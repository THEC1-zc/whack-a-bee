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

// Backward compatibility for historical records created before the
// low/nice/big/mega ladder replaced the old average tier.
const LEGACY_TYPE_ALIASES: Record<string, CapTypeKey> = {
  average: "nice",
};

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

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
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

export function pickCapProfile() {
  const roll = Math.random() * 100;
  let acc = 0;
  for (const item of CAP_TYPES) {
    acc += item.pct;
    if (roll <= acc) return item;
  }
  return CAP_TYPES[0];
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

export function getLivePointValuesForType(difficulty: Difficulty, capType: string): Record<HitType, number> {
  const normalized = normalizeCapType(capType);
  if (normalized === "jolly") {
    const mix = JOLLY_TUNING.waveTypePct;
    const total = mix.low + mix.nice + mix.big + mix.mega;
    const weighted = (key: keyof RunTypeTuning) =>
      (
        GAME_TUNING[difficulty].low[key] * mix.low +
        GAME_TUNING[difficulty].nice[key] * mix.nice +
        GAME_TUNING[difficulty].big[key] * mix.big +
        GAME_TUNING[difficulty].mega[key] * mix.mega
      ) / total;
    return {
      normal: roundToHalf(weighted("normalPoints")),
      fast: roundToHalf(weighted("triplePoints")),
      fuchsia: roundToHalf(weighted("quickPoints")),
      bomb: roundToHalf(weighted("bombPoints")),
      super: roundToHalf(weighted("prizePoints")),
    };
  }
  const tuning = getRunTypeTuning(difficulty, normalized);
  return {
    normal: tuning.normalPoints,
    fast: tuning.triplePoints,
    fuchsia: tuning.quickPoints,
    bomb: tuning.bombPoints,
    super: tuning.prizePoints,
  };
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
  const effectiveTypes =
    waveTypes?.length
      ? waveTypes
      : Array.from({ length: totalWaves }, () => "low");

  // Waves advance as soon as the board is cleared, so using full wave timeout
  // causes false "too fast" failures on strong runs. Keep a smaller server-side
  // minimum that still rejects instant finish abuse right after fee verify.
  let total = 3200;
  for (let i = 0; i < effectiveTypes.length; i += 1) {
    const timeoutMs = getWaveTimeoutMs(difficulty, effectiveTypes[i]);
    total += Math.max(160, Math.floor(timeoutMs * 0.14));
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
  hitStats: { normal: number; fast: number; fuchsia: number; bomb: number; super: number },
  capType: string = "low"
) {
  const points = getLivePointValuesForType(difficulty, capType);
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
