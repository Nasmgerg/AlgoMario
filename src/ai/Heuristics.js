import { PHYSICS } from '../config/physics.js';

/**
 * Speedrun-heurisztika (SPEC.md 5.5):
 *
 *   h(n) = (targetCol − n.col) / MAX_RUN_SPEED
 *
 * A hátralévő oszlopok minimális tick-költsége. **Megengedhető**
 * (admissible): vízszintesen ennél gyorsabban semmi nem történhet, tehát
 * az A* optimalitása áll. Előre-irányú gráfban (minden él dCol ≥ 1) a
 * cél sosincs balra, de a `max(0, …)` biztonságból ott van.
 *
 * @param {number} col - a csomópont oszlopa
 * @param {number} targetCol - a cél oszlopa
 * @returns {number}
 */
export function admissibleHeuristic(col, targetCol) {
  return Math.max(0, (targetCol - col) / PHYSICS.MAX_RUN_SPEED);
}

/**
 * Opcionális, NEM megengedhető változat magassági taggal (SPEC.md 5.5):
 *
 *   h(n) = (targetCol − n.col) / MAX_RUN_SPEED + |rowDiff| · k
 *
 * Gyorsabb, de szuboptimális utat adhat — a UI-ban a különbség
 * demonstrálható. Alapból nem ezt használjuk.
 *
 * @param {number} col @param {number} row
 * @param {number} targetCol @param {number} targetRow
 * @param {number} [k] - a magassági tag súlya
 * @returns {number}
 */
export function heightWeightedHeuristic(col, row, targetCol, targetRow, k = 2) {
  return admissibleHeuristic(col, targetCol) + Math.abs(targetRow - row) * k;
}
