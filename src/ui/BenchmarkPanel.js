import { CSV_COLUMNS } from '../modes/Benchmark.js';

/** Benchmark panel (SPEC.md 8.4): indítás, haladásjelzés, rendezhető eredménytáblázat, összegzés, CSV letöltés; a mérés Web Workerben fut, ez a modul csak vezérel és renderel. */

/** Ezek az oszlopok kisebb=jobb; a rendezés alapból eszerint indul. */
const NUMERIC_COLUMNS = new Set(CSV_COLUMNS.filter((c) => c !== 'algorithm'));

export class BenchmarkPanel {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.el = document.createElement('div');
    this.el.className = 'benchmark-panel';
    container.appendChild(this.el);

    /** @type {import('../modes/Benchmark.js').BenchmarkRow[]} */
    this.rows = [];
    this.summary = [];
    this.csv = '';
    this.sortColumn = 'seed';
    this.sortAscending = true;
    /** @type {Worker | null} */
    this.worker = null;
    this.status = 'A mérés még nem futott.';

    this._render();
  }

  /** @param {{seedCount: number, length: number, difficulty: number}} options */
  run(options) {
    if (this.worker) this.worker.terminate();
    this.rows = [];
    this.summary = [];
    this.csv = '';
    this.status = 'Mérés indul…';
    this._render();

    this.worker = new Worker(new URL('../workers/benchmark.worker.js', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'progress') {
        this.status = `Mérés: ${message.done} / ${message.total} seed (utolsó: #${message.seed})`;
        this._render();
      } else if (message.type === 'done') {
        this.rows = message.rows;
        this.summary = message.summary;
        this.csv = message.csv;
        this.status = `Kész: ${message.rows.length} futás.`;
        this._releaseWorker();
        this._render();
      } else if (message.type === 'error') {
        this.status = `Hiba a mérés közben: ${message.message}`;
        this._releaseWorker();
        this._render();
      }
    };
    this.worker.onerror = (event) => {
      this.status = `Worker hiba: ${event.message}`;
      this._releaseWorker();
      this._render();
    };
    this.worker.postMessage(options);
  }

  /** @param {string} column */
  _sortBy(column) {
    if (this.sortColumn === column) this.sortAscending = !this.sortAscending;
    else {
      this.sortColumn = column;
      this.sortAscending = true;
    }
    this._render();
  }

  /** @returns {import('../modes/Benchmark.js').BenchmarkRow[]} */
  _sortedRows() {
    const column = this.sortColumn;
    const direction = this.sortAscending ? 1 : -1;
    return [...this.rows].sort((a, b) => {
      const av = a[column];
      const bv = b[column];
      if (NUMERIC_COLUMNS.has(column) && typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * direction;
      }
      return String(av).localeCompare(String(bv)) * direction;
    });
  }

  _downloadCsv() {
    const blob = new Blob([this.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mario-ai-benchmark.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  _render() {
    const header = CSV_COLUMNS.map((column) => {
      const arrow = this.sortColumn === column ? (this.sortAscending ? ' ▲' : ' ▼') : '';
      return `<th data-col="${column}" title="Rendezés">${column}${arrow}</th>`;
    }).join('');

    const body = this._sortedRows()
      .map(
        (row) =>
          `<tr>${CSV_COLUMNS.map((column) => {
            const value = row[column];
            const text = typeof value === 'boolean' ? (value ? '✓' : '—') : value;
            const highlight = column === 'optimalityRatio' && value === 1 ? ' class="optimal"' : '';
            return `<td${highlight}>${text}</td>`;
          }).join('')}</tr>`,
      )
      .join('');

    const summaryRows = this.summary
      .map(
        (s) =>
          `<tr><td>${s.algorithm}</td><td>${s.avgPlanTimeMs}</td><td>${s.avgNodesExpanded}</td>` +
          `<td>${s.avgPathCost}</td><td${s.avgOptimalityRatio === 1 ? ' class="optimal"' : ''}>${
            s.avgOptimalityRatio
          }</td><td>${s.solved}/${s.runs}</td></tr>`,
      )
      .join('');

    this.el.innerHTML = `
      <h3>Benchmark</h3>
      <div class="stat-phase">${this.status}</div>
      ${
        this.summary.length > 0
          ? `<h4>Összegzés (átlagok)</h4>
             <div class="table-scroll">
               <table class="bench-summary">
                 <thead><tr><th>algoritmus</th><th>terv ms</th><th>kiterj.</th><th>költség</th><th>opt. arány</th><th>megoldott</th></tr></thead>
                 <tbody>${summaryRows}</tbody>
               </table>
             </div>`
          : ''
      }
      ${
        this.rows.length > 0
          ? `<h4>Részletes eredmények</h4>
             <button class="csv-button">CSV letöltése</button>
             <div class="table-scroll">
               <table class="bench-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
             </div>`
          : ''
      }
    `;

    for (const th of this.el.querySelectorAll('th[data-col]')) {
      th.addEventListener('click', () => this._sortBy(th.getAttribute('data-col')));
    }
    const csvButton = this.el.querySelector('.csv-button');
    if (csvButton) csvButton.addEventListener('click', () => this._downloadCsv());
  }

  _releaseWorker() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
  }

  /** Módváltáskor hívandó: a félbehagyott mérés Workere különben a háttérben tovább terhelné a CPU-t. */
  stopMeasurement() {
    if (!this.worker) return;
    this._releaseWorker();
    this.status = 'A mérés megszakadt (módváltás).';
    this._render();
  }
}
