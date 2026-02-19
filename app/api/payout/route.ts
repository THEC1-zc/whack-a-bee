import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BF_ADDRESS, ERC20_ABI, fromBFUnits, toBFUnits, PRIZE_WALLET } from "@/lib/contracts";
import { bfToUsdc, usdcToBf } from "@/lib/pricing";
import { addWeeklyPot } from "@/lib/weekly";

// Prize pool wallet private key — set in Vercel env vars, NEVER in code
const PRIZE_PRIVATE_KEY = process.env.PRIZE_WALLET_PRIVATE_KEY as `0x${string}`;
const PRIZE_WALLET_ADDRESS = process.env.PRIZE_WALLET_ADDRESS as `0x${string}` | undefined;
const MIN_POOL_BALANCE_BF = 100000;

export async function POST(req: NextRequest) {
  try {
    if (!PRIZE_PRIVATE_KEY) {
      return NextResponse.json({ error: "Payout not configured" }, { status: 503 });
    }

    const { recipient, amount } = await req.json();

    if (!recipient || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const account = privateKeyToAccount(PRIZE_PRIVATE_KEY);
    if (PRIZE_WALLET_ADDRESS && PRIZE_WALLET_ADDRESS !== account.address) {
      return NextResponse.json(
        { error: "Prize wallet mismatch", configured: false },
        { status: 503 }
      );
    }
    const prizeAddress = PRIZE_WALLET_ADDRESS || account.address;

    const publicClient = createPublicClient({
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    // Check BF pool balance before queueing
    const poolBalance = await publicClient.readContract({
      address: BF_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [prizeAddress],
    });

    const poolBalanceBf = fromBFUnits(poolBalance as bigint);
    const poolBalanceUsdc = await bfToUsdc(poolBalanceBf);

    if (poolBalanceBf < MIN_POOL_BALANCE_BF) {
      return NextResponse.json(
        { error: "Prize pool is empty", poolBalance: poolBalanceUsdc },
        { status: 503 }
      );
    }

    const bfAmount = await usdcToBf(amount);
    if (poolBalanceBf < bfAmount) {
      return NextResponse.json(
        { error: "Insufficient pool balance", poolBalance: poolBalanceUsdc },
        { status: 503 }
      );
    }

    // Send BF to winner
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    const txHash = await walletClient.writeContract({
      address: BF_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipient as `0x${string}`, toBFUnits(bfAmount)],
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    // weekly pot += 5% of payout
    await addWeeklyPot(bfAmount * 0.05);

    return NextResponse.json({ ok: true, txHash, bfAmount });
  } catch (e: any) {
    console.error("Payout error:", e);
    return NextResponse.json({ error: e?.message || "Payout failed" }, { status: 500 });
  }
}

// GET: check current pool balance (public)
export async function GET() {
  try {
    const prizeAddress = PRIZE_WALLET_ADDRESS || PRIZE_WALLET;
    const publicClient = createPublicClient({
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    const balance = await publicClient.readContract({
      address: BF_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [prizeAddress],
    });

    const balanceBf = fromBFUnits(balance as bigint);
    const balanceUsdc = bfToUsdc(balanceBf);

    return NextResponse.json({
      balance: balanceUsdc,
      balanceBf,
      configured: true,
      address: prizeAddress,
    });
  } catch {
    return NextResponse.json({ balance: 0, configured: false });
  }
}
