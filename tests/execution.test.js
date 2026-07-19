import { describe, it, expect } from 'vitest';
import { generateLevel } from '../src/world/LevelGenerator.js';
import { buildJumpGraph } from '../src/ai/JumpGraph.js';
import { createSpeedrunProblem } from '../src/ai/SearchProblem.js';
import { search, runToCompletion } from '../src/ai/search.js';
import { astar, dijkstra } from '../src/ai/algorithms.js';
import { PlanExecutor } from '../src/ai/PlanExecutor.js';
import { createRunStateAt } from '../src/core/RunState.js';
import { step } from '../src/core/step.js';

/**
 * Folytonos (nem újrahorgonyzott) végrehajtás — M3-audit K1 javítás
 * (SPEC.md 7). A terv egyetlen, megszakítás nélküli akciófolyamként
 * lejátszva a start-állapotból pontosan a célba kell érjen, halmozódó
 * sodródás nélkül.
 */

const CASES = [
  [1, 80, 0],
  [2, 100, 1],
  [5, 120, 2],
  [7, 120, 3],
  [11, 150, 4],
  [23, 200, 2],
];

// Lebegőpontos tűrés: a horgony-fázis 0,05-rácson mozog, a maradék csak a
// 0,05 bináris ábrázolási hibája (nagyságrend 1e-12).
const FLOAT_TOLERANCE = 1e-6;

describe('Folytonos terv-végrehajtás (SPEC.md 7, M3-audit K1)', () => {
  it('minden él PONTOSAN a cél-csomópont egész oszlopában, nyugalomban végződik', () => {
    for (const [seed, len, diff] of CASES) {
      const graph = buildJumpGraph(generateLevel({ seed, length: len, difficulty: diff }));
      for (let from = 0; from < graph.nodes.length; from += 1) {
        for (const edge of graph.edgesFrom(from)) {
          const to = graph.nodes[edge.to];
          let state = createRunStateAt(graph.nodes[from].row, graph.nodes[from].col);
          for (const action of edge.actions) state = step(state, action, graph.physicsLevel);
          expect(state.grounded).toBe(true);
          expect(state.vCol).toBe(0);
          expect(state.row).toBe(to.row);
          expect(Math.abs(state.col - to.col)).toBeLessThan(FLOAT_TOLERANCE);
        }
      }
    }
  });

  it('az A* terv FOLYTONOSAN (újrahorgonyzás nélkül) célba ér, sodródás nélkül', () => {
    for (const [seed, len, diff] of CASES) {
      const level = generateLevel({ seed, length: len, difficulty: diff });
      const graph = buildJumpGraph(level);
      const res = runToCompletion(
        search(createSpeedrunProblem(graph), astar, { maxDepth: graph.nodes.length }),
      );
      expect(res.found, `seed ${seed}: A* nem talált utat`).toBe(true);

      const exec = new PlanExecutor(level, graph);
      const run = exec.runContinuous(res.path, res.edges);
      expect(run.reachedGoal, `seed ${seed}: folytonos lejátszás nem ért célba`).toBe(true);
      expect(run.maxDrift, `seed ${seed}: sodródás túl nagy`).toBeLessThan(FLOAT_TOLERANCE);
    }
  });

  it('a folytonos és az újrahorgonyzott lejátszás bit-azonos trajektóriát ad', () => {
    for (const [seed, len, diff] of CASES) {
      const level = generateLevel({ seed, length: len, difficulty: diff });
      const graph = buildJumpGraph(level);
      const res = runToCompletion(
        search(createSpeedrunProblem(graph), dijkstra, { maxDepth: graph.nodes.length }),
      );
      const exec = new PlanExecutor(level, graph);
      const cont = exec.runContinuous(res.path, res.edges);
      const rean = exec.runReanchored(res.path, res.edges);
      expect(rean.ok).toBe(true);
      // A folytonos trajektória tartalmazza a kezdőpontot is (+1 elem).
      expect(cont.trajectory.length).toBe(rean.trajectory.length + 1);
      for (let t = 0; t < rean.trajectory.length; t += 1) {
        const c = cont.trajectory[t + 1];
        const r = rean.trajectory[t];
        expect(Math.abs(c.col - r.col)).toBeLessThan(FLOAT_TOLERANCE);
        expect(c.row).toBe(r.row);
      }
    }
  });

  it('a folytonos akciófolyam hossza megegyezik az élköltségek összegével', () => {
    const level = generateLevel({ seed: 5, length: 120, difficulty: 2 });
    const graph = buildJumpGraph(level);
    const res = runToCompletion(
      search(createSpeedrunProblem(graph), astar, { maxDepth: graph.nodes.length }),
    );
    const exec = new PlanExecutor(level, graph);
    const stream = exec.toActionStream(res.edges);
    const costSum = res.edges.reduce((s, e) => s + e.cost, 0);
    expect(stream.length).toBe(costSum);
    expect(exec.runContinuous(res.path, res.edges).ticks).toBe(costSum);
  });
});
