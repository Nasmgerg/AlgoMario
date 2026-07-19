/**
 * Bináris min-heap a Dijkstra / A* / Greedy / Best-First frontierhez
 * (SPEC.md 6.2). A rendezés az elemek `priority` mezője szerint történik;
 * azonos prioritásnál a beszúrási sorrend dönt, hogy a keresés
 * determinisztikus maradjon (SPEC.md D8 szellemében).
 * @template {{priority: number}} T
 */
export class BinaryHeap {
  constructor() {
    /** @type {{item: T, priority: number, seq: number}[]} */
    this._heap = [];
    this._seq = 0;
  }

  /** @param {T} item */
  push(item) {
    const node = { item, priority: item.priority, seq: this._seq };
    this._seq += 1;
    this._heap.push(node);
    this._siftUp(this._heap.length - 1);
  }

  /** @returns {T | undefined} */
  pop() {
    const heap = this._heap;
    if (heap.length === 0) return undefined;
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0 && last !== undefined) {
      heap[0] = last;
      this._siftDown(0);
    }
    return top.item;
  }

  /** @returns {number} */
  get size() {
    return this._heap.length;
  }

  /**
   * @param {number} a @param {number} b
   * @returns {boolean} igaz, ha `a` node előbbre való, mint `b`
   */
  _before(a, b) {
    const na = this._heap[a];
    const nb = this._heap[b];
    if (na.priority !== nb.priority) return na.priority < nb.priority;
    return na.seq < nb.seq;
  }

  /** @param {number} i */
  _siftUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this._before(i, parent)) break;
      this._swap(i, parent);
      i = parent;
    }
  }

  /** @param {number} i */
  _siftDown(i) {
    const n = this._heap.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this._before(left, smallest)) smallest = left;
      if (right < n && this._before(right, smallest)) smallest = right;
      if (smallest === i) break;
      this._swap(i, smallest);
      i = smallest;
    }
  }

  /** @param {number} a @param {number} b */
  _swap(a, b) {
    const tmp = this._heap[a];
    this._heap[a] = this._heap[b];
    this._heap[b] = tmp;
  }
}
