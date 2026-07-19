import { describe, it, expect } from 'vitest';
import { Level, CellType } from '../src/world/Level.js';
import { createRunStateAt, RunStatus } from '../src/core/RunState.js';
import { step } from '../src/core/step.js';
import { generateLevel } from '../src/world/LevelGenerator.js';
import { buildJumpTable, jumpTableKey, JUMP_TABLE_RANGE, _resetJumpTableCache } from '../src/ai/JumpTable.js';
import { buildJumpGraph } from '../src/ai/JumpGraph.js';

/**
 * Egy él tényleges kivitelezése a step()-pel: a forrás-csomópont nyugalmi
 * állapotából lefuttatjuk az akciókat, és megnézzük, hova ér Mario.
 */
function executeEdge(graph, fromNode, edge) {
  let state = createRunStateAt(fromNode.row, fromNode.col);
  for (const action of edge.actions) {
    state = step(state, action, graph.physicsLevel);
    if (state.status === RunStatus.FELL) break;
  }
  return state;
}

describe('JumpTable (SPEC.md 5.2)', () => {
  it('a tartományon belül épül, és van benne alapvető sétaél', () => {
    const { entries, range } = buildJumpTable();
    expect(range).toEqual(JUMP_TABLE_RANGE);
    // sík séta 1 oszlopra: létezik és olcsó
    const walk1 = entries.get(jumpTableKey(0, 1));
    expect(walk1).toBeTruthy();
    expect(walk1[0].ticks).toBeGreaterThan(0);
  });

  it('minden jelölt akciósora a saját tick-hosszával egyezik', () => {
    const { entries } = buildJumpTable();
    for (const list of entries.values()) {
      for (const cand of list) {
        expect(cand.actions.length).toBe(cand.ticks);
      }
    }
  });

  it('determinisztikus: cache-ürítés után ugyanaz épül', () => {
    const a = buildJumpTable();
    _resetJumpTableCache();
    const b = buildJumpTable();
    expect(b.entries.size).toBe(a.entries.size);
    for (const [key, listA] of a.entries) {
      const listB = b.entries.get(key);
      expect(listB.map((c) => c.ticks)).toEqual(listA.map((c) => c.ticks));
    }
  });
});

describe('JumpGraph csomópontok (SPEC.md 5.3)', () => {
  it('állható cella = nem tömör cella tömör cella fölött', () => {
    // 6 magas, 5 széles: alsó sor tömör, egy platform (3,2)-nél.
    const height = 6;
    const length = 5;
    const cells = new Uint8Array(height * length);
    for (let col = 0; col < length; col += 1) cells[(height - 1) * length + col] = CellType.WALL;
    cells[4 * length + 2] = CellType.WALL; // platformtömb a (4,2)-n → tetején (3,2) állható
    const level = new Level({
      height,
      length,
      cells,
      coins: [],
      surprises: [],
      startPosition: { row: height - 2, col: 0 },
      goalColumn: length - 1,
      maxTicks: 1000,
      seed: 1,
    });
    const graph = buildJumpGraph(level);
    // A talajsor fölött minden oszlopban van csomópont (row = height-2),
    // KIVÉVE a 2. oszlopot, ahol a platformtömb ül a talajon → ott a
    // csomópont a tömb tetején (3,2) van.
    for (let col = 0; col < length; col += 1) {
      if (col === 2) continue;
      expect(graph.nodeIndexAt(height - 2, col)).toBeGreaterThanOrEqual(0);
    }
    expect(graph.nodeIndexAt(height - 2, 2)).toBe(-1); // (4,2) tömör, nem állható
    expect(graph.nodeIndexAt(3, 2)).toBeGreaterThanOrEqual(0); // a tömb teteje
  });
});

describe('JumpGraph élek (SPEC.md 5.3, 11)', () => {
  const cases = [
    [1, 80, 0],
    [2, 100, 1],
    [5, 120, 2],
    [7, 120, 3],
    [11, 150, 4],
  ];

  it('minden él végrehajtása valóban a célcellába érkezik (step()-pel visszaellenőrizve)', () => {
    for (const [seed, len, diff] of cases) {
      const level = generateLevel({ seed, length: len, difficulty: diff });
      const graph = buildJumpGraph(level);
      expect(graph.edgeCount()).toBeGreaterThan(0);
      for (let from = 0; from < graph.nodes.length; from += 1) {
        for (const edge of graph.edgesFrom(from)) {
          const target = graph.nodes[edge.to];
          const finalState = executeEdge(graph, graph.nodes[from], edge);
          expect(
            finalState.grounded,
            `seed ${seed}: él ${from}→${edge.to} nem talajon ér véget`,
          ).toBe(true);
          expect(finalState.row, `seed ${seed}: él ${from}→${edge.to} rossz sor`).toBe(target.row);
          expect(
            Math.round(finalState.col),
            `seed ${seed}: él ${from}→${edge.to} rossz oszlop`,
          ).toBe(target.col);
        }
      }
    }
  });

  it('az élsúly pozitív egész és egyezik az akcióhosszal', () => {
    const level = generateLevel({ seed: 3, length: 100, difficulty: 2 });
    const graph = buildJumpGraph(level);
    for (let from = 0; from < graph.nodes.length; from += 1) {
      for (const edge of graph.edgesFrom(from)) {
        expect(Number.isInteger(edge.cost)).toBe(true);
        expect(edge.cost).toBeGreaterThan(0);
        expect(edge.cost).toBe(edge.actions.length);
        expect(edge.to).not.toBe(from);
      }
    }
  });

  it('a start eléri a célt a jump-graphon (minden nehézségi szinten)', () => {
    for (const [seed, len, diff] of cases) {
      const level = generateLevel({ seed, length: len, difficulty: diff });
      const graph = buildJumpGraph(level);
      const start = graph.startIndex();
      const goals = new Set(graph.goalIndices());
      expect(goals.size).toBeGreaterThan(0);
      const seen = new Set([start]);
      const queue = [start];
      let reached = false;
      while (queue.length > 0) {
        const n = queue.shift();
        if (goals.has(n)) reached = true;
        for (const e of graph.edgesFrom(n)) {
          if (!seen.has(e.to)) {
            seen.add(e.to);
            queue.push(e.to);
          }
        }
      }
      expect(reached, `seed ${seed} (diff ${diff}): a start nem éri el a célt`).toBe(true);
    }
  });

  it('determinisztikus: ugyanabból a pályából ugyanaz a gráf épül', () => {
    const level = generateLevel({ seed: 9, length: 100, difficulty: 2 });
    const a = buildJumpGraph(level);
    const b = buildJumpGraph(level);
    expect(b.nodes.length).toBe(a.nodes.length);
    expect(b.edgeCount()).toBe(a.edgeCount());
    for (let i = 0; i < a.nodes.length; i += 1) {
      expect(b.edgesFrom(i).map((e) => `${e.to}:${e.cost}`)).toEqual(
        a.edgesFrom(i).map((e) => `${e.to}:${e.cost}`),
      );
    }
  });

  it('gyűjthető érme szerepel valamelyik él coins-metaadatában', () => {
    // Olyan pálya, amin biztosan van elérhető érme.
    const level = generateLevel({ seed: 4, length: 120, difficulty: 1, coinDensity: 0.9 });
    if (level.coins.length === 0) return;
    const graph = buildJumpGraph(level);
    const coinsOnEdges = new Set();
    for (let from = 0; from < graph.nodes.length; from += 1) {
      for (const edge of graph.edgesFrom(from)) {
        for (const id of edge.coins) coinsOnEdges.add(id);
      }
    }
    expect(coinsOnEdges.size).toBeGreaterThan(0);
  });
});
