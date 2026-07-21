import { Racer, RaceSubmode } from '../modes/RaceAI.js';

/** Race eredménypanel (SPEC.md 8.3): a két futó összehasonlítása és a győztes; realtime almódban az AI "gondolkodási adóját" (állás-tickek, újratervezések) is mutatja. */

const STATUS_LABEL = Object.freeze({
  running: 'fut',
  goal: 'célba ért',
  fell: 'leesett',
  timeout: 'lejárt az idő',
});

/** @param {string} label @param {string|number} playerValue @param {string|number} aiValue @param {string} [winner] */
function compareRow(label, playerValue, aiValue, winner) {
  const playerClass = winner === Racer.PLAYER ? ' class="win"' : '';
  const aiClass = winner === Racer.AI ? ' class="win"' : '';
  return `<tr><td>${label}</td><td${playerClass}>${playerValue}</td><td${aiClass}>${aiValue}</td></tr>`;
}

export class RacePanel {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.el = document.createElement('div');
    this.el.className = 'race-panel';
    container.appendChild(this.el);
  }

  /** @param {import('../modes/RaceAI.js').RaceAI['stats']} stats */
  update(stats) {
    const { player, ai } = stats;
    const fasterWinner =
      player.reachedGoal && ai.reachedGoal
        ? player.ticks < ai.ticks
          ? Racer.PLAYER
          : ai.ticks < player.ticks
            ? Racer.AI
            : undefined
        : undefined;

    const banner = stats.finished
      ? `<div class="race-banner ${stats.winner}">${
          stats.winner === Racer.PLAYER
            ? '🏆 A JÁTÉKOS NYERT'
            : stats.winner === Racer.AI
              ? '🤖 AZ AI NYERT'
              : '🤝 DÖNTETLEN'
        }</div><div class="stat-note">${stats.reason}</div>`
      : `<div class="stat-phase">Verseny folyamatban — ${(stats.ticks / 60).toFixed(1)} s</div>`;

    const realtimeRows =
      stats.submode === RaceSubmode.REALTIME
        ? `${compareRow('Állás (gondolkodás)', '—', `${stats.aiStallTicks} tick`)}
           ${compareRow('Újratervezés', '—', stats.aiReplans)}`
        : '';

    this.el.innerHTML = `
      <h3>Race: ${stats.algorithm}</h3>
      <div class="stat-phase">${stats.submode === RaceSubmode.REALTIME ? 'realtime (tick-budget)' : 'precomputed (teljes terv)'}${
        stats.handicapTicks > 0 ? ` · handicap ${(stats.handicapTicks / 60).toFixed(1)} s` : ''
      }</div>
      ${banner}
      <table class="race-table">
        <thead><tr><th></th><th>TE</th><th>AI</th></tr></thead>
        <tbody>
          ${compareRow('Célba ért', player.reachedGoal ? '✓' : '—', ai.reachedGoal ? '✓' : '—', stats.winner)}
          ${compareRow('Idő', `${player.timeSeconds.toFixed(2)} s`, `${ai.timeSeconds.toFixed(2)} s`, fasterWinner)}
          ${compareRow('Pontszám', player.score, ai.score, player.score === ai.score ? undefined : player.score > ai.score ? Racer.PLAYER : Racer.AI)}
          ${compareRow('Érme', player.coins, ai.coins)}
          ${compareRow('Eljutott (oszlop)', player.maxCol, ai.maxCol)}
          ${compareRow('Állapot', STATUS_LABEL[player.status] ?? player.status, STATUS_LABEL[ai.status] ?? ai.status)}
          ${realtimeRows}
        </tbody>
      </table>
      <div class="stat-note">AI tervezési idő: ${stats.aiPlanTimeMs.toFixed(1)} ms · kiterjesztett csp.: ${stats.aiNodesExpanded}</div>
      <div class="stat-note">Irányítás: A/← D/→ W/↑/Space · R = újraindítás</div>
    `;
  }
}
