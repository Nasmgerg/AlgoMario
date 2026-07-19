import { Metrics } from './Metrics.js';
import { FifoQueue } from './frontiers/FifoQueue.js';
import { LifoStack } from './frontiers/LifoStack.js';
import { BinaryHeap } from './frontiers/BinaryHeap.js';

/**
 * @typedef {Object} SearchProblem
 * @property {() => number} startNode
 * @property {(n: number) => boolean} isGoal
 * @property {(n: number) => import('./JumpGraph.js').JumpEdge[]} neighbors
 * @property {(n: number) => number} heuristic
 *
 * @typedef {Object} Algorithm
 * @property {string} name
 * @property {'fifo' | 'lifo' | 'heap'} frontier
 * @property {(g: number, h: number) => number} priority - csak heap frontiernél
 * @property {'firstSeen' | 'bestCost'} dedup
 * @property {boolean} [depthLimited]
 *
 * @typedef {Object} SearchResult
 * @property {boolean} found
 * @property {number[]} path            - csomópont-indexek a starttól a célig
 * @property {import('./JumpGraph.js').JumpEdge[]} edges - az úton bejárt élek
 * @property {number} goalNode          - az elért cél (vagy a legjobb rész-csomópont)
 * @property {Metrics} metrics
 *
 * @typedef {Object} SearchStep - egy kiterjesztés pillanatképe (vizualizációhoz)
 * @property {number} current
 * @property {number} g
 * @property {number} openSize
 * @property {number} closedSize
 */

/** @param {Algorithm} algorithm @returns {{push: Function, pop: Function, size: number}} */
function createFrontier(algorithm) {
  if (algorithm.frontier === 'fifo') return new FifoQueue();
  if (algorithm.frontier === 'lifo') return new LifoStack();
  return new BinaryHeap();
}

/**
 * Generátoros gráfkeresés — egyetlen váz, a viselkedést az `algorithm`
 * (frontier + prioritás + dedup) adja (SPEC.md 6.1). Minden kiterjesztésnél
 * yield-el, így időszeletelhető és lépésenként vizualizálható.
 *
 * @param {SearchProblem} problem
 * @param {Algorithm} algorithm
 * @param {{maxExpansions?: number, maxDepth?: number, weight?: number}} [options]
 * @returns {Generator<SearchStep, SearchResult, void>}
 */
export function* search(problem, algorithm, options = {}) {
  const maxExpansions = options.maxExpansions ?? Infinity;
  const maxDepth = algorithm.depthLimited ? options.maxDepth ?? Infinity : Infinity;
  const useHeap = algorithm.frontier === 'heap';
  const trackBestCost = algorithm.dedup === 'bestCost';

  const metrics = new Metrics();
  const frontier = createFrontier(algorithm);
  const start = problem.startNode();

  /** @type {Map<number, number>} nodeId → eddigi legjobb g (bestCost dedup) */
  const bestG = new Map();
  /** @type {Set<number>} nodeId (firstSeen dedup) */
  const seen = new Set();
  /** @type {Map<number, {from: number, edge: import('./JumpGraph.js').JumpEdge}>} */
  const cameFrom = new Map();
  const closed = new Set();

  /** @param {number} node @param {number} g @param {number} depth */
  const makeItem = (node, g, depth) => ({
    node,
    g,
    depth,
    priority: useHeap ? algorithm.priority(g, problem.heuristic(node)) : 0,
  });

  bestG.set(start, 0);
  seen.add(start);
  frontier.push(makeItem(start, 0, 0));
  metrics.nodesGenerated += 1;

  let goalNode = start;
  let bestHeuristic = problem.heuristic(start);

  while (frontier.size > 0) {
    if (metrics.nodesExpanded >= maxExpansions) {
      metrics.timeout = true;
      break;
    }

    const item = frontier.pop();
    const node = item.node;
    if (closed.has(node)) continue;
    if (trackBestCost && item.g > (bestG.get(node) ?? Infinity)) continue;

    closed.add(node);
    metrics.nodesExpanded += 1;
    metrics.observeOpen(frontier.size);

    // A legjobb (célhoz legközelebbi) rész-csomópont nyilvántartása a
    // "nincs megoldás" esetre (SPEC.md 12).
    const h = problem.heuristic(node);
    if (h < bestHeuristic) {
      bestHeuristic = h;
      goalNode = node;
    }

    yield { current: node, g: item.g, openSize: frontier.size, closedSize: closed.size };

    if (problem.isGoal(node)) {
      const { path, edges } = reconstruct(cameFrom, start, node);
      metrics.found = true;
      metrics.closedSize = closed.size;
      metrics.recordPath(edges);
      return { found: true, path, edges, goalNode: node, metrics };
    }

    if (item.depth >= maxDepth) continue;

    for (const edge of problem.neighbors(node)) {
      const succ = edge.to;
      if (closed.has(succ)) continue;
      const tentativeG = item.g + edge.cost;

      if (trackBestCost) {
        if (tentativeG < (bestG.get(succ) ?? Infinity)) {
          bestG.set(succ, tentativeG);
          cameFrom.set(succ, { from: node, edge });
          frontier.push(makeItem(succ, tentativeG, item.depth + 1));
          metrics.nodesGenerated += 1;
        }
      } else if (!seen.has(succ)) {
        seen.add(succ);
        cameFrom.set(succ, { from: node, edge });
        frontier.push(makeItem(succ, tentativeG, item.depth + 1));
        metrics.nodesGenerated += 1;
      }
    }
  }

  metrics.closedSize = closed.size;
  const { path, edges } = reconstruct(cameFrom, start, goalNode);
  metrics.recordPath(edges);
  return { found: false, path, edges, goalNode, metrics };
}

/**
 * Út visszafejtése a `cameFrom` láncból.
 * @param {Map<number, {from: number, edge: import('./JumpGraph.js').JumpEdge}>} cameFrom
 * @param {number} start @param {number} target
 * @returns {{path: number[], edges: import('./JumpGraph.js').JumpEdge[]}}
 */
function reconstruct(cameFrom, start, target) {
  const path = [target];
  const edges = [];
  let node = target;
  while (node !== start) {
    const prev = cameFrom.get(node);
    if (!prev) break; // target nem elérhető a startból (rész-út)
    edges.push(prev.edge);
    node = prev.from;
    path.push(node);
  }
  path.reverse();
  edges.reverse();
  return { path, edges };
}

/**
 * A generátoros keresés végigfuttatása vizualizáció nélkül.
 * @param {Generator<SearchStep, SearchResult, void>} gen
 * @returns {SearchResult}
 */
export function runToCompletion(gen) {
  let res = gen.next();
  while (!res.done) res = gen.next();
  return res.value;
}
