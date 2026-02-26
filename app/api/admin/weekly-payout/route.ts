import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BF_ADDRESS, ERC20_ABI, toBFUnits } from "@/lib/contracts";
import {
  acquireWeeklyPayoutLock,
  getAdminWallet,
  getWeeklyConfig,
  getWeeklyMeta,
  getWeeklyState,
  logWeeklyPayout,
  markWeeklyPayoutDone,
  mergePendingTicketsIntoClaimed,
  releaseWeeklyPayoutLock,
  resetWeeklyState,
  setWeeklySnapshot,
  type WeeklyTransferResult,
} from "@/lib/weekly";
import { getAdminStats, resetLeaderboard } from "@/lib/leaderboard";

const ADMIN_WALLET = getAdminWallet();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const POT_PRIVATE_KEY = process.env.POT_WALLET_PRIVATE_KEY;

type WeeklyPayoutRequest = {
  force?: boolean;
  autoClaimPendingTickets?: boolean;
  mode?: "manual" | "auto";
};

type TransferPlan = {
  to: string;
  amountBf: number;
  group: string;
};

function normalizePrivateKey(value: string | undefined) {
  const raw = (value || "").trim().replace(/^['"]|['"]$/g, "");
  const compact = raw.replace(/\s+/g, "");
  if (/^[0-9a-fA-F]{64}$/.test(compact)) {
    return `0x${compact}`;
  }
  return compact;
}

function isAuthorized(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  if (ADMIN_API_KEY && token === ADMIN_API_KEY) return true;
  const addr = req.headers.get("x-admin-wallet") || "";
  return addr.toLowerCase() === ADMIN_WALLET;
}

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

async function sendBfTransfers(transfers: TransferPlan[]): Promise<WeeklyTransferResult[]> {
  const key = normalizePrivateKey(POT_PRIVATE_KEY);
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("POT_WALLET_PRIVATE_KEY invalid: expected 64 hex chars (with or without 0x)");
  }
  const account = privateKeyToAccount(key as `0x${string}`);
  const publicClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
  const walletClient = createWalletClient({ account, chain: base, transport: http("https://mainnet.base.org") });
  const results: WeeklyTransferResult[] = [];

  for (const t of transfers) {
    if (t.amountBf <= 0) continue;

    try {
      const txHash = await walletClient.writeContract({
        address: BF_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [t.to as `0x${string}`, toBFUnits(t.amountBf)],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      results.push({ ...t, txHash, ok: true });
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : "transfer failed";
      results.push({ ...t, ok: false, error });
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  const meta = getWeeklyMeta();
  const lock = await acquireWeeklyPayoutLock(meta.weekId, 180000);
  if (!lock) {
    return NextResponse.json({ error: "Weekly payout already running" }, { status: 409 });
  }

  try {
    if (!isAuthorized(req)) {
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

    const stats = await getAdminStats();
    const top3 = stats.players.filter((p) => p.address).slice(0, 3).map((p) => p.address!.toLowerCase());

    const topShare = potBf * 0.6;
    const topPayouts = [0.5, 0.3, 0.2].map((p) => topShare * p);
    const lotteryShare = potBf * 0.4;
    const perLottery = lotteryShare / 7;

    const exclude = new Set(top3);
    const lotteryWinners = weightedPick(weekly.tickets || {}, 7, exclude);

    const transfers: TransferPlan[] = [];
    top3.forEach((addr, i) => transfers.push({ to: addr, amountBf: topPayouts[i] || 0, group: "top3" }));
    lotteryWinners.forEach((addr) => transfers.push({ to: addr, amountBf: perLottery, group: "lottery" }));

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

    const results = await sendBfTransfers(transfers);
    const failed = results.filter((r) => !r.ok);

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
