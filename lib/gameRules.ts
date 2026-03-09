export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTY_CONFIG: Record<Difficulty, {
  label: string;
  emoji: string;
  time: number;
  maxPts: number;
  fee: number;
  color: string;
}> = {
  easy: { label: "Easy", emoji: "🟢", time: 30, maxPts: 40, fee: 0.015, color: "#16a34a" },
  medium: { label: "Medium", emoji: "🟡", time: 25, maxPts: 60, fee: 0.025, color: "#ca8a04" },
  hard: { label: "Hard", emoji: "🔴", time: 20, maxPts: 80, fee: 0.035, color: "#dc2626" },
};

export const PRIZE_PER_POINT: Record<Difficulty, number> = {
  easy: 0.000522,
  medium: 0.000600,
  hard: 0.000652,
};

export const LIVE_POINT_VALUES: Record<Difficulty, Record<"normal" | "fast" | "fuchsia" | "bomb" | "super", number>> = {
  easy: { normal: 1, fast: 3, fuchsia: 5, bomb: -2, super: 1 },
  medium: { normal: 1, fast: 3, fuchsia: 5, bomb: -2, super: 1 },
  hard: { normal: 1, fast: 3, fuchsia: 5, bomb: -2, super: 1 },
};

export const SUPER_BEE_BONUS_BF = 100000;

// Maximum plausible hit counts per game per difficulty.
// Based on: waves × per-wave spawn limits from the balance sheet.
// Used server-side to reject stat-inflated game submissions.
export const HIT_BOUNDS: Record<Difficulty, Record<"normal" | "fast" | "fuchsia" | "bomb" | "super", number>> = {
  // Easy: 10 waves, board max 9, ~2.76 spawns/wave
  easy:   { normal: 60, fast: 20, fuchsia: 3, bomb: 25, super: 1 },
  // Medium: 9 waves, board max 9, ~2.5 spawns/wave
  medium: { normal: 50, fast: 18, fuchsia: 3, bomb: 20, super: 1 },
  // Hard: 8 waves, board max 9, ~4.2 spawns/wave
  hard:   { normal: 50, fast: 16, fuchsia: 3, bomb: 30, super: 1 },
};

const CAP_DISTRIBUTION = [
  { mult: 0.95, pct: 21.0 },
  { mult: 1.2, pct: 29.0 },
  { mult: 1.5, pct: 30.0 },
  { mult: 2.0, pct: 17.0 },
  { mult: 3.0, pct: 6.0 },
] as const;

export function pickCapMultiplier() {
  const roll = Math.random() * 100;
  let acc = 0;
  for (const item of CAP_DISTRIBUTION) {
    acc += item.pct;
    if (roll <= acc) return item.mult;
  }
  return 1;
}

export function capLabel(mult: number) {
  if (mult >= 3) return { icon: "💥", label: "Mega" };
  if (mult >= 2) return { icon: "🌟", label: "Big" };
  if (mult >= 1.5) return { icon: "🔥", label: "Average" };
  if (mult >= 1.2) return { icon: "✅", label: "Nice" };
  return { icon: "🪫", label: "Low" };
}

export function clampLiveScore(score: number, difficulty: Difficulty, capMultiplier: number) {
  const capScore = Math.max(1, Math.floor(DIFFICULTY_CONFIG[difficulty].maxPts * capMultiplier));
  return Math.max(0, Math.min(score, capScore));
}

export function deriveScoreFromHits(
  difficulty: Difficulty,
  hitStats: { normal: number; fast: number; fuchsia: number; bomb: number; super: number }
) {
  const points = LIVE_POINT_VALUES[difficulty];
  return (
    hitStats.normal * points.normal +
    hitStats.fast * points.fast +
    hitStats.fuchsia * points.fuchsia +
    hitStats.bomb * points.bomb +
    hitStats.super * points.super
  );
}
