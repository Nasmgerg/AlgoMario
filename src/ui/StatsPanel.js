import { WatchPhase } from '../modes/WatchAI.js';

/**
 * Statisztikapanel (SPEC.md 6.4 metrikák, 8.2 Watch AI). DOM-alapú: a
 * `ui/` réteg használhatja a DOM-ot, a `core`/`world`/`ai` nem.
 */

const PHASE_LABEL = Object.freeze({
  [WatchPhase.SEARCHING]: 'Keresés…',
  [WatchPhase.EXECUTING]: 'Végrehajtás',
  [WatchPhase.DONE]: 'Kész',
  [WatchPhase.NO_SOLUTION]: 'Nincs megoldás',
});

/** @param {string} label @param {string|number} value @returns {string} */
function row(label, value) {
  return `<div class="stat-row"><span>${label}</span><b>${value}</b></div>`;
}

export class StatsPanel {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.el = document.createElement('div');
    this.el.className = 'stats-panel';
    container.appendChild(this.el);
    this._loggedCollectorNote = false;
  }

  /** @param {import('../modes/WatchAI.js').WatchAI['stats']} stats */
  update(stats) {
    const pathCostText = stats.pathCost > 0 ? stats.pathCost : '—';
    const warning =
      stats.phase === WatchPhase.NO_SOLUTION
        ? `<div class="stat-warning">${stats.failureReason}</div>`
        : '';
    // Optimalitás-jelzés (SPEC 5.4/6.2): pozitív, ha bizonyítottan optimális utat ad, különben hogy nem garantált.
    const optimality = stats.isProvablyOptimal
      ? '<div class="stat-good">✓ bizonyítottan optimális út (megengedhető heurisztika)</div>'
      : '<div class="stat-note">az út nem garantáltan optimális</div>';

    // Fejlesztői infó (nem a fő UI-nak való): a collector-mód nem-optimalitásának oka, csak konzolba, módváltáskor egyszer.
    if (stats.goalMode === 'collector' && !this._loggedCollectorNote) {
      console.info('collector: nearest-neighbour kapu-sorrend — NEM optimális (SPEC 5.4)');
      this._loggedCollectorNote = true;
    } else if (stats.goalMode !== 'collector') {
      this._loggedCollectorNote = false;
    }

    this.el.innerHTML = `
      <h3>${stats.algorithm}</h3>
      <div class="stat-phase">${PHASE_LABEL[stats.phase] ?? stats.phase}${
        stats.goalMode === 'collector' ? ` · szakasz ${stats.leg}` : ''
      }</div>
      ${warning}
      ${optimality}
      ${row('Open lista', stats.openSize)}
      ${row('Closed halmaz', stats.closedSize)}
      ${row('Kiterjesztett csp.', stats.nodesExpanded)}
      ${row('Generált csp.', stats.nodesGenerated)}
      ${row('Peak open', stats.peakOpenSize)}
      ${row('Útvonalhossz (él)', stats.pathLength)}
      ${row('Útköltség (tick)', pathCostText)}
      ${row('Tervezés (CPU)', `${stats.planTimeMs.toFixed(1)} ms`)}
      ${row('Keresés (fal)', `${(stats.searchWallMs / 1000).toFixed(1)} s / ${stats.searchFrames} frame`)}
      ${row('Begyűjtve érme', `${stats.coinsCollected} / ${stats.coinsOnPath}`)}
      ${row('Kiütve surprise', `${stats.surprisesCollected} / ${stats.surprisesOnPath}`)}
      ${row('Lejátszás', `${stats.executionTick} / ${stats.executionTicks} tick`)}
      <hr />
      ${row('Gráf csomópont', stats.graphNodes)}
      ${row('Gráf él', stats.graphEdges)}
      <div class="legend">
        <span><i style="background:#00e5ff"></i>open</span>
        <span><i style="background:#2b3a67"></i>closed</span>
        <span><i style="background:#ffd400"></i>útvonal</span>
        <span><i style="background:#ffffff"></i>aktuális</span>
      </div>
    `;
  }
}
