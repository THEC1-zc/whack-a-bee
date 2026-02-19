import Redis from "ioredis";
import { getBfPerUsdc } from "./pricing";

const WEEKLY_KEY = "weekly:state:";
const WEEKLY_LOG_KEY = "weekly:log:";
const ADMIN_WALLET = (process.env.ADMIN_WALLET || "0xd29c790466675153A50DF7860B9EFDb689A21cDe").toLowerCase();

let redis: Redis | null = null;
const memoryStore = new Map<string, any>();

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
  const get = (t: string) => Number(fmt.find(p => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function getISOWeekId(date = new Date()) {
  const { year, month, day } = getCETDateParts(date);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const weekId = `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  return weekId;
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
  const y = Number(parts.find(p => p.type === "year")?.value);
  const m = Number(parts.find(p => p.type === "month")?.value);
  const d = Number(parts.find(p => p.type === "day")?.value);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dayNum = base.getUTCDay(); // 0 = Sunday
  const daysToSun = (7 - dayNum) % 7;
  const target = new Date(Date.UTC(y, m - 1, d + daysToSun, hour - 1, minute, 0)); // CET approx UTC+1
  return target.getTime();
}

export function getWeeklyMeta() {
  return {
    weekId: getISOWeekId(),
    snapshotAt: nextSundayCET(0, 0),
    payoutAt: nextSundayCET(0, 5),
  };
}

async function loadState(weekId: string) {
  const client = getRedis();
  const key = WEEKLY_KEY + weekId;
  const empty = { potBf: 0, tickets: {}, wins: {}, pendingTickets: {}, snapshot: null };
  if (client) {
    const raw = await client.get(key);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  }
  return memoryStore.get(key) || empty;
}

async function saveState(weekId: string, state: any) {
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

  let add = 1; // 1 per game
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
  await saveState(weekId, { potBf: 0, tickets: {}, wins: {}, pendingTickets: {}, snapshot: null });
}

export async function logWeeklyPayout(entry: any) {
  const { weekId } = getWeeklyMeta();
  const key = WEEKLY_LOG_KEY + weekId;
  const client = getRedis();
  const item = { ...entry, at: Date.now() };
  if (client) {
    const raw = await client.get(key);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push(item);
    await client.set(key, JSON.stringify(arr));
    return;
  }
  const arr = memoryStore.get(key) || [];
  arr.push(item);
  memoryStore.set(key, arr);
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

export async function setWeeklySnapshot(snapshot: any) {
  const { weekId } = getWeeklyMeta();
  const state = await loadState(weekId);
  state.snapshot = snapshot;
  await saveState(weekId, state);
}

export function getAdminWallet() {
  return ADMIN_WALLET;
}

export async function getBfValueFromUsdc(usdcAmount: number) {
  const rate = await getBfPerUsdc();
  return usdcAmount * rate;
}
