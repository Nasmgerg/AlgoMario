import { generateLevel } from '../world/LevelGenerator.js';
import { LENGTH_PRESETS } from '../config/difficulty.js';
import { createInitialRunState, RunStatus } from '../core/RunState.js';
import { step } from '../core/step.js';
import { buildJumpGraph } from '../ai/JumpGraph.js';
import { createSpeedrunProblem } from '../ai/SearchProblem.js';
import { search, runToCompletion } from '../ai/search.js';
import { Metrics } from '../ai/Metrics.js';
import { bfs, dfs, dijkstra, astar, greedy, bestFirst } from '../ai/algorithms.js';

/** Benchmark mag (SPEC.md 8.4, metrikák: 6.4) — N seed × 6 algoritmus, Phaser/DOM nélkül, ezért Node alatt és Web Workerben is fut. */

/** A hat mért algoritmus (a Best-First a spec szerinti w=3 weighted A*). */
export const BENCHMARK_ALGORITHMS = Object.freeze([
  { key: 'bfs', label: 'BFS', build: () => bfs },
  { key: 'dfs', label: 'DFS', build: () => dfs },
  { key: 'dijkstra', label: 'Dijkstra', build: () => dijkstra },
  { key: 'astar', label: 'A*', build: () => astar },
  { key: 'greedy', label: 'Greedy', build: () => greedy },
  { key: 'bestFirst', label: 'Best-First (w=3)', build: (w) => bestFirst(w ?? 3) },
]);

/** @param {number[]} values @returns {number} */
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A tervet lefuttatja a valódi pályán, visszaadja a tényleges eredményt (SPEC.md 6.4: runTicks/coinsCollected/score/success).
 * @param {import('../world/Level.js').Level} level
 * @param {import('../ai/JumpGraph.js').JumpEdge[]} edges
 */
function executePlan(level, edges) {
  let state = createInitialRunState(level);
  for (const edge of edges) {
    for (const action of edge.actions) {
      state = step(state, action, level);
      if (state.status !== RunStatus.RUNNING) {
        return {
          runTicks: state.ticks,
          coinsCollected: state.collectedCoins.size,
          score: state.score,
          success: state.status === RunStatus.GOAL,
        };
      }
    }
  }
  return {
    runTicks: state.ticks,
    coinsCollected: state.collectedCoins.size,
    score: state.score,
    success: state.status === RunStatus.GOAL,
  };
}

/**
 * @typedef {Object} BenchmarkRow
 * @property {number} seed @property {string} algorithm @property {boolean} found
 * @property {number} planTimeMs @property {number} nodesExpanded @property {number} nodesGenerated
 * @property {number} peakOpenSize @property {number} closedSize @property {number} pathLength
 * @property {number} pathCost @property {number} optimalityRatio @property {number} runTicks
 * @property {number} coinsCollected @property {number} score @property {boolean} success
 */

/**
 * Lefuttatja a benchmarkot; az `onProgress` seedenként jelez, hogy a Worker haladást tudjon küldeni.
 * @param {{seeds?: number[], seedCount?: number, startSeed?: number, length?: number,
 *          difficulty?: number, weight?: number, planTimeSamples?: number,
 *          algorithms?: string[]}} [options]
 * @param {(progress: {done: number, total: number, seed: number}) => void} [onProgress]
 * @returns {BenchmarkRow[]}
 */
export function runBenchmark(options = {}, onProgress) {
  const seeds =
    options.seeds ??
    Array.from({ length: options.seedCount ?? 10 }, (_, i) => (options.startSeed ?? 0) + i);
  const length = options.length ?? LENGTH_PRESETS.short;
  const difficulty = options.difficulty ?? 2;
  const weight = options.weight ?? 3;
  // SPEC 6.4: planTimeMs = 5 futás mediánja, vizualizáció nélkül.
  const samples = Math.max(1, options.planTimeSamples ?? 5);
  const selected = options.algorithms
    ? BENCHMARK_ALGORITHMS.filter((a) => options.algorithms.includes(a.key))
    : BENCHMARK_ALGORITHMS;

  /** @type {BenchmarkRow[]} */
  const rows = [];

  seeds.forEach((seed, index) => {
    const level = generateLevel({ seed, length, difficulty });
    // A gráf seedenként EGYSZER épül — a mérés az algoritmusokat hasonlítja
    // össze, nem a gráfépítést (az minden algoritmusnál közös).
    const graph = buildJumpGraph(level);
    const problem = createSpeedrunProblem(graph);
    const searchOptions = { maxExpansions: 200000, maxDepth: graph.nodes.length };

    // Referencia az optimalityRatio-hoz: a Dijkstra bizonyítottan optimális.
    const reference = runToCompletion(search(problem, dijkstra, { ...searchOptions }));
    const dijkstraCost = reference.found ? reference.metrics.pathCost : 0;

    for (const algorithm of selected) {
      const algo = algorithm.build(weight);
      /** @type {number[]} */
      const timings = [];
      /** @type {import('../ai/search.js').SearchResult | null} */
      let result = null;

      for (let s = 0; s < samples; s += 1) {
        const metrics = new Metrics();
        const startedAt = performance.now();
        const run = runToCompletion(search(problem, algo, { ...searchOptions, metrics }));
        timings.push(performance.now() - startedAt);
        result = run; // determinisztikus: minden futás azonos eredményt ad
      }

      const metrics = result.metrics;
      const execution = result.found
        ? executePlan(level, result.edges)
        : { runTicks: 0, coinsCollected: 0, score: 0, success: false };

      rows.push({
        seed,
        algorithm: algorithm.label,
        found: result.found,
        planTimeMs: Number(median(timings).toFixed(4)),
        nodesExpanded: metrics.nodesExpanded,
        nodesGenerated: metrics.nodesGenerated,
        peakOpenSize: metrics.peakOpenSize,
        closedSize: metrics.closedSize,
        pathLength: metrics.pathLength,
        pathCost: metrics.pathCost,
        optimalityRatio:
          dijkstraCost > 0 && result.found ? Number((metrics.pathCost / dijkstraCost).toFixed(4)) : 0,
        ...execution,
      });
    }

    if (onProgress) onProgress({ done: index + 1, total: seeds.length, seed });
  });

  return rows;
}

/** A CSV oszlopok sorrendje (a SPEC.md 6.4 metrikái). */
export const CSV_COLUMNS = Object.freeze([
  'seed',
  'algorithm',
  'found',
  'planTimeMs',
  'nodesExpanded',
  'nodesGenerated',
  'peakOpenSize',
  'closedSize',
  'pathLength',
  'pathCost',
  'optimalityRatio',
  'runTicks',
  'coinsCollected',
  'score',
  'success',
]);

/**
 * CSV export (SPEC.md 8.4). RFC 4180 szerinti idézőjelezés, hogy a
 * szövegmezők (pl. "Best-First (w=3)") ne törjék el a formátumot.
 * @param {BenchmarkRow[]} rows
 * @returns {string}
 */
export function toCsv(rows) {
  const escape = (value) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => escape(row[column])).join(','));
  }
  return lines.join('\n');
}

/**
 * Algoritmusonkénti összegzés a táblázat alá (átlagok az összes seedre).
 * @param {BenchmarkRow[]} rows
 * @returns {{algorithm: string, runs: number, solved: number, avgPlanTimeMs: number,
 *            avgNodesExpanded: number, avgPathCost: number, avgOptimalityRatio: number, successRate: number}[]}
 */
export function summarize(rows) {
  /** @type {Map<string, BenchmarkRow[]>} */
  const byAlgorithm = new Map();
  for (const row of rows) {
    const list = byAlgorithm.get(row.algorithm) ?? [];
    list.push(row);
    byAlgorithm.set(row.algorithm, list);
  }
  const average = (list, pick) => (list.length === 0 ? 0 : list.reduce((s, r) => s + pick(r), 0) / list.length);

  return [...byAlgorithm.entries()].map(([algorithm, list]) => {
    const solvedRows = list.filter((r) => r.found);
    return {
      algorithm,
      runs: list.length,
      solved: solvedRows.length,
      avgPlanTimeMs: Number(average(list, (r) => r.planTimeMs).toFixed(3)),
      avgNodesExpanded: Math.round(average(list, (r) => r.nodesExpanded)),
      avgPathCost: Math.round(average(solvedRows, (r) => r.pathCost)),
      avgOptimalityRatio: Number(average(solvedRows, (r) => r.optimalityRatio).toFixed(4)),
      successRate: Number((list.filter((r) => r.success).length / Math.max(1, list.length)).toFixed(3)),
    };
  });
}
