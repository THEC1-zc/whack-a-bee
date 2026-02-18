export interface LeaderboardEntry {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  score: number;
  difficulty: string;
  timestamp: number;
}

const store = new Map<string, LeaderboardEntry>();

export function saveScore(entry: LeaderboardEntry) {
  const key = `${entry.fid}-${entry.difficulty}`;
  const existing = store.get(key);
  if (!existing || entry.score > existing.score) {
    store.set(key, entry);
  }
}

export function getLeaderboard(limit = 20): LeaderboardEntry[] {
  return Array.from(store.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
