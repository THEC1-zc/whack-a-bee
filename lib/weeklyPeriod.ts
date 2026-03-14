import Redis from "ioredis";
import { getSundayWeekId, nextSundayCET } from "@/lib/weekWindow";

const WEEKLY_ACTIVE_KEY = "weekly:active:period";

let redis: Redis | null = null;
const memoryStore = new Map<string, unknown>();

export type ActiveWeeklyPeriod = {
  baseWeekId: string;
  activeWeekId: string;
  cycle: number;
  snapshotAt: number;
  payoutAt: number;
  startedAt: number;
  lastResetAt?: number;
};

function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redis = new Redis(url);
  return redis;
}

function buildPeriod(baseWeekId: string, cycle: number, startedAt = Date.now()): ActiveWeeklyPeriod {
  return {
    baseWeekId,
    activeWeekId: cycle > 0 ? `${baseWeekId}-R${cycle}` : baseWeekId,
    cycle,
    snapshotAt: nextSundayCET(0, 0),
    payoutAt: nextSundayCET(0, 5),
    startedAt,
    lastResetAt: startedAt,
  };
}

async function loadStoredPeriod() {
  const client = getRedis();
  if (client) {
    const raw = await client.get(WEEKLY_ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as ActiveWeeklyPeriod) : null;
  }
  return (memoryStore.get(WEEKLY_ACTIVE_KEY) as ActiveWeeklyPeriod | undefined) || null;
}

async function saveStoredPeriod(period: ActiveWeeklyPeriod) {
  const client = getRedis();
  if (client) {
    await client.set(WEEKLY_ACTIVE_KEY, JSON.stringify(period));
    return;
  }
  memoryStore.set(WEEKLY_ACTIVE_KEY, period);
}

export async function getActiveWeeklyPeriod(now = new Date()): Promise<ActiveWeeklyPeriod> {
  const calendarWeekId = getSundayWeekId(now);
  const stored = await loadStoredPeriod();
  if (!stored) {
    const initial = buildPeriod(calendarWeekId, 0, now.getTime());
    await saveStoredPeriod(initial);
    return initial;
  }
  return stored;
}

export async function advanceActiveWeeklyPeriod(now = new Date()): Promise<ActiveWeeklyPeriod> {
  const calendarWeekId = getSundayWeekId(now);
  const current = await getActiveWeeklyPeriod(now);
  const nextCycle = current.baseWeekId === calendarWeekId ? current.cycle + 1 : 0;
  const next = buildPeriod(calendarWeekId, nextCycle, now.getTime());
  await saveStoredPeriod(next);
  return next;
}
