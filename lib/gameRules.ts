import { DIFFICULTIES, DIFFICULTY_META, GAME_TUNING, JOLLY_TUNING, RUN_TYPES, RUN_TYPE_META } from "@/lib/gameConfig.generated";

export type Difficulty = (typeof DIFFICULTIES)[number];
export type RunType = (typeof RUN_TYPES)[number];
export type CapTypeKey = RunType | "jolly";
export type HitType = "normal" | "fast" | "fuchsia" | "bomb" | "super";

type DifficultyConfig = {
  label: string;
  emoji: string;
  waves: number;
  maxPts: number;
  fee: number;
  color: string;
};

type RunTypeTuning = (typeof GAME_TUNING)[Difficulty][RunType];
type WavePlan = { spawnCount: number; bombCount: number };

const LEGACY_TYPE_ALIASES: Record<string, CapTypeKey> = {
  average: "nice",
};

const CAP_TYPE_ORDER: CapTypeKey[] = ["low", "nice", "big", "mega", "jolly"];

export const BEE_LABELS: Record<HitType, string> = {
  normal: "Butterfly",
  fast: "Triplefly",
  fuchsia: "Quickfly",
  bomb: "Bombfly",
  super: "Prizefly",
};

export const CAP_TYPES = [
  ...RUN_TYPES.map((type) => ({
    key: type,
    icon: RUN_TYPE_META[type].icon,
    label: RUN_TYPE_META[type].label,
    mult: RUN_TYPE_META[type].mult,
    pct: GAME_TUNING.easy[type].runRollPct,
  })),
  {
    key: "jolly" as const,
    icon: RUN_TYPE_META.jolly.icon,
    label: RUN_TYPE_META.jolly.label,
    mult: RUN_TYPE_META.jolly.mult,
    pct: JOLLY_TUNING.runRollPct,
  },
] as const satisfies readonly { key: CapTypeKey; icon: string; label: string; mult: number; pct: number }[];

function normalizeCapType(capType?: string | null): CapTypeKey {
  if (!capType) return "low";
  if (capType === "jolly" || RUN_TYPES.includes(capType as RunType)) return capType as CapTypeKey;
  return LEGACY_TYPE_ALIASES[capType] || "low";
}

function getRunTypeTuning(difficulty: Difficulty, capType: CapTypeKey): RunTypeTuning {
  if (capType === "jolly") return GAME_TUNING[difficulty].low;
  return GAME_TUNING[difficulty][capType];
}

function getRunTypePpp(difficulty: Difficulty, capType: CapTypeKey) {
  if (capType === "jolly") {
    const mix = JOLLY_TUNING.waveTypePct;
    const total = mix.low + mix.nice + mix.big + mix.mega;
    return (
      (GAME_TUNING[difficulty].low.pppInputUsdcPerPoint * mix.low +
        GAME_TUNING[difficulty].nice.pppInputUsdcPerPoint * mix.nice +
        GAME_TUNING[difficulty].big.pppInputUsdcPerPoint * mix.big +
        GAME_TUNING[difficulty].mega.pppInputUsdcPerPoint * mix.mega) /
      total
    );
  }
  return GAME_TUNING[difficulty][capType].pppInputUsdcPerPoint;
}

function getRunTypePrizeBonus(difficulty: Difficulty, capType: CapTypeKey) {
  if (capType === "jolly") {
    return {
      easy: JOLLY_TUNING.easyPrizeBonusUsdcGross,
      medium: JOLLY_TUNING.mediumPrizeBonusUsdcGross,
      hard: JOLLY_TUNING.hardPrizeBonusUsdcGross,
    }[difficulty];
  }
  return GAME_TUNING[difficulty][capType].prizeBonusUsdcGross;
}

function getRunTypePerfectPositiveSlots(tuning: RunTypeTuning) {
  return tuning.totalWaves * Math.max(1, tuning.maxButterfliesPerWave - tuning.bombsBasePerWave);
}

function getRunTypePerfectScore(difficulty: Difficulty, capType: CapTypeKey) {
  const tuning = getRunTypeTuning(difficulty, capType);
  const positiveSlots = getRunTypePerfectPositiveSlots(tuning);
  const triples = Math.min(positiveSlots, tuning.tripleMaxPerGame, tuning.totalWaves * tuning.tripleMaxPerWave);
  const quicks = Math.min(
    positiveSlots - triples,
    tuning.quickMaxPerGame,
    tuning.totalWaves * tuning.quickMaxPerWave
  );
  const prize = Math.min(tuning.prizeMaxPerGame, Math.max(0, positiveSlots - triples - quicks));
  const normals = Math.max(0, positiveSlots - triples - quicks - prize);
  return Math.max(
    1,
    Math.floor(
      normals * tuning.normalPoints +
        triples * tuning.triplePoints +
        quicks * tuning.quickPoints +
        prize * tuning.prizePoints
    )
  );
}

function buildDifficultyPointValues(difficulty: Difficulty) {
  const low = GAME_TUNING[difficulty].low;
  return {
    normal: low.normalPoints,
    fast: low.triplePoints,
    fuchsia: low.quickPoints,
    bomb: low.bombPoints,
    super: low.prizePoints,
  };
}

function buildDifficultyDurations(difficulty: Difficulty) {
  const low = GAME_TUNING[difficulty].low;
  return {
    normal: low.normalDurationMs,
    fast: low.tripleDurationMs,
    fuchsia: low.quickDurationMs,
    bomb: low.bombDurationMs,
    super: low.prizeDurationMs,
  };
}

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = Object.fromEntries(
  DIFFICULTIES.map((difficulty) => [
    difficulty,
    {
      label: DIFFICULTY_META[difficulty].label,
      emoji: DIFFICULTY_META[difficulty].emoji,
      waves: GAME_TUNING[difficulty].low.totalWaves,
      maxPts: getRunTypePerfectScore(difficulty, "low"),
      fee: DIFFICULTY_META[difficulty].fee,
      color: DIFFICULTY_META[difficulty].color,
    },
  ])
) as Record<Difficulty, DifficultyConfig>;

export const PRIZE_PER_POINT: Record<Difficulty, number> = Object.fromEntries(
  DIFFICULTIES.map((difficulty) => [difficulty, GAME_TUNING[difficulty].low.pppInputUsdcPerPoint])
) as Record<Difficulty, number>;

export const LIVE_POINT_VALUES: Record<Difficulty, Record<HitType, number>> = Object.fromEntries(
  DIFFICULTIES.map((difficulty) => [difficulty, buildDifficultyPointValues(difficulty)])
) as Record<Difficulty, Record<HitType, number>>;

export const BEE_DURATIONS: Record<Difficulty, Record<HitType, number>> = Object.fromEntries(
  DIFFICULTIES.map((difficulty) => [difficulty, buildDifficultyDurations(difficulty)])
) as Record<Difficulty, Record<HitType, number>>;

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

export function pickJollyWaveCapProfile() {
  const roll = Math.random() * 100;
  let acc = 0;
  for (const type of RUN_TYPES) {
    acc += JOLLY_TUNING.waveTypePct[type];
    if (roll <= acc) {
      return {
        key: type,
        icon: RUN_TYPE_META[type].icon,
        label: RUN_TYPE_META[type].label,
        mult: RUN_TYPE_META[type].mult,
        pct: JOLLY_TUNING.waveTypePct[type],
      };
    }
  }
  return {
    key: "low" as const,
    icon: RUN_TYPE_META.low.icon,
    label: RUN_TYPE_META.low.label,
    mult: RUN_TYPE_META.low.mult,
    pct: JOLLY_TUNING.waveTypePct.low,
  };
}

export function pickJollyWaveMultipliers(totalWaves: number) {
  return Array.from({ length: totalWaves }, () => pickJollyWaveCapProfile().mult);
}

export function pickJollyWaveTypes(totalWaves: number): RunType[] {
  return Array.from({ length: totalWaves }, () => pickJollyWaveCapProfile().key);
}

export function getCapTypeKeyForMultiplier(mult: number): CapTypeKey {
  if (mult >= 3) return "mega";
  if (mult >= 2) return "big";
  if (mult >= 1.1) return "nice";
  return "low";
}

export function getCapMultiplier(capType: CapTypeKey) {
  return RUN_TYPE_META[normalizeCapType(capType)].mult;
}

export function capLabel(mult: number, capType?: string) {
  const normalized = normalizeCapType(capType || getCapTypeKeyForMultiplier(mult));
  return {
    icon: RUN_TYPE_META[normalized].icon,
    label: RUN_TYPE_META[normalized].label,
  };
}

export function getRunWaveCount(difficulty: Difficulty, capType: string) {
  const normalized = normalizeCapType(capType);
  if (normalized === "jolly") return GAME_TUNING[difficulty].low.totalWaves;
  return GAME_TUNING[difficulty][normalized].totalWaves;
}

export function getRunTypeConfig(difficulty: Difficulty, capType: string) {
  return getRunTypeTuning(difficulty, normalizeCapType(capType));
}

export function getWavePlan(difficulty: Difficulty, capType: string, rolls?: number[]): WavePlan {
  const tuning = getRunTypeTuning(difficulty, normalizeCapType(capType));
  const spawnCount = tuning.maxButterfliesPerWave;
  const extraBombRoll = rolls?.[0] ?? Math.random();
  const bombCount = Math.min(
    Math.max(1, spawnCount - 1),
    tuning.bombsBasePerWave + (extraBombRoll < tuning.bombsSecondChance ? 1 : 0)
  );
  return { spawnCount, bombCount };
}

export function getWavePlanForMultiplier(difficulty: Difficulty, capMultiplier: number, rolls?: number[]) {
  return getWavePlan(difficulty, getCapTypeKeyForMultiplier(capMultiplier), rolls);
}

export function getWaveMaxSpawnCount(difficulty: Difficulty, capType: string) {
  return getRunTypeTuning(difficulty, normalizeCapType(capType)).maxButterfliesPerWave;
}

export function getWaveMaxBombCount(difficulty: Difficulty, capType: string) {
  const tuning = getRunTypeTuning(difficulty, normalizeCapType(capType));
  return Math.min(Math.max(1, tuning.maxButterfliesPerWave - 1), tuning.bombsBasePerWave + 1);
}

export function getWaveDelayMs(difficulty: Difficulty, waveIndex: number, totalWaves = DIFFICULTY_CONFIG[difficulty].waves, capType: string = "low") {
  const tuning = getRunTypeTuning(difficulty, normalizeCapType(capType));
  return Math.max(0, tuning.waveDurationMs - waveIndex * Math.max(1, Math.floor(120 / Math.max(1, totalWaves))));
}

export function getWaveTimeoutMs(difficulty: Difficulty, capType: string = "low") {
  return getRunTypeTuning(difficulty, normalizeCapType(capType)).waveDurationMs;
}

export function getFastChance(difficulty: Difficulty, capTypeOrMultiplier: string | number) {
  const capType =
    typeof capTypeOrMultiplier === "number" ? getCapTypeKeyForMultiplier(capTypeOrMultiplier) : normalizeCapType(capTypeOrMultiplier);
  return getRunTypeTuning(difficulty, capType).tripleChancePerWave;
}

export function getFastLimit(difficulty: Difficulty, capTypeOrMultiplier: string | number) {
  const capType =
    typeof capTypeOrMultiplier === "number" ? getCapTypeKeyForMultiplier(capTypeOrMultiplier) : normalizeCapType(capTypeOrMultiplier);
  return getRunTypeTuning(difficulty, capType).tripleMaxPerWave;
}

export function getFuchsiaChance(difficulty: Difficulty, capTypeOrMultiplier: string | number) {
  const capType =
    typeof capTypeOrMultiplier === "number" ? getCapTypeKeyForMultiplier(capTypeOrMultiplier) : normalizeCapType(capTypeOrMultiplier);
  return getRunTypeTuning(difficulty, capType).quickChancePerWave;
}

export function getQuickLimit(difficulty: Difficulty, capTypeOrMultiplier: string | number) {
  const capType =
    typeof capTypeOrMultiplier === "number" ? getCapTypeKeyForMultiplier(capTypeOrMultiplier) : normalizeCapType(capTypeOrMultiplier);
  return getRunTypeTuning(difficulty, capType).quickMaxPerWave;
}

export function getPrizeflyChance(difficulty: Difficulty, capType: string) {
  return getRunTypeTuning(difficulty, normalizeCapType(capType)).prizeChance;
}

export function getPrizeflyBonusUsdc(difficulty: Difficulty, capType: string) {
  return getRunTypePrizeBonus(difficulty, normalizeCapType(capType));
}

export function getRunCapScore(difficulty: Difficulty, capType: string, waveTypes?: string[]) {
  const normalized = normalizeCapType(capType);
  if (!waveTypes?.length || normalized !== "jolly") return getRunTypePerfectScore(difficulty, normalized);
  return Math.max(
    1,
    waveTypes.reduce((total, waveType) => {
      const tuning = getRunTypeTuning(difficulty, normalizeCapType(waveType));
      const positiveSlots = Math.max(1, tuning.maxButterfliesPerWave - tuning.bombsBasePerWave);
      const tripleCount = Math.min(tuning.tripleMaxPerWave, positiveSlots);
      const quickCount = Math.min(tuning.quickMaxPerWave, Math.max(0, positiveSlots - tripleCount));
      const prizeCount = 0;
      const normals = Math.max(0, positiveSlots - tripleCount - quickCount - prizeCount);
      return (
        total +
        normals * tuning.normalPoints +
        tripleCount * tuning.triplePoints +
        quickCount * tuning.quickPoints
      );
    }, 0)
  );
}

export function getHitBounds(difficulty: Difficulty, capTypeOrMultiplier: string | number): Record<HitType, number> {
  const capType =
    typeof capTypeOrMultiplier === "number" ? getCapTypeKeyForMultiplier(capTypeOrMultiplier) : normalizeCapType(capTypeOrMultiplier);
  const tuning = getRunTypeTuning(difficulty, capType);
  const totalWaves = getRunWaveCount(difficulty, capType);
  const positiveSlots = totalWaves * Math.max(1, tuning.maxButterfliesPerWave - tuning.bombsBasePerWave);
  return {
    normal: positiveSlots,
    fast: totalWaves * tuning.tripleMaxPerWave,
    fuchsia: totalWaves * tuning.quickMaxPerWave,
    bomb: totalWaves * getWaveMaxBombCount(difficulty, capType),
    super: tuning.prizeMaxPerGame,
  };
}

export function getHitBoundsForWaveMultipliers(difficulty: Difficulty, waveMultipliers: number[]): Record<HitType, number> {
  return waveMultipliers.reduce<Record<HitType, number>>(
    (acc, mult) => {
      const type = getCapTypeKeyForMultiplier(mult);
      const tuning = getRunTypeTuning(difficulty, type);
      acc.normal += Math.max(1, tuning.maxButterfliesPerWave - tuning.bombsBasePerWave);
      acc.fast += tuning.tripleMaxPerWave;
      acc.fuchsia += tuning.quickMaxPerWave;
      acc.bomb += getWaveMaxBombCount(difficulty, type);
      return acc;
    },
    { normal: 0, fast: 0, fuchsia: 0, bomb: 0, super: 1 }
  );
}

export function estimateMinimumGameDurationMs(difficulty: Difficulty, totalWaves = DIFFICULTY_CONFIG[difficulty].waves, waveTypes?: string[]) {
  let total = 3000;
  const effectiveTypes =
    waveTypes?.length
      ? waveTypes
      : Array.from({ length: totalWaves }, () => "low");
  for (let i = 0; i < effectiveTypes.length; i += 1) {
    total += getWaveTimeoutMs(difficulty, effectiveTypes[i]) + 80;
  }
  return total;
}

export function clampLiveScore(score: number, difficulty: Difficulty, capTypeOrMultiplier: string | number, waveTypes?: string[]) {
  const capType =
    typeof capTypeOrMultiplier === "number" ? getCapTypeKeyForMultiplier(capTypeOrMultiplier) : normalizeCapType(capTypeOrMultiplier);
  const capScore = getRunCapScore(difficulty, capType, waveTypes);
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

export function calculatePrizeUsdc(score: number, difficulty: Difficulty, bonusUsdc = 0, capType: string = "low") {
  const effectivePoints = getEffectivePayoutPoints(score);
  return Number((effectivePoints * getRunTypePpp(difficulty, normalizeCapType(capType)) + bonusUsdc).toFixed(6));
}

export function getFullValueThreshold(difficulty: Difficulty, capType: string = "low") {
  return getRunCapScore(difficulty, capType);
}

export function getMaxPrizeUsdc(difficulty: Difficulty, capType: string = "low") {
  const cappedScore = getRunCapScore(difficulty, capType);
  return calculatePrizeUsdc(cappedScore, difficulty, 0, capType);
}

export function getDifficultyTypes() {
  return CAP_TYPE_ORDER;
}
