import { PHYSICS } from '../config/physics.js';
import { SCORING, computeGoalTimeBonus } from '../config/scoring.js';
import { CellType, isSolidCellType } from '../world/Level.js';
import { RunStatus } from './RunState.js';

/** Akciótér (SPEC.md 3.2. szakasz: 4 elemű, nincs JUMP_RELEASE). */
export const Action = Object.freeze({
  NONE: 0,
  LEFT: 1,
  RIGHT: 2,
  JUMP: 3,
});

const COLLISION_EPS = 1e-9;

// A fizika pozíció-kvantuma: MINDEN sebesség, gyorsulás és súrlódás a 0,05
// többszöröse (JUMP 0.70, GRAVITY 0.05, RUN_ACCEL/FRICTION 0.15, MAX_RUN 0.20,
// MAX_FALL 2.00), ezért a pozíció is mindig 0,05-rácson mozog. A lebegőpontos
// összeadás azonban ~1e-14 zajt hoz be, ami PONTOSAN egy cellahatáron
// (pl. col = 34,0) átbillentheti a `Math.floor`-t → hibás ütközés-döntés.
// A `snapToGrid` a zajt levágja: a döntések így bit-pontosan reprodukálhatók,
// és egy terv folytonosan (újrahorgonyzás nélkül) is a validálttal azonosan
// fut le (M3-audit K1). SPEC.md D8 (determinizmus) szempontjából is nyereség.
const POS_GRID = 20; // 1 / 0.05

/** @param {number} x @returns {number} a 0,05-rácsra kerekített érték */
function snapToGrid(x) {
  return Math.round(x * POS_GRID) / POS_GRID;
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Az `[pos, pos+1)` intervallum által érintett egész cellaindexek (1 vagy 2,
 * a törtrész-illeszkedéstől függően — Mario doboza pontosan 1 cella méretű).
 * A `pos`-t a 0,05-rácson, egész egységekben értékeljük ki, így a döntés
 * float-zaj-immun a cellahatárokon.
 * @param {number} pos
 * @returns {number[]}
 */
function overlappedCells(pos) {
  const units = Math.round(pos * POS_GRID);
  const lo = Math.floor(units / POS_GRID);
  return units % POS_GRID === 0 ? [lo] : [lo, lo + 1];
}

/**
 * A cella tényleges (futásállapot-függő) típusa: egy kiütött surprise a
 * futásállapotban WALL-lá válik (SPEC.md 3.4), a pályán kívüli cellák a
 * pálya szélén szilárd falak, alul nyitott gödör (a "kiesés" feltétel
 * kezeli, nem az ütközés).
 * @param {import('../world/Level.js').Level} level
 * @param {import('./RunState.js').RunState} state
 * @param {number} row @param {number} col
 * @returns {number}
 */
function effectiveCellType(level, state, row, col) {
  if (col < 0 || col >= level.length || row < 0) {
    return CellType.WALL;
  }
  if (row >= level.height) {
    return CellType.EMPTY;
  }
  const raw = level.cellAt(row, col);
  if (raw === CellType.SURPRISE) {
    const id = level.surpriseIdAt(row, col);
    if (id !== null && state.poppedSurprises.has(id)) {
      return CellType.WALL;
    }
  }
  return raw;
}

/**
 * Vízszintes mozgás alkalmazása és ütközés (SPEC.md 3.4 / 1. lépés).
 * @param {import('../world/Level.js').Level} level
 * @param {import('./RunState.js').RunState} state
 * @param {number} vCol
 */
function moveHorizontal(level, state, vCol) {
  let col = snapToGrid(state.col + vCol);
  if (vCol !== 0) {
    const rows = overlappedCells(state.row);
    const leadingCol = vCol > 0 ? Math.floor(col + 1 - COLLISION_EPS) : Math.floor(col);
    const blocked = rows.some((row) => isSolidCellType(effectiveCellType(level, state, row, leadingCol)));
    if (blocked) {
      col = vCol > 0 ? leadingCol - 1 : leadingCol + 1;
      vCol = 0;
    }
  }
  return { col, vCol };
}

/**
 * Függőleges mozgás alkalmazása, ütközés és surprise-kiütés (SPEC.md 3.4 /
 * 2. lépés). A `col` már a vízszintes felbontás utáni érték.
 * @param {import('../world/Level.js').Level} level
 * @param {import('./RunState.js').RunState} state
 * @param {number} col
 * @param {number} vRow
 */
function moveVertical(level, state, col, vRow) {
  let row = snapToGrid(state.row + vRow);
  let grounded = false;
  let poppedSurprises = state.poppedSurprises;
  let scoreDelta = 0;

  if (vRow !== 0) {
    const cols = overlappedCells(col);
    const leadingRow = vRow > 0 ? Math.floor(row + 1 - COLLISION_EPS) : Math.floor(row);
    const hitCols = cols.filter((c) => isSolidCellType(effectiveCellType(level, state, leadingRow, c)));
    if (hitCols.length > 0) {
      if (vRow > 0) {
        row = leadingRow - 1;
        grounded = true;
      } else {
        row = leadingRow + 1;
        for (const c of hitCols) {
          if (effectiveCellType(level, state, leadingRow, c) === CellType.SURPRISE) {
            const id = level.surpriseIdAt(leadingRow, c);
            if (id !== null && !poppedSurprises.has(id)) {
              if (poppedSurprises === state.poppedSurprises) {
                poppedSurprises = new Set(poppedSurprises);
              }
              poppedSurprises.add(id);
              scoreDelta += SCORING.SURPRISE;
            }
          }
        }
      }
      vRow = 0;
    }
  }

  return { row, vRow, grounded, poppedSurprises, scoreDelta };
}

/**
 * Érmegyűjtés: Mario doboza által jelenleg átfedett cellák közül az még
 * be nem gyűjtött érmék (SPEC.md 3.4 / 3. lépés).
 * @param {import('../world/Level.js').Level} level
 * @param {import('./RunState.js').RunState} state
 * @param {number} row @param {number} col
 */
function collectCoins(level, state, row, col) {
  let collectedCoins = state.collectedCoins;
  let scoreDelta = 0;
  for (const r of overlappedCells(row)) {
    for (const c of overlappedCells(col)) {
      if (!level.isInBounds(r, c)) continue;
      const id = level.coinIdAt(r, c);
      if (id !== null && !collectedCoins.has(id)) {
        if (collectedCoins === state.collectedCoins) {
          collectedCoins = new Set(collectedCoins);
        }
        collectedCoins.add(id);
        scoreDelta += SCORING.COIN;
      }
    }
  }
  return { collectedCoins, scoreDelta };
}

/**
 * @param {import('../world/Level.js').Level} level
 * @param {number} row @param {number} col
 * @returns {boolean}
 */
function touchesGoal(level, row, col) {
  for (const r of overlappedCells(row)) {
    for (const c of overlappedCells(col)) {
      if (level.isInBounds(r, c) && level.cellAt(r, c) === CellType.GOAL) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Egy tick szimulációja. Tiszta függvény: nem mutálja a bemenetet
 * (SPEC.md 3.3. szakasz).
 * @param {import('./RunState.js').RunState} state
 * @param {number} action - {@link Action}
 * @param {import('../world/Level.js').Level} level
 * @returns {import('./RunState.js').RunState}
 */
export function step(state, action, level) {
  if (state.status !== RunStatus.RUNNING) {
    return state;
  }

  let vCol = state.vCol;
  if (action === Action.LEFT) {
    vCol -= PHYSICS.RUN_ACCEL;
  } else if (action === Action.RIGHT) {
    vCol += PHYSICS.RUN_ACCEL;
  } else if (state.grounded) {
    if (vCol > 0) vCol = Math.max(0, vCol - PHYSICS.FRICTION);
    else if (vCol < 0) vCol = Math.min(0, vCol + PHYSICS.FRICTION);
  }
  vCol = clamp(vCol, -PHYSICS.MAX_RUN_SPEED, PHYSICS.MAX_RUN_SPEED);

  let vRow;
  if (action === Action.JUMP && state.grounded) {
    vRow = -PHYSICS.JUMP_IMPULSE;
  } else {
    vRow = Math.min(PHYSICS.MAX_FALL_SPEED, state.vRow + PHYSICS.GRAVITY);
  }

  const horizontal = moveHorizontal(level, state, vCol);
  const vertical = moveVertical(level, state, horizontal.col, vRow);
  const coinResult = collectCoins(level, state, vertical.row, horizontal.col);

  const maxColReached = Math.max(state.maxColReached, Math.floor(horizontal.col));
  const progressScore = (maxColReached - state.maxColReached) * SCORING.PROGRESS_PER_COLUMN;
  const ticks = state.ticks + 1;

  /** @type {string} */
  let status = RunStatus.RUNNING;
  let goalBonus = 0;
  if (vertical.row >= level.height) {
    status = RunStatus.FELL;
  } else if (touchesGoal(level, vertical.row, horizontal.col)) {
    status = RunStatus.GOAL;
    goalBonus = computeGoalTimeBonus(ticks, level.maxTicks);
  } else if (ticks >= level.maxTicks) {
    status = RunStatus.TIMEOUT;
  }

  return Object.freeze({
    row: vertical.row,
    col: horizontal.col,
    vRow: snapToGrid(vertical.vRow),
    vCol: snapToGrid(horizontal.vCol),
    grounded: vertical.grounded,
    ticks,
    score: state.score + progressScore + coinResult.scoreDelta + vertical.scoreDelta + goalBonus,
    maxColReached,
    collectedCoins: coinResult.collectedCoins,
    poppedSurprises: vertical.poppedSurprises,
    status,
  });
}
