// In-memory leaderboard (replace with DB like Upstash/Supabase for production)
export interface LeaderboardEntry {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  score: number;
  timestamp: number;
}

// Simple in-memory store (resets on server restart)
// For production: use Upstash Redis or Supabase
const store = new Map<number, LeaderboardEntry>();

export function saveScore(entry: LeaderboardEntry) {
  const existing = store.get(entry.fid);
  if (!existing || entry.score > existing.score) {
    store.set(entry.fid, entry);
  }
}

export function getLeaderboard(limit = 10): LeaderboardEntry[] {
  return Array.from(store.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
