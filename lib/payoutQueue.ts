import Redis from "ioredis";

const PENDING_KEY = "payout:pending";

let redis: Redis | null = null;
const memoryStore = new Map<string, number>();

function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redis = new Redis(url);
  return redis;
}

export async function enqueuePending(address: `0x${string}`, amountBf: number) {
  const client = getRedis();
  if (client) {
    const raw = await client.get(PENDING_KEY);
    const data = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    data[address] = (data[address] || 0) + amountBf;
    await client.set(PENDING_KEY, JSON.stringify(data));
    return;
  }
  memoryStore.set(address, (memoryStore.get(address) || 0) + amountBf);
}

export async function getPending(): Promise<Record<string, number>> {
  const client = getRedis();
  if (client) {
    const raw = await client.get(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  }
  const obj: Record<string, number> = {};
  for (const [k, v] of memoryStore.entries()) obj[k] = v;
  return obj;
}

export async function setPending(next: Record<string, number>) {
  const client = getRedis();
  if (client) {
    await client.set(PENDING_KEY, JSON.stringify(next));
    return;
  }
  memoryStore.clear();
  for (const [k, v] of Object.entries(next)) memoryStore.set(k, v);
}

