/**
 * FIFO sor a BFS-hez (SPEC.md 6.2). Egységes frontier-interfész:
 * `push`, `pop`, `size` — a {@link import('../search.js')} váz ezt használja,
 * a prioritásmezőt figyelmen kívül hagyja.
 *
 * A `shift()` O(n) költségének elkerülésére fejmutatót használ, a lefogyott
 * elejű belső tömböt időnként tömöríti.
 * @template T
 */
export class FifoQueue {
  constructor() {
    /** @type {T[]} */
    this._items = [];
    this._head = 0;
  }

  /** @param {T} item */
  push(item) {
    this._items.push(item);
  }

  /** @returns {T | undefined} */
  pop() {
    if (this._head >= this._items.length) return undefined;
    const item = this._items[this._head];
    this._head += 1;
    if (this._head > 32 && this._head * 2 >= this._items.length) {
      this._items = this._items.slice(this._head);
      this._head = 0;
    }
    return item;
  }

  /** @returns {number} */
  get size() {
    return this._items.length - this._head;
  }
}
