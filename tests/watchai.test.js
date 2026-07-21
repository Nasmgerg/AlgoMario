import { describe, it, expect } from 'vitest';
import { generateLevel } from '../src/world/LevelGenerator.js';
import { buildJumpGraph } from '../src/ai/JumpGraph.js';
import { createSpeedrunProblem } from '../src/ai/SearchProblem.js';
import { search, searchIterativeDeepening, runToCompletion } from '../src/ai/search.js';
import { bfs, dfs, dfsDepthLimited } from '../src/ai/algorithms.js';
import {
  WatchAI,
  WatchPhase,
  GoalMode,
  DfsVariant,
  ALGORITHM_CHOICES,
} from '../src/modes/WatchAI.js';

/** A keresést végigfuttatja, majd a lejátszást is befejezi. */
function runWatchToEnd(watch) {
  watch.runSearchToEnd();
  let guard = 0;
  while (watch.phase === WatchPhase.EXECUTING && guard < 100000) {
    watch.advanceExecution(500);
    guard += 1;
  }
  return watch;
}

describe('search() vizualizációs kimenet (SPEC.md 6.1, M4)', () => {
  it('minden yield tartalmazza az open/closed halmazt, a méretekkel konzisztensen', () => {
    const graph = buildJumpGraph(generateLevel({ seed: 5, length: 120, difficulty: 2 }));
    const gen = search(createSpeedrunProblem(graph), bfs, { maxDepth: graph.nodes.length });
    let res = gen.next();
    let steps = 0;
    while (!res.done) {
      const stepValue = /** @type {import('../src/ai/search.js').SearchStep} */ (res.value);
      expect(stepValue.open).toBeInstanceOf(Set);
      expect(stepValue.closed).toBeInstanceOf(Set);
      expect(stepValue.closed.size).toBe(stepValue.closedSize);
      // A frissen kiterjesztett csomópont már NEM open, viszont closed:
      expect(stepValue.closed.has(stepValue.current)).toBe(true);
      expect(stepValue.open.has(stepValue.current)).toBe(false);
      // A yield ÉLŐ metrics-et is ad (SPEC 6.1), ami a kiterjesztésekkel nő:
      expect(stepValue.metrics.nodesExpanded).toBe(steps + 1);
      steps += 1;
      res = gen.next();
    }
    expect(steps).toBeGreaterThan(0);
  });
});

describe('Iteratív mélyítés (SPEC.md 6.3)', () => {
  const graph = buildJumpGraph(generateLevel({ seed: 5, length: 120, difficulty: 2 }));
  const problem = createSpeedrunProblem(graph);

  it('megoldást talál, és a BFS-szel azonos élszámú (legkevesebb élű) utat ad', () => {
    const iterative = runToCompletion(searchIterativeDeepening(problem, dfsDepthLimited, { maxDepth: 64 }));
    const breadth = runToCompletion(search(problem, bfs, { maxDepth: graph.nodes.length }));
    expect(iterative.found).toBe(true);
    expect(iterative.edges.length).toBe(breadth.edges.length);
  });

  it('ára: lényegesen több kiterjesztés, mint a nyers DFS-é', () => {
    const iterative = runToCompletion(searchIterativeDeepening(problem, dfsDepthLimited, { maxDepth: 64 }));
    const raw = runToCompletion(search(problem, dfs, { maxDepth: graph.nodes.length }));
    expect(raw.found).toBe(true);
    expect(iterative.metrics.nodesExpanded).toBeGreaterThan(raw.metrics.nodesExpanded);
  });
});

describe('WatchAI mód (SPEC.md 8.2, M4)', () => {
  const CASES = [
    [5, 120, 2],
    [7, 120, 3],
  ];

  it('mind a hat algoritmus végigmegy a keresés → végrehajtás fázison', () => {
    for (const [seed, length, difficulty] of CASES) {
      const level = generateLevel({ seed, length, difficulty });
      for (const { key, label } of ALGORITHM_CHOICES) {
        const watch = runWatchToEnd(new WatchAI(level, { algorithm: key, weight: 3 }));
        expect(watch.phase, `${label} (seed ${seed}) nem ért végig`).toBe(WatchPhase.DONE);
        const stats = watch.stats;
        expect(stats.pathLength).toBeGreaterThan(0);
        expect(stats.pathCost).toBeGreaterThan(0);
        expect(stats.nodesExpanded).toBeGreaterThan(0);
        expect(stats.planTimeMs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('a lépésenkénti (vizualizált) keresés ugyanazt adja, mint az azonnali', () => {
    const level = generateLevel({ seed: 5, length: 120, difficulty: 2 });
    const instant = runWatchToEnd(new WatchAI(level, { algorithm: 'astar' }));

    const stepped = new WatchAI(level, { algorithm: 'astar' });
    let guard = 0;
    while (stepped.phase === WatchPhase.SEARCHING && guard < 100000) {
      stepped.stepSearch(3);
      guard += 1;
    }
    expect(stepped.path).toEqual(instant.path);
    expect(stepped.stats.pathCost).toBe(instant.stats.pathCost);
    expect(stepped.stats.nodesExpanded).toBe(instant.stats.nodesExpanded);
  });

  it('a DFS két változata megkülönböztethető a statisztikában (6.3)', () => {
    const level = generateLevel({ seed: 5, length: 120, difficulty: 2 });
    const raw = runWatchToEnd(new WatchAI(level, { algorithm: 'dfs', dfsVariant: DfsVariant.RAW }));
    const iterative = runWatchToEnd(
      new WatchAI(level, { algorithm: 'dfs', dfsVariant: DfsVariant.ITERATIVE }),
    );
    expect(raw.stats.algorithm).toContain('nyers');
    expect(iterative.stats.algorithm).toContain('iteratív');
    expect(iterative.stats.nodesExpanded).toBeGreaterThan(raw.stats.nodesExpanded);
  });

  it('collector célmódban a waypoint-láncot végigjárja és érmét gyűjt (5.4)', () => {
    const level = generateLevel({ seed: 4, length: 120, difficulty: 1, coinDensity: 0.9 });
    const watch = runWatchToEnd(new WatchAI(level, { algorithm: 'astar', goalMode: GoalMode.COLLECTOR }));
    expect(watch.phase).toBe(WatchPhase.DONE);
    expect(watch.stats.coinsOnPath).toBeGreaterThan(0);
    expect(watch.stats.goalMode).toBe(GoalMode.COLLECTOR);
  });

  it('a végrehajtás a folytonos (sodródásmentes) trajektórián halad végig', () => {
    const level = generateLevel({ seed: 7, length: 120, difficulty: 3 });
    const watch = new WatchAI(level, { algorithm: 'astar' });
    watch.runSearchToEnd();
    expect(watch.phase).toBe(WatchPhase.EXECUTING);
    const goalNode = watch.graph.nodes[watch.path[watch.path.length - 1]];
    runWatchToEnd(watch);
    const finalPos = watch.currentPosition();
    expect(finalPos.row).toBe(goalNode.row);
    expect(Math.abs(finalPos.col - goalNode.col)).toBeLessThan(1e-6);
  });

  it('a keresési limit túllépése "nincs megoldás" állapotot ad, magyarázattal (12)', () => {
    const level = generateLevel({ seed: 5, length: 120, difficulty: 2 });
    const watch = new WatchAI(level, { algorithm: 'dijkstra', maxExpansions: 3 });
    watch.runSearchToEnd();
    expect(watch.phase).toBe(WatchPhase.NO_SOLUTION);
    expect(watch.stats.failureReason).toContain('limit');
  });
});

describe('M4 hibajavítás: UI-kötések ellenőrzése (a diagnózis-kérés tesztjei)', () => {
  const level5 = generateLevel({ seed: 5, length: 120, difficulty: 2 });

  it('(a) különböző algoritmus-választás különböző eredményt ad', () => {
    /** @type {Map<string, WatchAI>} */
    const results = new Map();
    for (const { key } of ALGORITHM_CHOICES) {
      results.set(key, runWatchToEnd(new WatchAI(level5, { algorithm: key, weight: 3 })));
    }
    // Legalább 4 különböző (költség | kiterjesztés) aláírás a hatból —
    // A*≡Dijkstra és Greedy≈Best-First(w=3) párok jogosan eshetnek egybe.
    const signatures = new Set(
      [...results.values()].map((w) => `${w.stats.pathCost}|${w.stats.nodesExpanded}`),
    );
    expect(signatures.size).toBeGreaterThanOrEqual(4);
    // A nyers DFS útja hosszabb, mint az A*-é (a fordított gyereksorrend óta ténylegesen "mély")
    expect(results.get('dfs').stats.pathLength).toBeGreaterThan(results.get('astar').stats.pathLength);
    // A Greedy kevesebbet terjeszt ki, mint a Dijkstra
    expect(results.get('greedy').stats.nodesExpanded).toBeLessThan(
      results.get('dijkstra').stats.nodesExpanded,
    );
    // Az A* és a Dijkstra költsége azonos (mindkettő optimális)
    expect(results.get('astar').stats.pathCost).toBe(results.get('dijkstra').stats.pathCost);
  });

  it('(b) a célmód-váltás különböző útvonalat ad, a collector tényleg érmét gyűjt', () => {
    const level = generateLevel({ seed: 4, length: 120, difficulty: 1, coinDensity: 0.9 });
    const speedrun = runWatchToEnd(new WatchAI(level, { algorithm: 'astar', goalMode: GoalMode.SPEEDRUN }));
    const collector = runWatchToEnd(
      new WatchAI(level, { algorithm: 'astar', goalMode: GoalMode.COLLECTOR }),
    );
    expect(speedrun.phase).toBe(WatchPhase.DONE);
    expect(collector.phase).toBe(WatchPhase.DONE);
    expect(collector.path).not.toEqual(speedrun.path);
    // A kapu-élek kényszerítése miatt a collector a pálya érméinek nagy
    // részét TÉNYLEGESEN begyűjti (szimulált futásból mérve), a speedrun alig.
    expect(collector.stats.coinsOnPath).toBeGreaterThanOrEqual(10);
    expect(collector.stats.coinsOnPath).toBeGreaterThan(speedrun.stats.coinsOnPath);
    // A kitérők miatt a collector útja nem olcsóbb a speedrunnál.
    expect(collector.stats.pathCost).toBeGreaterThanOrEqual(speedrun.stats.pathCost);
  });

  it('(c) az optimalitás-jelzés helyesen tükrözi az algoritmus+célmód garanciáit', () => {
    // A flag nem függ a pályától — kis pálya elég (12 példány épül).
    const smallLevel = generateLevel({ seed: 5, length: 40, difficulty: 1 });
    /** @param {object} opts */
    const flag = (opts) => new WatchAI(smallLevel, opts).isProvablyOptimal;
    // Bizonyítottan optimális: teljes keresők megengedhető heurisztikával, speedrunban.
    expect(flag({ algorithm: 'astar' })).toBe(true);
    expect(flag({ algorithm: 'dijkstra' })).toBe(true);
    expect(flag({ algorithm: 'bestFirst', weight: 0 })).toBe(true);
    expect(flag({ algorithm: 'bestFirst', weight: 1 })).toBe(true);
    // Nem garantált: túlsúlyozott heurisztika, greedy, BFS (élszám ≠ tick), DFS.
    expect(flag({ algorithm: 'bestFirst', weight: 3 })).toBe(false);
    expect(flag({ algorithm: 'greedy' })).toBe(false);
    expect(flag({ algorithm: 'bfs' })).toBe(false);
    expect(flag({ algorithm: 'dfs' })).toBe(false);
    // Collector módban SOSEM garantált (nearest-neighbour kapu-sorrend).
    expect(flag({ algorithm: 'astar', goalMode: GoalMode.COLLECTOR })).toBe(false);
    expect(flag({ algorithm: 'dijkstra', goalMode: GoalMode.COLLECTOR })).toBe(false);
    // A stats ugyanezt adja tovább a panelnek.
    expect(new WatchAI(smallLevel, { algorithm: 'astar' }).stats.isProvablyOptimal).toBe(true);
  });

  it('a metrikák a keresés KÖZBEN is élnek és nőnek (SPEC 6.1/6.4)', () => {
    const watch = new WatchAI(level5, { algorithm: 'dijkstra' });
    watch.stepSearch(5);
    expect(watch.phase).toBe(WatchPhase.SEARCHING);
    expect(watch.stats.nodesExpanded).toBe(5);
    expect(watch.stats.openSize).toBeGreaterThan(0);
    watch.stepSearch(5);
    expect(watch.stats.nodesExpanded).toBe(10);
    // A yield-elt metrics ugyanaz az élő példány, amit a stats olvas.
    expect(watch.lastStep.metrics).toBe(watch.metrics);
  });

  it('a keresés VALÓBAN frame-enként adagolt: N lépés/hívás, nem egy menet', () => {
    // 1 lépés/hívás: hívásonként pontosan 1 kiterjesztés fogy — a hívások
    // (≈ böngésző-frame-ek) száma a kiterjesztések számával azonos
    // nagyságrendű, azaz a keresés időben széthúzott.
    const slow = new WatchAI(level5, { algorithm: 'astar' });
    let calls = 0;
    while (slow.phase === WatchPhase.SEARCHING && calls < 100000) {
      slow.stepSearch(1);
      calls += 1;
    }
    expect(slow.phase).toBe(WatchPhase.EXECUTING);
    expect(calls).toBeGreaterThanOrEqual(slow.metrics.nodesExpanded);
    expect(slow.searchFrames).toBe(calls);
    expect(slow.metrics.nodesExpanded).toBeGreaterThan(50); // érdemi keresés

    // 25 lépés/hívás: ~25-öd annyi hívás — a csúszka tényleg a tempót szabja.
    const fast = new WatchAI(level5, { algorithm: 'astar' });
    let fastCalls = 0;
    while (fast.phase === WatchPhase.SEARCHING && fastCalls < 100000) {
      fast.stepSearch(25);
      fastCalls += 1;
    }
    expect(fastCalls).toBeLessThan(calls / 5);
    // Az eredmény ütemezéstől független (determinizmus):
    expect(fast.path).toEqual(slow.path);
    expect(fast.stats.pathCost).toBe(slow.stats.pathCost);

    // Budget-őr: érvénytelen érték nem öli meg némán az ütemezést.
    const guarded = new WatchAI(level5, { algorithm: 'astar' });
    guarded.stepSearch(/** @type {any} */ (undefined));
    expect(guarded.stats.nodesExpanded).toBe(1); // 1 lépés minimum, nem 0 és nem ∞
  });

  it('érme-események tick-pontosak, és a lejátszás alatt élőben nő a számláló', () => {
    const level = generateLevel({ seed: 4, length: 120, difficulty: 1, coinDensity: 0.9 });
    const watch = new WatchAI(level, { algorithm: 'astar', goalMode: GoalMode.COLLECTOR });
    watch.runSearchToEnd();
    expect(watch.phase).toBe(WatchPhase.EXECUTING);

    const events = watch.coinEvents;
    expect(events.length).toBe(watch.stats.coinsOnPath);
    expect(events.length).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i].tick).toBeGreaterThanOrEqual(events[i - 1].tick);
    }
    expect(events[0].tick).toBeGreaterThan(0);
    expect(events[events.length - 1].tick).toBeLessThanOrEqual(watch.stats.executionTicks);

    // A számláló a lejátszással együtt, menet közben nő — nem a végén ugrik.
    expect(watch.stats.coinsCollected).toBe(0);
    watch.advanceExecution(events[Math.floor(events.length / 2)].tick);
    const midway = watch.stats.coinsCollected;
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(events.length);
    while (watch.phase === WatchPhase.EXECUTING) watch.advanceExecution(500);
    expect(watch.stats.coinsCollected).toBe(events.length);
  });
});
