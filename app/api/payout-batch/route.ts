import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BF_ADDRESS, ERC20_ABI, toBFUnits } from "@/lib/contracts";
import { getPending, setPending } from "@/lib/payoutQueue";

const PRIZE_PRIVATE_KEY = process.env.PRIZE_WALLET_PRIVATE_KEY as `0x${string}`;
const GAS_MAX_USDC = 0.03;

async function getEthUsd(): Promise<number> {
  try {
    const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot");
    const data = await res.json();
    return Number(data?.data?.amount || 0);
  } catch {
    return 0;
  }
}

async function runBatch() {
  try {
    if (!PRIZE_PRIVATE_KEY) {
      return NextResponse.json({ error: "Payout not configured" }, { status: 503 });
    }

    const pending = await getPending();
    const entries = Object.entries(pending);
    if (entries.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, skipped: 0 });
    }

    const account = privateKeyToAccount(PRIZE_PRIVATE_KEY);
    const publicClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
    const walletClient = createWalletClient({ account, chain: base, transport: http("https://mainnet.base.org") });

    const gasPrice = await publicClient.getGasPrice();
    const ethUsd = await getEthUsd();
    if (!ethUsd) {
      return NextResponse.json({ error: "ETH price unavailable" }, { status: 503 });
    }

    let totalGasUsd = 0;
    let processed = 0;
    const remaining: Record<string, number> = { ...pending };

    for (const [address, amountBf] of entries) {
      const gasEstimate = await publicClient.estimateContractGas({
        address: BF_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [address as `0x${string}`, toBFUnits(amountBf)],
        account,
      });

      const gasCostEth = Number(gasEstimate * gasPrice) / 1e18;
      const gasCostUsd = gasCostEth * ethUsd;

      if (totalGasUsd + gasCostUsd > GAS_MAX_USDC) {
        continue;
      }

      const txHash = await walletClient.writeContract({
        address: BF_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [address as `0x${string}`, toBFUnits(amountBf)],
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      totalGasUsd += gasCostUsd;
      processed += 1;
      delete remaining[address];
    }

    await setPending(remaining);

    return NextResponse.json({
      ok: true,
      processed,
      skipped: Object.keys(remaining).length,
      gasUsd: Number(totalGasUsd.toFixed(4)),
    });
  } catch (e: any) {
    console.error("Batch payout error:", e);
    return NextResponse.json({ error: e?.message || "Batch payout failed" }, { status: 500 });
  }
}

export async function GET() {
  return runBatch();
}

export async function POST() {
  return runBatch();
}
