import { getCachedGraph } from '../ai/graphCache.js';
import { createSpeedrunProblem, createWaypointProblem, collectorGates } from '../ai/SearchProblem.js';
import { search, searchIterativeDeepening } from '../ai/search.js';
import { bfs, dfs, dfsDepthLimited, dijkstra, astar, greedy, bestFirst } from '../ai/algorithms.js';
import { PlanExecutor } from '../ai/PlanExecutor.js';
import { Metrics } from '../ai/Metrics.js';

/** Watch AI mód (SPEC.md 8.2), renderer-független: keresés (search() léptetve) → végrehajtás (PlanExecutor.runContinuous). Phaser/DOM nélkül — azt a render/ réteg olvassa. */

export const GoalMode = Object.freeze({ SPEEDRUN: 'speedrun', COLLECTOR: 'collector' });

/** DFS változatok (SPEC.md 6.3). */
export const DfsVariant = Object.freeze({ RAW: 'raw', ITERATIVE: 'iterative' });

export const WatchPhase = Object.freeze({
  SEARCHING: 'searching',
  EXECUTING: 'executing',
  DONE: 'done',
  NO_SOLUTION: 'noSolution',
});

/** A UI-ban választható hat algoritmus (SPEC.md 6.2). */
export const ALGORITHM_CHOICES = Object.freeze([
  { key: 'bfs', label: 'BFS' },
  { key: 'dfs', label: 'DFS' },
  { key: 'dijkstra', label: 'Dijkstra' },
  { key: 'astar', label: 'A*' },
  { key: 'greedy', label: 'Greedy Best-First' },
  { key: 'bestFirst', label: 'Best-First (w)' },
]);

/** A terv "célba" szakaszának jelzője (nem konkrét csomópont, hanem a céloszlop). */
const GOAL_TARGET = -1;

/**
 * @param {string} key @param {number} weight @param {string} dfsVariant
 * @returns {import('../ai/search.js').Algorithm}
 */
function buildAlgorithm(key, weight, dfsVariant) {
  switch (key) {
    case 'bfs':
      return bfs;
    case 'dfs':
      return dfsVariant === DfsVariant.ITERATIVE ? dfsDepthLimited : dfs;
    case 'dijkstra':
      return dijkstra;
    case 'astar':
      return astar;
    case 'greedy':
      return greedy;
    case 'bestFirst':
      return bestFirst(weight);
    default:
      throw new Error(`WatchAI: ismeretlen algoritmus-kulcs: ${key}`);
  }
}

export class WatchAI {
  /**
   * @param {import('../world/Level.js').Level} level
   * @param {{algorithm?: string, weight?: number, goalMode?: string, dfsVariant?: string, maxExpansions?: number}} [options]
   */
  constructor(level, options = {}) {
    this.level = level;
    this.algorithmKey = options.algorithm ?? 'astar';
    this.weight = options.weight ?? 1;
    this.goalMode = options.goalMode ?? GoalMode.SPEEDRUN;
    this.dfsVariant = options.dfsVariant ?? DfsVariant.RAW;
    this.maxExpansions = options.maxExpansions ?? 200000;

    this.graph = getCachedGraph(level);
    this.algorithm = buildAlgorithm(this.algorithmKey, this.weight, this.dfsVariant);
    this.executor = new PlanExecutor(level, this.graph);

    // Megosztott, élő számlálók (SPEC.md 6.4): a keresés minden szakasza ugyanebbe kumulál.
    this.metrics = new Metrics();

    /** @type {({kind: 'search', target: number} | {kind: 'edge', from: number, edge: import('../ai/JumpGraph.js').JumpEdge})[]} */
    this._plan = this._buildPlan();
    this._planIndex = 0;
    /** @type {number} az aktuális pozíció csomópont-indexe a tervezés során */
    this._cursor = this.graph.startIndex();
    /** @type {Generator<import('../ai/search.js').SearchStep, import('../ai/search.js').SearchResult, void> | null} */
    this._generator = null;

    /** @type {number[]} */
    this.path = [];
    /** @type {import('../ai/JumpGraph.js').JumpEdge[]} */
    this.edges = [];

    /** @type {string} - {@link WatchPhase} */
    this.phase = WatchPhase.SEARCHING;
    this.planTimeMs = 0;
    this.failureReason = '';
    /** @type {import('../ai/search.js').SearchStep | null} */
    this.lastStep = null;
    /** @type {{row: number, col: number}[]} */
    this.trajectory = [];
    this.executionTick = 0;
    /** A végrehajtás során TÉNYLEGESEN begyűjtött érmék száma (szimulált). */
    this.coinsOnPath = 0;
    /** A végrehajtás során TÉNYLEGESEN kiütött surprise blokkok száma (szimulált). */
    this.surprisesOnPath = 0;
    /** @type {{tick: number, coinId: number}[]} tick-pontos érme-események */
    this.coinEvents = [];
    /** @type {{tick: number, surpriseId: number}[]} tick-pontos surprise-események */
    this.surpriseEvents = [];
    // Frame-szám + falidő a panelnek: a planTimeMs (CPU-idő) önmagában nem jelzi az ütemezés széthúzottságát.
    this.searchFrames = 0;
    this.searchWallMs = 0;
    this._searchWallStart = -1;
  }

  /** A terv felépítése: speedrun = egyetlen cél-szakasz; collector = kapunként [keresés a kapuig] + [kényszerített kapu-él], végül cél-szakasz.
   * @returns {({kind: 'search', target: number} | {kind: 'edge', from: number, edge: import('../ai/JumpGraph.js').JumpEdge})[]}
   */
  _buildPlan() {
    /** @type {({kind: 'search', target: number} | {kind: 'edge', from: number, edge: import('../ai/JumpGraph.js').JumpEdge})[]} */
    const plan = [];
    if (this.goalMode === GoalMode.COLLECTOR) {
      let cursor = this.graph.startIndex();
      for (const gate of collectorGates(this.graph)) {
        if (gate.from !== cursor) plan.push({ kind: 'search', target: gate.from });
        plan.push({ kind: 'edge', from: gate.from, edge: gate.edge });
        cursor = gate.edge.to;
      }
    }
    plan.push({ kind: 'search', target: GOAL_TARGET });
    return plan;
  }

  /**
   * @param {number} target
   * @returns {Generator<import('../ai/search.js').SearchStep, import('../ai/search.js').SearchResult, void>}
   */
  _createGenerator(target) {
    const problem =
      target === GOAL_TARGET
        ? createSpeedrunProblem(this.graph, this._cursor)
        : createWaypointProblem(this.graph, this._cursor, target);
    const options = {
      maxExpansions: this.maxExpansions,
      maxDepth: this.graph.nodes.length,
      metrics: this.metrics,
    };
    if (this.algorithmKey === 'dfs' && this.dfsVariant === DfsVariant.ITERATIVE) {
      return searchIterativeDeepening(problem, this.algorithm, options);
    }
    return search(problem, this.algorithm, options);
  }

  /**
   * A keresés léptetése legfeljebb `maxSteps` kiterjesztéssel (a
   * sebesség-csúszka ezt hívja frame-enként). `Infinity` = azonnali.
   * @param {number} maxSteps
   */
  stepSearch(maxSteps) {
    if (this.phase !== WatchPhase.SEARCHING) return;
    // Budget-őr: NaN/undefined/0 esetén ne "haljon meg" némán az ütemezés —
    // 1 lépés/hívás a biztonságos minimum.
    const budget = maxSteps === Infinity ? Infinity : Math.max(1, Math.floor(Number(maxSteps) || 1));
    const startedAt = performance.now();
    if (this._searchWallStart < 0) this._searchWallStart = startedAt;
    this.searchFrames += 1;
    let steps = 0;

    while (steps < budget && this.phase === WatchPhase.SEARCHING) {
      const item = this._plan[this._planIndex];

      if (item.kind === 'edge') {
        this._applyForcedEdge(item);
        continue;
      }

      if (!this._generator) this._generator = this._createGenerator(item.target);
      const result = this._generator.next();
      if (!result.done) {
        this.lastStep = /** @type {import('../ai/search.js').SearchStep} */ (result.value);
        steps += 1;
        continue;
      }
      this._generator = null;
      this._finishSearchLeg(item.target, /** @type {import('../ai/search.js').SearchResult} */ (result.value));
    }

    const now = performance.now();
    this.planTimeMs += now - startedAt;
    this.searchWallMs = now - this._searchWallStart;
  }

  /** A teljes keresés lefuttatása vizualizáció nélkül ("azonnali" mód). */
  runSearchToEnd() {
    this.stepSearch(Infinity);
  }

  /** Kényszerített kapu-él a tervbe; ha a kurzor nem a kapu forrásán áll (egy korábbi kapu kimaradt), a kaput kihagyjuk.
   * @param {{kind: 'edge', from: number, edge: import('../ai/JumpGraph.js').JumpEdge}} item
   */
  _applyForcedEdge(item) {
    if (this._cursor !== item.from) {
      this._plan.splice(this._planIndex, 1);
      return;
    }
    if (this.path.length === 0) this.path.push(this._cursor);
    this.path.push(item.edge.to);
    this.edges.push(item.edge);
    this._cursor = item.edge.to;
    this._planIndex += 1;
    if (this._planIndex >= this._plan.length) this._finishPlanning();
  }

  /**
   * @param {number} target
   * @param {import('../ai/search.js').SearchResult} result
   */
  _finishSearchLeg(target, result) {
    if (!result.found) {
      if (target !== GOAL_TARGET) {
        // Elérhetetlen kapu: a kaput (keresési láb + kényszer-él) kihagyjuk,
        // az érméi kimaradnak — a futás a következő tervponttal folytatódik.
        this._plan.splice(this._planIndex, 2);
        return;
      }
      this.phase = WatchPhase.NO_SOLUTION;
      this.failureReason = result.metrics.timeout
        ? `A keresés elérte a ${this.maxExpansions} kiterjesztéses limitet.`
        : 'Nincs megoldás: a cél nem érhető el a jump-graphon.';
      return;
    }

    // Szakaszok összefűzése (az átfedő csomópontot csak egyszer vesszük).
    if (this.path.length === 0) this.path = [...result.path];
    else this.path.push(...result.path.slice(1));
    this.edges.push(...result.edges);
    this._cursor = result.goalNode;

    this._planIndex += 1;
    if (this._planIndex >= this._plan.length) this._finishPlanning();
  }

  _finishPlanning() {
    if (this.edges.length === 0) {
      this.phase = WatchPhase.NO_SOLUTION;
      this.failureReason = 'A terv üres (a start egyben a cél).';
      return;
    }
    const run = this.executor.runContinuous(this.path, this.edges);
    this.trajectory = run.trajectory;
    this.executionTick = 0;
    this.coinsOnPath = run.collectedCoins.size;
    this.surprisesOnPath = run.poppedSurprises.size;
    this.coinEvents = run.coinEvents;
    this.surpriseEvents = run.surpriseEvents;
    if (!run.reachedGoal) {
      this.phase = WatchPhase.NO_SOLUTION;
      this.failureReason = 'A terv végrehajtása eltért a tervezettől (belső hiba).';
      return;
    }
    this.phase = WatchPhase.EXECUTING;
  }

  /**
   * A lejátszás léptetése.
   * @param {number} ticks
   * @returns {{row: number, col: number} | null} az aktuális pozíció
   */
  advanceExecution(ticks) {
    if (this.phase !== WatchPhase.EXECUTING) return this.currentPosition();
    this.executionTick = Math.min(this.executionTick + ticks, this.trajectory.length - 1);
    if (this.executionTick >= this.trajectory.length - 1) this.phase = WatchPhase.DONE;
    return this.currentPosition();
  }

  /** @returns {{row: number, col: number} | null} */
  currentPosition() {
    if (this.trajectory.length === 0) return null;
    return this.trajectory[Math.min(this.executionTick, this.trajectory.length - 1)];
  }

  /** @returns {number} az aktuális lejátszási tickig begyűjtött érmék száma */
  get coinsCollected() {
    let count = 0;
    for (const event of this.coinEvents) {
      if (event.tick <= this.executionTick) count += 1;
    }
    return count;
  }

  /** @returns {number} az aktuális lejátszási tickig kiütött surprise blokkok száma */
  get surprisesCollected() {
    let count = 0;
    for (const event of this.surpriseEvents) {
      if (event.tick <= this.executionTick) count += 1;
    }
    return count;
  }

  /**
   * Bizonyítottan optimális-e (SPEC.md 5.4, 6.2): csak speedrunban, Dijkstra/A-star/Best-First w≤1-nél; collectorban sosem.
   * @returns {boolean}
   */
  get isProvablyOptimal() {
    if (this.goalMode !== GoalMode.SPEEDRUN) return false;
    if (this.algorithmKey === 'dijkstra' || this.algorithmKey === 'astar') return true;
    return this.algorithmKey === 'bestFirst' && this.weight <= 1;
  }

  /** A statisztikapanel adatai (SPEC.md 6.4) — keresés közben is ÉLŐ értékek. */
  get stats() {
    const m = this.metrics;
    const dfsSuffix =
      this.algorithmKey === 'dfs'
        ? this.dfsVariant === DfsVariant.ITERATIVE
          ? ' — iteratív mélyítés'
          : ' — nyers'
        : '';
    return {
      algorithm: this.algorithm.name + dfsSuffix,
      goalMode: this.goalMode,
      phase: this.phase,
      failureReason: this.failureReason,
      isProvablyOptimal: this.isProvablyOptimal,
      openSize: this.lastStep ? this.lastStep.openSize : 0,
      closedSize: this.lastStep ? this.lastStep.closedSize : m.closedSize,
      nodesExpanded: m.nodesExpanded,
      nodesGenerated: m.nodesGenerated,
      peakOpenSize: m.peakOpenSize,
      pathLength: this.edges.length,
      pathCost: this.edges.reduce((sum, e) => sum + e.cost, 0),
      planTimeMs: this.planTimeMs,
      searchFrames: this.searchFrames,
      searchWallMs: this.searchWallMs,
      coinsOnPath: this.coinsOnPath,
      coinsCollected: this.coinsCollected,
      surprisesOnPath: this.surprisesOnPath,
      surprisesCollected: this.surprisesCollected,
      leg: `${Math.min(this._planIndex + 1, this._plan.length)}/${this._plan.length}`,
      graphNodes: this.graph.nodes.length,
      graphEdges: this.graph.edgeCount(),
      executionTick: this.executionTick,
      executionTicks: Math.max(0, this.trajectory.length - 1),
    };
  }
}
