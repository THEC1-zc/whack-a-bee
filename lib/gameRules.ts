export type Difficulty = "easy" | "medium" | "hard";
export type HitType = "normal" | "fast" | "fuchsia" | "bomb" | "super";

type DifficultyConfig = {
  label: string;
  emoji: string;
  waves: number;
  maxPts: number;
  fee: number;
  color: string;
};

type PayoutBand = {
  upTo: number;
  multiplier: number;
};

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: { label: "Easy", emoji: "🟢", waves: 15, maxPts: 40, fee: 0.015, color: "#16a34a" },
  medium: { label: "Medium", emoji: "🟡", waves: 12, maxPts: 60, fee: 0.025, color: "#ca8a04" },
  hard: { label: "Hard", emoji: "🔴", waves: 9, maxPts: 80, fee: 0.035, color: "#dc2626" },
};

export const PRIZE_PER_POINT: Record<Difficulty, number> = {
  easy: 0.00025,
  medium: 0.0004,
  hard: 0.0006,
};

export const LIVE_POINT_VALUES: Record<Difficulty, Record<HitType, number>> = {
  easy: { normal: 1, fast: 2, fuchsia: 3, bomb: -1, super: 1 },
  medium: { normal: 1, fast: 3, fuchsia: 5, bomb: -2, super: 1 },
  hard: { normal: 1, fast: 4, fuchsia: 7, bomb: -3, super: 1 },
};

export const PAYOUT_BANDS: Record<Difficulty, PayoutBand[]> = {
  easy: [
    { upTo: 20, multiplier: 1 },
    { upTo: 35, multiplier: 0.7 },
    { upTo: Number.POSITIVE_INFINITY, multiplier: 0.4 },
  ],
  medium: [
    { upTo: 30, multiplier: 1 },
    { upTo: 50, multiplier: 0.7 },
    { upTo: Number.POSITIVE_INFINITY, multiplier: 0.4 },
  ],
  hard: [
    { upTo: 40, multiplier: 1 },
    { upTo: 65, multiplier: 0.7 },
    { upTo: Number.POSITIVE_INFINITY, multiplier: 0.4 },
  ],
};

export const SUPER_BEE_BONUS_BF = 100000;
export const FUCHSIA_CHANCE = 0.15;
export const FUCHSIA_MAX_PER_GAME = 3;
export const SUPER_BEE_CHANCE_PER_GAME = 0.025;

export const BEE_LABELS: Record<HitType, string> = {
  normal: "Butterfly",
  fast: "Triplefly",
  fuchsia: "Quickfly",
  bomb: "Bombfly",
  super: "Prizefly",
};

export const BEE_CHANCES = {
  easy: { fast: 0.22 },
  medium: { fast: 0.25 },
  hard: { fast: 0.30 },
} as const;

export const SPAWN_CONFIG = {
  easy: { base: 900, min: 450, step: 16 },
  medium: { base: 820, min: 420, step: 18 },
  hard: { base: 720, min: 380, step: 22 },
} as const;

export const BEE_DURATIONS: Record<Difficulty, Record<HitType, number>> = {
  easy: { normal: 1200, fast: 1050, fuchsia: 750, bomb: 1300, super: 1300 },
  medium: { normal: 1000, fast: 850, fuchsia: 600, bomb: 1000, super: 1000 },
  hard: { normal: 800, fast: 600, fuchsia: 500, bomb: 800, super: 800 },
};

const BASE_WAVE_MAX: Record<Difficulty, number> = {
  easy: 2,
  medium: 3,
  hard: 5,
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

export function isMegaRound(capMultiplier: number) {
  return capMultiplier >= 3;
}

export function getFastChance(difficulty: Difficulty, capMultiplier: number) {
  const base = BEE_CHANCES[difficulty].fast;
  return Math.min(0.95, isMegaRound(capMultiplier) ? base * 2 : base);
}

export function getFastLimit(capMultiplier: number) {
  return isMegaRound(capMultiplier) ? 2 : 1;
}

export function getFuchsiaChance(capMultiplier: number) {
  return Math.min(0.95, isMegaRound(capMultiplier) ? FUCHSIA_CHANCE * 2 : FUCHSIA_CHANCE);
}

export function getSuperChance(capMultiplier: number) {
  return SUPER_BEE_CHANCE_PER_GAME * (isMegaRound(capMultiplier) ? 3 : 1);
}

export function getBaseWaveCount(difficulty: Difficulty, roll = Math.random()) {
  if (difficulty === "easy") return 2;
  if (difficulty === "medium") {
    if (roll < 0.6) return 1;
    if (roll < 0.9) return 2;
    return 3;
  }
  if (roll < 0.15) return 1;
  if (roll < 0.4) return 2;
  if (roll < 0.7) return 3;
  if (roll < 0.9) return 4;
  return 5;
}

export function getWaveSpawnCount(difficulty: Difficulty, capMultiplier: number, roll = Math.random()) {
  const baseCount = getBaseWaveCount(difficulty, roll);
  return Math.min(9, Math.max(2, Math.round(baseCount * capMultiplier)));
}

export function getWaveDelayMs(difficulty: Difficulty, waveIndex: number) {
  const totalWaves = DIFFICULTY_CONFIG[difficulty].waves;
  const cfg = SPAWN_CONFIG[difficulty];
  return Math.max(cfg.min, cfg.base - waveIndex * cfg.step * Math.max(1, Math.floor(10 / totalWaves)));
}

export function getHitBounds(difficulty: Difficulty, capMultiplier: number): Record<HitType, number> {
  const totalWaves = DIFFICULTY_CONFIG[difficulty].waves;
  const totalSpawns = totalWaves * Math.min(9, Math.max(2, Math.round(BASE_WAVE_MAX[difficulty] * capMultiplier)));
  return {
    normal: totalSpawns,
    fast: totalWaves * getFastLimit(capMultiplier),
    fuchsia: FUCHSIA_MAX_PER_GAME,
    bomb: totalWaves,
    super: 1,
  };
}

export function estimateMinimumGameDurationMs(difficulty: Difficulty) {
  const totalWaves = DIFFICULTY_CONFIG[difficulty].waves;
  let total = 3000; // countdown
  for (let waveIndex = 0; waveIndex < totalWaves; waveIndex += 1) {
    total += waveIndex === 0 ? 180 : getWaveDelayMs(difficulty, waveIndex);
  }
  total += Math.max(...Object.values(BEE_DURATIONS[difficulty])) + 250;
  return total;
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

export function getEffectivePayoutPoints(score: number, difficulty: Difficulty) {
  let remaining = Math.max(0, score);
  let previousUpper = 0;
  let effective = 0;
  for (const band of PAYOUT_BANDS[difficulty]) {
    if (remaining <= 0) break;
    const span = Number.isFinite(band.upTo) ? band.upTo - previousUpper : remaining;
    const applied = Math.min(remaining, span);
    effective += applied * band.multiplier;
    remaining -= applied;
    previousUpper = Number.isFinite(band.upTo) ? band.upTo : previousUpper;
  }
  return Number(effective.toFixed(2));
}

export function calculatePrizeUsdc(score: number, difficulty: Difficulty, bonusUsdc = 0) {
  const effectivePoints = getEffectivePayoutPoints(score, difficulty);
  return Number((effectivePoints * PRIZE_PER_POINT[difficulty] + bonusUsdc).toFixed(6));
}

export function getFullValueThreshold(difficulty: Difficulty) {
  return PAYOUT_BANDS[difficulty][0].upTo;
}

export function getMaxPrizeUsdc(difficulty: Difficulty, capMultiplier = 1) {
  const cappedScore = Math.max(1, Math.floor(DIFFICULTY_CONFIG[difficulty].maxPts * capMultiplier));
  return calculatePrizeUsdc(cappedScore, difficulty);
}
