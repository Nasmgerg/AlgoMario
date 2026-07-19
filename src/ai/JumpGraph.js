import { Level, CellType, isSolidCellType } from '../world/Level.js';
import { createRunStateAt, RunStatus } from '../core/RunState.js';
import { step, Action } from '../core/step.js';
import { buildJumpTable, jumpTableKey } from './JumpTable.js';

/**
 * JumpGraph — a pályánként egyszer felépített makró-gráf (SPEC.md 5.3).
 *
 * - **Csomópont**: minden cella, amin Mario állhat (nem tömör cella, alatta
 *   tömör) → talaj- és platformtetők.
 * - **Él**: `A → B`, ha a JumpTable valamelyik jelöltje A-ból nyugalmi
 *   állásba viszi Mariót B-be, és a röppálya a VALÓDI pályán is
 *   végrehajtható (a `step()`-pel visszaszimulálva nem ütközik semmibe).
 * - **Élsúly**: a mozgás tick-száma (pozitív egész).
 * - **Él-metaadat**: az útközben érintett érmék id-listája.
 *
 * @typedef {Object} JumpNode
 * @property {number} index @property {number} row @property {number} col
 *
 * @typedef {Object} JumpEdge
 * @property {number} to      - cél csomópont indexe
 * @property {number} cost    - tickek száma (pozitív)
 * @property {Uint8Array} actions
 * @property {number[]} coins  - útközben érintett érmék id-jei
 */

/** @param {number} row @param {number} col @returns {string} */
function cellKey(row, col) {
  return `${row},${col}`;
}

/**
 * A GOAL cellák leállítják a `step()`-et (a futás véget ér). Az él-validáció
 * SORÁN ez zavaró — ezért egy "fizikai" pályán a GOAL-t EMPTY-re cseréljük,
 * hogy Mario normálisan rá tudjon állni a cél-oszlop csomópontjára. A keresés
 * a csomópont oszlopa alapján dönti el, mi a cél; a valódi játékban a GOAL
 * cellára lépés továbbra is győzelmet jelent.
 * @param {Level} level @returns {Level}
 */
function toPhysicsLevel(level) {
  const cells = Uint8Array.from(level.cells);
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] === CellType.GOAL) cells[i] = CellType.EMPTY;
  }
  return new Level({
    height: level.height,
    length: level.length,
    cells,
    coins: level.coins,
    surprises: level.surprises,
    startPosition: level.startPosition,
    goalColumn: level.goalColumn,
    maxTicks: level.maxTicks,
    seed: level.seed,
  });
}

/**
 * Minden állható cella összegyűjtése: a cella nem tömör, és alatta tömör
 * cella van (talaj- vagy platformtető).
 * @param {Level} level @returns {JumpNode[]}
 */
function collectNodes(level) {
  const nodes = [];
  for (let col = 0; col < level.length; col += 1) {
    for (let row = 0; row < level.height - 1; row += 1) {
      const here = level.cellAt(row, col);
      const below = level.cellAt(row + 1, col);
      if (!isSolidCellType(here) && isSolidCellType(below)) {
        nodes.push({ index: nodes.length, row, col });
      }
    }
  }
  return nodes;
}

// A cél-oszlopra állás megengedett float-hibája. A horgony-fázis PONTOSAN
// egész oszlopra visz (a fizika 0,05 rácson mozog), ez csak a 0,05 tört
// bináris reprezentációjának hibáját nyeli el.
const ANCHOR_EPS = 1e-6;
const POS_UNIT = 0.05; // a fizika kvantuma: minden Δpozíció 0,05 többszöröse
const MAX_ALIGN_TICKS = 24;

/**
 * "Horgony"-fázis a VALÓDI terepen: a landolási (tört oszlopú) nyugalmi
 * állapotból a legrövidebb akciósor, ami PONTOSAN a `targetCol` egész
 * oszlopra, `vCol = 0` nyugalomba viszi Mariót, VÉGIG ugyanazon a soron,
 * a valódi pálya peremeit/falait tiszteletben tartva. Ez teszi az éleket
 * folytonosan komponálhatóvá: minden él pontosan a cél-csomópont kanonikus
 * állapotában végződik, így a következő él pontosan onnan indul — nincs
 * halmozódó sodródás (M3-audit K1). BFS a `(col, vCol)` 0,05-rácson,
 * determinisztikus. `null`, ha a terep miatt nem horgonyozható.
 * @param {Level} level @param {import('../core/RunState.js').RunState} start @param {number} targetCol
 * @returns {number[] | null}
 */
function alignToInteger(level, start, targetCol) {
  const keyOf = (s) => `${Math.round(s.col / POS_UNIT)},${Math.round(s.vCol / POS_UNIT)}`;
  const atAnchor = (s) => s.grounded && s.vCol === 0 && Math.abs(s.col - targetCol) < ANCHOR_EPS;
  if (atAnchor(start)) return [];

  const queue = [{ state: start, actions: /** @type {number[]} */ ([]) }];
  const seen = new Set([keyOf(start)]);
  while (queue.length > 0) {
    const { state, actions } = queue.shift();
    if (actions.length >= MAX_ALIGN_TICKS) continue;
    for (const a of [Action.LEFT, Action.RIGHT, Action.NONE]) {
      const next = step(state, a, level);
      if (next.status !== RunStatus.RUNNING || !next.grounded || next.row !== start.row) continue;
      const key = keyOf(next);
      if (seen.has(key)) continue;
      seen.add(key);
      const nextActions = [...actions, a];
      if (atAnchor(next)) return nextActions;
      queue.push({ state: next, actions: nextActions });
    }
  }
  return null;
}

/**
 * Egy JumpTable-jelölt kivitelezhető-e a valódi pályán A-ból B-be. A
 * kanonikus (nyugalmi) A-állapotból lefuttatjuk a fő-manővert; ha Mario B
 * cellájában, nyugalomban (de tört oszlopon) áll meg, a VALÓDI terepen
 * hozzáfűzünk egy horgony-fázist, ami PONTOSAN B egész oszlopára állítja.
 * Az így visszaadott, teljes akciósor B kanonikus állapotában végződik →
 * folytonosan komponálható a következő éllel.
 * @param {Level} physics @param {JumpNode} from @param {JumpNode} to @param {Uint8Array} actions
 * @returns {{cost: number, coins: number[], actions: Uint8Array} | null}
 */
function validateEdge(physics, from, to, actions) {
  let state = createRunStateAt(from.row, from.col);
  for (let t = 0; t < actions.length; t += 1) {
    state = step(state, actions[t], physics);
    if (state.status !== RunStatus.RUNNING) return null;
  }
  // Fő-fázis: B cellájában, nyugalomban (round az egész oszlopra).
  if (!(state.grounded && state.vCol === 0 && state.row === to.row && Math.round(state.col) === to.col)) {
    return null;
  }
  // Horgony-fázis a valódi terepen: pontosan az egész oszlopra.
  const align = alignToInteger(physics, state, to.col);
  if (align === null) return null;
  for (const a of align) {
    state = step(state, a, physics);
    if (state.status !== RunStatus.RUNNING) return null;
  }
  if (!(state.grounded && state.vCol === 0 && state.row === to.row && Math.abs(state.col - to.col) < ANCHOR_EPS)) {
    return null;
  }
  const full = new Uint8Array(actions.length + align.length);
  full.set(actions, 0);
  full.set(align, actions.length);
  return { cost: full.length, coins: [...state.collectedCoins], actions: full };
}

/** A makró-gráf (SPEC.md 5.3). */
export class JumpGraph {
  /**
   * @param {JumpNode[]} nodes
   * @param {JumpEdge[][]} edges - edges[nodeIndex] = kimenő élek
   * @param {Map<string, number>} indexByCell
   * @param {Level} level - az eredeti pálya (GOAL cellákkal)
   * @param {Level} physicsLevel - a GOAL-semlegesített pálya, amin az élek validálva lettek
   */
  constructor(nodes, edges, indexByCell, level, physicsLevel) {
    this.nodes = nodes;
    this.edges = edges;
    this._indexByCell = indexByCell;
    this.level = level;
    this.physicsLevel = physicsLevel;
  }

  /** @param {number} row @param {number} col @returns {number} - csomópont index vagy -1 */
  nodeIndexAt(row, col) {
    return this._indexByCell.get(cellKey(row, col)) ?? -1;
  }

  /** @returns {number} a start csomópont indexe (Mario kiinduló állása) */
  startIndex() {
    const { row, col } = this.level.startPosition;
    const idx = this.nodeIndexAt(row, col);
    if (idx < 0) throw new Error('JumpGraph: a start pozíció nem állható csomópont');
    return idx;
  }

  /** @returns {number[]} a cél-oszlopban lévő csomópontok indexei */
  goalIndices() {
    return this.nodes.filter((n) => n.col === this.level.goalColumn).map((n) => n.index);
  }

  /** @param {number} index @returns {JumpEdge[]} */
  edgesFrom(index) {
    return this.edges[index];
  }

  /** @returns {number} élek száma összesen */
  edgeCount() {
    return this.edges.reduce((sum, list) => sum + list.length, 0);
  }
}

/**
 * Felépíti a JumpGraph-ot a pályához (SPEC.md 5.3).
 * @param {Level} level
 * @returns {JumpGraph}
 */
export function buildJumpGraph(level) {
  const { entries } = buildJumpTable();
  const physics = toPhysicsLevel(level);
  const nodes = collectNodes(physics);

  const indexByCell = new Map();
  for (const node of nodes) indexByCell.set(cellKey(node.row, node.col), node.index);

  /** @type {JumpEdge[][]} */
  const edges = nodes.map(() => []);

  for (const from of nodes) {
    for (const [key, candidates] of entries) {
      const [dRow, dCol] = key.split(',').map(Number);
      const toIndex = indexByCell.get(cellKey(from.row + dRow, from.col + dCol));
      if (toIndex === undefined) continue;
      const to = nodes[toIndex];
      for (const candidate of candidates) {
        const result = validateEdge(physics, from, to, candidate.actions);
        if (result) {
          edges[from.index].push({
            to: toIndex,
            cost: result.cost,
            actions: result.actions, // fő-manőver + a terepen tuningolt horgony
            coins: result.coins,
          });
          break; // a legolcsóbb kivitelezhető jelölt nyer (a lista rendezett)
        }
      }
    }
  }

  return new JumpGraph(nodes, edges, indexByCell, level, physics);
}

/** A `jumpTableKey` re-exportja kényelemből. */
export { jumpTableKey };
