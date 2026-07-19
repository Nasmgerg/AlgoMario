import { admissibleHeuristic } from './Heuristics.js';

/**
 * Keresési problémák a JumpGraph fölött (SPEC.md 5.4, 6.1). A
 * {@link import('./search.js').search} által elvárt interfész:
 * `startNode()`, `isGoal(n)`, `neighbors(n)`, `heuristic(n)`.
 */

/**
 * Speedrun mód: egyetlen cél a pálya jobb széle, költség = tick. Ebben a
 * módban az A* és a Dijkstra bizonyíthatóan optimális (SPEC.md 5.4) — ez a
 * referencia-mérték.
 * @param {import('./JumpGraph.js').JumpGraph} graph
 * @returns {import('./search.js').SearchProblem}
 */
export function createSpeedrunProblem(graph) {
  const goalCol = graph.level.goalColumn;
  return {
    startNode: () => graph.startIndex(),
    isGoal: (n) => graph.nodes[n].col >= goalCol,
    neighbors: (n) => graph.edgesFrom(n),
    heuristic: (n) => admissibleHeuristic(graph.nodes[n].col, goalCol),
  };
}

/**
 * Waypoint-probléma: egy KONKRÉT cél-csomópont elérése. A collector mód
 * láncszemeihez és általános cél-kereséshez.
 * @param {import('./JumpGraph.js').JumpGraph} graph
 * @param {number} startIndex @param {number} targetIndex
 * @returns {import('./search.js').SearchProblem}
 */
export function createWaypointProblem(graph, startIndex, targetIndex) {
  const targetCol = graph.nodes[targetIndex].col;
  return {
    startNode: () => startIndex,
    isGoal: (n) => n === targetIndex,
    neighbors: (n) => graph.edgesFrom(n),
    heuristic: (n) => admissibleHeuristic(graph.nodes[n].col, targetCol),
  };
}

/**
 * Az érméket a leggyorsabban rájuk vezető ÉL cél-csomópontjához rendeli
 * (az él-metaadat `coins` mezője alapján). Ha egy érme egyetlen él mentén
 * sem gyűjthető be, kimarad.
 * @param {import('./JumpGraph.js').JumpGraph} graph
 * @returns {Map<number, number>} coinId → csomópont-index
 */
export function coinCollectionNodes(graph) {
  /** @type {Map<number, number>} */
  const byCoin = new Map();
  for (let from = 0; from < graph.nodes.length; from += 1) {
    for (const edge of graph.edgesFrom(from)) {
      for (const coinId of edge.coins) {
        if (!byCoin.has(coinId)) byCoin.set(coinId, edge.to);
      }
    }
  }
  return byCoin;
}

/**
 * Collector waypoint-sorrend: start → érme₁ → … → cél, a sorrendet
 * nearest-neighbour heurisztika adja (oszloptávolság alapján). NEM optimális,
 * és ezt a UI-ban ki is írjuk (SPEC.md 5.4).
 * @param {import('./JumpGraph.js').JumpGraph} graph
 * @returns {number[]} csomópont-indexek: [start, ...érmecsomópontok, cél]
 */
export function collectorWaypoints(graph) {
  const start = graph.startIndex();
  const goals = graph.goalIndices();
  const goal = goals.length > 0 ? goals[0] : start;

  const coinNodes = [...coinCollectionNodes(graph).values()];
  const waypoints = [start];
  let current = start;
  const remaining = new Set(coinNodes);

  while (remaining.size > 0) {
    let nearest = -1;
    let nearestDist = Infinity;
    for (const candidate of remaining) {
      const dist = Math.abs(graph.nodes[candidate].col - graph.nodes[current].col);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = candidate;
      }
    }
    waypoints.push(nearest);
    remaining.delete(nearest);
    current = nearest;
  }

  waypoints.push(goal);
  return waypoints;
}
