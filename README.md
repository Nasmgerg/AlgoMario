# AlgoMario

Böngészőben futó, determinisztikus 2D platformjáték hat útkereső algoritmus
(BFS, DFS, Dijkstra, A\*, Greedy Best-First, paraméterezett Best-First)
összehasonlítására és vizualizálására. Mind a hat lefut ugyanazon a
procedurálisan generált pályán, és a különbség valós
`nodesExpanded`/`pathCost`/`optimalityRatio` számokban mérhető, CSV-be
exportálhatóan.

Induláskor egy kezdőoldal (`src/ui/Landing.js`) fogadja rövid
projektismertetővel és egy "Tovább a játékhoz" gombbal, ami a tényleges
alkalmazásra vált.

<!-- TODO: élő demó link ide, miután a GitHub Pages be van kapcsolva, pl.
**Élő demó:** https://<felhasznalonev>.github.io/<repo>/ -->

## Képernyőképek

*(a képek még hiányoznak, böngészős screenshotolás után kerülnek ide)*

| Play Yourself | Watch AI (keresés vizualizáció) |
|---|---|
| `docs/screenshots/play-yourself.png` | `docs/screenshots/watch-ai-search.png` |

| Race Against AI | Benchmark (mérési táblázat) |
|---|---|
| `docs/screenshots/race.png` | `docs/screenshots/benchmark.png` |

## Miért készült

Portfólió-projekt, ami állítás helyett mér. Ugyanazon a pályán, ugyanazzal a
fizikával és keresési vázzal fut mind a hat algoritmus, a különbség pedig
számokban is látszik (lásd lejjebb a mérési táblázatot). A tervezési döntések
és az indoklásuk: [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md) döntésnapló.

## Játékmódok

- **Play Yourself** — hagyományos irányítás (A/D/←/→, W/↑/Space ugrás, R
  restart), célba érés / leesés / időtúllépés.
- **Watch AI** — algoritmus + célmód (`speedrun`/`collector`) + Best-First `w`
  súly kiválasztása. Két fázis: a **keresés** élőben festi az open/closed
  csomópontokat és a végleges utat, majd a **végrehajtás** lejátssza a talált
  tervet. DFS-nél kapcsoló a nyers és az iteratív mélyítéses változat között.
- **Race Against AI** — te és az AI egyszerre indultok ugyanazon a
  pályán/seeden. `precomputed` (az AI előre kiszámolja a teljes tervet) vagy
  `realtime` (az AI-nak tickenként korlátozott ideje van újratervezni, ami
  megmutatja, melyik algoritmus bírja az időnyomást). Handicap-csúszkával
  kiegyenlíthető.
- **Benchmark** — N seed × mind a hat algoritmus, Web Workerben (a UI nem
  fagy le), rendezhető táblázat + CSV export.

## Technológiai stack

| Elem | Választás | Megjegyzés |
|---|---|---|
| Nyelv | Vanilla JavaScript (ES6+) | TypeScript nélkül. `jsconfig.json` + `checkJs: true` + JSDoc: IDE-szintű típusellenőrzés build nélkül |
| Renderelés | Phaser 3 | csak sprite + input, a fizika saját, fixed-timestep szimuláció |
| Build | Vite | GitHub Pages `base` a deploy workflow-ban injektálva |
| Teszt | Vitest | a `core`/`world`/`ai` réteg Phaser nélkül, Node alatt fut |
| Lint | ESLint + `no-restricted-imports` | a rétegszabályt (lásd lent) kód szinten kényszeríti ki |
| CI/CD | GitHub Actions → GitHub Pages | teszt → build → deploy |

## Architektúra röviden

`src/core/`, `src/world/`, `src/ai/` egyetlen fájlja sem importálhat Phasert
vagy DOM-ot. Node alatt, Phaser nélkül futtathatók és tesztelhetők. Ezt az
ESLint `no-restricted-imports`/`no-restricted-globals` szabálya kényszeríti ki
build helyett kód-szinten. A vizualizáció (`src/render/`) csak **olvassa** az
AI-réteg kimenetét (a `search()` generátor `yield`-jeit), nem módosítja.
Részletek: [`docs/SPEC.md`](docs/SPEC.md) 9. szakasz.

## Futtatás helyileg

```bash
npm install
npm run dev      # http://localhost:5173 — élő fejlesztői szerver
npm test         # Vitest — a teljes suite (76 teszt) Node alatt, Phaser nélkül
npm run build    # production build a dist/ mappába
```

## Mérési eredmények — a hat algoritmus valódi összehasonlítása

A táblázat a projekt Benchmark magjából (`src/modes/Benchmark.js`) származó
tényleges mérés: 20 seed, pályahossz 250, nehézség 2. A `planTimeMs` az 5
futás mediánja, vizualizáció nélkül (SPEC.md 6.4).

| Algoritmus | Megoldva | Kiterjesztett csp. (átlag) | Útköltség (átlag, tick) | Optimalitási arány | Tervezési idő (medián, ms) |
|---|---|---|---|---|---|
| BFS | 20/20 | 248 | 1458 | 1.034 | 0.137 |
| DFS | 20/20 | 68 | 1830 | 1.298 | 0.058 |
| **Dijkstra** | 20/20 | 248 | 1410 | **1.000** | 0.163 |
| **A\*** | 20/20 | 246 | 1410 | **1.000** | 0.152 |
| Greedy Best-First | 20/20 | 40 | 1447 | 1.026 | 0.051 |
| Best-First (w=3) | 20/20 | 40 | 1439 | 1.021 | 0.050 |

**Amit a táblázat mutat:**
- A Dijkstra és az A\* optimalitási aránya pontosan **1.000**. Ez nem
  esetleges egyezés: a `tests/algorithms.test.js` minden vizsgált seeden
  ellenőrzi, hogy a két algoritmus költsége megegyezik.
- A Greedy Best-First ~6× kevesebb csomópontból (40 vs. 248) mindössze
  2,6%-kal rosszabb utat ad. Ha a sebesség számít, ez jó arányú kompromisszum.
- A DFS 30%-kal rosszabb utat ad, mint az optimum, annak ellenére, hogy a
  legkevesebbet terjeszti ki. Pontosan ez a tér–idő kompromisszum indokolja
  mind a hat algoritmus jelenlétét.
- A `realtime` Race módban ez a különbség *döntéshozatali sebességgé* válik:
  szűk tick-budget mellett a sokat kiterjesztő algoritmusok (Dijkstra, A\*,
  BFS) láthatóan megállnak gondolkodni, a Greedy/Best-First nem.

A mérés a böngészőben is reprodukálható: nyisd meg a Benchmark módot, add meg
a seed-számot, majd "Mérés indítása". A táblázat rendezhető, és CSV-be
exportálható.

## A hat algoritmus dióhéjban

Mind a hat ugyanazon a generátoros keresési vázon (`ai/search.js`) fut. Csak
a frontier (FIFO/LIFO/min-heap), a prioritásfüggvény és a
duplikátum-kezelés különbözik köztük, hogy az összehasonlítás fair legyen.

| Algoritmus | Frontier | Prioritás | Garantáltan optimális (speedrun)? |
|---|---|---|---|
| **BFS** | FIFO | — | nem (élszám-optimum, nem tick-optimum) |
| **DFS** | LIFO | — | nem |
| **Dijkstra** | min-heap | `g` | igen |
| **A\*** | min-heap | `g + h` | igen (`h` megengedhető) |
| **Greedy Best-First** | min-heap | `h` | nem |
| **Best-First** (paraméterezett) | min-heap | `g + w·h` | `w ≤ 1`-nél igen |

A Best-First `w` paramétere `w=0`-nál pontosan Dijkstra, `w=1`-nél pontosan
A\*, és ez nem csak koncepcionálisan igaz: a tesztek a kiterjesztési
sorrendet is bit-azonosnak mutatják. Teljes leírás, a `w` keretrendszer és a
tervezési döntésnapló: [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md).

## Tesztelés

```bash
npm test
```

A Vitest a teljes `core`/`world`/`ai`/`modes` réteget lefedi: fizika és
ütközés, determinisztikus pályagenerálás, JumpTable/JumpGraph-élek valódi
`step()`-tel visszaellenőrizve, mind a hat algoritmus optimalitása, folytonos
(újrahorgonyzás nélküli) tervvégrehajtás, Watch AI kötések, Race Against AI,
és a Benchmark mag. Mindez Phaser és böngésző nélkül, Node alatt fut.

## Specifikáció

A teljes funkcionális specifikáció: [`docs/SPEC.md`](docs/SPEC.md).
A hat algoritmus részletes összehasonlítása és a döntésnapló:
[`docs/ALGORITHMS.md`](docs/ALGORITHMS.md).
