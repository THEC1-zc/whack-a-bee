import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BF_ADDRESS, ERC20_ABI, fromBFUnits, toBFUnits, PRIZE_WALLET } from "@/lib/contracts";
import { bfToUsdc, usdcToBf } from "@/lib/pricing";
import { addWeeklyPot, getWeeklyMeta } from "@/lib/weekly";
import { logTxRecord } from "@/lib/txLedger";

// Prize pool wallet private key — set in Vercel env vars, NEVER in code
const PRIZE_PRIVATE_KEY = process.env.PRIZE_WALLET_PRIVATE_KEY;
const POT_WALLET = (process.env.POT_WALLET_ADDRESS || "0x468d066995A4C09209c9c165F30Bd76A4FDB88e0") as `0x${string}`;
const PRIZE_WALLET_ADDRESS = process.env.PRIZE_WALLET_ADDRESS as `0x${string}` | undefined;
const MIN_POOL_BALANCE_BF = 100000;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonWithCors(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function isRetryableNonceError(message: string) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("replacement transaction underpriced") ||
    lowered.includes("transaction underpriced") ||
    lowered.includes("nonce too low") ||
    lowered.includes("already known")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Payout failed");
}

function normalizePrivateKey(value: string | undefined) {
  const raw = (value || "").trim().replace(/^['"]|['"]$/g, "");
  const compact = raw.replace(/\s+/g, "");
  if (/^[0-9a-fA-F]{64}$/.test(compact)) {
    return `0x${compact}`;
  }
  return compact;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    if (!PRIZE_PRIVATE_KEY) {
      return jsonWithCors({ error: "Payout not configured" }, 503);
    }
    const normalizedPrizeKey = normalizePrivateKey(PRIZE_PRIVATE_KEY);
    if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedPrizeKey)) {
      return jsonWithCors(
        { error: "PRIZE_WALLET_PRIVATE_KEY invalid: expected 64 hex chars (with or without 0x)" },
        503
      );
    }

    const { recipient, amount } = await req.json();

    if (!recipient || typeof amount !== "number" || amount <= 0) {
      return jsonWithCors({ error: "Invalid request" }, 400);
    }

    const account = privateKeyToAccount(normalizedPrizeKey as `0x${string}`);
    if (PRIZE_WALLET_ADDRESS && PRIZE_WALLET_ADDRESS !== account.address) {
      return jsonWithCors(
        { error: "Prize wallet mismatch", configured: false },
        503
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
      return jsonWithCors(
        { error: "Prize pool is empty", poolBalance: poolBalanceUsdc },
        503
      );
    }

    const bfAmount = await usdcToBf(amount);
    if (poolBalanceBf < bfAmount) {
      return jsonWithCors(
        { error: "Insufficient pool balance", poolBalance: poolBalanceUsdc },
        503
      );
    }

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    const playerAmount = bfAmount * 0.95;
    const potAmount = bfAmount * 0.05;
    const playerAmountUnits = toBFUnits(playerAmount);
    const potAmountUnits = toBFUnits(potAmount);
    const recipientAddress = recipient as `0x${string}`;

    const recipientCode = await publicClient.getCode({ address: recipientAddress });
    const recipientIsContract = Boolean(recipientCode && recipientCode !== "0x");

    // Preflight simulation for the winner transfer to get deterministic revert reason before tx send
    try {
      await publicClient.simulateContract({
        account,
        address: BF_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [recipientAddress, playerAmountUnits],
      });
    } catch (simulateError: unknown) {
      const reason = extractErrorMessage(simulateError);
      const hint = recipientIsContract
        ? " Recipient is a smart-contract wallet; token transfer rules may block contract recipients."
        : "";
      return jsonWithCors(
        {
          error: `Winner transfer simulation failed: ${reason}${hint}`,
          recipient: recipientAddress,
          recipientIsContract,
          amountBf: playerAmount,
        },
        500
      );
    }

    const sendTransfer = async (to: `0x${string}`, value: number, label: string) => {
      let lastError: unknown;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const nonce = await publicClient.getTransactionCount({
            address: account.address,
            blockTag: "pending",
          });

          const txHash = await walletClient.writeContract({
            address: BF_ADDRESS,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [to, toBFUnits(value)],
            nonce,
          });

          await publicClient.waitForTransactionReceipt({ hash: txHash });
          return txHash;
        } catch (error: unknown) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error || "");
          if (!isRetryableNonceError(message) || attempt === 2) {
            throw error;
          }

          console.warn(`[payout] retrying ${label} transfer (attempt ${attempt + 2}/3):`, message);
          await sleep(700 * (attempt + 1));
        }
      }

      throw lastError;
    };

    const { weekId } = getWeeklyMeta();

    // Send BF to winner (critical path)
    const txHash = await sendTransfer(recipientAddress, playerAmount, "winner");
    await logTxRecord({
      kind: "game_prize_out",
      status: "ok",
      weekId,
      to: recipientAddress,
      amountBf: playerAmount,
      txHash,
      stage: "winner_transfer",
    });

    // Pot transfer is best-effort; winner payout should not fail because of pot wallet issues
    let potTxHash: `0x${string}` | null = null;
    let potWarning: string | null = null;
    try {
      await publicClient.simulateContract({
        account,
        address: BF_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [POT_WALLET, potAmountUnits],
      });
      potTxHash = await sendTransfer(POT_WALLET, potAmount, "pot");
      await addWeeklyPot(potAmount);
      await logTxRecord({
        kind: "game_pot_in",
        status: "ok",
        weekId,
        to: POT_WALLET,
        amountBf: potAmount,
        txHash: potTxHash,
        stage: "pot_transfer",
      });
    } catch (potError: unknown) {
      potWarning = extractErrorMessage(potError);
      console.error("Pot transfer warning:", potWarning);
      await logTxRecord({
        kind: "payout_error",
        status: "failed",
        weekId,
        to: POT_WALLET,
        amountBf: potAmount,
        stage: "pot_transfer",
        reason: potWarning,
      });
    }

    return jsonWithCors({
      ok: true,
      txHash,
      potTxHash,
      bfAmount: playerAmount,
      warning: potWarning,
    });
  } catch (e: unknown) {
    console.error("Payout error:", e);
    const message = extractErrorMessage(e);
    await logTxRecord({
      kind: "payout_error",
      status: "failed",
      stage: "winner_transfer",
      reason: message,
    });
    return jsonWithCors({ error: message }, 500);
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

    return jsonWithCors({
      balance: balanceUsdc,
      balanceBf,
      configured: true,
      address: prizeAddress,
      potAddress: POT_WALLET,
    });
  } catch {
    return jsonWithCors({ balance: 0, configured: false });
  }
}
