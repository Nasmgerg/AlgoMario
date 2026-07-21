/** Cellatípusok (SPEC.md 3.1. szakasz). */
export const CellType = Object.freeze({
  EMPTY: 0,
  WALL: 1,
  PIPE: 2,
  SURPRISE: 3,
  COIN: 4,
  GOAL: 5,
});

/** @param {number} cellType @returns {boolean} */
export function isSolidCellType(cellType) {
  return cellType === CellType.WALL || cellType === CellType.PIPE || cellType === CellType.SURPRISE;
}

/** Immutable pálya (SPEC.md 3.1); a begyűjtött érmék / kiütött surprise-ok nem itt, hanem a RunState-ben (Set-ekben) vannak nyilvántartva. */
export class Level {
  /**
   * @param {object} params
   * @param {number} params.height
   * @param {number} params.length
   * @param {Uint8Array} params.cells - sor-major, index = row*length+col
   * @param {{id: number, row: number, col: number}[]} params.coins
   * @param {{id: number, row: number, col: number}[]} params.surprises
   * @param {{row: number, col: number}} params.startPosition
   * @param {number} params.goalColumn
   * @param {number} params.maxTicks
   * @param {number} params.seed - a felhasználó által megadott (megjelenítendő) seed
   * @param {number} [params.retryCount] - hány újragenerálás kellett járhatóságig (SPEC.md 4.3)
   */
  constructor({
    height,
    length,
    cells,
    coins,
    surprises,
    startPosition,
    goalColumn,
    maxTicks,
    seed,
    retryCount = 0,
  }) {
    if (cells.length !== height * length) {
      throw new Error(
        `Level: cells mérete (${cells.length}) nem egyezik height*length-lel (${height * length})`,
      );
    }
    this.height = height;
    this.length = length;
    this.cells = cells;
    this.coins = coins;
    this.surprises = surprises;
    this.startPosition = startPosition;
    this.goalColumn = goalColumn;
    this.maxTicks = maxTicks;
    this.seed = seed;
    this.retryCount = retryCount;
    this._coinIndex = new Map(coins.map((c) => [c.row * length + c.col, c.id]));
    this._surpriseIndex = new Map(surprises.map((s) => [s.row * length + s.col, s.id]));
    Object.freeze(this);
  }

  /** @param {number} row @param {number} col @returns {boolean} */
  isInBounds(row, col) {
    return row >= 0 && row < this.height && col >= 0 && col < this.length;
  }

  /**
   * @param {number} row @param {number} col
   * @returns {number} - {@link CellType}
   */
  cellAt(row, col) {
    if (!this.isInBounds(row, col)) {
      throw new RangeError(`Level.cellAt: (${row}, ${col}) a pályán kívül esik`);
    }
    return this.cells[row * this.length + col];
  }

  /** @param {number} row @param {number} col @returns {number | null} érme id, ha van */
  coinIdAt(row, col) {
    return this._coinIndex.get(row * this.length + col) ?? null;
  }

  /** @param {number} row @param {number} col @returns {number | null} surprise id, ha van */
  surpriseIdAt(row, col) {
    return this._surpriseIndex.get(row * this.length + col) ?? null;
  }

  /**
   * A legfelső szilárd cella sora egy oszlopban (ahol Mario állhat egyet
   * felette), vagy `null`, ha az oszlop teljes egészében jarhatatlan gödör.
   * @param {number} col
   * @returns {number | null}
   */
  surfaceRowAt(col) {
    for (let row = 0; row < this.height; row += 1) {
      if (isSolidCellType(this.cellAt(row, col))) {
        return row - 1;
      }
    }
    return null;
  }
}
