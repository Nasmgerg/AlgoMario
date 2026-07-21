import { Rng } from '../core/Rng.js';
import { LENGTH_PRESETS, DEFAULT_HEIGHT, computeMaxTicks, difficultyPreset } from '../config/difficulty.js';
import { CellType, Level, isSolidCellType } from './Level.js';
import { CHUNK_TYPES, FLOOR_THICKNESS } from './ChunkCatalog.js';
import { validateLevel, repairLevel } from './LevelValidator.js';

/** Az első/utolsó ennyi oszlop mindig `flat` (biztonságos start/cél, SPEC.md 4.2). */
const SAFE_START_COLS = 10;
const SAFE_END_COLS = 5;
const GOAL_POLE_HEIGHT = 5;
const DEFAULT_MAX_REPAIR_ATTEMPTS = 3;

const FLAT_CHUNK = CHUNK_TYPES.find((c) => c.type === 'flat');

/**
 * @param {import('./ChunkCatalog.js').ChunkContext['params']} params
 * @param {typeof CHUNK_TYPES[number]} chunkDef
 * @returns {number}
 */
function chunkWeight(chunkDef, params) {
  switch (chunkDef.category) {
    case 'gap':
      return 1 + params.gapFrequency * 4;
    case 'platform':
      return 1 + params.platformDensity * 4;
    case 'coin':
      return 1 + params.coinDensity * 4;
    default:
      return 2;
  }
}

/**
 * @param {Uint8Array} grid @param {number} height @param {number} length @param {number} col
 * @returns {number | null}
 */
function rawSurfaceRowAt(grid, height, length, col) {
  for (let row = 0; row < height; row += 1) {
    if (isSolidCellType(grid[row * length + col])) return row - 1;
  }
  return null;
}

/** @param {Uint8Array} grid @param {number} height @param {number} length @param {number} goalColumn */
function placeGoal(grid, height, length, goalColumn) {
  const groundTop = height - FLOOR_THICKNESS;
  for (let h = 1; h <= GOAL_POLE_HEIGHT; h += 1) {
    const row = groundTop - h;
    if (row >= 0) grid[row * length + goalColumn] = CellType.GOAL;
  }
}

/** @param {Uint8Array} grid @param {number} height @param {number} length */
function collectCoinsAndSurprises(grid, height, length) {
  const coins = [];
  const surprises = [];
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < length; col += 1) {
      const type = grid[row * length + col];
      if (type === CellType.COIN) {
        coins.push({ id: coins.length, row, col });
      } else if (type === CellType.SURPRISE) {
        surprises.push({ id: surprises.length, row, col });
      }
    }
  }
  return { coins, surprises };
}

/**
 * @param {number} currentSeed - a chunk-RNG-hez ténylegesen használt seed
 * @param {number} originalSeed - a felhasználó által kért, megjelenítendő seed
 * @param {number} retryCount
 * @param {{height: number, length: number, difficulty: number, gapFrequency?: number, coinDensity?: number, platformDensity?: number}} genParams
 * @returns {Level}
 */
function buildRawLevel(currentSeed, originalSeed, retryCount, genParams) {
  const { height, length, difficulty } = genParams;
  const rng = new Rng(currentSeed);
  const preset = difficultyPreset(difficulty);
  const params = {
    difficulty,
    gapFrequency: genParams.gapFrequency ?? preset.gapFrequency,
    coinDensity: genParams.coinDensity ?? preset.coinDensity,
    platformDensity: genParams.platformDensity ?? preset.platformDensity,
  };

  const grid = new Uint8Array(height * length);

  FLAT_CHUNK.build({ grid, height, levelLength: length, colOffset: 0, width: SAFE_START_COLS, rng, params });

  let col = SAFE_START_COLS;
  const middleEnd = length - SAFE_END_COLS;
  while (col < middleEnd) {
    const remaining = middleEnd - col;
    const eligible = CHUNK_TYPES.filter((c) => c.minDifficulty <= difficulty && c.minWidth <= remaining);
    const chunkDef = eligible.length > 0 ? rng.weightedPick(eligible, (c) => chunkWeight(c, params)) : FLAT_CHUNK;
    const maxWidthFit = Math.min(chunkDef.maxWidth, remaining);
    const width = maxWidthFit < chunkDef.minWidth ? maxWidthFit : rng.nextInt(chunkDef.minWidth, maxWidthFit + 1);
    chunkDef.build({ grid, height, levelLength: length, colOffset: col, width, rng, params });
    col += width;
  }
  FLAT_CHUNK.build({ grid, height, levelLength: length, colOffset: col, width: length - col, rng, params });

  const goalColumn = length - 3;
  placeGoal(grid, height, length, goalColumn);

  const { coins, surprises } = collectCoinsAndSurprises(grid, height, length);
  const startRow = rawSurfaceRowAt(grid, height, length, 2);
  if (startRow === null) {
    throw new Error('LevelGenerator: a safe-start zóna nem tartalmaz járható felszínt (belső hiba)');
  }

  return new Level({
    height,
    length,
    cells: grid,
    coins,
    surprises,
    startPosition: { row: startRow, col: 2 },
    goalColumn,
    maxTicks: computeMaxTicks(length),
    seed: originalSeed,
    retryCount,
  });
}

/**
 * Eltávolítja azokat az érméket, amelyek oszlopa a start→cél BFS szerint
 * nem elérhető (SPEC.md 4.3: "Elérhetőségi ellenőrzés az érmékre is fut").
 * @param {Level} level @param {Set<number>} reachableCols
 * @returns {Level}
 */
function removeUnreachableCoins(level, reachableCols) {
  const unreachable = level.coins.filter((c) => !reachableCols.has(c.col));
  if (unreachable.length === 0) return level;

  const cells = Uint8Array.from(level.cells);
  for (const coin of unreachable) {
    cells[coin.row * level.length + coin.col] = CellType.EMPTY;
  }
  const coins = level.coins.filter((c) => reachableCols.has(c.col));

  return new Level({
    height: level.height,
    length: level.length,
    cells,
    coins,
    surprises: level.surprises,
    startPosition: level.startPosition,
    goalColumn: level.goalColumn,
    maxTicks: level.maxTicks,
    seed: level.seed,
    retryCount: level.retryCount,
  });
}

/**
 * @param {number} originalSeed @param {number} currentSeed @param {number} retryCount
 * @param {object} genParams @param {number} maxRepairAttempts
 * @returns {Level}
 */
function buildWithRetryChain(originalSeed, currentSeed, retryCount, genParams, maxRepairAttempts) {
  let level = buildRawLevel(currentSeed, originalSeed, retryCount, genParams);
  let validation = validateLevel(level);

  let repairs = 0;
  while (!validation.walkable && repairs < maxRepairAttempts) {
    level = repairLevel(level, validation);
    validation = validateLevel(level);
    repairs += 1;
  }

  if (!validation.walkable) {
    return buildWithRetryChain(originalSeed, currentSeed + 1, retryCount + 1, genParams, maxRepairAttempts);
  }

  if (retryCount > 0) {
    // SPEC.md 4.3: a retry-számot logolni kell.
    console.info(`Seed ${originalSeed} (retry ${retryCount})`);
  }

  return removeUnreachableCoins(level, validation.reachable);
}

/**
 * Chunk-alapú, seedelt pályagenerálás (SPEC.md 4. szakasz); ha javítás után sem járható, `seed+1`-gyel újragenerál, megőrizve a determinizmust.
 * @param {object} options
 * @param {number} options.seed - kötelező, egész szám (a fallback véletlen
 *   seed generálása és kiírása a hívó/UI felelőssége, SPEC.md 12. szakasz)
 * @param {number} [options.length]
 * @param {number} [options.height]
 * @param {number} [options.difficulty] - 0-4
 * @param {number} [options.gapFrequency] - felülírja a nehézségi presetet
 * @param {number} [options.coinDensity] - felülírja a nehézségi presetet
 * @param {number} [options.platformDensity] - felülírja a nehézségi presetet
 * @param {number} [options.maxRepairAttempts]
 * @returns {Level}
 */
export function generateLevel(options) {
  const {
    seed,
    length = LENGTH_PRESETS.normal,
    height = DEFAULT_HEIGHT,
    difficulty = 1,
    gapFrequency,
    coinDensity,
    platformDensity,
    maxRepairAttempts = DEFAULT_MAX_REPAIR_ATTEMPTS,
  } = options;

  if (!Number.isInteger(seed)) {
    throw new Error(
      `generateLevel: érvénytelen seed (${seed}) — numerikus egész szükséges. ` +
        'A fallback véletlen seed generálása és kiírása a hívó (UI) felelőssége (SPEC.md 12. szakasz).',
    );
  }
  if (length < SAFE_START_COLS + SAFE_END_COLS) {
    throw new Error(
      `generateLevel: a pálya hossza (${length}) túl rövid a kötelező safe start(${SAFE_START_COLS})+end(${SAFE_END_COLS}) zónákhoz`,
    );
  }

  const genParams = { height, length, difficulty, gapFrequency, coinDensity, platformDensity };
  return buildWithRetryChain(seed, seed, 0, genParams, maxRepairAttempts);
}
