import { createInitialRunState, RunStatus } from '../core/RunState.js';
import { step, Action } from '../core/step.js';
import { buildJumpGraph } from '../ai/JumpGraph.js';
import { bfs, dfs, dijkstra, astar, greedy, bestFirst } from '../ai/algorithms.js';
import { PrecomputedAIController, RealtimeAIController } from './AIController.js';

/** Race Against AI (SPEC.md 8.3): a játékos és az AI egyszerre fut, közös `step()` fizikával, külön futásállapottal; a `handicapTicks` késlelteti az AI indulását, hogy játszható maradjon. */

export const RaceSubmode = Object.freeze({ PRECOMPUTED: 'precomputed', REALTIME: 'realtime' });

export const Racer = Object.freeze({ PLAYER: 'player', AI: 'ai', TIE: 'tie' });

/** @param {string} key @param {number} weight @returns {import('../ai/search.js').Algorithm} */
function algorithmByKey(key, weight) {
  switch (key) {
    case 'bfs':
      return bfs;
    case 'dfs':
      return dfs;
    case 'dijkstra':
      return dijkstra;
    case 'astar':
      return astar;
    case 'greedy':
      return greedy;
    case 'bestFirst':
      return bestFirst(weight);
    default:
      throw new Error(`RaceAI: ismeretlen algoritmus-kulcs: ${key}`);
  }
}

export class RaceAI {
  /**
   * @param {import('../world/Level.js').Level} level
   * @param {{submode?: string, algorithm?: string, weight?: number, budgetMs?: number,
   *          expansionsPerTick?: number, commitEdges?: number, handicapTicks?: number}} [options]
   */
  constructor(level, options = {}) {
    this.level = level;
    this.submode = options.submode ?? RaceSubmode.PRECOMPUTED;
    this.algorithmKey = options.algorithm ?? 'astar';
    this.weight = options.weight ?? 1;
    this.handicapTicks = Math.max(0, options.handicapTicks ?? 0);

    this.graph = buildJumpGraph(level);
    const algorithm = algorithmByKey(this.algorithmKey, this.weight);
    this.algorithmName = algorithm.name;

    this.aiController =
      this.submode === RaceSubmode.REALTIME
        ? new RealtimeAIController(this.graph, algorithm, {
            budgetMs: options.budgetMs,
            expansionsPerTick: options.expansionsPerTick,
            commitEdges: options.commitEdges,
          })
        : new PrecomputedAIController(this.graph, algorithm);

    this.playerState = createInitialRunState(level);
    this.aiState = createInitialRunState(level);
    this.ticks = 0;
    /** @type {number} hányadik ticken ért célba (−1, ha nem) */
    this.playerFinishTick = -1;
    this.aiFinishTick = -1;
  }

  /** @returns {boolean} mindkét futó befejezte (célba ért / leesett / lejárt) */
  get finished() {
    return this.playerState.status !== RunStatus.RUNNING && this.aiState.status !== RunStatus.RUNNING;
  }

  /**
   * Egy tick: mindkét futó lép. A már befejezett futó állapota változatlan
   * marad (a `step()` lezárt állapoton no-op).
   * @param {number} playerAction - {@link Action}
   */
  tick(playerAction) {
    if (this.finished) return;

    if (this.playerState.status === RunStatus.RUNNING) {
      this.playerState = step(this.playerState, playerAction, this.level);
      if (this.playerState.status === RunStatus.GOAL && this.playerFinishTick < 0) {
        this.playerFinishTick = this.playerState.ticks;
      }
    }

    if (this.aiState.status === RunStatus.RUNNING) {
      // Handicap: az AI az első `handicapTicks` tickben nem lép.
      const aiAction = this.ticks < this.handicapTicks ? Action.NONE : this.aiController.getAction();
      this.aiState = step(this.aiState, aiAction, this.level);
      if (this.aiState.status === RunStatus.GOAL && this.aiFinishTick < 0) {
        this.aiFinishTick = this.aiState.ticks;
      }
    }

    this.ticks += 1;
  }

  /**
   * @param {import('../core/RunState.js').RunState} state @param {number} finishTick
   * @returns {{reachedGoal: boolean, ticks: number, timeSeconds: number, score: number, coins: number, maxCol: number, status: string}}
   */
  _side(state, finishTick) {
    return {
      reachedGoal: state.status === RunStatus.GOAL,
      ticks: finishTick >= 0 ? finishTick : state.ticks,
      timeSeconds: (finishTick >= 0 ? finishTick : state.ticks) / 60,
      score: state.score,
      coins: state.collectedCoins.size,
      maxCol: state.maxColReached,
      status: state.status,
    };
  }

  /**
   * Eredmény-összehasonlítás (SPEC.md 8.3): idő, pontszám, célba érés, győztes.
   * Győztes-sorrend: célba ért > kevesebb tick > messzebb jutott > több pont.
   * @returns {{winner: string, reason: string, player: object, ai: object}}
   */
  get result() {
    const player = this._side(this.playerState, this.playerFinishTick);
    const ai = this._side(this.aiState, this.aiFinishTick);

    /** @type {string} - {@link Racer} */
    let winner = Racer.TIE;
    let reason = '';

    if (player.reachedGoal && !ai.reachedGoal) {
      winner = Racer.PLAYER;
      reason = 'A játékos célba ért, az AI nem.';
    } else if (ai.reachedGoal && !player.reachedGoal) {
      winner = Racer.AI;
      reason = 'Az AI célba ért, a játékos nem.';
    } else if (player.reachedGoal && ai.reachedGoal) {
      if (player.ticks !== ai.ticks) {
        winner = player.ticks < ai.ticks ? Racer.PLAYER : Racer.AI;
        reason = `Mindkettő célba ért — a gyorsabb nyert (${Math.min(player.ticks, ai.ticks)} tick).`;
      } else {
        reason = 'Mindkettő célba ért, azonos idő alatt.';
      }
    } else if (player.maxCol !== ai.maxCol) {
      winner = player.maxCol > ai.maxCol ? Racer.PLAYER : Racer.AI;
      reason = 'Egyikük sem ért célba — a messzebb jutó nyert.';
    } else if (player.score !== ai.score) {
      winner = player.score > ai.score ? Racer.PLAYER : Racer.AI;
      reason = 'Egyikük sem ért célba, azonos távolság — a több pont nyert.';
    } else {
      reason = 'Döntetlen.';
    }

    return { winner, reason, player, ai };
  }

  /** A statisztikapanel adatai. */
  get stats() {
    const { winner, reason, player, ai } = this.result;
    const controller = this.aiController;
    return {
      submode: this.submode,
      algorithm: this.algorithmName,
      handicapTicks: this.handicapTicks,
      ticks: this.ticks,
      finished: this.finished,
      winner,
      reason,
      player,
      ai,
      aiPlanTimeMs: controller.planTimeMs,
      aiStallTicks: controller.stallTicks,
      aiReplans: controller.replans,
      aiNodesExpanded: controller.metrics.nodesExpanded,
    };
  }
}
