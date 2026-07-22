/** Seed-feloldás (SPEC.md 12. szakasz): érvénytelen (nem egész) seed esetén véletlen egész fallback — a hívó felelőssége a ténylegesen használt seedet kiírni a felhasználónak.
 * @param {number} rawSeed
 * @returns {{seed: number, isFallback: boolean}}
 */
export function resolveSeed(rawSeed) {
  if (Number.isInteger(rawSeed)) return { seed: rawSeed, isFallback: false };
  return { seed: Math.floor(Math.random() * 1_000_000), isFallback: true };
}
