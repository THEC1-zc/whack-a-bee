import { NextRequest, NextResponse } from "next/server";
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
  setWeeklySnapshot,
  type WeeklyTransferResult,
} from "@/lib/weekly";
import { getAdminStats, resetLeaderboard } from "@/lib/leaderboard";
import { logTxRecord } from "@/lib/txLedger";
import { BF_ADDRESS, ERC20_ABI, toBFUnits } from "@/lib/contracts";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Vercel Cron — viene chiamato ogni domenica a mezzanotte CET
// Configurato in vercel.json: { "crons": [{ "path": "/api/cron/weekly-payout", "schedule": "0 23 * * 0" }] }
// (domenica 23:00 UTC = domenica 00:00 CET in inverno / 01:00 CEST in estate)
// Per ora usiamo il Sunday midnight CET standard = domenica 23:00 UTC

const CRON_SECRET = process.env.CRON_SECRET;
const POT_PRIVATE_KEY = process.env.POT_WALLET_PRIVATE_KEY;

function normalizeKey(value: string | undefined) {
  const raw = (value || "").trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, "");
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

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

async function sendTransfers(transfers: { to: string; amountBf: number; group: string }[]): Promise<WeeklyTransferResult[]> {
  const key = normalizeKey(POT_PRIVATE_KEY);
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("POT_WALLET_PRIVATE_KEY invalid");
  const account = privateKeyToAccount(key as `0x${string}`);
  const pub = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
  const wallet = createWalletClient({ account, chain: base, transport: http("https://mainnet.base.org") });
  const results: WeeklyTransferResult[] = [];
  for (const t of transfers) {
    if (t.amountBf <= 0) continue;
    try {
      const txHash = await wallet.writeContract({
        address: BF_ADDRESS, abi: ERC20_ABI, functionName: "transfer",
        args: [t.to as `0x${string}`, toBFUnits(t.amountBf)],
      });
      await pub.waitForTransactionReceipt({ hash: txHash });
      results.push({ ...t, txHash, ok: true });
    } catch (e) {
      results.push({ ...t, ok: false, error: e instanceof Error ? e.message : "transfer failed" });
    }
  }
  return results;
}

export async function GET(req: NextRequest) {
  // Vercel cron calls GET with Authorization header
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
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

    // Merge pending → claimed before extraction
    await mergePendingTicketsIntoClaimed();
    const weekly = await getWeeklyState();
    const potBf = Number(weekly.potBf || 0);

    if (potBf <= 0) {
      return NextResponse.json({ skipped: true, reason: "pot empty" });
    }

    const stats = await getAdminStats();
    const profiles = new Map(stats.players.filter(p => p.address).map(p => [p.address!.toLowerCase(), p]));
    const top3 = stats.players.filter(p => p.address).slice(0, 3).map(p => p.address!.toLowerCase());

    const topShare = potBf * 0.6;
    const lotteryShare = potBf * 0.4;
    const exclude = new Set(top3);
    const lotteryWinners = weightedPick(weekly.tickets || {}, 7, exclude);

    const transfers = [
      ...top3.map((addr, i) => ({ to: addr, amountBf: topShare * [0.5, 0.3, 0.2][i], group: "top3", playerUsername: profiles.get(addr)?.username })),
      ...lotteryWinners.map(addr => ({ to: addr, amountBf: lotteryShare / 7, group: "lottery", playerUsername: profiles.get(addr)?.username })),
    ];

    if (!transfers.length) return NextResponse.json({ skipped: true, reason: "no eligible winners" });

    await setWeeklySnapshot({ status: "running", weekId: meta.weekId, startedAt: Date.now(), potBf, top3, lotteryWinners, transfers, mode: "cron" });

    const results = await sendTransfers(transfers);
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
