import Redis from "ioredis";
import { getBfPerUsdc } from "./pricing";

const WEEKLY_KEY = "weekly:state:";
const WEEKLY_LOG_KEY = "weekly:log:";
const WEEKLY_CFG_KEY = "weekly:config";
const WEEKLY_HISTORY_KEY = "weekly:payout:history";
const WEEKLY_LOCK_KEY = "weekly:payout:lock:";
const ADMIN_WALLET = (process.env.ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe").toLowerCase();

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

export type WeeklyConfig = {
  autoPayoutEnabled: boolean;
  forceBypassSchedule: boolean;
  autoClaimPendingTickets: boolean;
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

const DEFAULT_WEEKLY_CONFIG: WeeklyConfig = {
  autoPayoutEnabled: false,
  forceBypassSchedule: false,
  autoClaimPendingTickets: true,
};

function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redis = new Redis(url);
  return redis;
}

function getCETDateParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(fmt.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function getISOWeekId(date = new Date()) {
  const { year, month, day } = getCETDateParts(date);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function nextSundayCET(hour = 0, minute = 0): number {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dayNum = base.getUTCDay();
  const daysToSun = (7 - dayNum) % 7;
  const target = new Date(Date.UTC(y, m - 1, d + daysToSun, hour - 1, minute, 0));
  return target.getTime();
}

export function getWeeklyMeta() {
  return {
    weekId: getISOWeekId(),
    snapshotAt: nextSundayCET(0, 0),
    payoutAt: nextSundayCET(0, 5),
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

export async function addWeeklyPot(bfAmount: number) {
  const { weekId } = getWeeklyMeta();
  const state = await loadState(weekId);
  state.potBf = (state.potBf || 0) + bfAmount;
  await saveState(weekId, state);
}

export async function updateWeeklyTickets(entry: {
  fid: number;
  address?: string;
  score: number;
  fee: number;
  prize: number;
}) {
  const address = entry.address?.toLowerCase();
  if (!address) return;

  const { weekId } = getWeeklyMeta();
  const state = await loadState(weekId);
  const tickets = state.tickets || {};
  const pending = state.pendingTickets || {};
  const wins = state.wins || {};

  let add = 1;
  add += Math.floor(entry.score / 1000);
  add += Math.floor(entry.fee / 0.25);

  const isWin = entry.prize > entry.fee;
  if (isWin) {
    wins[address] = (wins[address] || 0) + 1;
    if (wins[address] % 25 === 0) add += 1;
  }

  pending[address] = (pending[address] || 0) + add;
  state.pendingTickets = pending;
  state.tickets = tickets;
  state.wins = wins;
  await saveState(weekId, state);
}

export async function getWeeklyState() {
  const { weekId, snapshotAt, payoutAt } = getWeeklyMeta();
  const state = await loadState(weekId);
  return { weekId, snapshotAt, payoutAt, ...state };
}

export async function resetWeeklyState() {
  const { weekId } = getWeeklyMeta();
  await saveState(weekId, { ...DEFAULT_WEEKLY_STATE });
}

export async function claimTickets(address: string) {
  const { weekId } = getWeeklyMeta();
  const state = await loadState(weekId);
  const pending = state.pendingTickets || {};
  const tickets = state.tickets || {};
  const addr = address.toLowerCase();
  const amt = pending[addr] || 0;
  if (!amt) return { claimed: 0 };
  tickets[addr] = (tickets[addr] || 0) + amt;
  delete pending[addr];
  state.pendingTickets = pending;
  state.tickets = tickets;
  await saveState(weekId, state);
  return { claimed: amt, total: tickets[addr] };
}

export async function getUserTickets(address: string) {
  const { weekId } = getWeeklyMeta();
  const state = await loadState(weekId);
  const addr = address.toLowerCase();
  return {
    claimed: (state.tickets || {})[addr] || 0,
    pending: (state.pendingTickets || {})[addr] || 0,
  };
}

export async function setWeeklySnapshot(snapshot: unknown) {
  const { weekId } = getWeeklyMeta();
  const state = await loadState(weekId);
  state.snapshot = snapshot;
  await saveState(weekId, state);
}

export async function markWeeklyPayoutDone() {
  const { weekId } = getWeeklyMeta();
  const state = await loadState(weekId);
  state.lastPayoutAt = Date.now();
  await saveState(weekId, state);
}

export async function mergePendingTicketsIntoClaimed() {
  const { weekId } = getWeeklyMeta();
  const state = await loadState(weekId);
  const pending = state.pendingTickets || {};
  const tickets = state.tickets || {};

  for (const [addrRaw, amountRaw] of Object.entries(pending)) {
    const addr = addrRaw.toLowerCase();
    const amount = Number(amountRaw || 0);
    if (amount <= 0) continue;
    tickets[addr] = (tickets[addr] || 0) + amount;
    delete pending[addrRaw];
  }

  state.pendingTickets = pending;
  state.tickets = tickets;
  await saveState(weekId, state);
  return state;
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
  const meta = getWeeklyMeta();
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
  const key = WEEKLY_LOG_KEY + (weekId || getWeeklyMeta().weekId);
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
  const filtered = weekId ? typed.filter((l) => l.weekId === weekId) : typed;
  return filtered.slice(-limit).reverse();
}

export async function getWeeklyConfig() {
  const client = getRedis();
  if (client) {
    const raw = await client.get(WEEKLY_CFG_KEY);
    if (!raw) return { ...DEFAULT_WEEKLY_CONFIG };
    return { ...DEFAULT_WEEKLY_CONFIG, ...JSON.parse(raw) } as WeeklyConfig;
  }
  const raw = memoryStore.get(WEEKLY_CFG_KEY) as WeeklyConfig | undefined;
  return raw ? { ...DEFAULT_WEEKLY_CONFIG, ...raw } : { ...DEFAULT_WEEKLY_CONFIG };
}

export async function setWeeklyConfig(partial: Partial<WeeklyConfig>) {
  const next = { ...(await getWeeklyConfig()), ...partial };
  const client = getRedis();
  if (client) {
    await client.set(WEEKLY_CFG_KEY, JSON.stringify(next));
  } else {
    memoryStore.set(WEEKLY_CFG_KEY, next);
  }
  return next;
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
  if (current === lock.token) {
    memoryLocks.delete(lock.key);
  }
}

export function getAdminWallet() {
  return ADMIN_WALLET;
}

export async function getBfValueFromUsdc(usdcAmount: number) {
  const rate = await getBfPerUsdc();
  return usdcAmount * rate;
}
