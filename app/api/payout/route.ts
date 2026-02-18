import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { USDC_ADDRESS, USDC_ABI, toUSDCUnits, fromUSDCUnits, PRIZE_WALLET } from "@/lib/contracts";

// Prize pool wallet private key — set in Vercel env vars, NEVER in code
const PRIZE_PRIVATE_KEY = process.env.PRIZE_WALLET_PRIVATE_KEY as `0x${string}`;
const MIN_POOL_BALANCE = 0.10;

export async function POST(req: NextRequest) {
  try {
    if (!PRIZE_PRIVATE_KEY) {
      return NextResponse.json({ error: "Payout not configured" }, { status: 503 });
    }

    const { recipient, amount } = await req.json();

    if (!recipient || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Max payout sanity check (hard cap at 0.10 USDC per game)
    if (amount > 0.10) {
      return NextResponse.json({ error: "Prize exceeds maximum" }, { status: 400 });
    }

    const account = privateKeyToAccount(PRIZE_PRIVATE_KEY);

    const publicClient = createPublicClient({
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    // Check pool balance before paying out
    const poolBalance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });

    const poolBalanceHuman = fromUSDCUnits(poolBalance as bigint);

    if (poolBalanceHuman < MIN_POOL_BALANCE) {
      return NextResponse.json(
        { error: "Prize pool is empty", poolBalance: poolBalanceHuman },
        { status: 503 }
      );
    }

    if (poolBalanceHuman < amount) {
      return NextResponse.json(
        { error: "Insufficient pool balance", poolBalance: poolBalanceHuman },
        { status: 503 }
      );
    }

    // Send USDC to winner
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    const txHash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "transfer",
      args: [recipient as `0x${string}`, toUSDCUnits(amount)],
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    console.log(`Payout: ${amount} USDC → ${recipient} | tx: ${txHash}`);

    return NextResponse.json({ ok: true, txHash, amount });
  } catch (e: any) {
    console.error("Payout error:", e);
    return NextResponse.json({ error: e?.message || "Payout failed" }, { status: 500 });
  }
}

// GET: check current pool balance (public)
export async function GET() {
  try {
    const prizeAddress =
      (process.env.PRIZE_WALLET_ADDRESS as `0x${string}` | undefined) || PRIZE_WALLET;
    const publicClient = createPublicClient({
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [prizeAddress],
    });

    return NextResponse.json({
      balance: fromUSDCUnits(balance as bigint),
      configured: true,
      address: prizeAddress,
    });
  } catch {
    return NextResponse.json({ balance: 0, configured: false });
  }
}
