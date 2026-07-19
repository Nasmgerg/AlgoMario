import { Level, CellType } from '../world/Level.js';
import { createRunStateAt, RunStatus } from '../core/RunState.js';
import { step, Action } from '../core/step.js';

/**
 * JumpTable — előszámított "mozdulat-menü" (SPEC.md 5.2).
 *
 * Minden `(dRow, dCol)` eltolásra megkeressük, milyen akciósorozattal és
 * hány tick alatt jut Mario egy nyugalmi (talajon álló, sebesség nélküli)
 * kiindulásból egy `dRow` sorral és `dCol` oszloppal odébb lévő nyugalmi
 * állásba. A keresés szimulációval (`step()`) történik zárt homokozó-
 * pályákon, ezért a fizika bit-pontosan ugyanaz, mint a valódi játékban.
 *
 * Eltérés a v2 spec pontos aláírásától: egy kulcshoz TÖBB jelöltet is
 * tárolunk (séta/lelépés ÉS ugrás), költség szerint növekvő sorrendben.
 * Erre azért van szükség, mert egy sík `dRow = 0` él lehet sétaél
 * (folytonos talajon) VAGY lyukat átugró él (szakadék felett) — a
 * `JumpGraph` a valódi pályán validálva választja ki az elsőt, amelyik
 * ténylegesen kivitelezhető. A landolás mindig SZÉLES felületre történik,
 * hogy Mario meg tudjon állni rajta (1 cellás csempéről lecsúszna).
 */

// A tartomány a spec 5.2 szerint: dRow ∈ [-5, +8], dCol ∈ [1, 7].
export const JUMP_TABLE_RANGE = /** @type {{minDRow:number,maxDRow:number,minDCol:number,maxDCol:number}} */ (
  Object.freeze({
    minDRow: -5,
    maxDRow: 8,
    minDCol: 1,
    maxDCol: 7,
  })
);

const SANDBOX_HEIGHT = 50;
const SR = 30; // kiindulási állás sora
const SC = 8; // kiindulási állás oszlopa
const SANDBOX_WIDTH = SC + JUMP_TABLE_RANGE.maxDCol + 12;
const MAX_MANEUVER_TICKS = 64;

/** @param {number} dRow @param {number} dCol @returns {string} */
export function jumpTableKey(dRow, dCol) {
  return `${dRow},${dCol}`;
}

/** @param {{row:number,col:number}[]} solids @returns {Level} */
function makeSandbox(solids) {
  const cells = new Uint8Array(SANDBOX_HEIGHT * SANDBOX_WIDTH);
  for (const { row, col } of solids) {
    if (row >= 0 && row < SANDBOX_HEIGHT && col >= 0 && col < SANDBOX_WIDTH) {
      cells[row * SANDBOX_WIDTH + col] = CellType.WALL;
    }
  }
  return new Level({
    height: SANDBOX_HEIGHT,
    length: SANDBOX_WIDTH,
    cells,
    coins: [],
    surprises: [],
    startPosition: { row: SR, col: SC },
    goalColumn: SANDBOX_WIDTH - 1,
    maxTicks: 100000,
    seed: 0,
  });
}

/** Teljesen sík padló — a `dRow = 0` sétaélek méréséhez. */
function flatFloorSandbox() {
  const solids = [];
  for (let col = 0; col < SANDBOX_WIDTH; col += 1) solids.push({ row: SR + 1, col });
  return makeSandbox(solids);
}

/** Start-perem [0..SC], `gap` széles szakadék, majd széles landolóföld ugyanazon a szinten. */
function gapSandbox(gap) {
  const solids = [];
  for (let col = 0; col <= SC; col += 1) solids.push({ row: SR + 1, col });
  for (let col = SC + gap + 1; col < SANDBOX_WIDTH; col += 1) solids.push({ row: SR + 1, col });
  return makeSandbox(solids);
}

/** Lépcső fel/le: start-perem [0..SC], majd tömör tömb, aminek teteje `dRow`-val odébb van. */
function stepSandbox(dRow) {
  const solids = [];
  for (let col = 0; col <= SC; col += 1) solids.push({ row: SR + 1, col });
  const topRow = SR + dRow + 1; // a landolófelület tömör sora
  for (let col = SC + 1; col < SANDBOX_WIDTH; col += 1) {
    for (let row = topRow; row < SANDBOX_HEIGHT; row += 1) solids.push({ row, col });
  }
  return makeSandbox(solids);
}

/**
 * Lefuttat egy akciósorozatot, és visszaadja az ELSŐ nyugalmi (talajon,
 * `vCol === 0`) állapotot a várt sorban, `dCol >= 1` eltolással. `null`, ha
 * Mario leesik, vagy a start mögött/előtt ragad.
 * @param {Level} level @param {number[]} actions @param {number} expectedRow
 * @returns {{dCol: number, ticks: number} | null}
 */
function firstSettled(level, actions, expectedRow) {
  let state = createRunStateAt(SR, SC);
  for (let t = 0; t < actions.length; t += 1) {
    state = step(state, actions[t], level);
    if (state.status === RunStatus.FELL) return null;
    if (state.grounded && state.vCol === 0) {
      if (state.row !== expectedRow) return null;
      const dCol = Math.round(state.col) - SC;
      return dCol >= 1 ? { dCol, ticks: t + 1 } : null;
    }
  }
  return null;
}

/** @param {number[]} prefix @returns {number[]} */
function padded(prefix) {
  const out = prefix.slice();
  while (out.length < MAX_MANEUVER_TICKS) out.push(Action.NONE);
  return out;
}

/** Séta/lelépés: k tick jobbra, majd kifutás. @returns {number[][]} */
function walkManeuvers() {
  const out = [];
  for (let k = 1; k <= 44; k += 1) out.push(padded(new Array(k).fill(Action.RIGHT)));
  return out;
}

/**
 * Ugrás: ugrás, `hold` tick jobbra, opcionálisan `brake` tick balra
 * (a landolás előtti csúszás rövidítéséhez → több elérhető dCol), kifutás.
 * @returns {number[][]}
 */
function jumpManeuvers() {
  const out = [];
  for (let hold = 0; hold <= 40; hold += 1) {
    for (const brake of [0, 2, 4, 6]) {
      const prefix = [Action.JUMP, ...new Array(hold).fill(Action.RIGHT), ...new Array(brake).fill(Action.LEFT)];
      out.push(padded(prefix));
    }
  }
  return out;
}

/** @type {{entries: Map<string, {actions: Uint8Array, ticks: number}[]>, range: typeof JUMP_TABLE_RANGE} | null} */
let _cache = null;

/**
 * Felépíti (és cache-eli) a JumpTable-t (SPEC.md 5.2: "cache-elhető").
 * @returns {{entries: Map<string, {actions: Uint8Array, ticks: number}[]>, range: typeof JUMP_TABLE_RANGE}}
 */
export function buildJumpTable() {
  if (_cache) return _cache;

  /** @type {Map<string, {actions: Uint8Array, ticks: number}[]>} */
  const entries = new Map();

  /** cheapest[kind][dCol] → {actions, ticks} egy adott dRow-ra */
  const collect = (level, maneuvers, expectedRow, best) => {
    for (const actions of maneuvers) {
      const hit = firstSettled(level, actions, expectedRow);
      if (!hit) continue;
      if (hit.dCol < JUMP_TABLE_RANGE.minDCol || hit.dCol > JUMP_TABLE_RANGE.maxDCol) continue;
      const prev = best.get(hit.dCol);
      if (!prev || hit.ticks < prev.ticks) {
        best.set(hit.dCol, { actions: Uint8Array.from(actions.slice(0, hit.ticks)), ticks: hit.ticks });
      }
    }
  };

  const walks = walkManeuvers();
  const jumps = jumpManeuvers();

  for (let dRow = JUMP_TABLE_RANGE.minDRow; dRow <= JUMP_TABLE_RANGE.maxDRow; dRow += 1) {
    const expectedRow = SR + dRow;
    if (expectedRow < 1 || expectedRow >= SANDBOX_HEIGHT - 1) continue;

    /** @type {Map<number, {actions: Uint8Array, ticks: number}>} */
    const walkBest = new Map();
    /** @type {Map<number, {actions: Uint8Array, ticks: number}>} */
    const jumpBest = new Map();

    if (dRow === 0) {
      collect(flatFloorSandbox(), walks, expectedRow, walkBest);
      for (let gap = 1; gap <= JUMP_TABLE_RANGE.maxDCol; gap += 1) {
        collect(gapSandbox(gap), jumps, expectedRow, jumpBest);
      }
    } else {
      const sandbox = stepSandbox(dRow);
      collect(sandbox, jumps, expectedRow, jumpBest);
      if (dRow > 0) collect(sandbox, walks, expectedRow, walkBest); // lelépés a peremről
    }

    for (let dCol = JUMP_TABLE_RANGE.minDCol; dCol <= JUMP_TABLE_RANGE.maxDCol; dCol += 1) {
      const list = [];
      const w = walkBest.get(dCol);
      const j = jumpBest.get(dCol);
      if (w) list.push(w);
      if (j) list.push(j);
      if (list.length > 0) {
        list.sort((a, b) => a.ticks - b.ticks);
        entries.set(jumpTableKey(dRow, dCol), list);
      }
    }
  }

  _cache = { entries, range: JUMP_TABLE_RANGE };
  return _cache;
}

/** Teszthez: a cache ürítése. */
export function _resetJumpTableCache() {
  _cache = null;
}
