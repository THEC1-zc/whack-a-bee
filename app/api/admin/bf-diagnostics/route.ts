import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, fallback, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { BF_ADDRESS, ERC20_ABI, fromBFUnits, toBFUnits } from "@/lib/contracts";
import { usdcToBf } from "@/lib/pricing";
import { getAdminWallet, requireAdminRequest } from "@/lib/adminSession";

const ADMIN_WALLET = getAdminWallet();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const PRIZE_PRIVATE_KEY = process.env.PRIZE_WALLET_PRIVATE_KEY;
const PRIZE_WALLET_ADDRESS = process.env.PRIZE_WALLET_ADDRESS as `0x${string}` | undefined;
const POT_WALLET = (process.env.POT_WALLET_ADDRESS || "0x468d066995A4C09209c9c165F30Bd76A4FDB88e0") as `0x${string}`;
const RPC_URLS = (process.env.BASE_RPC_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DEFAULT_RPC_URLS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
];

type ProbeResult = {
  name: string;
  value?: string | boolean | number;
  error?: string;
};

function isAuthorized(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  return Boolean(ADMIN_API_KEY && token === ADMIN_API_KEY);
}

function normalizePrivateKey(value: string | undefined) {
  const raw = (value || "").trim().replace(/^['"]|['"]$/g, "");
  const compact = raw.replace(/\s+/g, "");
  if (/^[0-9a-fA-F]{64}$/.test(compact)) return `0x${compact}`;
  return compact;
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "unknown error");
}

function isRetryableRpcError(message: string) {
  const lowered = message.toLowerCase();
  return lowered.includes("over rate limit") || lowered.includes("status: 429") || lowered.includes("http request failed");
}

function baseTransport() {
  const urls = RPC_URLS.length > 0 ? RPC_URLS : DEFAULT_RPC_URLS;
  return fallback(urls.map((u) => http(u)));
}

export async function GET(req: NextRequest) {
  if (!(await requireAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!PRIZE_PRIVATE_KEY) {
    return NextResponse.json({ error: "PRIZE_WALLET_PRIVATE_KEY missing" }, { status: 503 });
  }
  const normalizedPrizeKey = normalizePrivateKey(PRIZE_PRIVATE_KEY);
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedPrizeKey)) {
    return NextResponse.json({ error: "PRIZE_WALLET_PRIVATE_KEY invalid" }, { status: 503 });
  }

  const account = privateKeyToAccount(normalizedPrizeKey as `0x${string}`);
  const prizeAddress = PRIZE_WALLET_ADDRESS || account.address;
  const recipient = ((req.nextUrl.searchParams.get("recipient") || ADMIN_WALLET) as `0x${string}`);
  const amountUsdc = Math.max(0.001, Number(req.nextUrl.searchParams.get("amountUsdc") || 0.03));
  const bfAmount = await usdcToBf(amountUsdc);
  const playerAmount = bfAmount * 0.95;
  const potAmount = bfAmount * 0.05;
  const playerAmountUnits = toBFUnits(playerAmount);
  const potAmountUnits = toBFUnits(potAmount);

  const publicClient = createPublicClient({
    chain: base,
    transport: baseTransport(),
  });

  async function withRpcRetry<T>(fn: () => Promise<T>) {
    let lastError: unknown;
    for (let i = 0; i < 3; i += 1) {
      try {
        return await fn();
      } catch (e: unknown) {
        lastError = e;
        const msg = extractErrorMessage(e);
        if (!isRetryableRpcError(msg) || i === 2) throw e;
      }
    }
    throw lastError;
  }

  async function tryReadNoArgs(fnName: string): Promise<ProbeResult> {
    try {
      const value = await withRpcRetry(() => publicClient.readContract({
        address: BF_ADDRESS,
        abi: [
          {
            name: fnName,
            type: "function",
            stateMutability: "view",
            inputs: [],
            outputs: [{ name: "", type: "bool" }],
          },
        ] as const,
        functionName: fnName,
        args: [],
      }));
      return { name: fnName, value: Boolean(value) };
    } catch (e: unknown) {
      return { name: fnName, error: extractErrorMessage(e) };
    }
  }

  async function tryReadAddressBool(fnName: string, addr: `0x${string}`): Promise<ProbeResult> {
    try {
      const value = await withRpcRetry(() => publicClient.readContract({
        address: BF_ADDRESS,
        abi: [
          {
            name: fnName,
            type: "function",
            stateMutability: "view",
            inputs: [{ name: "user", type: "address" }],
            outputs: [{ name: "", type: "bool" }],
          },
        ] as const,
        functionName: fnName,
        args: [addr],
      }));
      return { name: `${fnName}(${addr})`, value: Boolean(value) };
    } catch (e: unknown) {
      return { name: `${fnName}(${addr})`, error: extractErrorMessage(e) };
    }
  }

  async function tryReadNoArgsUint(fnName: string): Promise<ProbeResult> {
    try {
      const value = await withRpcRetry(() => publicClient.readContract({
        address: BF_ADDRESS,
        abi: [
          {
            name: fnName,
            type: "function",
            stateMutability: "view",
            inputs: [],
            outputs: [{ name: "", type: "uint256" }],
          },
        ] as const,
        functionName: fnName,
        args: [],
      }));
      return { name: fnName, value: String(value) };
    } catch (e: unknown) {
      return { name: fnName, error: extractErrorMessage(e) };
    }
  }

  const [senderBalanceRaw, recipientBalanceRaw, potBalanceRaw, recipientCode, potCode] = await Promise.all([
    withRpcRetry(() => publicClient.readContract({
      address: BF_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [prizeAddress],
    })),
    withRpcRetry(() => publicClient.readContract({
      address: BF_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [recipient],
    })),
    withRpcRetry(() => publicClient.readContract({
      address: BF_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [POT_WALLET],
    })),
    withRpcRetry(() => publicClient.getCode({ address: recipient })),
    withRpcRetry(() => publicClient.getCode({ address: POT_WALLET })),
  ]);

  let winnerSim: { ok: boolean; reason?: string } = { ok: true };
  try {
    await withRpcRetry(() => publicClient.simulateContract({
      account,
      address: BF_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipient, playerAmountUnits],
    }));
  } catch (e: unknown) {
    winnerSim = { ok: false, reason: extractErrorMessage(e) };
  }

  let potSim: { ok: boolean; reason?: string } = { ok: true };
  try {
    await withRpcRetry(() => publicClient.simulateContract({
      account,
      address: BF_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [POT_WALLET, potAmountUnits],
    }));
  } catch (e: unknown) {
    potSim = { ok: false, reason: extractErrorMessage(e) };
  }

  const noArgFlags = await Promise.all([
    tryReadNoArgs("paused"),
    tryReadNoArgs("tradingOpen"),
    tryReadNoArgs("tradingEnabled"),
  ]);

  const addressFlags = await Promise.all([
    tryReadAddressBool("isBlacklisted", prizeAddress),
    tryReadAddressBool("isBlacklisted", recipient),
    tryReadAddressBool("isBlacklisted", POT_WALLET),
    tryReadAddressBool("blacklist", prizeAddress),
    tryReadAddressBool("blacklist", recipient),
    tryReadAddressBool("blacklist", POT_WALLET),
  ]);

  const uintFlags = await Promise.all([
    tryReadNoArgsUint("maxWallet"),
    tryReadNoArgsUint("_maxWalletSize"),
    tryReadNoArgsUint("maxWalletAmount"),
    tryReadNoArgsUint("maxTxAmount"),
    tryReadNoArgsUint("_maxTxAmount"),
    tryReadNoArgsUint("numTokensSellToAddToLiquidity"),
  ]);

  return NextResponse.json({
    token: BF_ADDRESS,
    chainId: base.id,
    prizeAddress,
    recipient,
    potWallet: POT_WALLET,
    amountUsdc,
    amountBf: bfAmount,
    playerAmountBf: playerAmount,
    potAmountBf: potAmount,
    balances: {
      prize: fromBFUnits(senderBalanceRaw as bigint),
      recipient: fromBFUnits(recipientBalanceRaw as bigint),
      potWallet: fromBFUnits(potBalanceRaw as bigint),
    },
    recipients: {
      recipientIsContract: Boolean(recipientCode && recipientCode !== "0x"),
      potIsContract: Boolean(potCode && potCode !== "0x"),
    },
    simulate: {
      winnerTransfer: winnerSim,
      potTransfer: potSim,
    },
    probes: {
      noArgFlags,
      addressFlags,
      uintFlags,
    },
  });
}
