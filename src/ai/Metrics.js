/** Keresési metrikák (SPEC.md 6.4); memóriamérés szándékosan nincs — a `peakOpenSize`+`closedSize` determinisztikus proxy helyette. */
export class Metrics {
  constructor() {
    this.nodesExpanded = 0;
    this.nodesGenerated = 0;
    this.peakOpenSize = 0;
    this.closedSize = 0;
    /** @type {number} élek száma a megoldásban, ha van */
    this.pathLength = 0;
    /** @type {number} tickek összege a megoldásban, ha van */
    this.pathCost = 0;
    /** @type {boolean} elérte-e a maxExpansions limitet */
    this.timeout = false;
    /** @type {boolean} */
    this.found = false;
  }

  /** @param {number} openSize */
  observeOpen(openSize) {
    if (openSize > this.peakOpenSize) this.peakOpenSize = openSize;
  }

  /**
   * A megoldás-út alapján kiszámolt hossz/költség rögzítése.
   * @param {import('./JumpGraph.js').JumpEdge[]} edges - az úton bejárt élek
   */
  recordPath(edges) {
    this.pathLength = edges.length;
    this.pathCost = edges.reduce((sum, e) => sum + e.cost, 0);
  }

  /**
   * Optimalitási arány (csak speedrun módban értelmes, SPEC.md 6.4).
   * @param {number} dijkstraCost - a Dijkstra (bizonyítottan optimális) költsége
   * @returns {number}
   */
  optimalityRatio(dijkstraCost) {
    if (dijkstraCost <= 0) return 1;
    return this.pathCost / dijkstraCost;
  }
}
