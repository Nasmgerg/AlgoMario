const BANNER = ` █████╗ ██╗      ██████╗  ██████╗ ███╗   ███╗ █████╗ ██████╗ ██╗ ██████╗
██╔══██╗██║     ██╔════╝ ██╔═══██╗████╗ ████║██╔══██╗██╔══██╗██║██╔═══██╗
███████║██║     ██║  ███╗██║   ██║██╔████╔██║███████║██████╔╝██║██║   ██║
██╔══██║██║     ██║   ██║██║   ██║██║╚██╔╝██║██╔══██║██╔══██╗██║██║   ██║
██║  ██║███████╗╚██████╔╝╚██████╔╝██║ ╚═╝ ██║██║  ██║██║  ██║██║╚██████╔╝
╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝ ╚═════╝`;

/** Egy tényleges chunk-sorrend (flat → gap → pipe → surprise_row → coin_arc → flat), a ChunkCatalog valódi cellatípusaival. */
const LEVEL_SNIPPET_ROWS = [
  '...........................................!',
  '...........................................!',
  '.............................o.............!',
  '............PP...?.?.?.....o...o...........!',
  '.M..........PP...........o.......o.........!',
  '######....##################################',
  '######....##################################',
];

const TILE_CLASS = Object.freeze({ '#': 'tile-wall', P: 'tile-pipe', '?': 'tile-surprise', o: 'tile-coin', '!': 'tile-goal', M: 'tile-mario' });

/** @param {string[]} rows @returns {string} */
function renderLevelSnippet(rows) {
  return rows
    .map((row) =>
      [...row].map((ch) => (ch === '.' ? ' ' : `<span class="${TILE_CLASS[ch]}">${ch}</span>`)).join(''),
    )
    .join('\n');
}

const MODES = Object.freeze([
  { name: 'Play Yourself', text: 'te vagy Mario, sima billentyűzet-vezérlés.' },
  { name: 'Watch AI', text: 'nézd végig élőben, ahogy egy algoritmus bejárja a pályát, aztán lejátssza a megtalált utat.' },
  { name: 'Race Against AI', text: 'versenyezz egy algoritmus ellen, ugyanazon a pályán.' },
  { name: 'Benchmark', text: 'futtasd le mind a hatot egymás után, és nézd meg a számokat (CSV-ben is).' },
]);

/** Kezdőoldal (SPEC.md-n kívüli, tisztán UI-réteg): induláskor jelenik meg, "Tovább a játékhoz" gombbal ereszti be a fő alkalmazást. */
export class Landing {
  /** @param {HTMLElement} container - a már megstílozott #landing elem, ide renderel közvetlenül @param {{onContinue: () => void}} handlers */
  constructor(container, handlers) {
    this.el = container;

    const tile = (m) => `<div class="mode-tile"><b>${m.name}</b><span>${m.text}</span></div>`;
    const leftTiles = MODES.slice(0, 2).map(tile).join('');
    const rightTiles = MODES.slice(2).map(tile).join('');

    this.el.innerHTML = `
      <pre class="landing-banner">${BANNER}</pre>
      <div class="landing-showcase">
        <div class="mode-col mode-col-left">${leftTiles}</div>
        <div class="landing-level-wrap">
          <pre class="landing-level">${renderLevelSnippet(LEVEL_SNIPPET_ROWS)}</pre>
          <p class="landing-legend">
            <span class="tile-wall">#</span> talaj ·
            <span class="tile-pipe">P</span> cső ·
            <span class="tile-surprise">?</span> surprise ·
            <span class="tile-coin">o</span> érme ·
            <span class="tile-goal">!</span> cél
          </p>
        </div>
        <div class="mode-col mode-col-right">${rightTiles}</div>
      </div>
      <p class="landing-intro">
        2D-s, Mario-szerű platformjáték: ugyanazzal a seeddel mindig ugyanaz
        a pálya, és hatféle útkereső algoritmus (<b>BFS</b>, <b>DFS</b>,
        <b>Dijkstra</b>, <b>A*</b>, <b>Greedy Best-First</b>, paraméterezett
        <b>Best-First</b>) viszi végig rajta magát. Végignézheted élőben,
        ahogy keresnek, vagy kiméred őket egymás ellen számokban.
      </p>
      <button type="button" class="landing-continue">Tovább a játékhoz</button>
    `;

    const button = /** @type {HTMLButtonElement} */ (this.el.querySelector('.landing-continue'));
    button.addEventListener('click', async () => {
      // Az onContinue dinamikus importot vár be (lassú hálózaton érzékelhető), ezért a gomb jelzi az állapotot, és hiba esetén újrapróbálható marad.
      button.disabled = true;
      button.textContent = 'Betöltés…';
      try {
        await handlers.onContinue();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Hiba történt — próbáld újra';
        console.error('Az alkalmazás betöltése nem sikerült:', error);
      }
    });
  }
}
