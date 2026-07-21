import { Level, CellType, isSolidCellType } from '../world/Level.js';
import { createRunStateAt, RunStatus } from '../core/RunState.js';
import { step, Action } from '../core/step.js';
import { buildJumpTable, jumpTableKey } from './JumpTable.js';

/**
 * JumpGraph — pályánként egyszer épített makró-gráf, él = step()-tel újra
 * validált JumpTable-jelölt, súly = tick (SPEC.md 5.3).
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

/** A GOAL leállítaná a step()-et, ezért a validáláshoz EMPTY-re cseréljük.
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

// Megengedett float-hiba a horgonyzásnál (a 0,05-rács kerekítési zaja).
const ANCHOR_EPS = 1e-6;
const POS_UNIT = 0.05; // a fizika kvantuma: minden Δpozíció 0,05 többszöröse
const MAX_ALIGN_TICKS = 24;

/**
 * BFS a valódi terepen: a landolásból pontosan `targetCol` egész oszlopára,
 * nyugalomba visz, hogy az élek folytonosan komponálhatók legyenek (M3-audit K1).
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
 * Egy jelölt kivitelezhető, ha a fő-manőver + a hozzáfűzött horgony-fázis is B kanonikus állapotára visz.
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

  // Csak akkor validáljuk a drágább (de érmét gyűjtő) jelölteket is, ha az ív befoglaló dobozában van érme.
  /** @type {Map<number, number[]>} oszlop → érme-sorok */
  const coinRowsByCol = new Map();
  for (const coin of physics.coins) {
    const rows = coinRowsByCol.get(coin.col) ?? [];
    rows.push(coin.row);
    coinRowsByCol.set(coin.col, rows);
  }
  const coinInArcBox = (fromNode, toNode) => {
    const rowLo = fromNode.row - 6;
    const rowHi = Math.max(fromNode.row, toNode.row) + 1;
    for (let col = fromNode.col; col <= toNode.col; col += 1) {
      const rows = coinRowsByCol.get(col);
      if (!rows) continue;
      for (const row of rows) if (row >= rowLo && row <= rowHi) return true;
    }
    return false;
  };

  for (const from of nodes) {
    for (const [key, candidates] of entries) {
      const [dRow, dCol] = key.split(',').map(Number);
      const toIndex = indexByCell.get(cellKey(from.row + dRow, from.col + dCol));
      if (toIndex === undefined) continue;
      const to = nodes[toIndex];
      const coinNearby = coinInArcBox(from, to);

      /** @type {{cost: number, coins: number[], actions: Uint8Array} | null} */
      let cheapest = null;
      /** @type {{cost: number, coins: number[], actions: Uint8Array} | null} */
      let mostCoins = null;
      for (const candidate of candidates) {
        const result = validateEdge(physics, from, to, candidate.actions);
        if (!result) continue;
        if (!cheapest) cheapest = result; // a lista költség szerint rendezett
        if (result.coins.length > (mostCoins?.coins.length ?? 0)) mostCoins = result;
        // Érme nélkül elég a legolcsóbb kivitelezhető jelölt (gyors út).
        if (!coinNearby) break;
      }
      if (!cheapest) continue;

      edges[from.index].push({
        to: toIndex,
        cost: cheapest.cost,
        actions: cheapest.actions, // fő-manőver + a terepen tuningolt horgony
        coins: cheapest.coins,
      });
      // Párhuzamos érme-változat él, ha egy drágább ív több érmét gyűjt (a collector kapuihoz kell).
      if (
        mostCoins &&
        mostCoins !== cheapest &&
        mostCoins.coins.some((coinId) => !cheapest.coins.includes(coinId))
      ) {
        edges[from.index].push({
          to: toIndex,
          cost: mostCoins.cost,
          actions: mostCoins.actions,
          coins: mostCoins.coins,
        });
      }
    }
  }

  return new JumpGraph(nodes, edges, indexByCell, level, physics);
}

/** A `jumpTableKey` re-exportja kényelemből. */
export { jumpTableKey };
