import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BF_ADDRESS, ERC20_ABI, toBFUnits } from "@/lib/contracts";
import { getAdminWallet, getWeeklyState, logWeeklyPayout, resetWeeklyState, setWeeklySnapshot } from "@/lib/weekly";
import { getAdminStats, resetLeaderboard } from "@/lib/leaderboard";

const ADMIN_WALLET = getAdminWallet();
const POT_PRIVATE_KEY = process.env.POT_WALLET_PRIVATE_KEY as `0x${string}`;

function isAuthorized(req: NextRequest) {
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

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!POT_PRIVATE_KEY) {
      return NextResponse.json({ error: "Payout not configured" }, { status: 503 });
    }

    const weekly = await getWeeklyState();
    const potBf = Number(weekly.potBf || 0);
    if (potBf <= 0) {
      return NextResponse.json({ error: "Weekly pot is empty" }, { status: 400 });
    }

    const stats = await getAdminStats();
    const top3 = stats.players
      .filter(p => p.address)
      .slice(0, 3)
      .map(p => p.address!.toLowerCase());

    const topShare = potBf * 0.6;
    const topPayouts = [0.5, 0.3, 0.2].map(p => topShare * p);
    const lotteryShare = potBf * 0.4;
    const perLottery = lotteryShare / 7;

    const exclude = new Set(top3);
    const lotteryWinners = weightedPick(weekly.tickets || {}, 7, exclude);

    const account = privateKeyToAccount(POT_PRIVATE_KEY);
    const publicClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
    const walletClient = createWalletClient({ account, chain: base, transport: http("https://mainnet.base.org") });

    const transfers: Array<{ to: string; amountBf: number; group: string }> = [];
    top3.forEach((addr, i) => transfers.push({ to: addr, amountBf: topPayouts[i] || 0, group: "top3" }));
    lotteryWinners.forEach(addr => transfers.push({ to: addr, amountBf: perLottery, group: "lottery" }));

    await setWeeklySnapshot({ top3, lotteryWinners, potBf });

    const results: any[] = [];
    for (const t of transfers) {
      if (t.amountBf <= 0) continue;
      const txHash = await walletClient.writeContract({
        address: BF_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [t.to as `0x${string}`, toBFUnits(t.amountBf)],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      results.push({ ...t, txHash });
    }

    await logWeeklyPayout({ potBf, top3, lotteryWinners, results });
    await resetWeeklyState();
    await resetLeaderboard();

    return NextResponse.json({ ok: true, potBf, top3, lotteryWinners, results });
  } catch (e: any) {
    console.error("Weekly payout error:", e);
    return NextResponse.json({ error: e?.message || "Weekly payout failed" }, { status: 500 });
  }
}
