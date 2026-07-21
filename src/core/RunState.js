/**
 * Egy futás végfeltétele (SPEC.md 3.5. szakasz).
 */
export const RunStatus = Object.freeze({
  RUNNING: 'running',
  GOAL: 'goal',
  FELL: 'fell',
  TIMEOUT: 'timeout',
});

/**
 * Futásállapot; a `collectedCoins`/`poppedSurprises` Set-jét soha nem szabad `.add()`-olni, mindig másolni kell bővítés előtt.
 * @typedef {object} RunState
 * @property {number} row - Mario doboz bal-felső sarkának sora (lefelé nő)
 * @property {number} col - Mario doboz bal-felső sarkának oszlopa
 * @property {number} vRow - függőleges sebesség
 * @property {number} vCol - vízszintes sebesség
 * @property {boolean} grounded
 * @property {number} ticks
 * @property {number} score
 * @property {number} maxColReached - a legmesszebb elért oszlop (pontozáshoz)
 * @property {Set<number>} collectedCoins - begyűjtött érme id-k
 * @property {Set<number>} poppedSurprises - kiütött surprise id-k
 * @property {string} status - {@link RunStatus}
 */

/**
 * @param {import('../world/Level.js').Level} level
 * @returns {RunState}
 */
export function createInitialRunState(level) {
  const { row, col } = level.startPosition;
  return createRunStateAt(row, col);
}

/**
 * Nyugalmi (kanonikus) futásállapot egy cellán — az AI-réteg ezt használja csomópont-állapotként.
 * @param {number} row @param {number} col
 * @returns {RunState}
 */
export function createRunStateAt(row, col) {
  return Object.freeze({
    row,
    col,
    vRow: 0,
    vCol: 0,
    grounded: true,
    ticks: 0,
    score: 0,
    maxColReached: Math.floor(col),
    collectedCoins: new Set(),
    poppedSurprises: new Set(),
    status: RunStatus.RUNNING,
  });
}
