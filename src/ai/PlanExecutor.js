import { createRunStateAt, RunStatus } from '../core/RunState.js';
import { step } from '../core/step.js';

/** PlanExecutor — a terv (csomópontok + élek) tick-akciófolyammá alakítása és lejátszása (SPEC.md 7); az élek a horgony-fázis miatt folytonosan komponálhatók (M3-audit K1). */
export class PlanExecutor {
  /**
   * @param {import('../world/Level.js').Level} level
   * @param {import('./JumpGraph.js').JumpGraph} graph
   */
  constructor(level, graph) {
    this.level = level;
    this.graph = graph;
    // Az újrahorgonyzott/sodródás-lejátszás a GOAL-semlegesített pályán fut,
    // hogy egyezzen az él-validációval (a GOAL cella megállítaná a step()-et).
    this.physicsLevel = graph.physicsLevel;
  }

  /**
   * Az élek akcióinak összefűzése egyetlen tick-akciófolyammá.
   * @param {import('./JumpGraph.js').JumpEdge[]} edges
   * @returns {Uint8Array}
   */
  toActionStream(edges) {
    let total = 0;
    for (const edge of edges) total += edge.actions.length;
    const stream = new Uint8Array(total);
    let offset = 0;
    for (const edge of edges) {
      stream.set(edge.actions, offset);
      offset += edge.actions.length;
    }
    return stream;
  }

  /**
   * Hű lejátszás csomópontonkénti újrahorgonyzással; ellenőrzi, hogy minden él a cél-csomópontba érkezik-e (SPEC.md 7 konzisztencia).
   * @param {number[]} path - csomópont-indexek
   * @param {import('./JumpGraph.js').JumpEdge[]} edges
   * @returns {{ok: boolean, reachedNode: number, trajectory: {row:number,col:number}[], ticks: number, failedEdge: number}}
   */
  runReanchored(path, edges) {
    const nodes = this.graph.nodes;
    /** @type {{row:number,col:number}[]} */
    const trajectory = [];
    let ticks = 0;

    for (let i = 0; i < edges.length; i += 1) {
      const from = nodes[path[i]];
      const to = nodes[path[i + 1]];
      let state = createRunStateAt(from.row, from.col);
      for (const action of edges[i].actions) {
        state = step(state, action, this.physicsLevel);
        trajectory.push({ row: state.row, col: state.col });
        ticks += 1;
        if (state.status === RunStatus.FELL) {
          return { ok: false, reachedNode: path[i], trajectory, ticks, failedEdge: i };
        }
      }
      const arrived = state.grounded && state.row === to.row && Math.round(state.col) === to.col;
      if (!arrived) {
        return { ok: false, reachedNode: path[i], trajectory, ticks, failedEdge: i };
      }
    }
    return {
      ok: true,
      reachedNode: path[path.length - 1],
      trajectory,
      ticks,
      failedEdge: -1,
    };
  }

  /**
   * Valódi folytonos lejátszás, újrahorgonyzás nélkül: egyetlen `step()`-lánc a start-állapottól, élhatáronként mérve a tervezettől való eltérést (SPEC.md 7).
   * @param {number[]} path @param {import('./JumpGraph.js').JumpEdge[]} edges
   * @returns {{ok: boolean, reachedGoal: boolean, maxDrift: number, ticks: number, trajectory: {row:number,col:number}[], failedEdge: number, collectedCoins: Set<number>, coinEvents: {tick: number, coinId: number}[]}}
   */
  runContinuous(path, edges) {
    const nodes = this.graph.nodes;
    const startNode = nodes[path[0]];
    const goalNode = nodes[path[path.length - 1]];
    let state = createRunStateAt(startNode.row, startNode.col);
    /** @type {{row:number,col:number}[]} */
    const trajectory = [{ row: state.row, col: state.col }];
    let maxDrift = 0;
    let ticks = 0;
    // Tick-pontos érme-események, hogy a vizualizáció valós időben tüntethesse el őket (nem él-végi kötegekben).
    /** @type {{tick: number, coinId: number}[]} */
    const coinEvents = [];
    const seenCoins = new Set();

    const recordCoins = () => {
      if (state.collectedCoins.size === seenCoins.size) return;
      for (const coinId of state.collectedCoins) {
        if (!seenCoins.has(coinId)) {
          seenCoins.add(coinId);
          coinEvents.push({ tick: ticks, coinId });
        }
      }
    };

    for (let i = 0; i < edges.length; i += 1) {
      for (const action of edges[i].actions) {
        state = step(state, action, this.physicsLevel);
        trajectory.push({ row: state.row, col: state.col });
        ticks += 1;
        recordCoins();
        if (state.status === RunStatus.FELL) {
          return {
            ok: false,
            reachedGoal: false,
            maxDrift: Infinity,
            ticks,
            trajectory,
            failedEdge: i,
            collectedCoins: state.collectedCoins,
            coinEvents,
          };
        }
      }
      const planned = nodes[path[i + 1]];
      maxDrift = Math.max(maxDrift, Math.abs(state.col - planned.col), Math.abs(state.row - planned.row));
    }

    const reachedGoal =
      state.grounded && state.row === goalNode.row && Math.abs(state.col - goalNode.col) < 1e-6;
    return {
      ok: reachedGoal,
      reachedGoal,
      maxDrift,
      ticks,
      trajectory,
      failedEdge: -1,
      // A szimuláció TÉNYLEGESEN begyűjtött érméi — a "hány érme lesz meg"
      // statisztika igazságforrása (nem az él-metaadat).
      collectedCoins: state.collectedCoins,
      coinEvents,
    };
  }

  /**
   * Folytonos lejátszás sodródásmérése (kompatibilitási vékony wrapper a
   * {@link runContinuous} köré).
   * @param {number[]} path @param {import('./JumpGraph.js').JumpEdge[]} edges
   * @returns {{maxDrift: number, finalStatus: string}}
   */
  measureContinuousDrift(path, edges) {
    const result = this.runContinuous(path, edges);
    return { maxDrift: result.maxDrift, finalStatus: result.reachedGoal ? RunStatus.GOAL : RunStatus.FELL };
  }
}
