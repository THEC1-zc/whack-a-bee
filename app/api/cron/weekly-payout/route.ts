import { NextRequest, NextResponse } from "next/server";
import {
  acquireWeeklyPayoutLock,
  getWeeklyConfig,
  getWeeklyMeta,
  logWeeklyPayout,
  markWeeklyPayoutDone,
  mergePendingTicketsIntoClaimed,
  releaseWeeklyPayoutLock,
  resetWeeklyState,
  sendWeeklyBfTransfers,
  setWeeklySnapshot,
} from "@/lib/weekly";
import { getWeeklyAdminStats, resetLeaderboard } from "@/lib/leaderboard";
import { logTxRecord } from "@/lib/txLedger";

// Vercel Cron — domenica 23:00 UTC = domenica 00:00 CET
// configurato in vercel.json: { "crons": [{ "path": "/api/cron/weekly-payout", "schedule": "0 23 * * 0" }] }

const CRON_SECRET = process.env.CRON_SECRET;
const POT_PRIVATE_KEY = process.env.POT_WALLET_PRIVATE_KEY;

function weightedPick(map: Record<string, number>, count: number, exclude: Set<string>) {
  const pool = Object.entries(map)
    .filter(([addr, t]) => t > 0 && !exclude.has(addr.toLowerCase()))
    .map(([addr, tickets]) => ({ addr, tickets }));
  const winners: string[] = [];
  while (winners.length < count && pool.length > 0) {
    const total = pool.reduce((s, p) => s + p.tickets, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) { r -= pool[idx].tickets; if (r <= 0) break; }
    winners.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0].addr);
  }
  return winners;
}

export async function GET(req: NextRequest) {
  // C-2 fix: CRON_SECRET must be explicitly configured — open endpoint otherwise
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured — cron endpoint disabled" }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meta = getWeeklyMeta();
  const cfg = await getWeeklyConfig();

  if (!cfg.autoPayoutEnabled) {
    return NextResponse.json({ skipped: true, reason: "autoPayoutEnabled=false" });
  }

  const lock = await acquireWeeklyPayoutLock(meta.weekId, 180000);
  if (!lock) return NextResponse.json({ error: "Already running" }, { status: 409 });

  try {
    if (!POT_PRIVATE_KEY) return NextResponse.json({ error: "POT_WALLET_PRIVATE_KEY not set" }, { status: 503 });

    await mergePendingTicketsIntoClaimed();
    const { getCurrentWeekTicketState } = await import("@/lib/gameSessions");
    const weekly = await getCurrentWeekTicketState();
    const potBf = Number(weekly.potBf || 0);

    if (potBf <= 0) {
      return NextResponse.json({ skipped: true, reason: "pot empty" });
    }

    const stats = await getWeeklyAdminStats(meta.weekId);
    const profiles = new Map(stats.players.filter((p: { address?: string }) => p.address).map((p: { address?: string; username?: string }) => [p.address!.toLowerCase(), p]));
    const top3 = stats.players.filter((p: { address?: string }) => p.address).slice(0, 3).map((p: { address?: string }) => p.address!.toLowerCase());

    const topShare = potBf * 0.6;
    const lotteryShare = potBf * 0.4;
    const exclude = new Set(top3);
    const lotteryWinners = weightedPick(weekly.tickets || {}, 7, exclude);

    const transfers = [
      ...top3.map((addr, i) => ({ to: addr, amountBf: topShare * [0.5, 0.3, 0.2][i], group: "top3", playerUsername: (profiles.get(addr) as { username?: string } | undefined)?.username })),
      ...lotteryWinners.map(addr => ({ to: addr, amountBf: lotteryShare / 7, group: "lottery", playerUsername: (profiles.get(addr) as { username?: string } | undefined)?.username })),
    ];

    if (!transfers.length) return NextResponse.json({ skipped: true, reason: "no eligible winners" });

    await setWeeklySnapshot({ status: "running", weekId: meta.weekId, startedAt: Date.now(), potBf, top3, lotteryWinners, transfers, mode: "cron" });

    const results = await sendWeeklyBfTransfers(transfers, POT_PRIVATE_KEY);
    const failed = results.filter(r => !r.ok);

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

    await logWeeklyPayout({
      weekId: meta.weekId,
      status: failed.length > 0 ? "partial_failed" : "paid",
      mode: "auto",
      force: false,
      autoClaimPendingTickets: true,
      potBf,
      top3,
      lotteryWinners,
      results,
      failedCount: failed.length,
      notes: "cron job",
    });

    if (failed.length === 0) {
      await resetWeeklyState();
      await markWeeklyPayoutDone();
      await resetLeaderboard();
    }

    return NextResponse.json({ ok: true, weekId: meta.weekId, potBf, top3, lotteryWinners, results, failedCount: failed.length });
  } finally {
    await releaseWeeklyPayoutLock(lock);
  }
}
