import { admissibleHeuristic } from './Heuristics.js';
import { edgeItemValue } from './JumpGraph.js';

/** Keresési problémák a JumpGraph fölött (SPEC.md 5.4, 6.1): a {@link import('./search.js').search} elvárt interfésze — `startNode()`, `isGoal(n)`, `neighbors(n)`, `heuristic(n)`. */

/**
 * Speedrun mód: egyetlen cél a pálya jobb széle, ebben az A* és a Dijkstra bizonyíthatóan optimális (SPEC.md 5.4).
 * @param {import('./JumpGraph.js').JumpGraph} graph
 * @param {number} [startIndex] - kezdő csomópont, alapból a pálya startja (a collector záró szakaszához tetszőleges lehet)
 * @returns {import('./search.js').SearchProblem}
 */
export function createSpeedrunProblem(graph, startIndex = -1) {
  const goalCol = graph.level.goalColumn;
  const start = startIndex >= 0 ? startIndex : graph.startIndex();
  return {
    startNode: () => start,
    isGoal: (n) => graph.nodes[n].col >= goalCol,
    neighbors: (n) => graph.edgesFrom(n),
    heuristic: (n) => admissibleHeuristic(graph.nodes[n].col, goalCol),
  };
}

/**
 * Waypoint-probléma: egy KONKRÉT cél-csomópont elérése. A collector mód
 * láncszemeihez és általános cél-kereséshez.
 * @param {import('./JumpGraph.js').JumpGraph} graph
 * @param {number} startIndex @param {number} targetIndex
 * @returns {import('./search.js').SearchProblem}
 */
export function createWaypointProblem(graph, startIndex, targetIndex) {
  const targetCol = graph.nodes[targetIndex].col;
  return {
    startNode: () => startIndex,
    isGoal: (n) => n === targetIndex,
    neighbors: (n) => graph.edgesFrom(n),
    heuristic: (n) => admissibleHeuristic(graph.nodes[n].col, targetCol),
  };
}

/**
 * @typedef {Object} CollectorGate
 * @property {number} from - a kapu-él forrás-csomópontja (ide navigál a kereső)
 * @property {import('./JumpGraph.js').JumpEdge} edge - a kényszerített begyűjtő él
 */

/** Kapu-sorrend: a balról jobbra haladó lánc miatt előbb a korábbi oszlop, azonos oszlopnál a többet érő, végül az olcsóbb él nyer.
 * @param {import('./JumpGraph.js').JumpGraph} graph
 * @param {CollectorGate} candidate @param {CollectorGate} current
 * @returns {boolean}
 */
function isBetterGate(graph, candidate, current) {
  const candidateCol = graph.nodes[candidate.from].col;
  const currentCol = graph.nodes[current.from].col;
  if (candidateCol !== currentCol) return candidateCol < currentCol;
  const candidateValue = edgeItemValue(candidate.edge);
  const currentValue = edgeItemValue(current.edge);
  if (candidateValue !== currentValue) return candidateValue > currentValue;
  return candidate.edge.cost < current.edge.cost;
}

/** Collector "kapuk" (SPEC.md 5.4): tárgyanként (érme ÉS surprise) a ténylegesen begyűjtő élek; a terv a kapu elejére navigál, majd kényszerítetten bejárja. Nearest-neighbour sorrendű, NEM optimális.
 * @param {import('./JumpGraph.js').JumpGraph} graph
 * @returns {CollectorGate[]}
 */
export function collectorGates(graph) {
  // Tárgyanként az ÖSSZES hordozó él (nem csak a legolcsóbb), hogy a lánc-építés választhasson köztük.
  /** @type {Map<string, CollectorGate[]>} */
  const carriersByItem = new Map();
  const addCarrier = (itemKey, gate) => {
    const list = carriersByItem.get(itemKey) ?? [];
    list.push(gate);
    carriersByItem.set(itemKey, list);
  };
  for (let from = 0; from < graph.nodes.length; from += 1) {
    for (const edge of graph.edgesFrom(from)) {
      for (const coinId of edge.coins) addCarrier(`c${coinId}`, { from, edge });
      for (const surpriseId of edge.surprises) addCarrier(`s${surpriseId}`, { from, edge });
    }
  }

  // Mohó lánc-építés: mindig a kurzorból ténylegesen elérhető, legjobb hordozót vesszük.
  const { canReach } = reachabilityClosure(graph);
  const gates = [];
  const covered = new Set();
  let cursor = graph.startIndex();

  for (;;) {
    /** @type {CollectorGate | null} */
    let next = null;
    for (const [itemKey, carriers] of carriersByItem) {
      if (covered.has(itemKey)) continue;
      for (const gate of carriers) {
        if (!canReach(cursor, gate.from)) continue;
        if (!next || isBetterGate(graph, gate, next)) next = gate;
      }
    }
    if (!next) break;
    gates.push(next);
    for (const coinId of next.edge.coins) covered.add(`c${coinId}`);
    for (const surpriseId of next.edge.surprises) covered.add(`s${surpriseId}`);
    cursor = next.edge.to;
  }
  return gates;
}

/** Elérhetőségi lezárt bitset-ekkel; a csökkenő oszlop szerinti sorrend a jobbra irányított DAG fordított topologikus rendezése.
 * @param {import('./JumpGraph.js').JumpGraph} graph
 * @returns {{canReach: (from: number, to: number) => boolean}}
 */
function reachabilityClosure(graph) {
  const n = graph.nodes.length;
  const words = Math.ceil(n / 32) || 1;
  const reach = Array.from({ length: n }, () => new Uint32Array(words));
  const order = [...graph.nodes].sort((a, b) => b.col - a.col || b.row - a.row);
  for (const node of order) {
    const i = node.index;
    const self = reach[i];
    self[i >> 5] |= 1 << (i & 31);
    for (const edge of graph.edgesFrom(i)) {
      const target = reach[edge.to];
      for (let w = 0; w < words; w += 1) self[w] |= target[w];
    }
  }
  return {
    canReach: (from, to) => ((reach[from][to >> 5] >>> (to & 31)) & 1) === 1,
  };
}
