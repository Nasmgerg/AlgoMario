const BANNER = ` █████╗ ██╗      ██████╗  ██████╗ ███╗   ███╗ █████╗ ██████╗ ██╗ ██████╗
██╔══██╗██║     ██╔════╝ ██╔═══██╗████╗ ████║██╔══██╗██╔══██╗██║██╔═══██╗
███████║██║     ██║  ███╗██║   ██║██╔████╔██║███████║██████╔╝██║██║   ██║
██╔══██║██║     ██║   ██║██║   ██║██║╚██╔╝██║██╔══██║██╔══██╗██║██║   ██║
██║  ██║███████╗╚██████╔╝╚██████╔╝██║ ╚═╝ ██║██║  ██║██║  ██║██║╚██████╔╝
╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝ ╚═════╝`;

/** Kezdőoldal (SPEC.md-n kívüli, tisztán UI-réteg): induláskor jelenik meg, "Tovább a játékhoz" gombbal ereszti be a fő alkalmazást. */
export class Landing {
  /** @param {HTMLElement} container - a már megstílozott #landing elem, ide renderel közvetlenül @param {{onContinue: () => void}} handlers */
  constructor(container, handlers) {
    this.el = container;

    this.el.innerHTML = `
      <pre class="landing-banner">${BANNER}</pre>
      <p class="landing-divider">▬▬▬▬▬ ● ▬▬▬▬▬ ● ▬▬▬▬▬ ● ▬▬▬▬▬</p>
      <p class="landing-intro">
        2D-s, Mario-szerű platformjáték: ugyanazzal a seeddel mindig ugyanaz
        a pálya, és hatféle útkereső algoritmus (<b>BFS</b>, <b>DFS</b>,
        <b>Dijkstra</b>, <b>A*</b>, <b>Greedy Best-First</b>, paraméterezett
        <b>Best-First</b>) viszi végig rajta magát. Végignézheted élőben,
        ahogy keresnek, vagy kiméred őket egymás ellen számokban.
      </p>
      <ul class="landing-modes">
        <li><b>Play Yourself</b> — te vagy Mario, sima billentyűzet-vezérlés.</li>
        <li><b>Watch AI</b> — nézd végig élőben, ahogy egy algoritmus bejárja a pályát, aztán lejátssza a megtalált utat.</li>
        <li><b>Race Against AI</b> — versenyezz egy algoritmus ellen, ugyanazon a pályán.</li>
        <li><b>Benchmark</b> — futtasd le mind a hatot egymás után, és nézd meg a számokat (CSV-ben is).</li>
      </ul>
      <button type="button" class="landing-continue">Tovább a játékhoz</button>
    `;

    this.el.querySelector('.landing-continue').addEventListener('click', () => handlers.onContinue());
  }
}
