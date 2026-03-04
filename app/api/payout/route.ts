import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  BF_ADDRESS,
  ERC20_ABI,
  fromBFUnits,
  toBFUnits,
  PRIZE_WALLET,
  USDC_ADDRESS,
  USDC_ABI,
  fromUSDCUnits,
  toUSDCUnits,
} from "@/lib/contracts";
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

function classifyErrorCode(message: string) {
  const lowered = message.toLowerCase();
  if (lowered.includes("insufficient funds")) return "INSUFFICIENT_GAS";
  if (lowered.includes("exceeds balance")) return "INSUFFICIENT_TOKEN_BALANCE";
  if (lowered.includes("transfer amount exceeds balance")) return "INSUFFICIENT_TOKEN_BALANCE";
  if (lowered.includes("underpriced")) return "NONCE_UNDERPRICED";
  if (lowered.includes("nonce too low")) return "NONCE_TOO_LOW";
  if (lowered.includes("reverted")) return "TRANSFER_REVERTED";
  return "PAYOUT_FAILED";
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

    const bfAmount = await usdcToBf(amount);

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    const playerAmount = bfAmount * 0.95;
    const potAmount = bfAmount * 0.05;
    const playerAmountUnits = toBFUnits(playerAmount);
    const potAmountUnits = toBFUnits(potAmount);
    const playerUsdcAmount = amount * 0.95;
    const playerUsdcUnits = toUSDCUnits(playerUsdcAmount);
    const recipientAddress = recipient as `0x${string}`;

    const recipientCode = await publicClient.getCode({ address: recipientAddress });
    const recipientIsContract = Boolean(recipientCode && recipientCode !== "0x");

    const bfPoolEligible = poolBalanceBf >= MIN_POOL_BALANCE_BF && poolBalanceBf >= bfAmount;
    let bfPreflightError: string | null = null;
    if (bfPoolEligible) {
      try {
        await publicClient.simulateContract({
          account,
          address: BF_ADDRESS,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [recipientAddress, playerAmountUnits],
        });
      } catch (simulateError: unknown) {
        bfPreflightError = extractErrorMessage(simulateError);
      }
    } else {
      bfPreflightError =
        poolBalanceBf < MIN_POOL_BALANCE_BF
          ? "Prize BF pool below minimum threshold"
          : "Prize BF pool insufficient for this payout";
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

    // Prefer BF payout; fallback to USDC if BF transfer path reverts
    let payoutToken: "BF" | "USDC" = "BF";
    let txHash: `0x${string}` | null = null;
    let payoutWarning: string | null = null;

    if (!bfPreflightError) {
      try {
        txHash = await sendTransfer(recipientAddress, playerAmount, "winner");
        await logTxRecord({
          kind: "game_prize_out",
          status: "ok",
          weekId,
          to: recipientAddress,
          amountBf: playerAmount,
          txHash,
          stage: "winner_transfer_bf",
        });
      } catch (winnerError: unknown) {
        bfPreflightError = extractErrorMessage(winnerError);
      }
    }

    if (!txHash) {
      if (bfPreflightError) {
        await logTxRecord({
          kind: "payout_error",
          status: "failed",
          weekId,
          to: recipientAddress,
          amountBf: playerAmount,
          stage: "winner_transfer_bf",
          reason: bfPreflightError,
          meta: { recipientIsContract },
        });
      }
      payoutToken = "USDC";
      const usdcBalance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [prizeAddress],
      });
      const usdcBalanceHuman = fromUSDCUnits(usdcBalance as bigint);
      if ((usdcBalance as bigint) < playerUsdcUnits) {
        const reason = `USDC fallback insufficient (${usdcBalanceHuman.toFixed(6)} USDC available, ${playerUsdcAmount.toFixed(6)} required)`;
        await logTxRecord({
          kind: "payout_error",
          status: "failed",
          weekId,
          to: recipientAddress,
          amountUsdc: playerUsdcAmount,
          stage: "winner_transfer_usdc_balance",
          reason,
          meta: {
            bfReason: bfPreflightError || undefined,
            recipientIsContract,
          },
        });
        return jsonWithCors(
          {
            error: `Winner payout failed: BF path reverted (${bfPreflightError || "unknown"}) and USDC fallback insufficient (${usdcBalanceHuman.toFixed(6)} USDC)`,
            errorCode: "USDC_FALLBACK_INSUFFICIENT",
            recipient: recipientAddress,
            recipientIsContract,
            amountUsdc: playerUsdcAmount,
            details: {
              bfReason: bfPreflightError || null,
              usdcBalance: usdcBalanceHuman,
              usdcRequired: playerUsdcAmount,
            },
          },
          500
        );
      }

      try {
        await publicClient.simulateContract({
          account,
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: "transfer",
          args: [recipientAddress, playerUsdcUnits],
        });
        txHash = await walletClient.writeContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: "transfer",
          args: [recipientAddress, playerUsdcUnits],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        payoutWarning = `BF transfer reverted (${bfPreflightError || "unknown"}). Paid in USDC fallback.`;
        await logTxRecord({
          kind: "game_prize_out",
          status: "ok",
          weekId,
          to: recipientAddress,
          amountUsdc: playerUsdcAmount,
          txHash,
          stage: "winner_transfer_usdc_fallback",
          reason: bfPreflightError || undefined,
        });
      } catch (usdcError: unknown) {
        const usdcReason = extractErrorMessage(usdcError);
        await logTxRecord({
          kind: "payout_error",
          status: "failed",
          weekId,
          to: recipientAddress,
          amountUsdc: playerUsdcAmount,
          stage: "winner_transfer_usdc_fallback",
          reason: usdcReason,
          meta: {
            bfReason: bfPreflightError || undefined,
            recipientIsContract,
          },
        });
        return jsonWithCors(
          {
            error: `Winner payout failed: BF path reverted (${bfPreflightError || "unknown"}) and USDC fallback failed (${usdcReason})`,
            errorCode: classifyErrorCode(usdcReason),
            recipient: recipientAddress,
            recipientIsContract,
            amountUsdc: playerUsdcAmount,
            details: {
              bfReason: bfPreflightError || null,
              usdcReason,
            },
          },
          500
        );
      }
    }

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
      payoutToken,
      warning: [payoutWarning, potWarning].filter(Boolean).join(" | ") || null,
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
