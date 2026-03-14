import { type Difficulty } from "@/lib/gameRules";
import { getAdminGames, getLeaderboardEntries, listAllGames } from "@/lib/gameSessions";
import { getWeeklyState } from "@/lib/weekly";

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

export async function saveGameResult() {
  return;
}

export async function getLeaderboardStats(limit = 20, difficulty?: string): Promise<UserStats[]> {
  return getLeaderboardEntries(limit, difficulty as Difficulty | undefined);
}

export async function getWeeklyLeaderboardStats(limit = 20, difficulty?: string): Promise<(UserStats & { tickets: number })[]> {
  const weekly = await getWeeklyState();
  const stats = await getWeeklyAdminStats(weekly.weekId);
  return stats.players
    .filter((player) => !difficulty || difficulty === "all" || player.gamesByDifficulty[difficulty] > 0)
    .map((player) => ({
      ...player,
      tickets: weekly.tickets[player.address?.toLowerCase() || ""] || 0,
    }))
    .sort((a, b) => b.net - a.net || b.tickets - a.tickets || b.games - a.games)
    .slice(0, limit);
}

export async function getAdminStats(): Promise<AdminStats> {
  const games = await listAllGames();
  const claimed = games.filter((game) => game.status === "claimed");
  const gamesByDifficulty: Record<string, number> = {};
  const playerMap = new Map<string, AdminPlayerStats>();
  let totalFees = 0;
  let totalPrizes = 0;

  for (const game of claimed) {
    gamesByDifficulty[game.difficulty] = (gamesByDifficulty[game.difficulty] || 0) + 1;
    totalFees += game.feeExpectedUsdc;
    totalPrizes += game.prizeUsdc || 0;
    const addr = (game.playerAddress || `unknown:${game.gameId}`).toLowerCase();
    const win = (game.prizeUsdc || 0) > game.feeExpectedUsdc;
    const fallbackFid = game.fid || Number.parseInt(addr.replace(/^0x/, "").slice(0, 8), 16) || 0;
    const existing = playerMap.get(addr);
    if (!existing) {
      playerMap.set(addr, {
        fid: fallbackFid,
        username: game.username || addr.slice(0, 6),
        displayName: game.displayName || game.username || addr.slice(0, 6),
        pfpUrl: game.pfpUrl || "",
        address: game.playerAddress,
        games: 1,
        wins: win ? 1 : 0,
        losses: win ? 0 : 1,
        winRate: 0,
        net: (game.prizeUsdc || 0) - game.feeExpectedUsdc,
        totalPrize: game.prizeUsdc || 0,
        totalFees: game.feeExpectedUsdc,
        lastPlayed: game.claimConfirmedAt || game.finishedAt || game.createdAt,
        gamesByDifficulty: { [game.difficulty]: 1 },
      });
    } else {
      existing.games += 1;
      existing.wins += win ? 1 : 0;
      existing.losses += win ? 0 : 1;
      existing.net += (game.prizeUsdc || 0) - game.feeExpectedUsdc;
      existing.totalPrize += game.prizeUsdc || 0;
      existing.totalFees += game.feeExpectedUsdc;
      existing.lastPlayed = Math.max(existing.lastPlayed, game.claimConfirmedAt || game.finishedAt || game.createdAt);
      existing.gamesByDifficulty[game.difficulty] = (existing.gamesByDifficulty[game.difficulty] || 0) + 1;
      if (!existing.pfpUrl && game.pfpUrl) existing.pfpUrl = game.pfpUrl;
      if (!existing.address && game.playerAddress) existing.address = game.playerAddress;
    }
  }

  const players = Array.from(playerMap.values()).map((player) => ({
    ...player,
    winRate: player.games ? Math.round((player.wins / player.games) * 100) : 0,
  }));

  return {
    totalGames: claimed.length,
    uniquePlayers: playerMap.size,
    totalFees,
    totalPrizes,
    gamesByDifficulty,
    players: players.sort((a, b) => b.net - a.net || b.games - a.games),
  };
}

export async function resetLeaderboard() {
  // no-op: leaderboard derives from authoritative game records
  await getAdminGames(1);
}

export async function getWeeklyAdminStats(weekId: string): Promise<AdminStats> {
  const games = await listAllGames();
  // Only include claimed games that belong to the requested week
  const claimed = games.filter((game) => game.status === "claimed" && game.weekId === weekId);
  const gamesByDifficulty: Record<string, number> = {};
  const playerMap = new Map<string, AdminPlayerStats>();
  let totalFees = 0;
  let totalPrizes = 0;

  for (const game of claimed) {
    gamesByDifficulty[game.difficulty] = (gamesByDifficulty[game.difficulty] || 0) + 1;
    totalFees += game.feeExpectedUsdc;
    totalPrizes += game.prizeUsdc || 0;
    const addr = (game.playerAddress || `unknown:${game.gameId}`).toLowerCase();
    const win = (game.prizeUsdc || 0) > game.feeExpectedUsdc;
    const fallbackFid = game.fid || Number.parseInt(addr.replace(/^0x/, "").slice(0, 8), 16) || 0;
    const existing = playerMap.get(addr);
    if (!existing) {
      playerMap.set(addr, {
        fid: fallbackFid,
        username: game.username || addr.slice(0, 6),
        displayName: game.displayName || game.username || addr.slice(0, 6),
        pfpUrl: game.pfpUrl || "",
        address: game.playerAddress,
        games: 1,
        wins: win ? 1 : 0,
        losses: win ? 0 : 1,
        winRate: 0,
        net: (game.prizeUsdc || 0) - game.feeExpectedUsdc,
        totalPrize: game.prizeUsdc || 0,
        totalFees: game.feeExpectedUsdc,
        lastPlayed: game.claimConfirmedAt || game.finishedAt || game.createdAt,
        gamesByDifficulty: { [game.difficulty]: 1 },
      });
    } else {
      existing.games += 1;
      existing.wins += win ? 1 : 0;
      existing.losses += win ? 0 : 1;
      existing.net += (game.prizeUsdc || 0) - game.feeExpectedUsdc;
      existing.totalPrize += game.prizeUsdc || 0;
      existing.totalFees += game.feeExpectedUsdc;
      existing.lastPlayed = Math.max(existing.lastPlayed, game.claimConfirmedAt || game.finishedAt || game.createdAt);
      existing.gamesByDifficulty[game.difficulty] = (existing.gamesByDifficulty[game.difficulty] || 0) + 1;
      if (!existing.pfpUrl && game.pfpUrl) existing.pfpUrl = game.pfpUrl;
      if (!existing.address && game.playerAddress) existing.address = game.playerAddress;
    }
  }

  const players = Array.from(playerMap.values()).map((player) => ({
    ...player,
    winRate: player.games ? Math.round((player.wins / player.games) * 100) : 0,
  }));

  return {
    totalGames: claimed.length,
    uniquePlayers: playerMap.size,
    totalFees,
    totalPrizes,
    gamesByDifficulty,
    players: players.sort((a, b) => b.net - a.net || b.games - a.games),
  };
}
