import { CELL_SIZE } from './Sprites.js';

/** SearchOverlay — a keresés vizualizációja a pálya fölött (SPEC.md M4); csomópontonként egy újrafelhasznált téglalapot tart, és csak a ténylegesen változottakat festi újra. */

/** Vizuális állapotok (a belső diff-hez). */
const State = Object.freeze({ HIDDEN: 0, CLOSED: 1, OPEN: 2, PATH: 3, CURRENT: 4 });

const STYLE = Object.freeze({
  [State.CLOSED]: { color: 0x2b3a67, alpha: 0.5, scale: 0.5 },
  [State.OPEN]: { color: 0x00e5ff, alpha: 0.55, scale: 0.6 },
  [State.PATH]: { color: 0xffd400, alpha: 0.85, scale: 0.7 },
  [State.CURRENT]: { color: 0xffffff, alpha: 0.95, scale: 0.8 },
});

export class SearchOverlay {
  /**
   * @param {import('phaser').Scene} scene
   * @param {{index: number, row: number, col: number}[]} nodes - a JumpGraph csomópontjai (csak olvasva)
   */
  constructor(scene, nodes) {
    this.scene = scene;
    this.nodes = nodes;
    /** @type {import('phaser').GameObjects.Rectangle[]} */
    this.marks = new Array(nodes.length);
    /** @type {Uint8Array} csomópontonkénti aktuális vizuális állapot (diff-hez) */
    this._state = new Uint8Array(nodes.length);
    /** @type {number[]} az utoljára kirajzolt útvonal */
    this._path = [];
    this._currentNode = -1;

    for (const node of nodes) {
      const rect = scene.add
        .rectangle(
          node.col * CELL_SIZE + CELL_SIZE / 2,
          node.row * CELL_SIZE + CELL_SIZE / 2,
          CELL_SIZE * 0.5,
          CELL_SIZE * 0.5,
          0xffffff,
          0,
        )
        .setDepth(500);
      this.marks[node.index] = rect;
    }
  }

  /**
   * @param {number} index @param {number} state - {@link State}
   */
  _apply(index, state) {
    if (this._state[index] === state) return;
    this._state[index] = state;
    const rect = this.marks[index];
    if (state === State.HIDDEN) {
      rect.setFillStyle(0xffffff, 0);
      return;
    }
    const style = STYLE[state];
    rect.setFillStyle(style.color, style.alpha);
    rect.setSize(CELL_SIZE * style.scale, CELL_SIZE * style.scale);
  }

  /**
   * A keresés aktuális pillanatképének megjelenítése. A `path` (ha már van)
   * mindig felülírja az open/closed színt.
   * @param {ReadonlySet<number>} open @param {ReadonlySet<number>} closed @param {number} current
   */
  syncSearch(open, closed, current) {
    const onPath = this._path.length > 0 ? new Set(this._path) : null;
    for (let i = 0; i < this.marks.length; i += 1) {
      /** @type {number} */
      let next = State.HIDDEN;
      if (onPath && onPath.has(i)) next = State.PATH;
      else if (i === current) next = State.CURRENT;
      else if (open.has(i)) next = State.OPEN;
      else if (closed.has(i)) next = State.CLOSED;
      this._apply(i, next);
    }
    this._currentNode = current;
  }

  /**
   * A megtalált útvonal kiemelése (a keresés utáni fázisban).
   * @param {number[]} pathNodes
   */
  showPath(pathNodes) {
    this._path = [...pathNodes];
    for (const index of this._path) this._apply(index, State.PATH);
  }

  /** Minden jelölés törlése (új keresés indításakor). */
  reset() {
    this._path = [];
    this._currentNode = -1;
    for (let i = 0; i < this.marks.length; i += 1) this._apply(i, State.HIDDEN);
  }

  /** @param {boolean} visible */
  setVisible(visible) {
    for (const rect of this.marks) rect.setVisible(visible);
  }

  destroy() {
    for (const rect of this.marks) rect.destroy();
    this.marks = [];
  }
}
