/**
 * LIFO verem a DFS-hez (SPEC.md 6.2). Egységes frontier-interfész:
 * `push`, `pop`, `size` — a prioritásmezőt figyelmen kívül hagyja.
 * @template T
 */
export class LifoStack {
  constructor() {
    /** @type {T[]} */
    this._items = [];
  }

  /** @param {T} item */
  push(item) {
    this._items.push(item);
  }

  /** @returns {T | undefined} */
  pop() {
    return this._items.pop();
  }

  /** @returns {number} */
  get size() {
    return this._items.length;
  }
}
