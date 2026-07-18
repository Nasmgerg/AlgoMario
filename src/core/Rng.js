/**
 * Determinisztikus PRNG (SPEC.md D8, 4.1. szakasz). `Math.random()` a
 * projektben tilos — minden véletlen döntésnek ebből kell jönnie.
 *
 * @param {number} seed - 32 bites egész.
 * @returns {() => number} minden hívásra egy [0, 1) tartományba eső számot ad.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Kényelmi wrapper mulberry32 köré a generátorban gyakran ismétlődő
 * műveletekhez (egész tartomány, választás, súlyozott választás, esély).
 */
export class Rng {
  /** @param {number} seed */
  constructor(seed) {
    this.seed = seed >>> 0;
    this._next = mulberry32(this.seed);
  }

  /** @returns {number} [0, 1) */
  next() {
    return this._next();
  }

  /**
   * Egész szám `[min, max)` tartományban.
   * @param {number} min - inkluzív
   * @param {number} max - exkluzív
   * @returns {number}
   */
  nextInt(min, max) {
    if (max <= min) {
      throw new RangeError(`Rng.nextInt: érvénytelen tartomány [${min}, ${max})`);
    }
    return min + Math.floor(this.next() * (max - min));
  }

  /**
   * @param {number} probability - [0, 1]
   * @returns {boolean}
   */
  chance(probability) {
    return this.next() < probability;
  }

  /**
   * @template T
   * @param {T[]} items
   * @returns {T}
   */
  pick(items) {
    if (items.length === 0) {
      throw new Error('Rng.pick: üres tömbből nem lehet választani');
    }
    return items[this.nextInt(0, items.length)];
  }

  /**
   * Súlyozott választás.
   * @template T
   * @param {T[]} items
   * @param {(item: T) => number} weightFn
   * @returns {T}
   */
  weightedPick(items, weightFn) {
    const weights = items.map(weightFn);
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total <= 0) {
      throw new Error('Rng.weightedPick: az összsúly nem lehet 0 vagy negatív');
    }
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i += 1) {
      roll -= weights[i];
      if (roll < 0) {
        return items[i];
      }
    }
    return items[items.length - 1];
  }
}
