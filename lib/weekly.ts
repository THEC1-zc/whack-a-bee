import Redis from "ioredis";
import { createPublicClient, createWalletClient, fallback, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BF_ADDRESS, ERC20_ABI, toBFUnits } from "@/lib/contracts";
import { getBfPerUsdc } from "./pricing";
import { getCurrentWeekTicketState, getUserWeeklyTickets } from "@/lib/gameSessions";
import { advanceActiveWeeklyPeriod, getActiveWeeklyPeriod } from "@/lib/weeklyPeriod";

const WEEKLY_KEY = "weekly:state:";
const WEEKLY_LOG_KEY = "weekly:log:";
const WEEKLY_HISTORY_KEY = "weekly:payout:history";
const WEEKLY_LOCK_KEY = "weekly:payout:lock:";
const ADMIN_WALLET = (process.env.ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe").toLowerCase();
const POT_WALLET = (process.env.POT_WALLET_ADDRESS || "0x468d066995A4C09209c9c165F30Bd76A4FDB88e0") as `0x${string}`;
const RPC_URLS = (process.env.BASE_RPC_URLS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const DEFAULT_RPC_URLS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
];

let redis: Redis | null = null;
const memoryStore = new Map<string, unknown>();
const memoryLocks = new Map<string, string>();

export type WeeklyState = {
  potBf: number;
  tickets: Record<string, number>;
  wins: Record<string, number>;
  pendingTickets: Record<string, number>;
  snapshot: unknown;
  lastPayoutAt?: number;
};

export type WeeklyTransferResult = {
  to: string;
  amountBf: number;
  group: string;
  txHash?: string;
  playerName?: string;
  playerUsername?: string;
  playerFid?: number;
  ok: boolean;
  error?: string;
};

export type WeeklyPayoutLogEntry = {
  weekId: string;
  at: number;
  status: "paid" | "partial_failed" | "failed";
  mode: "manual" | "auto";
  force: boolean;
  autoClaimPendingTickets: boolean;
  potBf: number;
  top3: string[];
  lotteryWinners: string[];
  results: WeeklyTransferResult[];
  failedCount: number;
  notes?: string;
};

type WeeklyPayoutLock = {
  key: string;
  token: string;
};

const DEFAULT_WEEKLY_STATE: WeeklyState = {
  potBf: 0,
  tickets: {},
  wins: {},
  pendingTickets: {},
  snapshot: null,
};

function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redis = new Redis(url);
  return redis;
}

export async function getWeeklyMeta() {
  const period = await getActiveWeeklyPeriod();
  return {
    weekId: period.activeWeekId,
    snapshotAt: period.snapshotAt,
    payoutAt: period.payoutAt,
    baseWeekId: period.baseWeekId,
    cycle: period.cycle,
  };
}

async function loadState(weekId: string): Promise<WeeklyState> {
  const client = getRedis();
  const key = WEEKLY_KEY + weekId;
  if (client) {
    const raw = await client.get(key);
    return raw ? { ...DEFAULT_WEEKLY_STATE, ...JSON.parse(raw) } : { ...DEFAULT_WEEKLY_STATE };
  }
  const existing = memoryStore.get(key) as WeeklyState | undefined;
  return existing ? { ...DEFAULT_WEEKLY_STATE, ...existing } : { ...DEFAULT_WEEKLY_STATE };
}

async function saveState(weekId: string, state: WeeklyState) {
  const client = getRedis();
  const key = WEEKLY_KEY + weekId;
  if (client) {
    await client.set(key, JSON.stringify(state));
    return;
  }
  memoryStore.set(key, state);
}

export async function addWeeklyPot() {
  return;
}

export async function updateWeeklyTickets() {
  return;
}

export async function getWeeklyState() {
  const { weekId, snapshotAt, payoutAt, baseWeekId, cycle } = await getWeeklyMeta();
  const derived = await getCurrentWeekTicketState();
  const persisted = await loadState(weekId);
  return {
    weekId,
    baseWeekId,
    cycle,
    snapshotAt,
    payoutAt,
    ...persisted,
    potBf: derived.potBf,
    tickets: derived.tickets,
    wins: derived.wins,
    pendingTickets: {},
  };
}

export async function resetWeeklyState() {
  const { activeWeekId: weekId } = await advanceActiveWeeklyPeriod();
  await saveState(weekId, { ...DEFAULT_WEEKLY_STATE });
}

export async function claimTickets() {
  return { claimed: 0, total: 0, info: "Tickets are assigned automatically at payout claim" };
}

export async function getUserTickets(address: string) {
  return getUserWeeklyTickets(address);
}

export async function setWeeklySnapshot(snapshot: unknown) {
  const { weekId } = await getWeeklyMeta();
  const state = await loadState(weekId);
  state.snapshot = snapshot;
  await saveState(weekId, state);
}

export async function markWeeklyPayoutDone(weekId?: string) {
  const targetWeekId = weekId || (await getWeeklyMeta()).weekId;
  const state = await loadState(targetWeekId);
  state.lastPayoutAt = Date.now();
  await saveState(targetWeekId, state);
}

export async function mergePendingTicketsIntoClaimed() {
  return getWeeklyState();
}

async function appendPayoutLog(weekId: string, item: WeeklyPayoutLogEntry) {
  const weekKey = WEEKLY_LOG_KEY + weekId;
  const client = getRedis();

  if (client) {
    const weekRaw = await client.get(weekKey);
    const weekArr = (weekRaw ? JSON.parse(weekRaw) : []) as WeeklyPayoutLogEntry[];
    weekArr.push(item);
    await client.set(weekKey, JSON.stringify(weekArr));

    const historyRaw = await client.get(WEEKLY_HISTORY_KEY);
    const history = (historyRaw ? JSON.parse(historyRaw) : []) as WeeklyPayoutLogEntry[];
    history.push(item);
    if (history.length > 500) history.splice(0, history.length - 500);
    await client.set(WEEKLY_HISTORY_KEY, JSON.stringify(history));
    return;
  }

  const weekArr = (memoryStore.get(weekKey) as WeeklyPayoutLogEntry[] | undefined) || [];
  weekArr.push(item);
  memoryStore.set(weekKey, weekArr);

  const history = (memoryStore.get(WEEKLY_HISTORY_KEY) as WeeklyPayoutLogEntry[] | undefined) || [];
  history.push(item);
  if (history.length > 500) history.splice(0, history.length - 500);
  memoryStore.set(WEEKLY_HISTORY_KEY, history);
}

export async function logWeeklyPayout(entry: Omit<WeeklyPayoutLogEntry, "at" | "weekId"> & { weekId?: string }) {
  const meta = await getWeeklyMeta();
  const item: WeeklyPayoutLogEntry = {
    weekId: entry.weekId || meta.weekId,
    at: Date.now(),
    status: entry.status,
    mode: entry.mode,
    force: entry.force,
    autoClaimPendingTickets: entry.autoClaimPendingTickets,
    potBf: entry.potBf,
    top3: entry.top3,
    lotteryWinners: entry.lotteryWinners,
    results: entry.results,
    failedCount: entry.failedCount,
    notes: entry.notes,
  };
  await appendPayoutLog(item.weekId, item);
}

export async function getWeeklyPayoutLog(limit = 10, weekId?: string) {
  const key = WEEKLY_LOG_KEY + (weekId || (await getWeeklyMeta()).weekId);
  const client = getRedis();
  let logs: unknown;
  if (client) {
    const raw = await client.get(key);
    logs = raw ? JSON.parse(raw) : [];
  } else {
    logs = (memoryStore.get(key) as WeeklyPayoutLogEntry[] | undefined) || [];
  }
  return Array.isArray(logs) ? logs.slice(-limit).reverse() : [];
}

export async function getWeeklyPayoutHistory(limit = 200, weekId?: string) {
  const client = getRedis();
  let logs: unknown;
  if (client) {
    const raw = await client.get(WEEKLY_HISTORY_KEY);
    logs = raw ? JSON.parse(raw) : [];
  } else {
    logs = (memoryStore.get(WEEKLY_HISTORY_KEY) as WeeklyPayoutLogEntry[] | undefined) || [];
  }
  if (!Array.isArray(logs)) return [];
  const typed = logs as WeeklyPayoutLogEntry[];
  const filtered = weekId ? typed.filter((log) => log.weekId === weekId) : typed;
  return filtered.slice(-limit).reverse();
}

export async function acquireWeeklyPayoutLock(weekId: string, ttlMs = 120000): Promise<WeeklyPayoutLock | null> {
  const key = WEEKLY_LOCK_KEY + weekId;
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const client = getRedis();

  if (client) {
    const ok = await client.set(key, token, "PX", ttlMs, "NX");
    if (ok !== "OK") return null;
    return { key, token };
  }

  if (memoryLocks.has(key)) return null;
  memoryLocks.set(key, token);
  return { key, token };
}

export async function releaseWeeklyPayoutLock(lock: WeeklyPayoutLock) {
  const client = getRedis();
  if (client) {
    const script = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
    await client.eval(script, 1, lock.key, lock.token);
    return;
  }

  const current = memoryLocks.get(lock.key);
  if (current === lock.token) memoryLocks.delete(lock.key);
}

export function getAdminWallet() {
  return ADMIN_WALLET;
}

export function getPotWalletAddress() {
  return POT_WALLET;
}

export async function getBfValueFromUsdc(usdcAmount: number) {
  const rate = await getBfPerUsdc();
  return usdcAmount * rate;
}

export async function getPotWalletBalanceBfUnits() {
  const transportUrls = RPC_URLS.length > 0 ? RPC_URLS : DEFAULT_RPC_URLS;
  const transport = fallback(transportUrls.map((url) => http(url)));
  const pub = createPublicClient({ chain: base, transport });
  const raw = await pub.readContract({
    address: BF_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [POT_WALLET],
  });
  return raw as bigint;
}

async function readPotWalletBfUnits(
  publicClient: any,
  address: `0x${string}`
) {
  const raw = await publicClient.readContract({
    address: BF_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  return raw as bigint;
}

// ── Shared BF transfer helper ─────────────────────────────────────────────────

function normalizePotKey(value: string | undefined) {
  const raw = (value || "").trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, "");
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

export type BfTransferPlan = {
  to: string;
  amountBf: number;
  group: string;
  playerName?: string;
  playerUsername?: string;
  playerFid?: number;
};

export async function sendWeeklyBfTransfers(
  transfers: BfTransferPlan[],
  potPrivateKey: string | undefined
): Promise<WeeklyTransferResult[]> {
  const key = normalizePotKey(potPrivateKey);
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("POT_WALLET_PRIVATE_KEY invalid: expected 64 hex chars (with or without 0x)");
  }
  const account = privateKeyToAccount(key as `0x${string}`);
  const transportUrls = RPC_URLS.length > 0 ? RPC_URLS : DEFAULT_RPC_URLS;
  const transport = fallback(transportUrls.map((url) => http(url)));
  const pub = createPublicClient({ chain: base, transport });
  const wallet = createWalletClient({ account, chain: base, transport });
  const results: WeeklyTransferResult[] = [];
  let nextNonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });

  for (const t of transfers) {
    if (t.amountBf <= 0) continue;
    const amountUnits = toBFUnits(t.amountBf);
    const potBalanceUnits = await readPotWalletBfUnits(pub, account.address);
    if (amountUnits > potBalanceUnits) {
      results.push({
        ...t,
        ok: false,
        error: `insufficient BF balance in pot wallet (${potBalanceUnits.toString()} units available)`,
      });
      continue;
    }
    let lastError = "transfer failed";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await pub.simulateContract({
          account,
          address: BF_ADDRESS,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [t.to as `0x${string}`, amountUnits],
        });
        const txHash = await wallet.writeContract({
          address: BF_ADDRESS,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [t.to as `0x${string}`, amountUnits],
          account,
          nonce: nextNonce,
        });
        nextNonce += 1;
        const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== "success") {
          throw new Error("weekly payout transfer reverted");
        }
        results.push({ ...t, txHash, ok: true });
        lastError = "";
        break;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "transfer failed";
        lastError = message;
        const lower = message.toLowerCase();
        const retryable =
          lower.includes("nonce too low") ||
          lower.includes("replacement transaction underpriced") ||
          lower.includes("already known") ||
          lower.includes("underpriced");

        if (!retryable || attempt === 2) {
          break;
        }

        nextNonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
      }
    }

    if (lastError) {
      results.push({ ...t, ok: false, error: lastError });
    }
  }
  return results;
}
