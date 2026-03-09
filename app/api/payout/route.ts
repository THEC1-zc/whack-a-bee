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

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
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
  void req;
  await logTxRecord({
    kind: "payout_error",
    status: "failed",
    stage: "sign_claim_disabled",
    reason: "POST /api/payout disabled pending authenticated server-side game session redesign",
  });
  return json({
    ok: false,
    error: "Payout signing temporarily disabled pending security redesign",
    errorCode: "PAYOUT_SIGNING_DISABLED",
    prizeStatus: "notpaid",
    potStatus: "notadded",
  }, 503);
}

// ── GET — pool balance ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const balanceBf = await readPrizeWalletBalanceBf();
    const bfPerUsdc = await getBfPerUsdc();
    const balanceUsdc = balanceBf / bfPerUsdc;

    return json({
      balance: balanceUsdc,
      balanceBf,
      configured: true,
      address: PRIZE_WALLET_ADDRESS,
      contractAddress: CONTRACT_ADDRESS,
    });
  } catch {
    return json({ balance: 0, configured: false });
  }
}
