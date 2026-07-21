import { describe, it, expect } from 'vitest';
import {
  runBenchmark,
  toCsv,
  summarize,
  CSV_COLUMNS,
  BENCHMARK_ALGORITHMS,
} from '../src/modes/Benchmark.js';

/**
 * Benchmark (SPEC.md 8.4 + 6.4 metrikák). A mag Phaser nélkül fut — ezek a
 * tesztek pont ezt bizonyítják: Node alatt, DOM és Phaser nélkül mérnek.
 */

// Kis mérés, hogy a tesztsorozat gyors maradjon (a spec 5 mintája helyett 1).
const OPTIONS = { seedCount: 2, length: 80, difficulty: 2, planTimeSamples: 1 };
const ROWS = runBenchmark(OPTIONS);

describe('Benchmark mag (SPEC.md 8.4)', () => {
  it('N seed × 6 algoritmus sort ad, a 6.4 metrikáival', () => {
    expect(ROWS.length).toBe(2 * BENCHMARK_ALGORITHMS.length);
    for (const row of ROWS) {
      for (const column of CSV_COLUMNS) expect(row).toHaveProperty(column);
      expect(row.found).toBe(true);
      expect(row.nodesExpanded).toBeGreaterThan(0);
      expect(row.nodesGenerated).toBeGreaterThanOrEqual(row.nodesExpanded);
      expect(row.peakOpenSize).toBeGreaterThan(0);
      expect(row.pathCost).toBeGreaterThan(0);
      expect(row.planTimeMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('a terv TÉNYLEGES lefuttatásából származó mezők kitöltöttek (runTicks, score, success)', () => {
    for (const row of ROWS) {
      expect(row.success).toBe(true); // minden algoritmus célba visz ezeken a seedeken
      expect(row.runTicks).toBeGreaterThan(0);
      expect(row.score).toBeGreaterThan(0);
      expect(row.coinsCollected).toBeGreaterThanOrEqual(0);
    }
  });

  it('optimalityRatio: a Dijkstra és az A* pontosan 1, a többi ≥ 1', () => {
    for (const row of ROWS) {
      if (row.algorithm === 'Dijkstra' || row.algorithm === 'A*') {
        expect(row.optimalityRatio, `${row.algorithm} @ seed ${row.seed}`).toBe(1);
      } else {
        expect(row.optimalityRatio).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('determinisztikus: ugyanaz a konfiguráció ugyanazokat a mérőszámokat adja', () => {
    const again = runBenchmark(OPTIONS);
    // Az időmérés gépfüggő, ezért a planTimeMs-t kihagyjuk az összevetésből.
    const stable = CSV_COLUMNS.filter((c) => c !== 'planTimeMs');
    const strip = (rows) => rows.map((row) => stable.map((column) => row[column]));
    expect(strip(again)).toEqual(strip(ROWS));
  });

  it('haladás-visszahívás seedenként jelez (a Worker ebből küld progresszt)', () => {
    const seen = [];
    runBenchmark({ ...OPTIONS, seedCount: 3 }, (p) => seen.push(p));
    expect(seen.map((p) => p.done)).toEqual([1, 2, 3]);
    expect(seen.every((p) => p.total === 3)).toBe(true);
  });

  it('algoritmus-szűrés: csak a kért algoritmusok futnak', () => {
    const rows = runBenchmark({ ...OPTIONS, seedCount: 1, algorithms: ['astar', 'greedy'] });
    expect(new Set(rows.map((r) => r.algorithm))).toEqual(new Set(['A*', 'Greedy']));
  });
});

describe('CSV export (SPEC.md 8.4)', () => {
  it('fejléc + soronként egy rekord, a CSV_COLUMNS sorrendjében', () => {
    const csv = toCsv(ROWS);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines.length).toBe(ROWS.length + 1);
  });

  it('a vesszőt tartalmazó mezőket idézőjelezi (RFC 4180) — nem törik el a formátum', () => {
    const csv = toCsv([{ ...ROWS[0], algorithm: 'Best-First (w=3), teszt' }]);
    const dataLine = csv.split('\n')[1];
    expect(dataLine).toContain('"Best-First (w=3), teszt"');
    // A sor mezőszáma helyes marad az idézőjelezés miatt.
    expect(dataLine.match(/,/g).length).toBeGreaterThanOrEqual(CSV_COLUMNS.length - 1);
  });
});

describe('Összegzés (a táblázat alatti átlagok)', () => {
  it('algoritmusonként egy sor, helyes megoldott-aránnyal', () => {
    const summary = summarize(ROWS);
    expect(summary.length).toBe(BENCHMARK_ALGORITHMS.length);
    for (const entry of summary) {
      expect(entry.runs).toBe(2);
      expect(entry.solved).toBe(2);
      expect(entry.successRate).toBe(1);
      expect(entry.avgPathCost).toBeGreaterThan(0);
    }
    const optimal = summary.filter((s) => s.algorithm === 'Dijkstra' || s.algorithm === 'A*');
    for (const entry of optimal) expect(entry.avgOptimalityRatio).toBe(1);
  });

  it('a heurisztikus keresők átlagosan kevesebb csomópontot terjesztenek ki, mint a Dijkstra', () => {
    const summary = summarize(ROWS);
    const byName = (name) => summary.find((s) => s.algorithm === name);
    expect(byName('Greedy').avgNodesExpanded).toBeLessThan(byName('Dijkstra').avgNodesExpanded);
    expect(byName('A*').avgNodesExpanded).toBeLessThanOrEqual(byName('Dijkstra').avgNodesExpanded);
  });
});
