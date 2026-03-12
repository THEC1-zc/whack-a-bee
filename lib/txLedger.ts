import Redis from "ioredis";

const TX_LEDGER_KEY = "tx:records";

let redis: Redis | null = null;
const memoryRecords: TxRecord[] = [];

export type TxKind =
  | "game_fee_in"
  | "game_prize_out"
  | "game_pot_in"
  | "game_burn_out"
  | "weekly_payout_out"
  | "payout_error";

export type TxRecord = {
  id: string;
  at: number;
  kind: TxKind;
  status: "ok" | "failed";
  weekId?: string;
  fid?: number;
  playerUsername?: string;
  playerAddress?: string;
  from?: string;
  to?: string;
  amountUsdc?: number;
  amountBf?: number;
  txHash?: string;
  basescanUrl?: string;
  stage?: string;
  reason?: string;
  meta?: Record<string, unknown>;
};

function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redis = new Redis(url);
  return redis;
}

function normalizeRecord(input: Omit<TxRecord, "id" | "at" | "basescanUrl">): TxRecord {
  const txHash = input.txHash;
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: Date.now(),
    ...input,
    basescanUrl: txHash ? `https://basescan.org/tx/${txHash}` : undefined,
  };
}

export async function logTxRecord(input: Omit<TxRecord, "id" | "at" | "basescanUrl">) {
  const rec = normalizeRecord(input);
  const client = getRedis();

  if (client) {
    const raw = await client.get(TX_LEDGER_KEY);
    const arr = (raw ? JSON.parse(raw) : []) as TxRecord[];
    arr.push(rec);
    if (arr.length > 5000) arr.splice(0, arr.length - 5000);
    await client.set(TX_LEDGER_KEY, JSON.stringify(arr));
    return rec;
  }

  memoryRecords.push(rec);
  if (memoryRecords.length > 5000) memoryRecords.splice(0, memoryRecords.length - 5000);
  return rec;
}

export async function getTxRecords(params?: {
  limit?: number;
  kinds?: TxKind[];
  status?: "ok" | "failed";
}) {
  const limit = Math.max(1, Math.min(1000, params?.limit || 200));
  const client = getRedis();
  let all: unknown;
  if (client) {
    const raw = await client.get(TX_LEDGER_KEY);
    all = raw ? JSON.parse(raw) : [];
  } else {
    all = memoryRecords;
  }

  const typed = Array.isArray(all) ? (all as TxRecord[]) : [];
  const filtered = typed.filter((r) => {
    if (params?.status && r.status !== params.status) return false;
    if (params?.kinds && params.kinds.length > 0 && !params.kinds.includes(r.kind)) return false;
    return true;
  });

  return filtered.slice(-limit).reverse();
}
