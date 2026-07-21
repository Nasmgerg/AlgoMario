import { CellType } from './Level.js';

/** Az alapszint (talaj) vastagsága cellában. */
export const FLOOR_THICKNESS = 2;

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {number} levelLength @param {number} row @param {number} col
 * @returns {number}
 */
function idx(levelLength, row, col) {
  return row * levelLength + col;
}

/**
 * @typedef {object} ChunkContext
 * @property {Uint8Array} grid - a teljes pálya cellabuffere (megosztott, írható)
 * @property {number} height
 * @property {number} levelLength - a teljes pálya szélessége (nem a chunké!)
 * @property {number} colOffset - a chunk kezdő oszlopa a teljes pályán
 * @property {number} width - a chunk szélessége
 * @property {import('../core/Rng.js').Rng} rng
 * @property {{difficulty: number, gapFrequency: number, coinDensity: number, platformDensity: number}} params
 */

/**
 * @param {ChunkContext} ctx @param {number} localRow @param {number} localCol @param {number} type
 */
function setCell(ctx, localRow, localCol, type) {
  if (localRow < 0 || localRow >= ctx.height || localCol < 0 || localCol >= ctx.width) return;
  ctx.grid[idx(ctx.levelLength, localRow, ctx.colOffset + localCol)] = type;
}

/** A talaj tetejének (első szilárd) sora — a fölötte lévő sor a járható felszín. */
function groundTopRow(ctx) {
  return ctx.height - FLOOR_THICKNESS;
}

/** @param {ChunkContext} ctx @param {number} localCol */
function fillGroundColumn(ctx, localCol) {
  for (let row = groundTopRow(ctx); row < ctx.height; row += 1) {
    setCell(ctx, row, localCol, CellType.WALL);
  }
}

/** @param {ChunkContext} ctx */
function fillFlatGround(ctx) {
  for (let localCol = 0; localCol < ctx.width; localCol += 1) {
    fillGroundColumn(ctx, localCol);
  }
}

/** Sima talaj (SPEC.md 4.2: `flat`). */
function buildFlat(ctx) {
  fillFlatGround(ctx);
}

/** 2-5 cella széles lyuk, biztonsági margóval mindkét oldalon (`gap`). */
function buildGap(ctx) {
  const { rng, width } = ctx;
  const gapWidth = clamp(rng.nextInt(2, 6), 1, width - 2);
  const remaining = width - gapWidth;
  const leftMargin = remaining > 1 ? rng.nextInt(1, remaining) : remaining;
  for (let localCol = 0; localCol < leftMargin; localCol += 1) fillGroundColumn(ctx, localCol);
  for (let localCol = leftMargin + gapWidth; localCol < width; localCol += 1) fillGroundColumn(ctx, localCol);
}

/** Lépcsős emelkedés/ereszkedés (`stairs`). */
function buildStairs(ctx) {
  const { rng, width, height } = ctx;
  const ascending = rng.chance(0.5);
  const stepWidth = rng.nextInt(1, 3);
  const baseline = groundTopRow(ctx);
  const lastStepIndex = Math.floor((width - 1) / stepWidth);
  // Az emelkedés korlátozott (fennsíkban végződik), hogy a chunk vége a szomszédos chunk baseline-jához képest a JumpTable tartományán belül maradjon (SPEC.md 5.2).
  const maxSteps = 4;
  for (let localCol = 0; localCol < width; localCol += 1) {
    const stepIndex = Math.floor(localCol / stepWidth);
    const stepsAboveBaseline = ascending
      ? Math.min(stepIndex, maxSteps)
      : Math.min(lastStepIndex - stepIndex, maxSteps);
    const solidTop = clamp(baseline - stepsAboveBaseline, 1, height - 1);
    for (let row = solidTop; row < height; row += 1) setCell(ctx, row, localCol, CellType.WALL);
  }
}

/** 1-3 cella magas cső a sima talajon (`pipe`). */
function buildPipe(ctx) {
  const { rng, width } = ctx;
  fillFlatGround(ctx);
  if (width < 3) return;
  const pipeCol = rng.nextInt(1, width - 1);
  const pipeHeight = rng.nextInt(1, 4);
  const top = groundTopRow(ctx);
  for (let h = 1; h <= pipeHeight; h += 1) {
    setCell(ctx, top - h, pipeCol, CellType.PIPE);
  }
}

/** Lebegő platform, alatta átjárással (`platform`). */
function buildPlatform(ctx) {
  const { rng, width } = ctx;
  fillFlatGround(ctx);
  const platformWidth = Math.min(rng.nextInt(3, 7), width - 2);
  if (platformWidth < 1) return;
  const maxStart = width - platformWidth - 1;
  if (maxStart < 1) return;
  const startCol = rng.nextInt(1, maxStart + 1);
  const top = groundTopRow(ctx);
  const platformRow = clamp(top - rng.nextInt(3, 6), 1, top - 1);
  for (let localCol = startCol; localCol < startCol + platformWidth; localCol += 1) {
    setCell(ctx, platformRow, localCol, CellType.WALL);
  }
}

/** Érmeív ugrási pálya mentén (`coin_arc`). */
function buildCoinArc(ctx) {
  const { width } = ctx;
  fillFlatGround(ctx);
  const top = groundTopRow(ctx);
  for (let localCol = 1; localCol < width - 1; localCol += 1) {
    const t = localCol / (width - 1);
    const arc = Math.round(Math.sin(Math.PI * t) * 3);
    const coinRow = clamp(top - 1 - arc, 1, top - 1);
    setCell(ctx, coinRow, localCol, CellType.COIN);
  }
}

/** Surprise blokkok sora ugrási magasságban (`surprise_row`). */
function buildSurpriseRow(ctx) {
  const { width } = ctx;
  fillFlatGround(ctx);
  const top = groundTopRow(ctx);
  const row = clamp(top - 4, 1, top - 1);
  for (let localCol = 1; localCol < width - 1; localCol += 2) {
    setCell(ctx, row, localCol, CellType.SURPRISE);
  }
}

/** Lyuk + benne lebegő platform (`gap_platform`). */
function buildGapPlatform(ctx) {
  const { rng, width } = ctx;
  const gapWidth = clamp(rng.nextInt(3, 8), 2, width - 2);
  const remaining = width - gapWidth;
  const leftMargin = remaining > 1 ? rng.nextInt(1, remaining) : remaining;
  for (let localCol = 0; localCol < leftMargin; localCol += 1) fillGroundColumn(ctx, localCol);
  for (let localCol = leftMargin + gapWidth; localCol < width; localCol += 1) fillGroundColumn(ctx, localCol);

  const top = groundTopRow(ctx);
  const platformWidth = Math.min(3, Math.max(1, gapWidth - 2));
  const platformStart = leftMargin + Math.floor((gapWidth - platformWidth) / 2);
  const platformRow = clamp(top - rng.nextInt(0, 3), 1, top - 1);
  for (let localCol = platformStart; localCol < platformStart + platformWidth; localCol += 1) {
    setCell(ctx, platformRow, localCol, CellType.WALL);
  }
}

/** A nyolc chunk-típus (SPEC.md 4.2); `category` a LevelGenerator súlyozásához (gapFrequency/platformDensity/coinDensity). */
export const CHUNK_TYPES = Object.freeze([
  Object.freeze({ type: 'flat', minDifficulty: 0, minWidth: 4, maxWidth: 8, category: 'flat', build: buildFlat }),
  Object.freeze({ type: 'gap', minDifficulty: 1, minWidth: 4, maxWidth: 8, category: 'gap', build: buildGap }),
  Object.freeze({ type: 'stairs', minDifficulty: 1, minWidth: 4, maxWidth: 10, category: 'flat', build: buildStairs }),
  Object.freeze({ type: 'pipe', minDifficulty: 1, minWidth: 4, maxWidth: 8, category: 'flat', build: buildPipe }),
  Object.freeze({
    type: 'platform',
    minDifficulty: 2,
    minWidth: 6,
    maxWidth: 12,
    category: 'platform',
    build: buildPlatform,
  }),
  Object.freeze({ type: 'coin_arc', minDifficulty: 0, minWidth: 4, maxWidth: 8, category: 'coin', build: buildCoinArc }),
  Object.freeze({
    type: 'surprise_row',
    minDifficulty: 1,
    minWidth: 4,
    maxWidth: 8,
    category: 'coin',
    build: buildSurpriseRow,
  }),
  Object.freeze({
    type: 'gap_platform',
    minDifficulty: 3,
    minWidth: 6,
    maxWidth: 12,
    category: 'gap',
    build: buildGapPlatform,
  }),
]);
