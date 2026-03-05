import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  BF_ADDRESS,
  ERC20_ABI,
  fromBFUnits,
  toBFUnits,
  PRIZE_WALLET,
} from "@/lib/contracts";
import { bfToUsdc, usdcToBf } from "@/lib/pricing";
import { addWeeklyPot, getWeeklyMeta } from "@/lib/weekly";
import { logTxRecord } from "@/lib/txLedger";

// Prize pool wallet private key — set in Vercel env vars, NEVER in code
const PRIZE_PRIVATE_KEY = process.env.PRIZE_WALLET_PRIVATE_KEY;
const POT_WALLET = (process.env.POT_WALLET_ADDRESS || "0x468d066995A4C09209c9c165F30Bd76A4FDB88e0") as `0x${string}`;
const PRIZE_WALLET_ADDRESS = process.env.PRIZE_WALLET_ADDRESS as `0x${string}` | undefined;
const MIN_POOL_BALANCE_BF = 100000;
const RPC_URLS = (process.env.BASE_RPC_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DEFAULT_RPC_URLS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
];
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

function isRetryableRpcError(message: string) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("over rate limit") ||
    lowered.includes("status: 429") ||
    lowered.includes("http request failed") ||
    lowered.includes("timeout") ||
    lowered.includes("network error")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Payout failed");
}

function parseHex(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(trimmed) || trimmed.length % 2 !== 0) return null;
  return trimmed;
}

function extractHexFromMessage(message: string) {
  const m = message.match(/data:\s*(0x[0-9a-fA-F]+)/i);
  if (!m?.[1]) return null;
  const parsed = parseHex(m[1]);
  return parsed && parsed.length >= 10 ? parsed : null;
}

function findRevertData(value: unknown, path = ""): string | null {
  const parsed = parseHex(value);
  if (parsed) {
    const key = path.toLowerCase();
    const looksLikeAddress = parsed.length === 42;
    const likelyDataField =
      key.endsWith(".data") ||
      key.endsWith(".revertdata") ||
      key.endsWith(".errordata") ||
      key.endsWith(".raw");
    if (likelyDataField && parsed.length >= 10 && !looksLikeAddress) {
      return parsed;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;

  const preferredKeys = ["data", "revertData", "errorData", "raw"];
  for (const key of preferredKeys) {
    if (key in obj) {
      const found = findRevertData(obj[key], `${path}.${key}`);
      if (found) return found;
    }
  }

  const nestedKeys = ["cause", "error", "details", "meta"];
  for (const key of nestedKeys) {
    if (key in obj) {
      const found = findRevertData(obj[key], `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

function extractErrorDetails(error: unknown) {
  const message = extractErrorMessage(error);
  const revertData = findRevertData(error) || extractHexFromMessage(message);
  const selector = revertData && revertData.length >= 10 ? revertData.slice(0, 10) : null;
  return { message, revertData, selector };
}

function formatReasonWithSelector(message: string, selector?: string | null) {
  return selector ? `${message} [selector=${selector}]` : message;
}

function normalizePrivateKey(value: string | undefined) {
  const raw = (value || "").trim().replace(/^['"]|['"]$/g, "");
  const compact = raw.replace(/\s+/g, "");
  if (/^[0-9a-fA-F]{64}$/.test(compact)) {
    return `0x${compact}`;
  }
  return compact;
}

function baseTransport() {
  const urls = RPC_URLS.length > 0 ? RPC_URLS : DEFAULT_RPC_URLS;
  return fallback(urls.map((u) => http(u)));
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
      transport: baseTransport(),
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
      transport: baseTransport(),
    });

    const bfAmountUnits = toBFUnits(bfAmount);
    const playerAmountUnits = (bfAmountUnits * BigInt(95)) / BigInt(100);
    const potAmountUnits = bfAmountUnits - playerAmountUnits;
    const playerAmount = fromBFUnits(playerAmountUnits);
    const potAmount = fromBFUnits(potAmountUnits);
    const recipientAddress = recipient as `0x${string}`;

    const recipientCode = await publicClient.getCode({ address: recipientAddress });
    const recipientIsContract = Boolean(recipientCode && recipientCode !== "0x");
    const [senderRawBalance, recipientRawBalance, potRawBalance] = await Promise.all([
      publicClient.readContract({
        address: BF_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [prizeAddress],
      }),
      publicClient.readContract({
        address: BF_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [recipientAddress],
      }),
      publicClient.readContract({
        address: BF_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [POT_WALLET],
      }),
    ]);
    const senderBfBalance = fromBFUnits(senderRawBalance as bigint);
    const recipientBfBalance = fromBFUnits(recipientRawBalance as bigint);
    const potWalletBfBalance = fromBFUnits(potRawBalance as bigint);

    const bfPoolEligible = poolBalanceBf >= MIN_POOL_BALANCE_BF && poolBalanceBf >= bfAmount;

    const sendTransfer = async (to: `0x${string}`, amountUnits: bigint, label: string) => {
      let lastError: unknown;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const nonce = await publicClient.getTransactionCount({
            address: account.address,
            blockTag: "pending",
          });

          // BF is a Superfluid SuperToken (UUPSProxy) — simulateContract fails because
          // the ERC20 transfer() lives in the implementation, not the proxy ABI.
          // We send the tx directly using encodeFunctionData to avoid simulation revert.
          const { encodeFunctionData } = await import("viem");
          const data = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [to, amountUnits],
          });

          const txHash = await walletClient.sendTransaction({
            to: BF_ADDRESS,
            data,
            nonce,
            account,
            chain: base,
          });

          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
          if (receipt.status === "reverted") {
            throw new Error(`Transfer reverted on-chain (${label}). txHash: ${txHash}`);
          }
          return txHash;
        } catch (error: unknown) {
          lastError = error;
          const { message } = extractErrorDetails(error);
          if (!(isRetryableNonceError(message) || isRetryableRpcError(message)) || attempt === 2) {
            throw error;
          }

          console.warn(`[payout] retrying ${label} transfer (attempt ${attempt + 2}/3):`, message);
          await sleep(1000 * (attempt + 1));
        }
      }

      throw lastError;
    };

    const { weekId } = getWeeklyMeta();

    let prizeStatus: "paid" | "notpaid" = "notpaid";
    let potStatus: "added" | "notadded" = "notadded";
    let prizeTxHash: `0x${string}` | null = null;
    let potTxHash: `0x${string}` | null = null;
    let prizeReason: string | null = null;
    let potReason: string | null = null;

    if (bfPoolEligible) {
      try {
        prizeTxHash = await sendTransfer(recipientAddress, playerAmountUnits, "winner");
        prizeStatus = "paid";
        await logTxRecord({
          kind: "game_prize_out",
          status: "ok",
          weekId,
          to: recipientAddress,
          amountBf: playerAmount,
          txHash: prizeTxHash,
          stage: "winner_transfer_bf",
        });
      } catch (winnerError: unknown) {
        const details = extractErrorDetails(winnerError);
        prizeReason = details.message;
        await logTxRecord({
          kind: "payout_error",
          status: "failed",
          weekId,
          to: recipientAddress,
          amountBf: playerAmount,
          stage: "winner_transfer_bf_revert_meta",
          reason: formatReasonWithSelector(details.message, details.selector),
          meta: {
            revertData: details.revertData || undefined,
            errorSelector: details.selector || undefined,
          },
        });
      }
    } else {
      prizeReason =
        poolBalanceBf < MIN_POOL_BALANCE_BF
          ? "Prize BF pool below minimum threshold"
          : "Prize BF pool insufficient for this payout";
    }

    if (prizeStatus === "notpaid") {
      await logTxRecord({
        kind: "payout_error",
        status: "failed",
        weekId,
        to: recipientAddress,
        amountBf: playerAmount,
        stage: "winner_transfer_bf",
        reason: prizeReason || "Winner BF transfer failed",
        meta: {
          recipientIsContract,
          senderBfBalance,
          recipientBfBalance,
        },
      });
    }

    try {
      potTxHash = await sendTransfer(POT_WALLET, potAmountUnits, "pot");
      await addWeeklyPot(potAmount);
      potStatus = "added";
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
      const details = extractErrorDetails(potError);
      potReason = details.message;
      console.error("Pot transfer warning:", potReason);
      await logTxRecord({
        kind: "payout_error",
        status: "failed",
        weekId,
        to: POT_WALLET,
        amountBf: potAmount,
        stage: "pot_transfer",
        reason: formatReasonWithSelector(potReason, details.selector),
        meta: {
          senderBfBalance,
          potWalletBfBalance,
          revertData: details.revertData || undefined,
          errorSelector: details.selector || undefined,
        },
      });
    }

    return jsonWithCors({
      ok: prizeStatus === "paid",
      prizeStatus,
      potStatus,
      txHash: prizeTxHash,
      potTxHash,
      bfAmount: playerAmount,
      payoutToken: "BF",
      prizeReason,
      potReason,
      recipient: recipientAddress,
      recipientIsContract,
      debug: {
        senderBfBalance,
        recipientBfBalance,
        potWalletBfBalance,
      },
    });
  } catch (e: unknown) {
    console.error("Payout error:", e);
    const details = extractErrorDetails(e);
    await logTxRecord({
      kind: "payout_error",
      status: "failed",
      stage: "winner_transfer",
      reason: details.message,
      meta: {
        revertData: details.revertData || undefined,
        errorSelector: details.selector || undefined,
      },
    });
    return jsonWithCors({ error: details.message, errorSelector: details.selector, revertData: details.revertData }, 500);
  }
}

// GET: check current pool balance (public)
export async function GET() {
  try {
    const prizeAddress = PRIZE_WALLET_ADDRESS || PRIZE_WALLET;
    const publicClient = createPublicClient({
      chain: base,
      transport: baseTransport(),
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
