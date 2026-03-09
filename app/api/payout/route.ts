import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";
import { BF_ADDRESS, ERC20_ABI, PRIZE_WALLET, SUPERTOKEN_ABI, fromBFUnits } from "@/lib/contracts";
import { getBfPerUsdc } from "@/lib/pricing";
import { issueClaimForGame } from "@/lib/gameSessions";
import { logTxRecord } from "@/lib/txLedger";

const PRIZE_WALLET_ADDRESS = (
  process.env.NEXT_PUBLIC_PRIZE_WALLET_ADDRESS || PRIZE_WALLET
) as `0x${string}`;
const CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_BFPAYOUT_CONTRACT || "0xCdfdbB8B93d8a02319434abA5CC69b31a746ef1D"
) as `0x${string}`;
const RPC_URLS = (process.env.BASE_RPC_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DEFAULT_RPC_URLS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

function baseTransport() {
  const urls = RPC_URLS.length > 0 ? RPC_URLS : DEFAULT_RPC_URLS;
  return fallback(urls.map((u) => http(u)));
}

async function readPrizeWalletBalanceBf() {
  const publicClient = createPublicClient({ chain: base, transport: baseTransport() });
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  try {
    const realtime = await publicClient.readContract({
      address: BF_ADDRESS,
      abi: SUPERTOKEN_ABI,
      functionName: "realtimeBalanceOf",
      args: [PRIZE_WALLET_ADDRESS, timestamp],
    });
    const [availableBalance] = realtime as readonly [bigint, bigint, bigint];
    if (availableBalance > BigInt(0)) return fromBFUnits(availableBalance);
  } catch {
    // fall back
  }
  const raw = await publicClient.readContract({
    address: BF_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [PRIZE_WALLET_ADDRESS],
  });
  return fromBFUnits(raw as bigint);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const gameId = String(body?.gameId || "");
    const gameSecret = String(body?.gameSecret || "");
    if (!gameId || !gameSecret) {
      return json({ ok: false, error: "gameId and gameSecret required", errorCode: "INVALID_GAME_CLAIM", prizeStatus: "notpaid", potStatus: "notadded" }, 400);
    }

    const claim = await issueClaimForGame({ gameId, gameSecret });
    return json({ ...claim, contractAddress: CONTRACT_ADDRESS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payout signing failed";
    await logTxRecord({
      kind: "payout_error",
      status: "failed",
      stage: "sign_claim",
      reason: message,
      meta: { endpoint: "/api/payout" },
    });
    return json({ ok: false, error: message, errorCode: "PAYOUT_SIGN_FAILED", prizeStatus: "notpaid", potStatus: "notadded" }, 400);
  }
}

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
