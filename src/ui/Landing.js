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
        Böngészőben futó, determinisztikus 2D platformjáték hat útkereső
        algoritmus (<b>BFS</b>, <b>DFS</b>, <b>Dijkstra</b>, <b>A*</b>,
        <b>Greedy Best-First</b>, paraméterezett <b>Best-First</b>)
        összehasonlítására és vizualizálására. Mind a hat ugyanazon a
        pályán fut, a különbség valós számokban mérhető.
      </p>
      <ul class="landing-modes">
        <li><b>Play Yourself</b> — irányítsd Mariót magad a klasszikus billentyűzetes vezérléssel.</li>
        <li><b>Watch AI</b> — nézd élőben a keresést (nyílt/lezárt csomópontok), majd a talált útvonal lejátszását.</li>
        <li><b>Race Against AI</b> — versenyezz egy választott algoritmus ellen ugyanazon a pályán.</li>
        <li><b>Benchmark</b> — mérd össze mind a hat algoritmust számokban, seedenként, CSV-exporttal.</li>
      </ul>
      <button type="button" class="landing-continue">Tovább a játékhoz</button>
    `;

    this.el.querySelector('.landing-continue').addEventListener('click', () => handlers.onContinue());
  }
}
