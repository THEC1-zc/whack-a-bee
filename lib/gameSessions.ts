import crypto from "node:crypto";
import Redis from "ioredis";
import {
  createWalletClient,
  createPublicClient,
  decodeFunctionData,
  encodePacked,
  fallback,
  http,
  keccak256,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import {
  BF_ADDRESS,
  ERC20_ABI,
  PRIZE_WALLET,
  SUPERTOKEN_ABI,
  USDC_ADDRESS,
  fromBFUnits,
  toBFUnits,
  toUSDCUnits,
} from "@/lib/contracts";
import { getBfPerUsdc } from "@/lib/pricing";
import {
  calculatePrizeUsdc,
  CAP_TYPES,
  type CapTypeKey,
  DIFFICULTY_CONFIG,
  type Difficulty,
  capLabel,
  clampLiveScore,
  deriveScoreFromHits,
  estimateMinimumGameDurationMs,
  getRunWaveCount,
  getFullValueThreshold,
  getHitBounds,
  getHitBoundsForWaveMultipliers,
  getPrizeflyBonusUsdc,
  getPrizeflyChance,
  getRunCapScore,
  pickCapProfile,
  pickJollyWaveTypes,
} from "@/lib/gameRules";
import { logTxRecord } from "@/lib/txLedger";
import { getActiveWeeklyPeriod } from "@/lib/weeklyPeriod";

const CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_BFPAYOUT_CONTRACT || "0xCdfdbB8B93d8a02319434abA5CC69b31a746ef1D"
) as `0x${string}`;
const SIGNER_PRIVATE_KEY = process.env.PAYOUT_SIGNER_PRIVATE_KEY || "";
const PRIZE_WALLET_ADDRESS = (
  process.env.NEXT_PUBLIC_PRIZE_WALLET_ADDRESS || PRIZE_WALLET
) as `0x${string}`;
const POT_WALLET_ADDRESS = (
  process.env.POT_WALLET_ADDRESS || "0x468d066995A4C09209c9c165F30Bd76A4FDB88e0"
) as `0x${string}`;
const BURN_WALLET_ADDRESS = (
  process.env.BURN_WALLET_ADDRESS || "0x5c29b12A731789182012D769B734D77eE15e530F"
) as `0x${string}`;
const PRIZE_WALLET_PRIVATE_KEY = process.env.PRIZE_WALLET_PRIVATE_KEY || "";
const RPC_URLS = (process.env.BASE_RPC_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DEFAULT_RPC_URLS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
];
const GAME_INDEX_KEY = "games:index";
const GAME_RECORD_KEY = "games:record:";
const GAME_FEE_TX_KEY = "games:fee:";
const GAME_CLAIM_TX_KEY = "games:claim:";
// Track how many sessions a wallet has created without paying (anti-spam)
const GAME_CREATE_COUNT_KEY = "games:creates:";
const MAX_GAMES = 5000;
// Max unpaid sessions per wallet before rate-limit kicks in
const MAX_UNPAID_SESSIONS_PER_WALLET = 10;

const BFPAYOUT_ABI = [
  {
    name: "claimPrize",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player", type: "address" },
      { name: "bfGross", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "expiry", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const TRANSFER_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
] as const;

export type HitStats = {
  normal: number;
  fast: number;
  fuchsia: number;
  bomb: number;
  super: number;
};

export type GameStatus = "created" | "fee_verified" | "finished" | "claim_signed" | "claimed";

export type GameRecord = {
  gameId: string;
  gameSecretHash: string;
  difficulty: Difficulty;
  feeExpectedUsdc: number;
  capType: CapTypeKey;
  capMultiplier: number;
  capLabel: string;
  capScore: number;
  prizeEligible?: boolean;
  prizeWaveIndex?: number | null;
  waveTypes?: CapTypeKey[];
  waveMultipliers?: number[];
  createdAt: number;
  weekId: string;
  status: GameStatus;
  playerAddress?: string;
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  feeTxHash?: `0x${string}`;
  feeVerifiedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  scoreRealized?: number;
  scorePossible?: number;
  hitStats?: HitStats;
  prizeUsdc?: number;
  prizeBfGross?: number;
  prizeBfGrossUnits?: string;
  playerBfUnits?: string;
  potBfUnits?: string;
  burnBfUnits?: string;
  claimNonce?: `0x${string}`;
  claimExpiry?: number;
  claimSignature?: `0x${string}`;
  claimSignedAt?: number;
  claimTxHash?: `0x${string}`;
  claimConfirmedAt?: number;
  claimMethod?: "player" | "admin_rescue";
  rescuePrizeTxHash?: `0x${string}`;
  rescuePotTxHash?: `0x${string}`;
  rescueBurnTxHash?: `0x${string}`;
  ticketAssigned?: boolean;
  ticketCount?: number;
};

export type AdminGameRow = {
  gameId: string;
  createdAt: number;
  weekId: string;
  difficulty: Difficulty;
  playerAddress?: string;
  username?: string;
  displayName?: string;
  feeExpectedUsdc: number;
  feeTxHash?: string;
  feeTxUrl?: string;
  feeVerifiedAt?: number;
  status: GameStatus;
  scoreRealized?: number;
  scorePossible?: number;
  prizeUsdc?: number;
  prizeBfGross?: number;
  claimTxHash?: string;
  claimTxUrl?: string;
  claimMethod?: "player" | "admin_rescue";
  rescuePrizeTxHash?: string;
  rescuePotTxHash?: string;
  rescueBurnTxHash?: string;
  rescuePending?: boolean;
  ticketAssigned?: boolean;
  ticketCount?: number;
};

export type LeaderboardEntry = {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  address?: string;
  games: number;
  wins: number;
  net: number;
  totalPrize: number;
  totalFees: number;
  lastPlayed: number;
};

let redis: Redis | null = null;
const memoryGames = new Map<string, GameRecord>();
const memoryIndex: string[] = [];
const memoryFeeTxMap = new Map<string, string>();
const memoryClaimTxMap = new Map<string, string>();
const memoryCreateCounts = new Map<string, number>();

function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redis = new Redis(url);
  return redis;
}

function baseTransport() {
  const urls = RPC_URLS.length > 0 ? RPC_URLS : DEFAULT_RPC_URLS;
  return fallback(urls.map((url) => http(url)));
}

function getPublicClient() {
  return createPublicClient({ chain: base, transport: baseTransport() });
}

function getPrizeWalletClient() {
  const normalized = normalizePrivateKey(PRIZE_WALLET_PRIVATE_KEY);
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("PRIZE_WALLET_PRIVATE_KEY invalid");
  }
  const account = privateKeyToAccount(normalized as `0x${string}`);
  if (account.address.toLowerCase() !== PRIZE_WALLET_ADDRESS.toLowerCase()) {
    throw new Error("PRIZE_WALLET_PRIVATE_KEY does not match configured prize wallet");
  }
  return createWalletClient({ account, chain: base, transport: baseTransport() });
}

function normalizePrivateKey(value: string | undefined) {
  const raw = (value || "").trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, "");
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function verifySecret(game: GameRecord, gameSecret: string) {
  return sha256Hex(gameSecret) === game.gameSecretHash;
}

function normalizeHash(hash: string) {
  return hash.toLowerCase();
}

function txUrl(hash?: string) {
  return hash ? `https://basescan.org/tx/${hash}` : undefined;
}

function isRetryableMissingTxError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /could not be found|not found|unknown transaction|No transaction found/i.test(message);
}

async function waitForIndexedClaimTx(publicClient: ReturnType<typeof getPublicClient>, hash: `0x${string}`) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const [tx, receipt] = await Promise.all([
        publicClient.getTransaction({ hash }),
        publicClient.getTransactionReceipt({ hash }),
      ]);
      return { tx, receipt };
    } catch (error) {
      lastError = error;
      if (!isRetryableMissingTxError(error) || attempt === 7) break;
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Claim transaction could not be found");
}

async function waitForIndexedReceipt(publicClient: ReturnType<typeof getPublicClient>, hash: `0x${string}`, label: string) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await publicClient.getTransactionReceipt({ hash });
    } catch (error) {
      lastError = error;
      if (!isRetryableMissingTxError(error) || attempt === 7) break;
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} transaction could not be found`);
}

async function getIndex() {
  const client = getRedis();
  if (client) {
    const raw = await client.get(GAME_INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  }
  return [...memoryIndex];
}

async function saveIndex(next: string[]) {
  const trimmed = next.slice(-MAX_GAMES);
  const client = getRedis();
  if (client) {
    await client.set(GAME_INDEX_KEY, JSON.stringify(trimmed));
    return;
  }
  memoryIndex.length = 0;
  memoryIndex.push(...trimmed);
}

async function saveGame(game: GameRecord) {
  const client = getRedis();
  if (client) {
    await client.set(`${GAME_RECORD_KEY}${game.gameId}`, JSON.stringify(game));
  } else {
    memoryGames.set(game.gameId, game);
  }
  const index = await getIndex();
  if (!index.includes(game.gameId)) {
    index.push(game.gameId);
    await saveIndex(index);
  }
}

export async function getGameById(gameId: string) {
  const client = getRedis();
  if (client) {
    const raw = await client.get(`${GAME_RECORD_KEY}${gameId}`);
    return raw ? (JSON.parse(raw) as GameRecord) : null;
  }
  return memoryGames.get(gameId) || null;
}

async function setFeeTxOwner(txHash: string, gameId: string) {
  const key = `${GAME_FEE_TX_KEY}${normalizeHash(txHash)}`;
  const client = getRedis();
  if (client) {
    await client.set(key, gameId);
  } else {
    memoryFeeTxMap.set(key, gameId);
  }
}

async function getFeeTxOwner(txHash: string) {
  const key = `${GAME_FEE_TX_KEY}${normalizeHash(txHash)}`;
  const client = getRedis();
  if (client) return await client.get(key);
  return memoryFeeTxMap.get(key) || null;
}

async function setClaimTxOwner(txHash: string, gameId: string) {
  const key = `${GAME_CLAIM_TX_KEY}${normalizeHash(txHash)}`;
  const client = getRedis();
  if (client) {
    await client.set(key, gameId);
  } else {
    memoryClaimTxMap.set(key, gameId);
  }
}

async function getClaimTxOwner(txHash: string) {
  const key = `${GAME_CLAIM_TX_KEY}${normalizeHash(txHash)}`;
  const client = getRedis();
  if (client) return await client.get(key);
  return memoryClaimTxMap.get(key) || null;
}

// ── Anti-spam: track unpaid session count per wallet ─────────────────────────

async function getCreateCount(address: string): Promise<number> {
  const key = `${GAME_CREATE_COUNT_KEY}${address.toLowerCase()}`;
  const client = getRedis();
  if (client) {
    const raw = await client.get(key);
    return raw ? Number(raw) : 0;
  }
  return memoryCreateCounts.get(key) || 0;
}

async function incrementCreateCount(address: string) {
  const key = `${GAME_CREATE_COUNT_KEY}${address.toLowerCase()}`;
  const client = getRedis();
  if (client) {
    // TTL 24h — resets daily
    await client.incr(key);
    await client.expire(key, 86400);
    return;
  }
  memoryCreateCounts.set(key, (memoryCreateCounts.get(key) || 0) + 1);
}

async function resetCreateCount(address: string) {
  const key = `${GAME_CREATE_COUNT_KEY}${address.toLowerCase()}`;
  const client = getRedis();
  if (client) {
    await client.del(key);
    return;
  }
  memoryCreateCounts.delete(key);
}

// ── Claim hash (mirrors BFPayout.sol _buildHash) ─────────────────────────────

function buildClaimHash(player: `0x${string}`, bfGross: bigint, nonce: `0x${string}`, expiry: bigint) {
  return keccak256(
    encodePacked(
      ["uint256", "address", "address", "uint256", "bytes32", "uint256"],
      [BigInt(base.id), CONTRACT_ADDRESS, player, bfGross, nonce, expiry]
    )
  );
}

async function readPrizeWalletBalanceBfUnits() {
  const publicClient = getPublicClient();
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  try {
    const realtime = await publicClient.readContract({
      address: BF_ADDRESS,
      abi: SUPERTOKEN_ABI,
      functionName: "realtimeBalanceOf",
      args: [PRIZE_WALLET_ADDRESS, timestamp],
    });
    const [availableBalance] = realtime as readonly [bigint, bigint, bigint];
    if (availableBalance > BigInt(0)) return availableBalance;
  } catch {
    // fall through to balanceOf
  }
  const raw = await publicClient.readContract({
    address: BF_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [PRIZE_WALLET_ADDRESS],
  });
  return raw as bigint;
}

// ── hitStats validation ───────────────────────────────────────────────────────

function normalizeHitStats(
  input: Partial<HitStats> | undefined,
  difficulty: Difficulty,
  capMultiplier: number,
  waveMultipliers?: number[]
): HitStats {
  const safe = {
    normal: Math.max(0, Math.floor(Number(input?.normal || 0))),
    fast:   Math.max(0, Math.floor(Number(input?.fast   || 0))),
    fuchsia:Math.max(0, Math.floor(Number(input?.fuchsia|| 0))),
    bomb:   Math.max(0, Math.floor(Number(input?.bomb   || 0))),
    super:  Math.max(0, Math.floor(Number(input?.super  || 0))),
  };

  const bounds = waveMultipliers?.length
    ? getHitBoundsForWaveMultipliers(difficulty, waveMultipliers)
    : getHitBounds(difficulty, capMultiplier);

  // Per-type upper bound check (score injection prevention)
  const types = ["normal", "fast", "fuchsia", "bomb", "super"] as const;
  for (const t of types) {
    if (safe[t] > bounds[t]) {
      throw new Error(`Invalid ${t} hit count: ${safe[t]} exceeds max ${bounds[t]} for ${difficulty}`);
    }
  }

  return safe;
}

// ── Ticket calculation ────────────────────────────────────────────────────────

function calculateTickets(params: {
  score: number;
  fee: number;
  prize: number;
  winStreak: number;
  difficulty: Difficulty;
}): number {
  let tickets = 1;
  if (params.score >= getFullValueThreshold(params.difficulty)) tickets += 1;
  if (params.prize > params.fee) tickets += 1;
  const isWin = params.prize > params.fee;
  if (isWin && params.winStreak > 0 && params.winStreak % 10 === 0) {
    tickets += 1;
  }
  return Math.max(1, tickets);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function createGameSession(difficulty: Difficulty, callerAddress?: string) {
  // Anti-spam: if a wallet address is provided, check unpaid session count
  if (callerAddress) {
    const count = await getCreateCount(callerAddress);
    if (count >= MAX_UNPAID_SESSIONS_PER_WALLET) {
      throw new Error("Too many open sessions. Please complete or pay for an existing game first.");
    }
    await incrementCreateCount(callerAddress);
  }

  const cfg = DIFFICULTY_CONFIG[difficulty];
  const capProfile = pickCapProfile();
  const totalWaves = getRunWaveCount(difficulty, capProfile.key);
  const waveTypes = capProfile.key === "jolly"
    ? pickJollyWaveTypes(totalWaves)
    : Array.from({ length: totalWaves }, () => capProfile.key);
  const waveMultipliers = capProfile.key === "jolly"
    ? waveTypes.map((type) => CAP_TYPES.find((item) => item.key === type)?.mult ?? 1)
    : Array.from({ length: totalWaves }, () => capProfile.mult);
  const capMultiplier = Number((waveMultipliers.reduce((sum, mult) => sum + mult, 0) / waveMultipliers.length).toFixed(4));
  const capInfo = capLabel(capMultiplier, capProfile.key);
  const gameId = crypto.randomUUID();
  const gameSecret = crypto.randomBytes(24).toString("hex");
  const prizeEligible = Math.random() < getPrizeflyChance(difficulty, capProfile.key);
  const prizeWaveIndex = prizeEligible ? Math.floor(Math.random() * totalWaves) : null;
  const game: GameRecord = {
    gameId,
    gameSecretHash: sha256Hex(gameSecret),
    difficulty,
    feeExpectedUsdc: cfg.fee,
    capType: capProfile.key,
    capMultiplier,
    capLabel: capInfo.label,
    capScore: getRunCapScore(difficulty, capProfile.key, waveTypes),
    prizeEligible,
    prizeWaveIndex,
    waveTypes,
    waveMultipliers,
    createdAt: Date.now(),
    weekId: (await getActiveWeeklyPeriod()).activeWeekId,
    status: "created",
    ticketAssigned: false,
    ticketCount: 0,
  };
  await saveGame(game);
  return {
    gameId,
    gameSecret,
    difficulty,
    feeExpectedUsdc: cfg.fee,
    capType: capProfile.key,
    capMultiplier,
    capLabel: capInfo.label,
    capIcon: capInfo.icon,
    capScore: game.capScore,
    prizeEligible,
    prizeWaveIndex,
    waveTypes,
    waveMultipliers,
    expiresAt: game.createdAt + 30 * 60 * 1000,
  };
}

export async function verifyGameFee(params: {
  gameId: string;
  gameSecret: string;
  txHash: `0x${string}`;
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}) {
  const game = await getGameById(params.gameId);
  if (!game) throw new Error("Game not found");
  if (!verifySecret(game, params.gameSecret)) throw new Error("Invalid game secret");
  if (game.status !== "created") {
    if (game.feeTxHash && game.feeTxHash.toLowerCase() === params.txHash.toLowerCase()) return game;
    throw new Error("Game already activated");
  }

  const existingFeeOwner = await getFeeTxOwner(params.txHash);
  if (existingFeeOwner && existingFeeOwner !== game.gameId) {
    throw new Error("Fee transaction already linked to another game");
  }

  const publicClient = getPublicClient();
  const receipt = await waitForIndexedReceipt(publicClient, params.txHash, "Fee");
  if (receipt.status !== "success") {
    throw new Error("Fee transaction failed");
  }

  const parsed = parseEventLogs({
    abi: TRANSFER_EVENT_ABI,
    eventName: "Transfer",
    logs: receipt.logs,
    strict: false,
  });

  const expectedAmount = toUSDCUnits(game.feeExpectedUsdc);
  const transfer = parsed.find((log) =>
    log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
    String(log.args.to || "").toLowerCase() === PRIZE_WALLET_ADDRESS.toLowerCase() &&
    BigInt(log.args.value || BigInt(0)) === expectedAmount
  );

  if (!transfer) {
    throw new Error("Fee transaction does not match expected USDC transfer");
  }

  const from = String(transfer.args.from || "").toLowerCase();
  if (!from || from === PRIZE_WALLET_ADDRESS.toLowerCase()) {
    throw new Error("Invalid fee payer");
  }

  game.playerAddress = from;
  game.fid = typeof params.fid === "number" ? params.fid : game.fid;
  game.username = params.username || game.username;
  game.displayName = params.displayName || game.displayName;
  game.pfpUrl = params.pfpUrl || game.pfpUrl;
  game.feeTxHash = params.txHash;
  game.feeVerifiedAt = Date.now();
  game.startedAt = game.feeVerifiedAt;
  game.status = "fee_verified";
  game.weekId = (await getActiveWeeklyPeriod(new Date(game.feeVerifiedAt))).activeWeekId;

  await saveGame(game);
  await setFeeTxOwner(params.txHash, game.gameId);

  // Fee paid — reset the anti-spam counter for this wallet
  await resetCreateCount(from);

  await logTxRecord({
    kind: "game_fee_in",
    status: "ok",
    fid: game.fid,
    playerUsername: game.username,
    playerAddress: game.playerAddress,
    from,
    to: PRIZE_WALLET_ADDRESS,
    amountUsdc: game.feeExpectedUsdc,
    txHash: params.txHash,
    stage: "fee_verified",
    meta: { gameId: game.gameId, difficulty: game.difficulty },
  });

  return game;
}

export async function finishGameSession(params: {
  gameId: string;
  gameSecret: string;
  score: number;
  hitStats: Partial<HitStats>;
}) {
  const game = await getGameById(params.gameId);
  if (!game) throw new Error("Game not found");
  if (!verifySecret(game, params.gameSecret)) throw new Error("Invalid game secret");
  if (!game.playerAddress) throw new Error("Game has no player wallet");
  if (game.status !== "fee_verified") {
    if (game.status === "finished" || game.status === "claim_signed" || game.status === "claimed") return game;
    throw new Error("Game not activated");
  }

  const now = Date.now();
  const minDurationMs = estimateMinimumGameDurationMs(game.difficulty, game.waveTypes?.length || undefined, game.waveTypes);
  if (!game.startedAt || now - game.startedAt < minDurationMs) {
    throw new Error("Game finished too early");
  }
  if (now - (game.startedAt || now) > 20 * 60 * 1000) {
    throw new Error("Game finish window expired");
  }

  // Validate hitStats per-type bounds (B-2 fix: score injection prevention)
  const hitStats = normalizeHitStats(params.hitStats, game.difficulty, game.capMultiplier, game.waveMultipliers);

  const rawScore = deriveScoreFromHits(game.difficulty, hitStats, game.capType);
  const realizedScore = clampLiveScore(rawScore, game.difficulty, game.capType, game.waveTypes);
  const reportedScore = Number(Math.max(0, Number(params.score || 0)).toFixed(2));
  if (reportedScore !== realizedScore) {
    throw new Error("Reported score does not match validated score");
  }
  if (hitStats.super > 0 && !game.prizeEligible) {
    throw new Error("Prizefly was not enabled for this run");
  }

  const bfPerUsdc = await getBfPerUsdc();
  const bonusUsdc = hitStats.super > 0 ? getPrizeflyBonusUsdc(game.difficulty, game.capType) : 0;
  const prizeUsdc = calculatePrizeUsdc(realizedScore, game.difficulty, bonusUsdc, game.capType);
  const grossBf = prizeUsdc * bfPerUsdc;
  const grossUnits = toBFUnits(grossBf);
  const prizeBfGross = fromBFUnits(grossUnits);
  const potUnits = (grossUnits * BigInt(450)) / BigInt(10000);
  const burnUnits = (grossUnits * BigInt(100)) / BigInt(10000);
  const playerUnits = grossUnits - potUnits - burnUnits;

  // M-3 fix: calculate ticket bonus based on score + fee + win streak
  const playerAddr = game.playerAddress?.toLowerCase() || "";
  let winStreak = 0;
  if (playerAddr) {
    const allGames = await listAllGames();
    const prevWins = allGames.filter(
      (g) => g.playerAddress?.toLowerCase() === playerAddr &&
             g.status === "claimed" &&
             (g.prizeUsdc || 0) > g.feeExpectedUsdc
    );
    winStreak = prevWins.length;
  }
  const ticketCount = calculateTickets({
    score: realizedScore,
    fee: game.feeExpectedUsdc,
    prize: prizeUsdc,
    winStreak,
    difficulty: game.difficulty,
  });

  game.finishedAt = now;
  game.status = "finished";
  game.scoreRealized = realizedScore;
  game.scorePossible = game.capScore;
  game.hitStats = hitStats;
  game.prizeUsdc = Number(prizeUsdc.toFixed(6));
  game.prizeBfGross = prizeBfGross;
  game.prizeBfGrossUnits = grossUnits.toString();
  game.playerBfUnits = playerUnits.toString();
  game.potBfUnits = potUnits.toString();
  game.burnBfUnits = burnUnits.toString();
  game.ticketCount = ticketCount;

  await saveGame(game);
  return game;
}

export async function issueClaimForGame(params: { gameId: string; gameSecret: string }) {
  const game = await getGameById(params.gameId);
  if (!game) throw new Error("Game not found");
  if (!verifySecret(game, params.gameSecret)) throw new Error("Invalid game secret");
  if (!game.playerAddress) throw new Error("Game has no player wallet");
  if (game.status === "claimed") throw new Error("Game already claimed");
  if (!["finished", "claim_signed"].includes(game.status)) throw new Error("Game not ready for claim");
  if (!game.prizeBfGrossUnits) throw new Error("Missing game payout");
  if (!SIGNER_PRIVATE_KEY) throw new Error("Payout signer not configured");

  const balanceUnits = await readPrizeWalletBalanceBfUnits();
  const grossUnits = BigInt(game.prizeBfGrossUnits);
  if (balanceUnits < grossUnits) {
    throw new Error("Prize pool insufficient");
  }

  const normalizedKey = SIGNER_PRIVATE_KEY.startsWith("0x") ? SIGNER_PRIVATE_KEY : `0x${SIGNER_PRIVATE_KEY}`;
  const account = privateKeyToAccount(normalizedKey as `0x${string}`);
  // Always regenerate nonce + expiry (10 min window) — idempotent: replaces old signed state
  const nonce = `0x${crypto.randomBytes(32).toString("hex")}` as `0x${string}`;
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 10 * 60);
  const rawHash = buildClaimHash(game.playerAddress as `0x${string}`, grossUnits, nonce, expiry);
  const signature = await account.signMessage({ message: { raw: rawHash } });

  game.claimNonce = nonce;
  game.claimExpiry = Number(expiry);
  game.claimSignature = signature;
  game.claimSignedAt = Date.now();
  game.status = "claim_signed";
  await saveGame(game);

  return {
    ok: true,
    gameId: game.gameId,
    recipient: game.playerAddress,
    bfGross: game.prizeBfGrossUnits,
    nonce,
    expiry: game.claimExpiry,
    signature,
    contractAddress: CONTRACT_ADDRESS,
    prizeStatus: "claimable" as const,
  };
}

export async function confirmClaimForGame(params: { gameId: string; gameSecret: string; txHash: `0x${string}` }) {
  const game = await getGameById(params.gameId);
  if (!game) throw new Error("Game not found");
  if (!verifySecret(game, params.gameSecret)) throw new Error("Invalid game secret");
  if (game.status === "claimed") return game;
  if (game.status !== "claim_signed") throw new Error("Game claim not signed");
  if (!game.playerAddress || !game.claimNonce || !game.claimExpiry || !game.claimSignature || !game.prizeBfGrossUnits) {
    throw new Error("Incomplete claim state");
  }

  const existingClaimOwner = await getClaimTxOwner(params.txHash);
  if (existingClaimOwner && existingClaimOwner !== game.gameId) {
    throw new Error("Claim transaction already linked to another game");
  }

  const publicClient = getPublicClient();
  const { tx, receipt } = await waitForIndexedClaimTx(publicClient, params.txHash);
  if (receipt.status !== "success") throw new Error("Claim transaction failed");
  if (!tx.to || tx.to.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) {
    throw new Error("Invalid claim target contract");
  }

  const decoded = decodeFunctionData({ abi: BFPAYOUT_ABI, data: tx.input });
  if (decoded.functionName !== "claimPrize") throw new Error("Invalid claim function");
  const [player, bfGross, nonce, expiry, signature] = decoded.args;
  if (String(player).toLowerCase() !== game.playerAddress.toLowerCase()) throw new Error("Claim player mismatch");
  if (BigInt(bfGross) !== BigInt(game.prizeBfGrossUnits)) throw new Error("Claim amount mismatch");
  if (String(nonce).toLowerCase() !== game.claimNonce.toLowerCase()) throw new Error("Claim nonce mismatch");
  if (Number(expiry) !== Number(game.claimExpiry)) throw new Error("Claim expiry mismatch");
  if (String(signature).toLowerCase() !== game.claimSignature.toLowerCase()) throw new Error("Claim signature mismatch");

  game.status = "claimed";
  game.claimTxHash = params.txHash;
  game.claimConfirmedAt = Date.now();
  game.claimMethod = "player";
  game.ticketAssigned = true;
  // ticketCount already calculated in finishGameSession; preserve it
  await saveGame(game);
  await setClaimTxOwner(params.txHash, game.gameId);

  const playerAmountBf = fromBFUnits(BigInt(game.playerBfUnits || "0"));
  const potAmountBf = fromBFUnits(BigInt(game.potBfUnits || "0"));
  const burnAmountBf = fromBFUnits(BigInt(game.burnBfUnits || "0"));
  await logTxRecord({
    kind: "game_prize_out",
    status: "ok",
    fid: game.fid,
    playerUsername: game.username,
    playerAddress: game.playerAddress,
    to: game.playerAddress,
    amountBf: playerAmountBf,
    txHash: params.txHash,
    stage: "winner_transfer_bf",
    meta: { gameId: game.gameId },
  });
  await logTxRecord({
    kind: "game_pot_in",
    status: "ok",
    fid: game.fid,
    playerUsername: game.username,
    playerAddress: game.playerAddress,
    amountBf: potAmountBf,
    txHash: params.txHash,
    stage: "pot_transfer_contract_split",
    meta: { gameId: game.gameId },
  });
  await logTxRecord({
    kind: "game_burn_out",
    status: "ok",
    fid: game.fid,
    playerUsername: game.username,
    playerAddress: game.playerAddress,
    amountBf: burnAmountBf,
    txHash: params.txHash,
    stage: "burn_transfer_contract_split",
    meta: { gameId: game.gameId },
  });

  return game;
}

async function sendPrizeWalletTransfer(to: `0x${string}`, amountUnits: bigint): Promise<`0x${string}`> {
  const wallet = getPrizeWalletClient();
  const publicClient = getPublicClient();
  const txHash = await wallet.writeContract({
    address: BF_ADDRESS,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to, amountUnits],
    account: wallet.account,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export async function rescueUnclaimedGamePayout(gameId: string) {
  const game = await getGameById(gameId);
  if (!game) throw new Error("Game not found");
  if (!game.playerAddress) throw new Error("Game has no player wallet");
  const hasPendingRescueLegs =
    game.claimMethod === "admin_rescue" &&
    (!game.rescuePrizeTxHash || !game.rescuePotTxHash || !game.rescueBurnTxHash);
  if (game.status === "claimed") {
    if (!hasPendingRescueLegs) throw new Error("Game already claimed");
  } else if (!["finished", "claim_signed"].includes(game.status)) {
    throw new Error("Game not ready for admin rescue payout");
  }
  if (!game.prizeBfGrossUnits || !game.playerBfUnits || !game.potBfUnits || !game.burnBfUnits) {
    throw new Error("Game payout split is incomplete");
  }
  if (!PRIZE_WALLET_PRIVATE_KEY) {
    throw new Error("PRIZE_WALLET_PRIVATE_KEY missing");
  }

  const grossUnits = BigInt(game.prizeBfGrossUnits);
  const availableUnits = await readPrizeWalletBalanceBfUnits();
  if (availableUnits < grossUnits) {
    throw new Error("Prize wallet balance insufficient");
  }

  const playerUnits = BigInt(game.playerBfUnits);
  const potUnits = BigInt(game.potBfUnits);
  const burnUnits = BigInt(game.burnBfUnits);

  const createdLogs: Array<{
    kind: "game_prize_out" | "game_pot_in" | "game_burn_out";
    to: `0x${string}`;
    amountBf: number;
    txHash: `0x${string}`;
    stage: string;
  }> = [];

  let prizeTxHash = game.rescuePrizeTxHash;
  let potTxHash = game.rescuePotTxHash;
  let burnTxHash = game.rescueBurnTxHash;

  if (!prizeTxHash && playerUnits > BigInt(0)) {
    prizeTxHash = await sendPrizeWalletTransfer(game.playerAddress as `0x${string}`, playerUnits);
    game.rescuePrizeTxHash = prizeTxHash;
    game.claimMethod = "admin_rescue";
    game.status = "claimed";
    game.claimConfirmedAt = game.claimConfirmedAt || Date.now();
    game.claimTxHash = prizeTxHash;
    game.ticketAssigned = true;
    await saveGame(game);
    createdLogs.push({
      kind: "game_prize_out",
      to: game.playerAddress as `0x${string}`,
      amountBf: fromBFUnits(playerUnits),
      txHash: prizeTxHash,
      stage: "admin_rescue_winner_transfer_bf",
    });
    await setClaimTxOwner(prizeTxHash, game.gameId);
  }
  if (!potTxHash && potUnits > BigInt(0)) {
    potTxHash = await sendPrizeWalletTransfer(POT_WALLET_ADDRESS, potUnits);
    game.rescuePotTxHash = potTxHash;
    game.claimMethod = "admin_rescue";
    game.status = "claimed";
    game.claimConfirmedAt = game.claimConfirmedAt || Date.now();
    game.claimTxHash = game.claimTxHash || game.rescuePrizeTxHash || potTxHash;
    game.ticketAssigned = true;
    await saveGame(game);
    createdLogs.push({
      kind: "game_pot_in",
      to: POT_WALLET_ADDRESS,
      amountBf: fromBFUnits(potUnits),
      txHash: potTxHash,
      stage: "admin_rescue_pot_transfer_bf",
    });
  }
  if (!burnTxHash && burnUnits > BigInt(0)) {
    burnTxHash = await sendPrizeWalletTransfer(BURN_WALLET_ADDRESS, burnUnits);
    game.rescueBurnTxHash = burnTxHash;
    game.claimMethod = "admin_rescue";
    game.status = "claimed";
    game.claimConfirmedAt = game.claimConfirmedAt || Date.now();
    game.claimTxHash = game.claimTxHash || game.rescuePrizeTxHash || game.rescuePotTxHash || burnTxHash;
    game.ticketAssigned = true;
    await saveGame(game);
    createdLogs.push({
      kind: "game_burn_out",
      to: BURN_WALLET_ADDRESS,
      amountBf: fromBFUnits(burnUnits),
      txHash: burnTxHash,
      stage: "admin_rescue_burn_transfer_bf",
    });
  }

  game.claimMethod = "admin_rescue";
  game.status = "claimed";
  game.claimConfirmedAt = game.claimConfirmedAt || Date.now();
  game.claimTxHash = (game.rescuePrizeTxHash || game.rescuePotTxHash || game.rescueBurnTxHash) as `0x${string}` | undefined;
  game.ticketAssigned = true;
  await saveGame(game);

  for (const log of createdLogs) {
    await logTxRecord({
      kind: log.kind,
      status: "ok",
      fid: game.fid,
      playerUsername: game.username,
      playerAddress: game.playerAddress,
      to: log.to,
      amountBf: log.amountBf,
      txHash: log.txHash,
      stage: log.stage,
      meta: { gameId: game.gameId },
    });
  }

  return {
    game,
    prizeTxHash,
    potTxHash,
    burnTxHash,
  };
}

export async function listGames(limit = 300) {
  const ids = await getIndex();
  const selected = ids.slice(-limit).reverse();
  const games = await Promise.all(selected.map((id) => getGameById(id)));
  return games.filter(Boolean) as GameRecord[];
}

export async function listAllGames() {
  const ids = await getIndex();
  const games = await Promise.all(ids.map((id) => getGameById(id)));
  return games.filter(Boolean) as GameRecord[];
}

export async function getAdminGames(limit = 300): Promise<AdminGameRow[]> {
  const games = await listGames(limit);
  return games.map((game) => {
    const rescuePending =
      game.claimMethod === "admin_rescue" &&
      (!game.rescuePrizeTxHash || !game.rescuePotTxHash || !game.rescueBurnTxHash);
    return {
    gameId: game.gameId,
    createdAt: game.createdAt,
    weekId: game.weekId,
    difficulty: game.difficulty,
    playerAddress: game.playerAddress,
    username: game.username,
    displayName: game.displayName,
    feeExpectedUsdc: game.feeExpectedUsdc,
    feeTxHash: game.feeTxHash,
    feeTxUrl: txUrl(game.feeTxHash),
    feeVerifiedAt: game.feeVerifiedAt,
    status: game.status,
    scoreRealized: game.scoreRealized,
    scorePossible: game.scorePossible,
    prizeUsdc: game.prizeUsdc,
    prizeBfGross: game.prizeBfGross,
    claimTxHash: game.claimTxHash,
    claimTxUrl: txUrl(game.claimTxHash),
    claimMethod: game.claimMethod,
    rescuePrizeTxHash: game.rescuePrizeTxHash,
    rescuePotTxHash: game.rescuePotTxHash,
    rescueBurnTxHash: game.rescueBurnTxHash,
    rescuePending,
    ticketAssigned: game.ticketAssigned,
    ticketCount: game.ticketCount,
    };
  });
}

export async function getLeaderboardEntries(limit = 20, difficulty?: Difficulty | string): Promise<LeaderboardEntry[]> {
  const allGames = await listAllGames();
  const relevant = allGames.filter((game) => {
    if (game.status !== "claimed") return false;
    if (!game.playerAddress || typeof game.prizeUsdc !== "number") return false;
    if (difficulty && difficulty !== "all" && game.difficulty !== difficulty) return false;
    return true;
  });

  const map = new Map<string, LeaderboardEntry>();
  for (const game of relevant) {
    const key = game.playerAddress!.toLowerCase();
    const existing = map.get(key);
    const win = (game.prizeUsdc || 0) > game.feeExpectedUsdc;
    const fallbackFid = Number.parseInt(key.slice(2, 10), 16) || 0;
    if (!existing) {
      map.set(key, {
        fid: game.fid || fallbackFid,
        username: game.username || shortAddress(key),
        displayName: game.displayName || game.username || shortAddress(key),
        pfpUrl: game.pfpUrl || "",
        address: game.playerAddress,
        games: 1,
        wins: win ? 1 : 0,
        net: (game.prizeUsdc || 0) - game.feeExpectedUsdc,
        totalPrize: game.prizeUsdc || 0,
        totalFees: game.feeExpectedUsdc,
        lastPlayed: game.claimConfirmedAt || game.finishedAt || game.createdAt,
      });
    } else {
      existing.games += 1;
      existing.wins += win ? 1 : 0;
      existing.net += (game.prizeUsdc || 0) - game.feeExpectedUsdc;
      existing.totalPrize += game.prizeUsdc || 0;
      existing.totalFees += game.feeExpectedUsdc;
      existing.lastPlayed = Math.max(existing.lastPlayed, game.claimConfirmedAt || game.finishedAt || game.createdAt);
      if (!existing.pfpUrl && game.pfpUrl) existing.pfpUrl = game.pfpUrl;
      if (!existing.displayName && game.displayName) existing.displayName = game.displayName;
      if (!existing.username && game.username) existing.username = game.username;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.net - a.net || b.wins - a.wins || b.games - a.games || b.lastPlayed - a.lastPlayed)
    .slice(0, limit);
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export async function getCurrentWeekTicketState() {
  const weekId = (await getActiveWeeklyPeriod()).activeWeekId;
  const allGames = await listAllGames();
  const games = allGames.filter((game) => game.weekId === weekId && game.ticketAssigned && game.status === "claimed");
  const tickets: Record<string, number> = {};
  const wins: Record<string, number> = {};
  let potBf = 0;
  for (const game of games) {
    const addr = game.playerAddress?.toLowerCase();
    if (!addr) continue;
    const ticketCount = game.ticketCount || 0;
    tickets[addr] = (tickets[addr] || 0) + ticketCount;
    if ((game.prizeUsdc || 0) > game.feeExpectedUsdc) {
      wins[addr] = (wins[addr] || 0) + 1;
    }
    potBf += fromBFUnits(BigInt(game.potBfUnits || "0"));
  }
  return { weekId, potBf, tickets, wins, pendingTickets: {}, snapshot: null };
}

export async function getUserWeeklyTickets(address: string) {
  const state = await getCurrentWeekTicketState();
  const addr = address.toLowerCase();
  return {
    claimed: state.tickets[addr] || 0,
    pending: 0,
  };
}
