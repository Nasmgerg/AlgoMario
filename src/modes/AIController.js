import { Controller } from '../core/Controller.js';
import { Action } from '../core/step.js';
import { createSpeedrunProblem } from '../ai/SearchProblem.js';
import { search, runToCompletion } from '../ai/search.js';
import { Metrics } from '../ai/Metrics.js';

/**
 * AI-vezérlők a Race módhoz (SPEC.md 8.3); mindkettő a `Controller` interfészen fut, mint a Play Yourself, és Phaser/DOM-mentes (`performance.now()` nem DOM API).
 *
 * | Almód | Működés | Mit mutat |
 * |---|---|---|
 * | `precomputed` | előre teljes tervet készít, majd lejátssza | az útvonal minőségét |
 * | `realtime` | tickenként X ms budget, csomópontonként újratervez | a döntéshozatal minőségét időnyomás alatt |
 */

/** A tervet a GOAL-semlegesített pályán számoljuk, de a valódin futtatjuk — a két pálya csak a GOAL cellában tér el, a röppálya a célig azonos. */

/**
 * Előre teljes tervet készítő AI: a konstruktorban lefuttatja a keresést,
 * majd tickenként a terv következő akcióját adja vissza.
 */
export class PrecomputedAIController extends Controller {
  /**
   * @param {import('../ai/JumpGraph.js').JumpGraph} graph
   * @param {import('../ai/search.js').Algorithm} algorithm
   * @param {{maxExpansions?: number}} [options]
   */
  constructor(graph, algorithm, options = {}) {
    super();
    this.graph = graph;
    this.algorithm = algorithm;
    this.metrics = new Metrics();

    const startedAt = performance.now();
    const result = runToCompletion(
      search(createSpeedrunProblem(graph), algorithm, {
        maxExpansions: options.maxExpansions ?? 200000,
        maxDepth: graph.nodes.length,
        metrics: this.metrics,
      }),
    );
    this.planTimeMs = performance.now() - startedAt;
    this.found = result.found;
    this.path = result.path;
    this.edges = result.edges;

    /** @type {number[]} a teljes terv tick-akciófolyama */
    this.stream = [];
    for (const edge of result.edges) this.stream.push(...edge.actions);
    this.cursor = 0;
    // A realtime vezérlővel közös felület a statisztikákhoz:
    this.stallTicks = 0;
    this.replans = result.found ? 1 : 0;
  }

  /** @returns {number} {@link Action} */
  getAction() {
    if (this.cursor >= this.stream.length) return Action.NONE;
    const action = this.stream[this.cursor];
    this.cursor += 1;
    return action;
  }
}

/** Valós idejű AI: tickenként korlátozott gondolkodási idő (`budgetMs` vagy determinisztikus `expansionsPerTick`); amíg nincs kész terve, áll — ez teszi láthatóvá a döntéshozatal sebességét (SPEC 8.3). */
export class RealtimeAIController extends Controller {
  /**
   * @param {import('../ai/JumpGraph.js').JumpGraph} graph
   * @param {import('../ai/search.js').Algorithm} algorithm
   * @param {{budgetMs?: number, expansionsPerTick?: number, commitEdges?: number, maxExpansions?: number}} [options]
   */
  constructor(graph, algorithm, options = {}) {
    super();
    this.graph = graph;
    this.algorithm = algorithm;
    this.budgetMs = options.budgetMs ?? 0.2;
    this.expansionsPerTick = options.expansionsPerTick ?? 0;
    // Hány élt vállal be egy tervezésből, mielőtt újratervez (SPEC 8.3:
    // "újratervez"). 1 = csomópontonkénti újratervezés → a budget végig számít.
    this.commitEdges = options.commitEdges ?? 1;
    this.maxExpansions = options.maxExpansions ?? 200000;

    this.nodeIndex = graph.startIndex();
    /** @type {number[]} */
    this.queue = [];
    /** @type {Generator<import('../ai/search.js').SearchStep, import('../ai/search.js').SearchResult, void> | null} */
    this.generator = null;
    this.metrics = new Metrics();

    this.planTimeMs = 0;
    /** Hány ticket töltött tervezéssel, mozgás nélkül (a "gondolkodási adó"). */
    this.stallTicks = 0;
    this.replans = 0;
    this.failed = false;
  }

  /**
   * A saját tervéből dolgozik (a csomópont-követés belső), ezért a
   * futásállapotot nem használja — a `Controller` interfész megengedi.
   * @returns {number} {@link Action}
   */
  getAction() {
    if (this.queue.length === 0 && !this.failed) this._think();
    if (this.queue.length > 0) return this.queue.shift();
    this.stallTicks += 1;
    return Action.NONE;
  }

  /** Egy tick gondolkodás a rendelkezésre álló budget erejéig. */
  _think() {
    if (!this.generator) {
      this.generator = search(createSpeedrunProblem(this.graph, this.nodeIndex), this.algorithm, {
        maxExpansions: this.maxExpansions,
        maxDepth: this.graph.nodes.length,
        metrics: this.metrics,
      });
      this.replans += 1;
    }

    const startedAt = performance.now();
    const useCount = this.expansionsPerTick > 0;
    let used = 0;

    for (;;) {
      const next = this.generator.next();
      if (next.done) {
        this._commit(/** @type {import('../ai/search.js').SearchResult} */ (next.value));
        break;
      }
      used += 1;
      // Legalább egy lépés tickenként — durva felbontású óránál se ragadjon be.
      if (useCount) {
        if (used >= this.expansionsPerTick) break;
      } else if (performance.now() - startedAt >= this.budgetMs) {
        break;
      }
    }

    this.planTimeMs += performance.now() - startedAt;
  }

  /** @param {import('../ai/search.js').SearchResult} result */
  _commit(result) {
    this.generator = null;
    if (!result.found || result.edges.length === 0) {
      this.failed = true;
      return;
    }
    const committed = result.edges.slice(0, Math.max(1, this.commitEdges));
    for (const edge of committed) this.queue.push(...edge.actions);
    this.nodeIndex = committed[committed.length - 1].to;
  }
}
