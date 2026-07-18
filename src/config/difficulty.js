/**
 * Pályaméret-presetek és nehézségi paraméterek (SPEC.md D1, D2, 4.2. szakasz).
 */
export const LENGTH_PRESETS = Object.freeze({
  short: 120,
  normal: 250,
  long: 500,
});

export const DEFAULT_HEIGHT = 16;
export const TICKS_PER_COLUMN = 40;

/** @param {number} length @returns {number} */
export function computeMaxTicks(length) {
  return length * TICKS_PER_COLUMN;
}

/**
 * Nehézségi szint (0-4) → chunk-választási súlyok.
 * `gapFrequency`/`platformDensity`: [0,1] súly a nehezebb chunk-típusokra.
 * `coinDensity`: [0,1] súly az érme-tartalmú chunkokra.
 */
export const DIFFICULTY_PRESETS = Object.freeze([
  Object.freeze({ difficulty: 0, gapFrequency: 0.0, coinDensity: 0.5, platformDensity: 0.0 }),
  Object.freeze({ difficulty: 1, gapFrequency: 0.25, coinDensity: 0.5, platformDensity: 0.15 }),
  Object.freeze({ difficulty: 2, gapFrequency: 0.35, coinDensity: 0.45, platformDensity: 0.25 }),
  Object.freeze({ difficulty: 3, gapFrequency: 0.45, coinDensity: 0.4, platformDensity: 0.35 }),
  Object.freeze({ difficulty: 4, gapFrequency: 0.55, coinDensity: 0.35, platformDensity: 0.45 }),
]);

/** @param {number} difficulty @returns {typeof DIFFICULTY_PRESETS[number]} */
export function difficultyPreset(difficulty) {
  const clamped = Math.max(0, Math.min(DIFFICULTY_PRESETS.length - 1, Math.round(difficulty)));
  return DIFFICULTY_PRESETS[clamped];
}
