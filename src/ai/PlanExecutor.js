import { createRunStateAt, RunStatus } from '../core/RunState.js';
import { step } from '../core/step.js';

/**
 * PlanExecutor — a keresés eredményét (csomópontok + élek) tick-szintű
 * akciófolyammá alakítja és lejátssza (SPEC.md 7).
 *
 * A JumpGraph minden éle a forrás-csomópont kanonikus (nyugalmi, egész
 * oszlopú) állapotából indul, ÉS PONTOSAN a cél-csomópont ugyanilyen
 * kanonikus állapotában végződik (a JumpGraph horgony-fázisa gondoskodik
 * erről). Ezért az élek FOLYTONOSAN komponálhatók: a `runContinuous` az
 * összefűzött akciófolyamot egyetlen, megszakítás nélküli `step()`-láncként
 * futtatja a start-állapotból, ÚJRAHORGONYZÁS NÉLKÜL — és a tervezett
 * csomópontoktól való eltérés csak lebegőpontos hiba nagyságrendű (M3-audit
 * K1 javítva). A `runReanchored` (élenkénti kanonikus újraindítás) így már
 * csak diagnosztika: az eredménye bit-azonos a folytonossal.
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
   * VALÓDI folytonos lejátszás: a start-csomópont állapotából egyetlen,
   * megszakítás nélküli `step()`-láncként futtatja az ÖSSZES él akcióját
   * (újrahorgonyzás NÉLKÜL), és élhatáronként méri a tervezettől való
   * eltérést (SPEC.md 7 konzisztencia-ellenőrzés). Ez az M4 lejátszás-
   * vizualizáció és az M5 race/realtime alapja.
   *
   * @param {number[]} path @param {import('./JumpGraph.js').JumpEdge[]} edges
   * @returns {{ok: boolean, reachedGoal: boolean, maxDrift: number, ticks: number, trajectory: {row:number,col:number}[], failedEdge: number}}
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

    for (let i = 0; i < edges.length; i += 1) {
      for (const action of edges[i].actions) {
        state = step(state, action, this.physicsLevel);
        trajectory.push({ row: state.row, col: state.col });
        ticks += 1;
        if (state.status === RunStatus.FELL) {
          return { ok: false, reachedGoal: false, maxDrift: Infinity, ticks, trajectory, failedEdge: i };
        }
      }
      const planned = nodes[path[i + 1]];
      maxDrift = Math.max(maxDrift, Math.abs(state.col - planned.col), Math.abs(state.row - planned.row));
    }

    const reachedGoal =
      state.grounded && state.row === goalNode.row && Math.abs(state.col - goalNode.col) < 1e-6;
    return { ok: reachedGoal, reachedGoal, maxDrift, ticks, trajectory, failedEdge: -1 };
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
