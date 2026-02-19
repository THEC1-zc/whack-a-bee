import Redis from "ioredis";
import { updateWeeklyTickets } from "./weekly";

export interface GameResult {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  address?: string;
  score: number;
  prize: number;
  fee: number;
  difficulty: string;
  timestamp: number;
}

export interface UserStats {
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
}

export interface AdminPlayerStats extends UserStats {
  losses: number;
  winRate: number;
  gamesByDifficulty: Record<string, number>;
}

export interface AdminStats {
  totalGames: number;
  uniquePlayers: number;
  totalFees: number;
  totalPrizes: number;
  gamesByDifficulty: Record<string, number>;
  players: AdminPlayerStats[];
}

const MAX_GAMES = 500;
const KV_KEY = "leaderboard:games";
const memoryStore: GameResult[] = [];
let redis: Redis | null = null;

function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redis = new Redis(url);
  return redis;
}

async function loadGames(): Promise<GameResult[]> {
  const client = getRedis();
  if (client) {
    const raw = await client.get(KV_KEY);
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
  return memoryStore;
}

async function saveGames(games: GameResult[]) {
  const client = getRedis();
  if (client) {
    await client.set(KV_KEY, JSON.stringify(games));
  } else {
    memoryStore.length = 0;
    memoryStore.push(...games);
  }
}

export async function saveGameResult(entry: GameResult) {
  const games = await loadGames();
  games.push(entry);
  if (games.length > MAX_GAMES) {
    games.splice(0, games.length - MAX_GAMES);
  }
  await saveGames(games);
  await updateWeeklyTickets(entry);
}

export async function getLeaderboardStats(limit = 20, difficulty?: string): Promise<UserStats[]> {
  const games = await loadGames();
  const filtered = difficulty && difficulty !== "all"
    ? games.filter(g => g.difficulty === difficulty)
    : games;

  const map = new Map<number, UserStats>();
  for (const g of filtered) {
    const existing = map.get(g.fid);
    const win = g.prize > g.fee;
    if (!existing) {
      map.set(g.fid, {
        fid: g.fid,
        username: g.username,
        displayName: g.displayName,
        pfpUrl: g.pfpUrl,
        address: g.address,
        games: 1,
        wins: win ? 1 : 0,
        net: g.prize - g.fee,
        totalPrize: g.prize,
        totalFees: g.fee,
        lastPlayed: g.timestamp,
      });
    } else {
      existing.games += 1;
      existing.wins += win ? 1 : 0;
      existing.net += g.prize - g.fee;
      existing.totalPrize += g.prize;
      existing.totalFees += g.fee;
      existing.lastPlayed = Math.max(existing.lastPlayed, g.timestamp);
      if (!existing.address && g.address) existing.address = g.address;
    }
  }

  return Array.from(map.values())
    .sort((a, b) =>
      b.net - a.net ||
      b.wins - a.wins ||
      b.games - a.games ||
      b.lastPlayed - a.lastPlayed
    )
    .slice(0, limit);
}

export async function getAdminStats(): Promise<AdminStats> {
  const games = await loadGames();
  const gamesByDifficulty: Record<string, number> = {};
  const playerMap = new Map<number, AdminPlayerStats>();
  let totalFees = 0;
  let totalPrizes = 0;

  for (const g of games) {
    gamesByDifficulty[g.difficulty] = (gamesByDifficulty[g.difficulty] || 0) + 1;
    totalFees += g.fee;
    totalPrizes += g.prize;

    const win = g.prize > g.fee;
    const existing = playerMap.get(g.fid);
    if (!existing) {
      playerMap.set(g.fid, {
        fid: g.fid,
        username: g.username,
        displayName: g.displayName,
        pfpUrl: g.pfpUrl,
        address: g.address,
        games: 1,
        wins: win ? 1 : 0,
        losses: win ? 0 : 1,
        winRate: 0,
        net: g.prize - g.fee,
        totalPrize: g.prize,
        totalFees: g.fee,
        lastPlayed: g.timestamp,
        gamesByDifficulty: { [g.difficulty]: 1 },
      });
    } else {
      existing.games += 1;
      existing.wins += win ? 1 : 0;
      existing.losses += win ? 0 : 1;
      existing.net += g.prize - g.fee;
      existing.totalPrize += g.prize;
      existing.totalFees += g.fee;
      existing.lastPlayed = Math.max(existing.lastPlayed, g.timestamp);
      existing.gamesByDifficulty[g.difficulty] = (existing.gamesByDifficulty[g.difficulty] || 0) + 1;
      if (!existing.address && g.address) existing.address = g.address;
    }
  }

  const players = Array.from(playerMap.values()).map(p => ({
    ...p,
    winRate: p.games ? Math.round((p.wins / p.games) * 100) : 0,
  }));

  return {
    totalGames: games.length,
    uniquePlayers: playerMap.size,
    totalFees,
    totalPrizes,
    gamesByDifficulty,
    players: players.sort((a, b) => b.net - a.net || b.games - a.games),
  };
}

export async function resetLeaderboard() {
  await saveGames([]);
}
