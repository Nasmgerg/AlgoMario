/**
 * Pontozási szabályok (SPEC.md 3.5. szakasz).
 */
export const SCORING = Object.freeze({
  PROGRESS_PER_COLUMN: 10,
  COIN: 100,
  SURPRISE: 500,
  GOAL_TIME_BONUS_MAX: 1000,
});

/**
 * Célba érési idő-bónusz: minél kevesebb tickből ér célba, annál nagyobb.
 * @param {number} ticks
 * @param {number} maxTicks
 * @returns {number}
 */
export function computeGoalTimeBonus(ticks, maxTicks) {
  return Math.round((1 - ticks / maxTicks) * SCORING.GOAL_TIME_BONUS_MAX);
}
