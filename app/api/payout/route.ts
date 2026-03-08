import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, fallback, http, keccak256, encodePacked } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  BF_ADDRESS,
  ERC20_ABI,
  SUPERTOKEN_ABI,
  fromBFUnits,
  toBFUnits,
  PRIZE_WALLET,
} from "@/lib/contracts";
import { addWeeklyPot, getWeeklyMeta } from "@/lib/weekly";
import { usdcToBf, getBfPerUsdc } from "@/lib/pricing";
import { logTxRecord } from "@/lib/txLedger";

// ── Env ───────────────────────────────────────────────────────────────────────

const SIGNER_PRIVATE_KEY = process.env.PAYOUT_SIGNER_PRIVATE_KEY;
const CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_BFPAYOUT_CONTRACT || "0xCdfdbB8B93d8a02319434abA5CC69b31a746ef1D"
) as `0x${string}`;
const PRIZE_WALLET_ADDRESS = (
  process.env.NEXT_PUBLIC_PRIZE_WALLET_ADDRESS || PRIZE_WALLET
) as `0x${string}`;

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

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonWithCors(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseTransport() {
  const urls = RPC_URLS.length > 0 ? RPC_URLS : DEFAULT_RPC_URLS;
  return fallback(urls.map((u) => http(u)));
}

function normalizePrivateKey(value: string | undefined): string {
  const raw = (value || "").trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, "");
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

async function readPrizeWalletBalanceBf() {
  const publicClient = createPublicClient({
    chain: base,
    transport: baseTransport(),
  });
  const timestamp = BigInt(Math.floor(Date.now() / 1000));

  try {
    const realtime = await publicClient.readContract({
      address: BF_ADDRESS,
      abi: SUPERTOKEN_ABI,
      functionName: "realtimeBalanceOf",
      args: [PRIZE_WALLET_ADDRESS, timestamp],
    });

    const [availableBalance] = realtime as readonly [bigint, bigint, bigint];
    if (availableBalance > BigInt(0)) {
      return fromBFUnits(availableBalance);
    }
  } catch (error) {
    console.warn("[payout] realtimeBalanceOf failed, falling back to balanceOf:", error);
  }

  const raw = await publicClient.readContract({
    address: BF_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [PRIZE_WALLET_ADDRESS],
  });

  return fromBFUnits(raw as bigint);
}

/**
 * Build the same hash as _buildHash() in BFPayout.sol
 * keccak256(abi.encodePacked(chainId, contractAddress, player, bfGross, nonce, expiry))
 * then EIP-191 prefix is added by signMessage({ message: { raw } })
 */
function buildClaimHash(
  player: `0x${string}`,
  bfGross: bigint,
  nonce: `0x${string}`,
  expiry: bigint
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["uint256", "address", "address", "uint256", "bytes32", "uint256"],
      [BigInt(base.id), CONTRACT_ADDRESS, player, bfGross, nonce, expiry]
    )
  );
}

// ── POST — generate signed claim ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Check signer key configured
    if (!SIGNER_PRIVATE_KEY) {
      return jsonWithCors({ error: "Payout signer not configured", errorCode: "NO_SIGNER" }, 503);
    }

    const normalizedKey = normalizePrivateKey(SIGNER_PRIVATE_KEY);
    if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedKey)) {
      return jsonWithCors({ error: "PAYOUT_SIGNER_PRIVATE_KEY invalid format", errorCode: "INVALID_SIGNER_KEY" }, 503);
    }

    const { recipient, amount } = await req.json();

    if (!recipient || typeof amount !== "number" || amount <= 0) {
      return jsonWithCors({ error: "Invalid request: need recipient address and amount (USDC)" }, 400);
    }

    const playerAddress = recipient as `0x${string}`;

    // ── Check pool balance ────────────────────────────────────────────────────

    const poolBalanceBf = await readPrizeWalletBalanceBf();

    // Convert prize USDC → BF gross
    const bfGrossFloat = await usdcToBf(amount);
    const bfGross = toBFUnits(bfGrossFloat);
    const bfGrossFloat2 = fromBFUnits(bfGross);

    if (poolBalanceBf < MIN_POOL_BALANCE_BF) {
      return jsonWithCors({
        ok: false,
        error: "Prize pool below minimum threshold",
        errorCode: "POOL_EMPTY",
        prizeStatus: "notpaid",
        potStatus: "notadded",
      });
    }

    if (poolBalanceBf < bfGrossFloat2) {
      return jsonWithCors({
        ok: false,
        error: "Prize pool insufficient for this payout",
        errorCode: "POOL_INSUFFICIENT",
        prizeStatus: "notpaid",
        potStatus: "notadded",
      });
    }

    // ── Generate nonce & expiry ───────────────────────────────────────────────

    // nonce = keccak of (player + timestamp + random) — unique per claim
    const nonceRaw = keccak256(
      encodePacked(
        ["address", "uint256", "uint256"],
        [playerAddress, BigInt(Date.now()), BigInt(Math.floor(Math.random() * 1_000_000))]
      )
    );
    const nonce = nonceRaw as `0x${string}`;
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 minutes

    // ── Sign the claim ────────────────────────────────────────────────────────

    const signerAccount = privateKeyToAccount(normalizedKey as `0x${string}`);
    const rawHash = buildClaimHash(playerAddress, bfGross, nonce, expiry);

    // signMessage adds the EIP-191 prefix "\x19Ethereum Signed Message:\n32"
    // which matches what _buildHash() + _recover() expects in Solidity
    const signature = await signerAccount.signMessage({ message: { raw: rawHash } });

    // ── Log the pending payout ────────────────────────────────────────────────

    const { weekId } = getWeeklyMeta();
    const bfPerUsdc = await getBfPerUsdc();

    await logTxRecord({
      kind: "game_prize_out",
      status: "ok",
      weekId,
      to: playerAddress,
      amountBf: bfGrossFloat2,
      amountUsdc: amount,
      stage: "claim_signed",
      meta: {
        nonce,
        expiry: expiry.toString(),
        contractAddress: CONTRACT_ADDRESS,
        bfPerUsdc,
        split: { player: "94.5%", pot: "4.5%", burn: "1%" },
      },
    });

    // ── Aggiorna contatore pot weekly (4.5% del gross in BF) ─────────────────
    try {
      const potBfAmount = fromBFUnits(bfGross) * 0.045;
      await addWeeklyPot(potBfAmount);
    } catch (e) {
      console.warn("[payout] addWeeklyPot failed (non-blocking):", e);
    }

    // ── Return signed claim to frontend ──────────────────────────────────────

    return jsonWithCors({
      ok: true,
      // bfGross as string to avoid JS number precision loss on large bigints
      bfGross: bfGross.toString(),
      nonce,
      expiry: expiry.toString(),
      signature,
      contractAddress: CONTRACT_ADDRESS,
      // Informational — contract splits automatically
      split: {
        playerBf: Math.round(bfGrossFloat2 * 0.945),
        potBf: Math.round(bfGrossFloat2 * 0.045),
        burnBf: Math.round(bfGrossFloat2 * 0.01),
      },
      prizeStatus: "signed",
      potStatus: "pending_onchain",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[payout] POST error:", message);
    await logTxRecord({
      kind: "payout_error",
      status: "failed",
      stage: "sign_claim",
      reason: message,
    });
    return jsonWithCors({ error: message, errorCode: "SIGN_ERROR" }, 500);
  }
}

// ── GET — pool balance ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const balanceBf = await readPrizeWalletBalanceBf();
    const bfPerUsdc = await getBfPerUsdc();
    const balanceUsdc = balanceBf / bfPerUsdc;

    return jsonWithCors({
      balance: balanceUsdc,
      balanceBf,
      configured: true,
      address: PRIZE_WALLET_ADDRESS,
      contractAddress: CONTRACT_ADDRESS,
    });
  } catch {
    return jsonWithCors({ balance: 0, configured: false });
  }
}
