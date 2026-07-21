import { CellType, Level } from './Level.js';

/** Járhatósági validáció (SPEC.md 4.3): a `world` réteg nem függhet az `ai`-tól, ezért a JumpTable tartományát (5.2) használja közvetlenül, szimuláció nélkül. */

const MIN_ROW_DELTA = -5;
const MAX_ROW_DELTA = 8;
const MIN_COL_DELTA = 1;
const MAX_COL_DELTA = 7;

/**
 * Minden oszlophoz a legfelső szilárd cella feletti (járható) sor, vagy
 * `null`, ha az oszlop teljesen járhatatlan gödör.
 * @param {import('./Level.js').Level} level
 * @returns {(number | null)[]}
 */
function computeStandableSurface(level) {
  const surface = new Array(level.length).fill(null);
  for (let col = 0; col < level.length; col += 1) {
    surface[col] = level.surfaceRowAt(col);
  }
  return surface;
}

/**
 * @param {(number | null)[]} surface
 * @param {number} fromCol @param {number} toCol
 * @returns {boolean}
 */
function isTraversable(surface, fromCol, toCol) {
  const fromRow = surface[fromCol];
  const toRow = surface[toCol];
  if (fromRow === null || toRow === null) return false;

  const dCol = toCol - fromCol;
  if (dCol < MIN_COL_DELTA || dCol > MAX_COL_DELTA) return false;

  const dRow = toRow - fromRow;
  if (dRow < MIN_ROW_DELTA || dRow > MAX_ROW_DELTA) return false;

  // Durva akadály-ellenőrzés: a köztes oszlopok felszíne nem lóghat a két
  // végpont alacsonyabbikánál magasabbra (kisebb sorindex = magasabb).
  const clearance = Math.min(fromRow, toRow);
  for (let col = fromCol + 1; col < toCol; col += 1) {
    const midRow = surface[col];
    if (midRow !== null && midRow < clearance) return false;
  }
  return true;
}

/**
 * BFS a járható oszlopok gráfján, `startCol`-ból indulva.
 * @param {import('./Level.js').Level} level
 * @param {number} startCol
 * @returns {{ reachable: Set<number>, surface: (number | null)[] }}
 */
export function findReachableColumns(level, startCol) {
  const surface = computeStandableSurface(level);
  if (surface[startCol] === null) {
    throw new Error(`LevelValidator: a start oszlop (${startCol}) nem járható felszín`);
  }

  const reachable = new Set([startCol]);
  const queue = [startCol];
  while (queue.length > 0) {
    const col = queue.shift();
    const lastCol = Math.min(level.length - 1, col + MAX_COL_DELTA);
    for (let toCol = col + MIN_COL_DELTA; toCol <= lastCol; toCol += 1) {
      if (reachable.has(toCol)) continue;
      if (isTraversable(surface, col, toCol)) {
        reachable.add(toCol);
        queue.push(toCol);
      }
    }
  }
  return { reachable, surface };
}

/**
 * @typedef {object} ValidationResult
 * @property {boolean} walkable
 * @property {Set<number>} reachable
 * @property {(number | null)[]} surface
 * @property {number} startCol
 */

/**
 * @param {import('./Level.js').Level} level
 * @returns {ValidationResult}
 */
export function validateLevel(level) {
  const startCol = Math.floor(level.startPosition.col);
  const { reachable, surface } = findReachableColumns(level, startCol);
  return {
    walkable: reachable.has(level.goalColumn),
    reachable,
    surface,
    startCol,
  };
}

/**
 * Célzott javítás: lépőkő beszúrása a legtávolabb elért oszlop (`frontier`) és az utána következő járható oszlop közé (SPEC.md 4.3, az első szakaszra egyszerűsítve).
 * @param {import('./Level.js').Level} level
 * @param {ValidationResult} validation
 * @returns {import('./Level.js').Level}
 */
export function repairLevel(level, validation) {
  const { reachable, surface } = validation;
  const frontier = Math.max(...reachable);

  let bridgeTargetCol = null;
  for (let col = frontier + 1; col < level.length; col += 1) {
    if (surface[col] !== null) {
      bridgeTargetCol = col;
      break;
    }
  }
  if (bridgeTargetCol === null) {
    throw new Error('LevelValidator.repairLevel: nincs javítható szakasz a frontier után');
  }

  const newCells = Uint8Array.from(level.cells);
  const fromRow = surface[frontier];
  const toRow = surface[bridgeTargetCol];
  const bridgeRow = Math.max(1, Math.round((fromRow + toRow) / 2));
  const bridgeCenterCol = Math.round((frontier + bridgeTargetCol) / 2);
  const bridgeStart = Math.max(frontier + 1, bridgeCenterCol - 1);
  const bridgeEnd = Math.min(bridgeTargetCol - 1, bridgeCenterCol + 1);
  for (let col = bridgeStart; col <= bridgeEnd; col += 1) {
    newCells[bridgeRow * level.length + col] = CellType.WALL;
  }

  const coins = level.coins.filter((c) => newCells[c.row * level.length + c.col] === CellType.COIN);
  const surprises = level.surprises.filter(
    (s) => newCells[s.row * level.length + s.col] === CellType.SURPRISE,
  );

  return new Level({
    height: level.height,
    length: level.length,
    cells: newCells,
    coins,
    surprises,
    startPosition: level.startPosition,
    goalColumn: level.goalColumn,
    maxTicks: level.maxTicks,
    seed: level.seed,
  });
}
