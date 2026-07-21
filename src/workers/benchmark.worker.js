import { runBenchmark, toCsv, summarize } from '../modes/Benchmark.js';

/** Benchmark Web Worker (SPEC.md 8.4): a mérés a fő szálon kívül fut; a worker csak burkolat, a logika a Phaser-mentes `modes/Benchmark.js`-ben van. */
self.onmessage = (event) => {
  try {
    const rows = runBenchmark(event.data ?? {}, (progress) => {
      self.postMessage({ type: 'progress', ...progress });
    });
    self.postMessage({ type: 'done', rows, summary: summarize(rows), csv: toCsv(rows) });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
