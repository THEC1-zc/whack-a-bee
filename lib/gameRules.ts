export type Difficulty = "easy" | "medium" | "hard";
export type HitType = "normal" | "fast" | "fuchsia" | "bomb" | "super";
export type CapTypeKey = "low" | "nice" | "average" | "big" | "mega" | "jolly";

type DifficultyConfig = {
  label: string;
  emoji: string;
  waves: number;
  maxPts: number;
  fee: number;
  color: string;
};

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: { label: "Easy", emoji: "🟢", waves: 15, maxPts: 45, fee: 0.015, color: "#16a34a" },
  medium: { label: "Medium", emoji: "🟡", waves: 13, maxPts: 65, fee: 0.025, color: "#ca8a04" },
  hard: { label: "Hard", emoji: "🔴", waves: 8, maxPts: 85, fee: 0.035, color: "#dc2626" },
};

export const PRIZE_PER_POINT: Record<Difficulty, number> = {
  easy: 0.000276,
  medium: 0.000786,
  hard: 0.00168,
};

export const LIVE_POINT_VALUES: Record<Difficulty, Record<HitType, number>> = {
  easy: { normal: 1, fast: 2, fuchsia: 3, bomb: -1, super: 1 },
  medium: { normal: 1, fast: 3, fuchsia: 5, bomb: -2, super: 1 },
  hard: { normal: 1, fast: 4, fuchsia: 7, bomb: -3, super: 1 },
};

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
  hard: { normal: 1800, fast: 1600, fuchsia: 1500, bomb: 1800, super: 1800 },
};

export const WAVE_TIMEOUT_MS: Partial<Record<Difficulty, number>> = {
  hard: 1050,
};

const BASE_WAVE_MAX: Record<Difficulty, number> = {
  easy: 2,
  medium: 3,
  hard: 5,
};

type WaveProfile = {
  minSpawns: number;
  extraSpawnChances: number[];
  baseBombs: number;
  extraBombChances: number[];
};

export const CAP_TYPES = [
  { key: "low", icon: "🪫", label: "Low", mult: 0.9, pct: 15.0 },
  { key: "nice", icon: "✅", label: "Nice", mult: 1.1, pct: 20.0 },
  { key: "average", icon: "🔥", label: "Average", mult: 1.25, pct: 35.0 },
  { key: "big", icon: "🌟", label: "Big", mult: 2.0, pct: 15.0 },
  { key: "mega", icon: "💥", label: "Mega", mult: 3.0, pct: 5.0 },
  { key: "jolly", icon: "🃏", label: "Jolly", mult: 1.0, pct: 10.0 },
] as const satisfies readonly { key: CapTypeKey; icon: string; label: string; mult: number; pct: number }[];

const STANDARD_CAP_TYPES = CAP_TYPES.filter((item) => item.key !== "jolly");

const PRIZEFLY_DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  easy: 0.42,
  medium: 0.68,
  hard: 1,
};

const PRIZEFLY_TYPE_MULTIPLIER: Record<CapTypeKey, number> = {
  low: 0.45,
  nice: 0.7,
  average: 0.82,
  big: 1,
  mega: 1.5,
  jolly: 0.9,
};

const PRIZEFLY_HARD_BIG_FEE_MULTIPLIER = 2.5;

const EASY_WAVE_PROFILES: Record<CapTypeKey, WaveProfile> = {
  low: { minSpawns: 2, extraSpawnChances: [0.35, 0.15], baseBombs: 1, extraBombChances: [0.25] },
  nice: { minSpawns: 2, extraSpawnChances: [0.5, 0.25], baseBombs: 1, extraBombChances: [0.25] },
  average: { minSpawns: 2, extraSpawnChances: [0.55, 0.3], baseBombs: 1, extraBombChances: [0.3] },
  big: { minSpawns: 2, extraSpawnChances: [0.7, 0.45], baseBombs: 1, extraBombChances: [0.35] },
  mega: { minSpawns: 3, extraSpawnChances: [0.8, 0.55], baseBombs: 1, extraBombChances: [0.35] },
  // Jolly should vary by the underlying per-wave type, not by its own separate profile.
  jolly: { minSpawns: 2, extraSpawnChances: [0.5, 0.25], baseBombs: 1, extraBombChances: [0.25] },
};

export function pickCapProfile() {
  const roll = Math.random() * 100;
  let acc = 0;
  for (const item of CAP_TYPES) {
    acc += item.pct;
    if (roll <= acc) return item;
  }
  return CAP_TYPES[0];
}

export function pickCapMultiplier() {
  return pickCapProfile().mult;
}

export function pickJollyWaveMultipliers(totalWaves: number) {
  return Array.from({ length: totalWaves }, () => pickStandardCapProfile().mult);
}

export function pickStandardCapProfile() {
  const roll = Math.random() * 90;
  let acc = 0;
  for (const item of STANDARD_CAP_TYPES) {
    acc += item.pct;
    if (roll <= acc) return item;
  }
  return STANDARD_CAP_TYPES[0];
}

export function getCapTypeKeyForMultiplier(mult: number): CapTypeKey {
  if (mult >= 3) return "mega";
  if (mult >= 2) return "big";
  if (mult >= 1.25) return "average";
  if (mult >= 1.1) return "nice";
  return "low";
}

export function capLabel(mult: number, capType?: CapTypeKey) {
  if (capType === "jolly") return { icon: "🃏", label: "Jolly" };
  if (mult >= 3) return { icon: "💥", label: "Mega" };
  if (mult >= 2) return { icon: "🌟", label: "Big" };
  if (mult >= 1.25) return { icon: "🔥", label: "Average" };
  if (mult >= 1.1) return { icon: "✅", label: "Nice" };
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

export function getPrizeflyBonusUsdc(difficulty: Difficulty, capType: CapTypeKey) {
  const hardBigAnchorUsdc = DIFFICULTY_CONFIG.hard.fee * PRIZEFLY_HARD_BIG_FEE_MULTIPLIER;
  return Number(
    (hardBigAnchorUsdc * PRIZEFLY_DIFFICULTY_MULTIPLIER[difficulty] * PRIZEFLY_TYPE_MULTIPLIER[capType]).toFixed(6)
  );
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
  return getWavePlanForMultiplier(difficulty, capMultiplier, [roll]).spawnCount;
}

function getFallbackWaveSpawnCount(difficulty: Difficulty, capMultiplier: number, roll = Math.random()) {
  const baseCount = getBaseWaveCount(difficulty, roll);
  return Math.min(9, Math.max(2, Math.round(baseCount * capMultiplier)));
}

function getWaveProfile(difficulty: Difficulty, capType: CapTypeKey): WaveProfile | null {
  if (difficulty === "easy") return EASY_WAVE_PROFILES[capType];
  return null;
}

function countExtra(chances: number[], rolls: number[]) {
  let extra = 0;
  for (let i = 0; i < chances.length; i += 1) {
    const roll = rolls[i] ?? Math.random();
    if (roll < chances[i]) extra += 1;
  }
  return extra;
}

export function getWavePlan(difficulty: Difficulty, capType: CapTypeKey, rolls?: number[]) {
  const profile = getWaveProfile(difficulty, capType);
  if (!profile) {
    const fallbackMultiplier = CAP_TYPES.find((item) => item.key === capType)?.mult ?? 1;
    return {
      spawnCount: getFallbackWaveSpawnCount(difficulty, fallbackMultiplier, rolls?.[0]),
      bombCount: 1,
    };
  }

  const spawnCount = Math.min(
    9,
    profile.minSpawns + countExtra(profile.extraSpawnChances, rolls?.slice(0, profile.extraSpawnChances.length) ?? [])
  );
  const bombCount = Math.max(
    1,
    profile.baseBombs + countExtra(
      profile.extraBombChances,
      rolls?.slice(profile.extraSpawnChances.length, profile.extraSpawnChances.length + profile.extraBombChances.length) ?? []
    )
  );
  return { spawnCount: Math.min(9, Math.max(2, spawnCount)), bombCount };
}

export function getWavePlanForMultiplier(difficulty: Difficulty, capMultiplier: number, rolls?: number[]) {
  return getWavePlan(difficulty, getCapTypeKeyForMultiplier(capMultiplier), rolls);
}

export function getWaveMaxSpawnCount(difficulty: Difficulty, capType: CapTypeKey) {
  const profile = getWaveProfile(difficulty, capType);
  if (!profile) {
    const fallbackMultiplier = CAP_TYPES.find((item) => item.key === capType)?.mult ?? 1;
    return Math.min(9, Math.max(2, Math.round(BASE_WAVE_MAX[difficulty] * fallbackMultiplier)));
  }
  return Math.min(9, profile.minSpawns + profile.extraSpawnChances.length);
}

export function getWaveMaxBombCount(difficulty: Difficulty, capType: CapTypeKey) {
  const profile = getWaveProfile(difficulty, capType);
  if (!profile) return 1;
  return Math.max(1, profile.baseBombs + profile.extraBombChances.length);
}

export function getWaveDelayMs(difficulty: Difficulty, waveIndex: number) {
  const totalWaves = DIFFICULTY_CONFIG[difficulty].waves;
  const cfg = SPAWN_CONFIG[difficulty];
  return Math.max(cfg.min, cfg.base - waveIndex * cfg.step * Math.max(1, Math.floor(10 / totalWaves)));
}

export function getWaveTimeoutMs(difficulty: Difficulty) {
  return WAVE_TIMEOUT_MS[difficulty] ?? null;
}

export function getHitBounds(difficulty: Difficulty, capMultiplier: number): Record<HitType, number> {
  const totalWaves = DIFFICULTY_CONFIG[difficulty].waves;
  const capType = getCapTypeKeyForMultiplier(capMultiplier);
  const totalSpawns = totalWaves * getWaveMaxSpawnCount(difficulty, capType);
  return {
    normal: totalSpawns,
    fast: totalWaves * getFastLimit(capMultiplier),
    fuchsia: FUCHSIA_MAX_PER_GAME,
    bomb: totalWaves * getWaveMaxBombCount(difficulty, capType),
    super: 1,
  };
}

export function getHitBoundsForWaveMultipliers(difficulty: Difficulty, waveMultipliers: number[]): Record<HitType, number> {
  const totals = waveMultipliers.reduce<Record<HitType, number>>(
    (acc, mult) => {
      const capType = getCapTypeKeyForMultiplier(mult);
      const waveSpawnCount = getWaveMaxSpawnCount(difficulty, capType);
      acc.normal += waveSpawnCount;
      acc.fast += getFastLimit(mult);
      acc.fuchsia += 1;
      acc.bomb += getWaveMaxBombCount(difficulty, capType);
      return acc;
    },
    { normal: 0, fast: 0, fuchsia: 0, bomb: 0, super: 1 }
  );
  totals.fuchsia = Math.min(FUCHSIA_MAX_PER_GAME, totals.fuchsia);
  return totals;
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

export function getEffectivePayoutPoints(score: number) {
  return Number(Math.max(0, score).toFixed(2));
}

export function calculatePrizeUsdc(score: number, difficulty: Difficulty, bonusUsdc = 0) {
  const effectivePoints = getEffectivePayoutPoints(score);
  return Number((effectivePoints * PRIZE_PER_POINT[difficulty] + bonusUsdc).toFixed(6));
}

export function getFullValueThreshold(difficulty: Difficulty) {
  return DIFFICULTY_CONFIG[difficulty].maxPts;
}

export function getMaxPrizeUsdc(difficulty: Difficulty, capMultiplier = 1) {
  const cappedScore = Math.max(1, Math.floor(DIFFICULTY_CONFIG[difficulty].maxPts * capMultiplier));
  return calculatePrizeUsdc(cappedScore, difficulty);
}
