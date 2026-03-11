import { NextRequest, NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { requireAdminRequest, getAdminWallet } from "@/lib/adminSession";
import { createAdminChallenge, buildAdminChallengeMessage, verifyAdminChallenge } from "@/lib/adminAuth";
import {
  acquireWeeklyPayoutLock,
  getWeeklyConfig,
  getWeeklyMeta,
  getWeeklyState,
  logWeeklyPayout,
  markWeeklyPayoutDone,
  mergePendingTicketsIntoClaimed,
  releaseWeeklyPayoutLock,
  resetWeeklyState,
  sendWeeklyBfTransfers,
  setWeeklySnapshot,
} from "@/lib/weekly";
import { getAdminStats, getWeeklyAdminStats, resetLeaderboard } from "@/lib/leaderboard";
import { logTxRecord } from "@/lib/txLedger";

const POT_PRIVATE_KEY = process.env.POT_WALLET_PRIVATE_KEY;
const ADMIN_WALLET = getAdminWallet();

type WeeklyPayoutRequest = {
  force?: boolean;
  autoClaimPendingTickets?: boolean;
  mode?: "manual" | "auto";
  // Wallet signature fields — required for manual payout (2FA)
  payoutChallenge?: string;
  payoutMessage?: string;
  payoutSignature?: string;
};

type TransferPlan = {
  to: string;
  amountBf: number;
  group: string;
  playerName?: string;
  playerUsername?: string;
  playerFid?: number;
};

function weightedPick(map: Record<string, number>, count: number, exclude: Set<string>) {
  const entries = Object.entries(map).filter(([addr, tickets]) => tickets > 0 && !exclude.has(addr.toLowerCase()));
  const winners: string[] = [];
  const pool = entries.map(([addr, tickets]) => ({ addr, tickets }));

  while (winners.length < count && pool.length > 0) {
    const total = pool.reduce((s, p) => s + p.tickets, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx += 1) {
      r -= pool[idx].tickets;
      if (r <= 0) break;
    }
    const win = pool.splice(Math.min(idx, pool.length - 1), 1)[0];
    winners.push(win.addr);
  }
  return winners;
}

// GET — issue a payout challenge (used by admin UI before calling POST)
export async function GET(req: NextRequest) {
  if (!(await requireAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const challenge = createAdminChallenge("weekly_payout", ADMIN_WALLET);
  if (!challenge) {
    return NextResponse.json({ error: "Admin signing secret missing" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...challenge });
}

export async function POST(req: NextRequest) {
  const meta = getWeeklyMeta();
  const lock = await acquireWeeklyPayoutLock(meta.weekId, 180000);
  if (!lock) {
    return NextResponse.json({ error: "Weekly payout already running" }, { status: 409 });
  }

  try {
    if (!(await requireAdminRequest(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!POT_PRIVATE_KEY) {
      return NextResponse.json({ error: "Payout not configured" }, { status: 503 });
    }

    const body = (await req.json().catch(() => ({}))) as WeeklyPayoutRequest;
    const cfg = await getWeeklyConfig();
    const mode = body.mode || "manual";
    const isAutoMode = mode === "auto";

    if (isAutoMode && !cfg.autoPayoutEnabled) {
      return NextResponse.json({ error: "Auto payout is disabled" }, { status: 403 });
    }

    // C-1 fix: manual payout requires a wallet signature as second factor
    // Auto mode (internal) is exempted since it runs server-side via cron
    if (!isAutoMode) {
      const challenge = String(body?.payoutChallenge || "");
      const message = String(body?.payoutMessage || "");
      const signature = String(body?.payoutSignature || "");

      if (!challenge || !message || !signature) {
        return NextResponse.json({ error: "Payout requires wallet signature — call GET first to obtain a challenge" }, { status: 400 });
      }

      const verification = verifyAdminChallenge(challenge, "weekly_payout", ADMIN_WALLET);
      if (!verification.ok) {
        return NextResponse.json({ error: verification.reason }, { status: 401 });
      }
      if (message !== buildAdminChallengeMessage(verification.payload)) {
        return NextResponse.json({ error: "Challenge message mismatch" }, { status: 401 });
      }

      const signer = await recoverMessageAddress({
        message,
        signature: signature as `0x${string}`,
      }).catch(() => null);
      if (!signer || signer.toLowerCase() !== ADMIN_WALLET) {
        return NextResponse.json({ error: "Invalid wallet signature for payout authorization" }, { status: 401 });
      }
    }

    const force = Boolean(body.force) || (isAutoMode && cfg.forceBypassSchedule);
    const shouldAutoClaimPending = body.autoClaimPendingTickets ?? cfg.autoClaimPendingTickets;

    const weeklyPre = await getWeeklyState();
    const now = Date.now();
    if (!force && weeklyPre.payoutAt && now < weeklyPre.payoutAt) {
      return NextResponse.json({ error: "Too early for payout", payoutAt: weeklyPre.payoutAt }, { status: 403 });
    }

    const allowManualReplay = force && mode === "manual";
    if (weeklyPre.lastPayoutAt && !allowManualReplay) {
      return NextResponse.json({
        error: "Payout already executed for this week",
        lastPayoutAt: weeklyPre.lastPayoutAt,
      }, { status: 409 });
    }

    if (shouldAutoClaimPending) {
      await mergePendingTicketsIntoClaimed();
    }

    const weekly = await getWeeklyState();
    const potBf = Number(weekly.potBf || 0);
    if (potBf <= 0) {
      return NextResponse.json({ error: "Weekly pot is empty" }, { status: 400 });
    }

    const stats = await getWeeklyAdminStats(meta.weekId);
    const addressProfiles = new Map<string, { playerName?: string; playerUsername?: string; playerFid?: number }>();
    for (const p of stats.players) {
      if (!p.address) continue;
      addressProfiles.set(p.address.toLowerCase(), {
        playerName: p.displayName,
        playerUsername: p.username,
        playerFid: p.fid,
      });
    }
    const top3 = stats.players.filter((p) => p.address).slice(0, 3).map((p) => p.address!.toLowerCase());

    const topShare = potBf * 0.6;
    const topPayouts = [0.5, 0.3, 0.2].map((p) => topShare * p);
    const lotteryShare = potBf * 0.4;
    const perLottery = lotteryShare / 7;

    const exclude = new Set(top3);
    const lotteryWinners = weightedPick(weekly.tickets || {}, 7, exclude);

    const transfers: TransferPlan[] = [];
    top3.forEach((addr, i) => {
      const profile = addressProfiles.get(addr) || {};
      transfers.push({ to: addr, amountBf: topPayouts[i] || 0, group: "top3", ...profile });
    });
    lotteryWinners.forEach((addr) => {
      const profile = addressProfiles.get(addr) || {};
      transfers.push({ to: addr, amountBf: perLottery, group: "lottery", ...profile });
    });

    if (!transfers.length) {
      return NextResponse.json({ error: "No eligible winners (no addresses/tickets)" }, { status: 400 });
    }

    const startedAt = Date.now();
    await setWeeklySnapshot({
      status: "running",
      weekId: meta.weekId,
      startedAt,
      potBf,
      force,
      mode,
      autoClaimPendingTickets: shouldAutoClaimPending,
      top3,
      lotteryWinners,
      transfers,
    });

    const results = await sendWeeklyBfTransfers(transfers, POT_PRIVATE_KEY);
    const failed = results.filter((r) => !r.ok);

    for (const r of results) {
      await logTxRecord({
        kind: "weekly_payout_out",
        status: r.ok ? "ok" : "failed",
        weekId: meta.weekId,
        playerUsername: r.playerUsername,
        playerAddress: r.to,
        to: r.to,
        amountBf: r.amountBf,
        txHash: r.txHash,
        stage: r.group,
        reason: r.error,
      });
    }

    if (failed.length > 0) {
      await setWeeklySnapshot({
        status: "partial_failed",
        weekId: meta.weekId,
        startedAt,
        completedAt: Date.now(),
        potBf,
        force,
        mode,
        autoClaimPendingTickets: shouldAutoClaimPending,
        top3,
        lotteryWinners,
        results,
        failed,
      });

      await logWeeklyPayout({
        weekId: meta.weekId,
        status: "partial_failed",
        mode,
        force,
        autoClaimPendingTickets: shouldAutoClaimPending,
        potBf,
        top3,
        lotteryWinners,
        results,
        failedCount: failed.length,
        notes: "Some transfers failed; weekly state NOT reset",
      });

      return NextResponse.json({
        error: "Weekly payout partial failure",
        weekId: meta.weekId,
        failedCount: failed.length,
        results,
      }, { status: 500 });
    }

    await setWeeklySnapshot({
      status: "paid",
      weekId: meta.weekId,
      startedAt,
      completedAt: Date.now(),
      potBf,
      force,
      mode,
      autoClaimPendingTickets: shouldAutoClaimPending,
      top3,
      lotteryWinners,
      results,
    });

    await logWeeklyPayout({
      weekId: meta.weekId,
      status: "paid",
      mode,
      force,
      autoClaimPendingTickets: shouldAutoClaimPending,
      potBf,
      top3,
      lotteryWinners,
      results,
      failedCount: 0,
    });

    await resetWeeklyState();
    await markWeeklyPayoutDone();
    await resetLeaderboard();

    const after = await getAdminStats();

    return NextResponse.json({
      ok: true,
      weekId: meta.weekId,
      potBf,
      top3,
      lotteryWinners,
      results,
      force,
      mode,
      autoClaimPendingTickets: shouldAutoClaimPending,
      leaderboardAfterReset: {
        totalGames: after.totalGames,
        uniquePlayers: after.uniquePlayers,
      },
    });
  } catch (e: unknown) {
    console.error("Weekly payout error:", e);
    const message = e instanceof Error ? e.message : "Weekly payout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await releaseWeeklyPayoutLock(lock);
  }
}
