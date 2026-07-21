import { describe, it, expect } from 'vitest';
import { generateLevel } from '../src/world/LevelGenerator.js';
import { buildJumpGraph } from '../src/ai/JumpGraph.js';
import { createSpeedrunProblem, createWaypointProblem, collectorGates } from '../src/ai/SearchProblem.js';
import { search, runToCompletion } from '../src/ai/search.js';
import { bfs, dfs, dijkstra, astar, greedy, bestFirst } from '../src/ai/algorithms.js';
import { BinaryHeap } from '../src/ai/frontiers/BinaryHeap.js';
import { FifoQueue } from '../src/ai/frontiers/FifoQueue.js';
import { LifoStack } from '../src/ai/frontiers/LifoStack.js';

/** @param {import('../src/ai/JumpGraph.js').JumpGraph} graph @param {import('../src/ai/search.js').Algorithm} alg */
function solveSpeedrun(graph, alg) {
  return runToCompletion(
    search(createSpeedrunProblem(graph), alg, { maxExpansions: 200000, maxDepth: graph.nodes.length }),
  );
}

describe('Frontier adatszerkezetek', () => {
  it('BinaryHeap a legkisebb prioritásút adja először, azonosnál FIFO', () => {
    const heap = /** @type {BinaryHeap<{priority:number, tag:string}>} */ (new BinaryHeap());
    heap.push({ priority: 5, tag: 'a' });
    heap.push({ priority: 1, tag: 'b' });
    heap.push({ priority: 3, tag: 'c' });
    heap.push({ priority: 1, tag: 'd' });
    expect(heap.pop().tag).toBe('b'); // 1, előbb szúrva
    expect(heap.pop().tag).toBe('d'); // 1, később szúrva
    expect(heap.pop().tag).toBe('c'); // 3
    expect(heap.pop().tag).toBe('a'); // 5
    expect(heap.size).toBe(0);
  });

  it('FifoQueue FIFO, LifoStack LIFO', () => {
    const q = new FifoQueue();
    [1, 2, 3].forEach((x) => q.push(x));
    expect([q.pop(), q.pop(), q.pop()]).toEqual([1, 2, 3]);

    const s = new LifoStack();
    [1, 2, 3].forEach((x) => s.push(x));
    expect([s.pop(), s.pop(), s.pop()]).toEqual([3, 2, 1]);
  });
});

describe('A hat algoritmus (SPEC.md 6.2, 11)', () => {
  const speedrunCases = [
    [1, 80, 0],
    [2, 100, 1],
    [5, 120, 2],
    [7, 120, 3],
    [11, 150, 4],
  ];

  it('mind a hat talál megoldást', () => {
    for (const [seed, len, diff] of speedrunCases) {
      const graph = buildJumpGraph(generateLevel({ seed, length: len, difficulty: diff }));
      for (const alg of [bfs, dfs, dijkstra, astar, greedy, bestFirst(1)]) {
        const res = solveSpeedrun(graph, alg);
        expect(res.found, `${alg.name} nem talált megoldást (seed ${seed})`).toBe(true);
        expect(res.metrics.pathCost).toBeGreaterThan(0);
      }
    }
  });

  it('A* és Dijkstra speedrun-költsége MEGEGYEZIK (optimalitás-ellenőrzés)', () => {
    for (const [seed, len, diff] of speedrunCases) {
      const graph = buildJumpGraph(generateLevel({ seed, length: len, difficulty: diff }));
      const dij = solveSpeedrun(graph, dijkstra);
      const ast = solveSpeedrun(graph, astar);
      expect(dij.found && ast.found).toBe(true);
      expect(ast.metrics.pathCost, `seed ${seed}: A* ≠ Dijkstra`).toBe(dij.metrics.pathCost);
    }
  });

  it('A* költsége ≤ Greedy Best-First költsége', () => {
    for (const [seed, len, diff] of speedrunCases) {
      const graph = buildJumpGraph(generateLevel({ seed, length: len, difficulty: diff }));
      const ast = solveSpeedrun(graph, astar);
      const grd = solveSpeedrun(graph, greedy);
      expect(ast.metrics.pathCost).toBeLessThanOrEqual(grd.metrics.pathCost);
    }
  });

  it('Best-First keretrendszer: w=0 → Dijkstra, w=1 → A* (költségben)', () => {
    for (const [seed, len, diff] of speedrunCases) {
      const graph = buildJumpGraph(generateLevel({ seed, length: len, difficulty: diff }));
      const dij = solveSpeedrun(graph, dijkstra).metrics.pathCost;
      const ast = solveSpeedrun(graph, astar).metrics.pathCost;
      expect(solveSpeedrun(graph, bestFirst(0)).metrics.pathCost).toBe(dij);
      expect(solveSpeedrun(graph, bestFirst(1)).metrics.pathCost).toBe(ast);
    }
  });

  it('A* megengedhető heurisztikával nem terjeszt több csomópontot, mint a Dijkstra', () => {
    for (const [seed, len, diff] of speedrunCases) {
      const graph = buildJumpGraph(generateLevel({ seed, length: len, difficulty: diff }));
      const dij = solveSpeedrun(graph, dijkstra);
      const ast = solveSpeedrun(graph, astar);
      expect(ast.metrics.nodesExpanded).toBeLessThanOrEqual(dij.metrics.nodesExpanded);
    }
  });

  it('a metrikák ki vannak töltve (6.4)', () => {
    const graph = buildJumpGraph(generateLevel({ seed: 5, length: 120, difficulty: 2 }));
    const res = solveSpeedrun(graph, astar);
    expect(res.metrics.nodesExpanded).toBeGreaterThan(0);
    expect(res.metrics.nodesGenerated).toBeGreaterThanOrEqual(res.metrics.nodesExpanded);
    expect(res.metrics.peakOpenSize).toBeGreaterThan(0);
    expect(res.metrics.closedSize).toBeGreaterThan(0);
    expect(res.metrics.pathLength).toBe(res.edges.length);
    expect(res.metrics.optimalityRatio(res.metrics.pathCost)).toBe(1);
  });

  it('determinisztikus: ugyanaz a seed + algoritmus → ugyanaz az útvonal (golden)', () => {
    const graph = buildJumpGraph(generateLevel({ seed: 7, length: 120, difficulty: 3 }));
    const a = solveSpeedrun(graph, astar);
    const b = solveSpeedrun(graph, astar);
    expect(a.path).toEqual(b.path);
    expect(a.metrics.pathCost).toBe(b.metrics.pathCost);
  });

  it('a generátoros keresés lépésenként léptethető (yield-el a kiterjesztéseknél)', () => {
    const graph = buildJumpGraph(generateLevel({ seed: 1, length: 80, difficulty: 0 }));
    const gen = search(createSpeedrunProblem(graph), astar, { maxDepth: graph.nodes.length });
    let steps = 0;
    let r = gen.next();
    while (!r.done) {
      expect(r.value).toHaveProperty('current');
      expect(r.value).toHaveProperty('openSize');
      steps += 1;
      r = gen.next();
    }
    expect(steps).toBeGreaterThan(0);
    expect(r.value.found).toBe(true);
    expect(r.value.metrics.nodesExpanded).toBe(steps);
  });

  it('collector mód: kapu-élek — valós begyűjtő élek, elérhető láncban (5.4)', () => {
    const graph = buildJumpGraph(generateLevel({ seed: 4, length: 120, difficulty: 1, coinDensity: 0.9 }));
    const gates = collectorGates(graph);
    expect(gates.length).toBeGreaterThan(0);

    const coveredCoins = new Set();
    const coveredSurprises = new Set();
    let cursor = graph.startIndex();
    for (const gate of gates) {
      // létező él, ami tényleg gyűjt valamit (érmét VAGY surprise-t)
      expect(graph.edgesFrom(gate.from)).toContain(gate.edge);
      expect(gate.edge.coins.length + gate.edge.surprises.length).toBeGreaterThan(0);
      // a lánc bejárható: a kurzortól a kapu elejéig van út
      if (gate.from !== cursor) {
        const res = runToCompletion(
          search(createWaypointProblem(graph, cursor, gate.from), astar, {
            maxDepth: graph.nodes.length,
          }),
        );
        expect(res.found, `kapu (${gate.from}) nem elérhető a láncban`).toBe(true);
      }
      cursor = gate.edge.to;
      for (const coinId of gate.edge.coins) coveredCoins.add(coinId);
      for (const surpriseId of gate.edge.surprises) coveredSurprises.add(surpriseId);
    }
    // a pálya érméinek nagy részét lefedik a kapuk
    expect(coveredCoins.size).toBeGreaterThanOrEqual(10);
    // a surprise blokkok sem maradnak ki (SPEC 3.5: 500 pont, az érme ötszöröse)
    expect(coveredSurprises.size).toBeGreaterThan(0);
  });

  it('maxExpansions limit → timeout jelzés, részleges legjobb csomóponttal (12)', () => {
    const graph = buildJumpGraph(generateLevel({ seed: 11, length: 150, difficulty: 4 }));
    const res = runToCompletion(
      search(createSpeedrunProblem(graph), dijkstra, { maxExpansions: 3, maxDepth: graph.nodes.length }),
    );
    expect(res.metrics.timeout).toBe(true);
    expect(res.found).toBe(false);
    expect(res.goalNode).toBeGreaterThanOrEqual(0);
  });
});
