/**
 * A hat útkereső ugyanazon a vázon: frontier + prioritásfüggvény + dedup-politika (SPEC.md 6.2).
 *
 * | Algoritmus | Frontier | Prioritás | Dedup |
 * |---|---|---|---|
 * | BFS       | FIFO | — | first-seen (legkevesebb ÉL) |
 * | DFS       | LIFO | — | first-seen (+ mélységkorlát) |
 * | Dijkstra  | heap | g | best-cost (optimális) |
 * | A*        | heap | g + h | best-cost (optimális, admissible h-val) |
 * | Greedy    | heap | h | first-seen (gyors, gyakran rossz) |
 * | Best-First| heap | g + w·h | best-cost (paraméterezett keretrendszer) |
 */

/** @typedef {import('./search.js').Algorithm} Algorithm */

/** @type {Algorithm} */
export const bfs = {
  name: 'BFS',
  frontier: 'fifo',
  priority: () => 0,
  dedup: 'firstSeen',
};

/** @type {Algorithm} */
export const dfs = {
  name: 'DFS',
  frontier: 'lifo',
  priority: () => 0,
  dedup: 'firstSeen',
};

/** DFS mélységkorláttal (iteratív mélyítéshez, SPEC.md 6.3). @type {Algorithm} */
export const dfsDepthLimited = {
  name: 'DFS (depth-limited)',
  frontier: 'lifo',
  priority: () => 0,
  dedup: 'firstSeen',
  depthLimited: true,
};

/** @type {Algorithm} */
export const dijkstra = {
  name: 'Dijkstra',
  frontier: 'heap',
  priority: (g) => g,
  dedup: 'bestCost',
};

/** @type {Algorithm} */
export const astar = {
  name: 'A*',
  frontier: 'heap',
  priority: (g, h) => g + h,
  dedup: 'bestCost',
};

/** @type {Algorithm} */
export const greedy = {
  name: 'Greedy Best-First',
  frontier: 'heap',
  priority: (g, h) => h,
  dedup: 'firstSeen',
};

/**
 * Paraméterezett Best-First: `f = g + w·h` (SPEC.md 6.2).
 * - `w = 0` → Dijkstra, `w = 1` → A*, `w = 3` → weighted A*, `w → ∞` → Greedy.
 * @param {number} w - a heurisztika súlya (0–10 a UI-ban)
 * @returns {Algorithm}
 */
export function bestFirst(w) {
  return {
    name: `Best-First (w=${w})`,
    frontier: 'heap',
    priority: (g, h) => g + w * h,
    dedup: 'bestCost',
  };
}

/** A hat "kanonikus" konfiguráció (a Best-First A*-ekvivalens w=1-gyel). */
export const ALL_ALGORITHMS = Object.freeze([bfs, dfs, dijkstra, astar, greedy, bestFirst(1)]);
