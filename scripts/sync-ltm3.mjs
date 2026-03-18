#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WORKBOOK_PATH = path.join(ROOT, "local-balance", "ltm3.xml");
const GENERATED_PATH = path.join(ROOT, "lib", "gameConfig.generated.ts");

const DIFFICULTIES = ["easy", "medium", "hard"];
const RUN_TYPES = ["low", "nice", "big", "mega"];

const DIFFICULTY_META = {
  easy: { label: "Easy", emoji: "🟢", color: "#16a34a", fee: 0.01, baseWaves: 14, ppp: 0.000342 },
  medium: { label: "Medium", emoji: "🟡", color: "#ca8a04", fee: 0.02, baseWaves: 13, ppp: 0.000468 },
  hard: { label: "Hard", emoji: "🔴", color: "#dc2626", fee: 0.03, baseWaves: 8, ppp: 0.000684 },
};

const RUN_TYPE_META = {
  low: { label: "Low", icon: "🪫", mult: 0.9 },
  nice: { label: "Nice", icon: "✅", mult: 1.1 },
  big: { label: "Big", icon: "🌟", mult: 2.0 },
  mega: { label: "Mega", icon: "💥", mult: 3.0 },
  jolly: { label: "Jolly", icon: "🃏", mult: 1.0 },
};

const RUN_TYPE_ROLL_PCT = {
  low: 24.545455,
  nice: 32.727273,
  big: 24.545455,
  mega: 8.181818,
  jolly: 10,
};

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function encodeEntities(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseWorkbook(xml) {
  const worksheets = {};
  const worksheetPattern = /<Worksheet\b[^>]*ss:Name="([^"]+)"[^>]*>([\s\S]*?)<\/Worksheet>/g;
  for (const match of xml.matchAll(worksheetPattern)) {
    const [, name, body] = match;
    const rows = [];
    const rowPattern = /<Row\b[^>]*>([\s\S]*?)<\/Row>/g;
    for (const rowMatch of body.matchAll(rowPattern)) {
      const cells = [];
      const cellPattern = /<Cell\b[^>]*>([\s\S]*?)<\/Cell>/g;
      for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
        const dataMatch = cellMatch[1].match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/);
        cells.push(dataMatch ? decodeEntities(dataMatch[1]) : "");
      }
      rows.push(cells);
    }
    worksheets[name] = rows;
  }
  return worksheets;
}

function toNumber(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function parseMatrixSheet(rows) {
  const header = rows[0];
  const typeNames = header.slice(1, 5);
  const result = {};
  for (const type of typeNames) result[type] = {};
  for (const row of rows.slice(1)) {
    const [parameter, ...rest] = row;
    if (!parameter) continue;
    typeNames.forEach((type, index) => {
      result[type][parameter] = rest[index] ?? "";
    });
  }
  return result;
}

function parseSingleSheet(rows) {
  const result = {};
  for (const row of rows.slice(1)) {
    if (!row[0]) continue;
    result[row[0]] = row[1] ?? "";
  }
  return result;
}

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyTypeRows(matrix) {
  for (const type of RUN_TYPES) {
    matrix[type].run_roll_pct = String(RUN_TYPE_ROLL_PCT[type]);
  }
  return matrix;
}

function computePrizeBonusUsdcGross(difficulty, type) {
  const difficultyMultiplier = { easy: 0.42, medium: 0.68, hard: 1 }[difficulty];
  const typeMultiplier = { low: 0.45, nice: 0.7, big: 1, mega: 1.5, jolly: 0.9 }[type];
  return round(DIFFICULTY_META.hard.fee * 2.5 * difficultyMultiplier * typeMultiplier, 6);
}

function syncPrizeBonuses(matrixByDifficulty, jollySheet, bfSnapshot) {
  for (const difficulty of DIFFICULTIES) {
    for (const type of RUN_TYPES) {
      matrixByDifficulty[difficulty][type].prize_bonus_usdc_gross = String(computePrizeBonusUsdcGross(difficulty, type));
      matrixByDifficulty[difficulty][type].bf_per_usdc_live_snapshot = String(bfSnapshot);
    }
  }
  jollySheet.easy_prize_bonus_usdc_gross = String(computePrizeBonusUsdcGross("easy", "jolly"));
  jollySheet.medium_prize_bonus_usdc_gross = String(computePrizeBonusUsdcGross("medium", "jolly"));
  jollySheet.hard_prize_bonus_usdc_gross = String(computePrizeBonusUsdcGross("hard", "jolly"));
  jollySheet.bf_per_usdc_live_snapshot = String(bfSnapshot);
  return { matrixByDifficulty, jollySheet };
}

function buildRowsFromMatrix(title, matrix, difficulty) {
  return [
    ["parameter", "low", "nice", "big", "mega", "unit", "note"],
    ["run_roll_pct", matrix.low.run_roll_pct, matrix.nice.run_roll_pct, matrix.big.run_roll_pct, matrix.mega.run_roll_pct, "pct", "normalized standard run-roll odds"],
    ["fee_usdc", matrix.low.fee_usdc, matrix.nice.fee_usdc, matrix.big.fee_usdc, matrix.mega.fee_usdc, "usdc", `primary edit surface for ${difficulty}`],
    ["base_waves", matrix.low.base_waves, matrix.nice.base_waves, matrix.big.base_waves, matrix.mega.base_waves, "count", "shared difficulty baseline"],
    ["extra_waves", matrix.low.extra_waves, matrix.nice.extra_waves, matrix.big.extra_waves, matrix.mega.extra_waves, "count", "type-specific wave growth"],
    ["total_waves", matrix.low.total_waves, matrix.nice.total_waves, matrix.big.total_waves, matrix.mega.total_waves, "count", "base + extra"],
    ["wave_duration_ms", matrix.low.wave_duration_ms, matrix.nice.wave_duration_ms, matrix.big.wave_duration_ms, matrix.mega.wave_duration_ms, "ms", "authoritative wave timeout per type"],
    ["max_butterflies_per_wave", matrix.low.max_butterflies_per_wave, matrix.nice.max_butterflies_per_wave, matrix.big.max_butterflies_per_wave, matrix.mega.max_butterflies_per_wave, "count", "authoritative spawn count per wave"],
    ["triple_max_per_game", matrix.low.triple_max_per_game, matrix.nice.triple_max_per_game, matrix.big.triple_max_per_game, matrix.mega.triple_max_per_game, "count", "authoritative per-run cap"],
    ["triple_max_per_wave", matrix.low.triple_max_per_wave, matrix.nice.triple_max_per_wave, matrix.big.triple_max_per_wave, matrix.mega.triple_max_per_wave, "count", "authoritative per-wave cap"],
    ["triple_chance_per_wave", matrix.low.triple_chance_per_wave, matrix.nice.triple_chance_per_wave, matrix.big.triple_chance_per_wave, matrix.mega.triple_chance_per_wave, "ratio", "authoritative chance on each positive slot"],
    ["triple_points", matrix.low.triple_points, matrix.nice.triple_points, matrix.big.triple_points, matrix.mega.triple_points, "pts", "authoritative score value"],
    ["triple_duration_ms", matrix.low.triple_duration_ms, matrix.nice.triple_duration_ms, matrix.big.triple_duration_ms, matrix.mega.triple_duration_ms, "ms", "authoritative display time"],
    ["quick_max_per_game", matrix.low.quick_max_per_game, matrix.nice.quick_max_per_game, matrix.big.quick_max_per_game, matrix.mega.quick_max_per_game, "count", "authoritative per-run cap"],
    ["quick_max_per_wave", matrix.low.quick_max_per_wave, matrix.nice.quick_max_per_wave, matrix.big.quick_max_per_wave, matrix.mega.quick_max_per_wave, "count", "authoritative per-wave cap"],
    ["quick_chance_per_wave", matrix.low.quick_chance_per_wave, matrix.nice.quick_chance_per_wave, matrix.big.quick_chance_per_wave, matrix.mega.quick_chance_per_wave, "ratio", "authoritative chance on each positive slot"],
    ["quick_points", matrix.low.quick_points, matrix.nice.quick_points, matrix.big.quick_points, matrix.mega.quick_points, "pts", "authoritative score value"],
    ["quick_duration_ms", matrix.low.quick_duration_ms, matrix.nice.quick_duration_ms, matrix.big.quick_duration_ms, matrix.mega.quick_duration_ms, "ms", "authoritative display time"],
    ["prize_max_per_game", matrix.low.prize_max_per_game, matrix.nice.prize_max_per_game, matrix.big.prize_max_per_game, matrix.mega.prize_max_per_game, "count", "authoritative prize cap"],
    ["prize_chance", matrix.low.prize_chance, matrix.nice.prize_chance, matrix.big.prize_chance, matrix.mega.prize_chance, "ratio", "authoritative per-run chance"],
    ["prize_points", matrix.low.prize_points, matrix.nice.prize_points, matrix.big.prize_points, matrix.mega.prize_points, "pts", "authoritative score value"],
    ["prize_bonus_usdc_gross", matrix.low.prize_bonus_usdc_gross, matrix.nice.prize_bonus_usdc_gross, matrix.big.prize_bonus_usdc_gross, matrix.mega.prize_bonus_usdc_gross, "usdc", "authoritative gross Prizefly bonus"],
    ["prize_duration_ms", matrix.low.prize_duration_ms, matrix.nice.prize_duration_ms, matrix.big.prize_duration_ms, matrix.mega.prize_duration_ms, "ms", "authoritative display time"],
    ["normal_points", matrix.low.normal_points, matrix.nice.normal_points, matrix.big.normal_points, matrix.mega.normal_points, "pts", "authoritative score value"],
    ["normal_duration_ms", matrix.low.normal_duration_ms, matrix.nice.normal_duration_ms, matrix.big.normal_duration_ms, matrix.mega.normal_duration_ms, "ms", "authoritative display time"],
    ["bombs_base_per_wave", matrix.low.bombs_base_per_wave, matrix.nice.bombs_base_per_wave, matrix.big.bombs_base_per_wave, matrix.mega.bombs_base_per_wave, "count", "authoritative guaranteed bombs per wave"],
    ["bombs_second_chance", matrix.low.bombs_second_chance, matrix.nice.bombs_second_chance, matrix.big.bombs_second_chance, matrix.mega.bombs_second_chance, "ratio", "authoritative chance for one extra bomb"],
    ["bomb_points", matrix.low.bomb_points, matrix.nice.bomb_points, matrix.big.bomb_points, matrix.mega.bomb_points, "pts", "authoritative score penalty"],
    ["bomb_duration_ms", matrix.low.bomb_duration_ms, matrix.nice.bomb_duration_ms, matrix.big.bomb_duration_ms, matrix.mega.bomb_duration_ms, "ms", "authoritative display time"],
    ["ppp_input_usdc_per_point", matrix.low.ppp_input_usdc_per_point, matrix.nice.ppp_input_usdc_per_point, matrix.big.ppp_input_usdc_per_point, matrix.mega.ppp_input_usdc_per_point, "usdc/pt", "authoritative point-to-USDC conversion"],
    ["bf_per_usdc_live_snapshot", matrix.low.bf_per_usdc_live_snapshot, matrix.nice.bf_per_usdc_live_snapshot, matrix.big.bf_per_usdc_live_snapshot, matrix.mega.bf_per_usdc_live_snapshot, "bf/usdc", "reference snapshot only, live pricing still refreshes at payout time"],
  ];
}

function buildJollyRows(jollySheet) {
  return [
    ["parameter", "value", "unit", "note"],
    ["run_roll_pct", String(RUN_TYPE_ROLL_PCT.jolly), "pct", "standard run-roll chance for Jolly"],
    ["editing_rule", jollySheet.editing_rule || "separate_logic", "text", "Jolly is tuned separately and mixes other types per wave."],
    ["current_runtime_note", jollySheet.current_runtime_note || "expected_mix_profile", "text", "Current app logic treats Jolly as a per-wave mixed profile."],
    ["easy_prize_bonus_usdc_gross", jollySheet.easy_prize_bonus_usdc_gross, "usdc", "authoritative easy Jolly Prizefly bonus"],
    ["medium_prize_bonus_usdc_gross", jollySheet.medium_prize_bonus_usdc_gross, "usdc", "authoritative medium Jolly Prizefly bonus"],
    ["hard_prize_bonus_usdc_gross", jollySheet.hard_prize_bonus_usdc_gross, "usdc", "authoritative hard Jolly Prizefly bonus"],
    ["wave_type_low_pct", jollySheet.wave_type_low_pct, "pct", "authoritative Jolly wave mix"],
    ["wave_type_nice_pct", jollySheet.wave_type_nice_pct, "pct", "authoritative Jolly wave mix"],
    ["wave_type_big_pct", jollySheet.wave_type_big_pct, "pct", "authoritative Jolly wave mix"],
    ["wave_type_mega_pct", jollySheet.wave_type_mega_pct, "pct", "authoritative Jolly wave mix"],
    ["bf_per_usdc_live_snapshot", jollySheet.bf_per_usdc_live_snapshot, "bf/usdc", "reference snapshot only, live pricing still refreshes at payout time"],
    ["workflow", jollySheet.workflow || "edit all easy/all medium/all hard first", "text", "Use this sheet for jolly-specific notes and overrides."],
  ];
}

function isNumericCellValue(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?$/.test(trimmed);
}

function shouldExportAsNumber(sheetName, rowIndex, cellIndex, row, cell) {
  if (rowIndex === 0) return false;
  if (sheetName === "jolly") {
    const numericParams = new Set([
      "run_roll_pct",
      "easy_prize_bonus_usdc_gross",
      "medium_prize_bonus_usdc_gross",
      "hard_prize_bonus_usdc_gross",
      "wave_type_low_pct",
      "wave_type_nice_pct",
      "wave_type_big_pct",
      "wave_type_mega_pct",
      "bf_per_usdc_live_snapshot",
    ]);
    return cellIndex === 1 && numericParams.has(row[0]) && isNumericCellValue(cell);
  }
  return cellIndex >= 1 && cellIndex <= 4 && isNumericCellValue(cell);
}

function renderWorkbook(sheets) {
  const renderRows = (sheetName, rows) =>
    rows
      .map(
        (row, rowIndex) =>
          `    <Row>\n${row
            .map((cell, cellIndex) => {
              const type = shouldExportAsNumber(sheetName, rowIndex, cellIndex, row, cell) ? "Number" : "String";
              return `      <Cell><Data ss:Type="${type}">${encodeEntities(cell)}</Data></Cell>`;
            })
            .join("\n")}\n    </Row>`
      )
      .join("\n");

  const renderSheet = (name, rows) =>
    `  <Worksheet ss:Name="${encodeEntities(name)}">\n   <Table ss:ExpandedColumnCount="${Math.max(...rows.map((row) => row.length))}" ss:ExpandedRowCount="${rows.length}" x:FullColumns="1" x:FullRows="1">\n${renderRows(name, rows)}\n   </Table>\n  </Worksheet>`;

  return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n xmlns:o="urn:schemas-microsoft-com:office:office"\n xmlns:x="urn:schemas-microsoft-com:office:excel"\n xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n xmlns:html="http://www.w3.org/TR/REC-html40">\n <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"></WorksheetOptions>\n${Object.entries(sheets)
    .map(([name, rows]) => renderSheet(name, rows))
    .join("\n")}\n</Workbook>\n`;
}

function buildGeneratedConfig(matrixByDifficulty, jollySheet) {
  const tuning = {};
  for (const difficulty of DIFFICULTIES) {
    tuning[difficulty] = {};
    for (const type of RUN_TYPES) {
      const row = matrixByDifficulty[difficulty][type];
      tuning[difficulty][type] = {
        runRollPct: toNumber(row.run_roll_pct),
        feeUsdc: toNumber(row.fee_usdc),
        baseWaves: toNumber(row.base_waves),
        extraWaves: toNumber(row.extra_waves),
        totalWaves: toNumber(row.total_waves),
        waveDurationMs: toNumber(row.wave_duration_ms),
        maxButterfliesPerWave: toNumber(row.max_butterflies_per_wave),
        tripleMaxPerGame: toNumber(row.triple_max_per_game),
        tripleMaxPerWave: toNumber(row.triple_max_per_wave),
        tripleChancePerWave: toNumber(row.triple_chance_per_wave),
        triplePoints: toNumber(row.triple_points),
        tripleDurationMs: toNumber(row.triple_duration_ms),
        quickMaxPerGame: toNumber(row.quick_max_per_game),
        quickMaxPerWave: toNumber(row.quick_max_per_wave),
        quickChancePerWave: toNumber(row.quick_chance_per_wave),
        quickPoints: toNumber(row.quick_points),
        quickDurationMs: toNumber(row.quick_duration_ms),
        prizeMaxPerGame: toNumber(row.prize_max_per_game),
        prizeChance: toNumber(row.prize_chance),
        prizePoints: toNumber(row.prize_points),
        prizeBonusUsdcGross: toNumber(row.prize_bonus_usdc_gross),
        prizeDurationMs: toNumber(row.prize_duration_ms),
        normalPoints: toNumber(row.normal_points),
        normalDurationMs: toNumber(row.normal_duration_ms),
        bombsBasePerWave: toNumber(row.bombs_base_per_wave),
        bombsSecondChance: toNumber(row.bombs_second_chance),
        bombPoints: toNumber(row.bomb_points),
        bombDurationMs: toNumber(row.bomb_duration_ms),
        pppInputUsdcPerPoint: toNumber(row.ppp_input_usdc_per_point),
        bfPerUsdcLiveSnapshot: toNumber(row.bf_per_usdc_live_snapshot),
      };
    }
  }

  const difficultyMeta = Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [
      difficulty,
      {
        ...DIFFICULTY_META[difficulty],
        ppp: toNumber(tuning[difficulty].low.pppInputUsdcPerPoint),
      },
    ])
  );
  return `// Generated by scripts/sync-ltm3.mjs from local-balance/ltm3.xml\nexport const DIFFICULTY_META = ${JSON.stringify(difficultyMeta, null, 2)} as const;\nexport const RUN_TYPE_META = ${JSON.stringify(RUN_TYPE_META, null, 2)} as const;\nexport const RUN_TYPES = ${JSON.stringify(RUN_TYPES)} as const;\nexport const DIFFICULTIES = ${JSON.stringify(DIFFICULTIES)} as const;\nexport const GAME_TUNING = ${JSON.stringify(tuning, null, 2)} as const;\nexport const JOLLY_TUNING = ${JSON.stringify(
    {
      runRollPct: RUN_TYPE_ROLL_PCT.jolly,
      easyPrizeBonusUsdcGross: toNumber(jollySheet.easy_prize_bonus_usdc_gross),
      mediumPrizeBonusUsdcGross: toNumber(jollySheet.medium_prize_bonus_usdc_gross),
      hardPrizeBonusUsdcGross: toNumber(jollySheet.hard_prize_bonus_usdc_gross),
      waveTypePct: {
        low: toNumber(jollySheet.wave_type_low_pct),
        nice: toNumber(jollySheet.wave_type_nice_pct),
        big: toNumber(jollySheet.wave_type_big_pct),
        mega: toNumber(jollySheet.wave_type_mega_pct),
      },
      bfPerUsdcLiveSnapshot: toNumber(jollySheet.bf_per_usdc_live_snapshot),
    },
    null,
    2
  )} as const;\n`;
}

function main() {
  const xml = fs.readFileSync(WORKBOOK_PATH, "utf8");
  const workbook = parseWorkbook(xml);
  const easyMatrix = applyTypeRows(parseMatrixSheet(workbook["all easy"]));
  const currentMedium = parseMatrixSheet(workbook["all medium"]);
  const currentHard = parseMatrixSheet(workbook["all hard"]);
  const jollySheet = parseSingleSheet(workbook["jolly"]);
  const bfSnapshot = toNumber(easyMatrix.low.bf_per_usdc_live_snapshot || jollySheet.bf_per_usdc_live_snapshot || 0);
  const mediumMatrix = applyTypeRows(cloneDeep(currentMedium));
  const hardMatrix = applyTypeRows(cloneDeep(currentHard));

  for (const type of RUN_TYPES) {
    mediumMatrix[type].fee_usdc = currentMedium[type]?.fee_usdc || String(DIFFICULTY_META.medium.fee);
    mediumMatrix[type].base_waves = currentMedium[type]?.base_waves || String(DIFFICULTY_META.medium.baseWaves);
    mediumMatrix[type].ppp_input_usdc_per_point = currentMedium[type]?.ppp_input_usdc_per_point || String(DIFFICULTY_META.medium.ppp);
    mediumMatrix[type].bf_per_usdc_live_snapshot = currentMedium[type]?.bf_per_usdc_live_snapshot || String(bfSnapshot);
    mediumMatrix[type].total_waves = String(toNumber(mediumMatrix[type].base_waves) + toNumber(mediumMatrix[type].extra_waves));

    hardMatrix[type].fee_usdc = currentHard[type]?.fee_usdc || String(DIFFICULTY_META.hard.fee);
    hardMatrix[type].base_waves = currentHard[type]?.base_waves || String(DIFFICULTY_META.hard.baseWaves);
    hardMatrix[type].ppp_input_usdc_per_point = currentHard[type]?.ppp_input_usdc_per_point || String(DIFFICULTY_META.hard.ppp);
    hardMatrix[type].bf_per_usdc_live_snapshot = currentHard[type]?.bf_per_usdc_live_snapshot || String(bfSnapshot);
    hardMatrix[type].total_waves = String(toNumber(hardMatrix[type].base_waves) + toNumber(hardMatrix[type].extra_waves));
  }

  const matrixByDifficulty = {
    easy: easyMatrix,
    medium: mediumMatrix,
    hard: hardMatrix,
  };
  syncPrizeBonuses(matrixByDifficulty, jollySheet, bfSnapshot);

  const workbookXml = renderWorkbook({
    "all easy": buildRowsFromMatrix("all easy", matrixByDifficulty.easy, "easy"),
    "all medium": buildRowsFromMatrix("all medium", matrixByDifficulty.medium, "medium"),
    "all hard": buildRowsFromMatrix("all hard", matrixByDifficulty.hard, "hard"),
    jolly: buildJollyRows(jollySheet),
  });
  fs.writeFileSync(WORKBOOK_PATH, workbookXml);

  const generated = buildGeneratedConfig(matrixByDifficulty, jollySheet);
  fs.writeFileSync(GENERATED_PATH, generated);
}

main();
