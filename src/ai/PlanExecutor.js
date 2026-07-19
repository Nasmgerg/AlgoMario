import { createRunStateAt, RunStatus } from '../core/RunState.js';
import { step } from '../core/step.js';

/**
 * PlanExecutor — a keresés eredményét (csomópontok + élek) tick-szintű
 * akciófolyammá alakítja és lejátssza (SPEC.md 7).
 *
 * A JumpGraph élei kanonikus (nyugalmi, egész oszlopú) csomópont-állapotból
 * vannak validálva. A hű lejátszás ezért csomópontonként ÚJRAHORGONYOZ: az
 * él akcióit mindig a forrás-csomópont kanonikus állapotából futtatja. Így
 * minden él bizonyítottan a cél-csomópontba érkezik (ezt a
 * konzisztencia-ellenőrzés ki is mondja), és a hibák nem halmozódnak.
 *
 * A folytonos (összefűzött) lejátszás — ahol a sebesség a csomóponthatárokon
 * átvezet — az él-menü nyugalmi kanonizálása miatt sodródhat; ezt a
 * `measureContinuousDrift` méri, és M4+-ban finomítható.
 */
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
   * Hű lejátszás csomópontonkénti újrahorgonyzással. Minden él a
   * forrás-csomópont nyugalmi állapotából fut, és ELLENŐRZI, hogy a
   * cél-csomópontba (nyugalomban) érkezett-e (SPEC.md 7 konzisztencia).
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
   * Folytonos lejátszás sodródásmérése: az összefűzött akciófolyamot a pálya
   * valódi startjáról futtatja, és élhatáronként összeveti a tényleges
   * oszlopot a tervezettel.
   * @param {number[]} path @param {import('./JumpGraph.js').JumpEdge[]} edges
   * @returns {{maxDrift: number, finalStatus: string}}
   */
  measureContinuousDrift(path, edges) {
    const nodes = this.graph.nodes;
    const startNode = nodes[path[0]];
    let state = createRunStateAt(startNode.row, startNode.col);
    let maxDrift = 0;

    for (let i = 0; i < edges.length; i += 1) {
      for (const action of edges[i].actions) {
        state = step(state, action, this.physicsLevel);
        if (state.status === RunStatus.FELL) return { maxDrift: Infinity, finalStatus: state.status };
      }
      const planned = nodes[path[i + 1]];
      maxDrift = Math.max(maxDrift, Math.abs(state.col - planned.col), Math.abs(state.row - planned.row));
    }
    return { maxDrift, finalStatus: state.status };
  }
}
