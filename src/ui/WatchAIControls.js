import { ALGORITHM_CHOICES, GoalMode, DfsVariant } from '../modes/WatchAI.js';
import { RaceSubmode } from '../modes/RaceAI.js';

/** Watch AI vezérlők (SPEC.md 8.2, 6.3, M4): algoritmus/célmód-választás, `w` súly és DFS-variáns; DOM-alapú, mint minden `ui/` modul. */

/** Rögzített keresés-sebesség: kiterjesztés/frame (SPEC.md 8.2, korábban csúszkával állítható). */
const STEPS_PER_FRAME = 2;

/** A realtime AI tick-budget fokozatai ms-ban (SPEC.md 8.3). */
export const BUDGET_STEPS = Object.freeze([0.05, 0.1, 0.2, 0.5, 1, 2, 5, 16]);

/** @param {string} label @param {HTMLElement} control @returns {HTMLElement} */
function field(label, control) {
  const wrap = document.createElement('label');
  wrap.className = 'ctl-field';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(span, control);
  return wrap;
}

export class WatchAIControls {
  /**
   * @param {HTMLElement} container
   * @param {{onRestart: (config: object) => void, onModeChange: (mode: string) => void,
   *          onRunBenchmark: (config: object) => void}} handlers
   */
  constructor(container, handlers) {
    this.handlers = handlers;
    this.el = document.createElement('div');
    this.el.className = 'controls';
    container.appendChild(this.el);

    this.modeSelect = this._select([
      { key: 'watch', label: 'Watch AI' },
      { key: 'play', label: 'Play Yourself' },
      { key: 'race', label: 'Race Against AI' },
      { key: 'benchmark', label: 'Benchmark' },
    ]);
    this.modeSelect.addEventListener('change', () => handlers.onModeChange(this.modeSelect.value));

    this.algorithmSelect = this._select(ALGORITHM_CHOICES);
    this.algorithmSelect.value = 'astar';
    this.algorithmSelect.addEventListener('change', () => {
      this._syncConditionalFields();
      this.restart();
    });

    this.goalSelect = this._select([
      { key: GoalMode.SPEEDRUN, label: 'speedrun' },
      { key: GoalMode.COLLECTOR, label: 'collector' },
    ]);
    this.goalSelect.addEventListener('change', () => this.restart());

    this.weightInput = this._range(0, 10, 1, 1);
    this.weightInput.addEventListener('input', () => {
      this.weightValue.textContent = this._weightLabel();
    });
    this.weightInput.addEventListener('change', () => this.restart());
    this.weightValue = document.createElement('b');
    this.weightValue.textContent = this._weightLabel();

    this.dfsSelect = this._select([
      { key: DfsVariant.RAW, label: 'nyers (raw)' },
      { key: DfsVariant.ITERATIVE, label: 'iteratív mélyítés' },
    ]);
    this.dfsSelect.addEventListener('change', () => this.restart());

    this.seedInput = document.createElement('input');
    this.seedInput.type = 'number';
    this.seedInput.value = '5';
    this.seedInput.className = 'ctl-seed';
    this.seedInput.addEventListener('change', () => this.restart());

    // --- Race (SPEC.md 8.3) ---
    this.raceSubmodeSelect = this._select([
      { key: RaceSubmode.PRECOMPUTED, label: 'precomputed (teljes terv)' },
      { key: RaceSubmode.REALTIME, label: 'realtime (tick-budget)' },
    ]);
    this.raceSubmodeSelect.addEventListener('change', () => {
      this._syncConditionalFields();
      this.restart();
    });

    // Tick-budget ms-ban: a valós játék frame-je ~16 ms, ezért az AI reális
    // gondolkodási kerete ennek töredéke — kis értéknél láthatóan akadozik.
    this.budgetInput = this._range(0, BUDGET_STEPS.length - 1, 1, BUDGET_STEPS.indexOf(0.2));
    this.budgetInput.addEventListener('input', () => {
      this.budgetValue.textContent = this._budgetLabel();
    });
    this.budgetInput.addEventListener('change', () => this.restart());
    this.budgetValue = document.createElement('b');
    this.budgetValue.textContent = this._budgetLabel();

    this.handicapInput = this._range(0, 5, 0.5, 0);
    this.handicapInput.addEventListener('input', () => {
      this.handicapValue.textContent = `${Number(this.handicapInput.value).toFixed(1)} s`;
    });
    this.handicapInput.addEventListener('change', () => this.restart());
    this.handicapValue = document.createElement('b');
    this.handicapValue.textContent = '0.0 s';

    // --- Benchmark (SPEC.md 8.4) ---
    this.seedCountInput = document.createElement('input');
    this.seedCountInput.type = 'number';
    this.seedCountInput.min = '1';
    this.seedCountInput.max = '200';
    this.seedCountInput.value = '10';
    this.seedCountInput.className = 'ctl-seed';

    this.benchmarkButton = document.createElement('button');
    this.benchmarkButton.textContent = 'Mérés indítása';
    this.benchmarkButton.addEventListener('click', () => handlers.onRunBenchmark(this.benchmarkConfig));

    const restartButton = document.createElement('button');
    restartButton.textContent = 'Újraindítás';
    restartButton.addEventListener('click', () => this.restart());

    this.weightField = field('Best-First w', this._withValue(this.weightInput, this.weightValue));
    this.dfsField = field('DFS változat', this.dfsSelect);
    this.goalField = field('Célmód', this.goalSelect);
    this.algorithmField = field('Algoritmus', this.algorithmSelect);
    this.seedField = field('Seed', this.seedInput);
    this.raceSubmodeField = field('Race almód', this.raceSubmodeSelect);
    this.budgetField = field('AI tick-budget', this._withValue(this.budgetInput, this.budgetValue));
    this.handicapField = field('AI handicap', this._withValue(this.handicapInput, this.handicapValue));
    this.seedCountField = field('Seedek száma', this.seedCountInput);
    this.restartField = restartButton;

    this.el.append(
      field('Mód', this.modeSelect),
      this.algorithmField,
      this.weightField,
      this.dfsField,
      this.goalField,
      this.raceSubmodeField,
      this.budgetField,
      this.handicapField,
      this.seedField,
      this.seedCountField,
      this.benchmarkButton,
      restartButton,
    );
    this._syncConditionalFields();
  }

  /** @param {readonly {key: string, label: string}[]} options @returns {HTMLSelectElement} */
  _select(options) {
    const select = document.createElement('select');
    for (const { key, label } of options) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = label;
      select.appendChild(option);
    }
    return select;
  }

  /** @returns {HTMLInputElement} */
  _range(min, max, step, value) {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    return input;
  }

  /** @param {HTMLElement} control @param {HTMLElement} value */
  _withValue(control, value) {
    const wrap = document.createElement('span');
    wrap.className = 'ctl-with-value';
    wrap.append(control, value);
    return wrap;
  }

  _weightLabel() {
    const w = Number(this.weightInput.value);
    if (w === 0) return 'w=0 (≡ Dijkstra)';
    if (w === 1) return 'w=1 (≡ A*)';
    return `w=${w} (weighted A*)`;
  }

  _budgetLabel() {
    const ms = BUDGET_STEPS[Number(this.budgetInput.value)];
    return ms >= 16 ? `${ms} ms (bő)` : `${ms} ms/tick`;
  }

  /**
   * Módfüggő mezőláthatóság: minden vezérlő csak ott jelenik meg, ahol
   * ténylegesen hat — így nem lehet olyat állítani, aminek nincs hatása.
   */
  _syncConditionalFields() {
    const mode = this.modeSelect.value;
    const usesAlgorithm = mode === 'watch' || mode === 'race';
    const show = (fieldEl, visible) => {
      fieldEl.style.display = visible ? '' : 'none';
    };

    show(this.algorithmField, usesAlgorithm);
    show(this.weightField, usesAlgorithm && this.algorithmSelect.value === 'bestFirst');
    // A DFS-variáns kapcsoló csak Watch AI-ban értelmes (a Race a nyers
    // változatot futtatja — az iteratív mélyítés újratervezésenként újraindulna).
    show(this.dfsField, mode === 'watch' && this.algorithmSelect.value === 'dfs');
    show(this.goalField, mode === 'watch');
    show(this.raceSubmodeField, mode === 'race');
    show(this.budgetField, mode === 'race' && this.raceSubmodeSelect.value === RaceSubmode.REALTIME);
    show(this.handicapField, mode === 'race');
    show(this.seedField, mode !== 'benchmark');
    show(this.seedCountField, mode === 'benchmark');
    this.benchmarkButton.style.display = mode === 'benchmark' ? '' : 'none';
    this.restartField.style.display = mode === 'benchmark' ? 'none' : '';
  }

  /** @returns {number} lépés/frame (a sebesség-csúszka eltávolítása után rögzített érték) */
  get stepsPerFrame() {
    return STEPS_PER_FRAME;
  }

  /** @returns {number} a kiválasztott seed */
  get seed() {
    const value = Number(this.seedInput.value);
    return Number.isFinite(value) ? value : 5;
  }

  /** @returns {{algorithm: string, weight: number, goalMode: string, dfsVariant: string, seed: number}} */
  get config() {
    return {
      algorithm: this.algorithmSelect.value,
      weight: Number(this.weightInput.value),
      goalMode: this.goalSelect.value,
      dfsVariant: this.dfsSelect.value,
      seed: this.seed,
    };
  }

  /** @returns {{submode: string, algorithm: string, weight: number, budgetMs: number, handicapTicks: number, seed: number}} */
  get raceConfig() {
    return {
      submode: this.raceSubmodeSelect.value,
      algorithm: this.algorithmSelect.value,
      weight: Number(this.weightInput.value),
      budgetMs: BUDGET_STEPS[Number(this.budgetInput.value)],
      handicapTicks: Math.round(Number(this.handicapInput.value) * 60),
      seed: this.seed,
    };
  }

  /** @returns {{seedCount: number, length: number, difficulty: number, weight: number}} */
  get benchmarkConfig() {
    const seedCount = Math.max(1, Math.min(200, Number(this.seedCountInput.value) || 10));
    return { seedCount, length: 100, difficulty: 2, weight: Number(this.weightInput.value) || 3 };
  }

  restart() {
    this.handlers.onRestart(this.config);
  }

  /** A mód váltásakor a mezőket újra kell szinkronizálni. */
  syncMode() {
    this._syncConditionalFields();
  }
}
