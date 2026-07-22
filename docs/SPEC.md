# Webes platformjáték AI útkeresőkkel

---

## 1. Projektcél

Böngészőben futó, determinisztikus, 2D-s platformjáték, amelyben ugyanazt a pályát végigviheti a játékos és hatféle útkereső algoritmus is. A hangsúly az algoritmusok **mérhető összehasonlításán** és a keresés **vizualizációján** van.

A régi Java beadandó (`MarioGame` / `MarioState` / `Agent`) **logikai referencia**: a fizikai modell és a pontozás átemelhető, a UI és az ütközéskezelés nem.

---

## 2. Rögzített döntések

| # | Téma | Döntés |
|---|---|---|
| D1 | Pályaméret | Konfigurálható. Alap: **16 sor × 250 oszlop**. Presetek: short 120 / normal 250 / long 500. |
| D2 | Tick-limit | `maxTicks = length × 40`, alapértelmezésben **10 000**. |
| D3 | Fizika | **Saját, fixed-timestep szimuláció.** Phaser Arcade Physics **nincs használva**: a delta-idő-függő fizika gépenként eltérő eredményt adna, ami a determinizmust, a race módot és a replay-t is elrontaná. |
| D4 | Algoritmusok | Mind a hat marad. A Best-First **paraméterezhető keretrendszerként** kerül be (lásd 6.2). |
| D5 | Keresési tér | Kétszintű: **jump-graph** (makró, itt fut a keresés) + **forward model** (mikró, végrehajtás). |
| D6 | Élsúly | **Tick-szám (pozitív).** Két célmód: `speedrun` és `collector`. |
| D7 | Mobil | **Kikerül** a követelmények közül. Reszponzív layout igen, touch-vezérlés nem. |
| D8 | Determinizmus | Saját seedelt PRNG (mulberry32). `Math.random()` tilos. |
| D9 | Keresés futtatása | **Generátor függvények** (`function*`), frame-enként időszeletelve: nem blokkolja a UI-t, lépésenként vizualizálható és bármikor leállítható. Worker csak batch-benchmarkhoz. |
| D10 | Metrikák | Memóriamérés helyett **peak open-list / closed méret / generált és kiterjesztett csomópontok**. |

---

## 3. Játékmodell

### 3.1. Pálya

- Rács, `height × length` cellák. Alap: 16 × 250.
- Cellatípusok: `EMPTY`, `WALL`, `PIPE`, `SURPRISE`, `COIN`, `GOAL`.
- Mario mérete: **1×1 cella**, mint a Java modellben.
- A pálya **immutable** a futás alatt. A begyűjtött érmék / kiütött surprise-ok a *futásállapotban* vannak nyilvántartva (Set), nem a mapban. Ez a legfontosabb eltérés a Java verziótól, ahol a `map` mutálódott.

### 3.2. Fizika

Konstansok (a Java modellből, `config/physics.js`-ben, mátrix-indexelés: `i` = sor lefelé, `j` = oszlop):

```
JUMP_IMPULSE   = 0.70   // egyszeri, felfelé
GRAVITY        = 0.05   // minden tick
MAX_FALL_SPEED = 2.00
RUN_ACCEL      = 0.15
MAX_RUN_SPEED  = 0.20
FRICTION       = 0.15   // csak talajon
TICK_RATE      = 60     // Hz, fix
```

**Számított jellemzők** (szimulációval validálandó a `JumpTable` építésekor):

- Ugrás magassága: ~**4,5 cella** (13 tick emelkedés)
- Levegőben töltött idő: ~**26 tick** (≈0,43 s)
- Max. átugorható lyuk: ~**5 cella**
- Vízszintes sebesség: 0,2 cella/tick = **12 cella/s**

**Ugrás:** egyetlen impulzus, nincs változó ugrásmagasság (nincs „hold to jump higher"). *Kompromisszum:* rosszabb game feel, cserébe az akciótér 4 elemű (`LEFT`, `RIGHT`, `JUMP`, `NONE`) marad, ami a keresést nagyságrendekkel olcsóbbá és az algoritmus-összehasonlítást tisztábbá teszi. Ha később bekerül, `JUMP_RELEASE` ötödik akcióként jön.

### 3.3. Lépésfüggvény

```js
/**
 * Egy tick szimulációja. Tiszta függvény: nem mutálja a bemenetet.
 * @param {RunState} state
 * @param {Action} action
 * @param {Level} level
 * @returns {RunState}
 */
export function step(state, action, level) { ... }
```

Ez a projekt magja. **Phaser-független, Node alatt tesztelhető.** Ebből következik:
- a replay = `{ seed, levelConfig, actions: Uint8Array }`, pár száz bájt;
- két gépen bit-pontosan ugyanaz az eredmény;
- az AI és a játékos ugyanazt a fizikát kapja.

### 3.4. Ütközés

Nem a Java `apply()` portolása. Tiszta, tengelyenként szétválasztott megoldás:

1. vízszintes mozgás alkalmazása → ha az új cella tömör, visszaigazítás a cellahatárra, `vj = 0`
2. függőleges mozgás alkalmazása → ha tömör alatta: landolás (`vi = 0`, `grounded = true`); ha tömör felette: fejütés (`vi = 0`), és ha `SURPRISE`, akkor pont + a cella `WALL`-lá válik a futásállapotban
3. érme: átfedés-teszt, ha még nincs a begyűjtöttek között

### 3.5. Szabályok és pontozás

| Esemény | Pont |
|---|---|
| Előrehaladás | +10 / oszlop (csak új maximum számít) |
| Érme | +100 |
| Surprise kiütése | +500 |
| Célba érés | + `round((1 − ticks / maxTicks) × 1000)` idő-bónusz |

A futás véget ér, ha: eléri a célt, a pálya alja alá esik, vagy `ticks >= maxTicks`.

---

## 4. Pályagenerálás

### 4.1. PRNG

```js
export function mulberry32(seed) { /* determinisztikus, 32 bites */ }
```

Minden véletlen döntés ebből az egy példányból jön. A seed a UI-ban megadható és megjelenik az eredményképernyőn.

### 4.2. Chunk-alapú generátor

A Java `MAP_ELEMTS` oszlopsablonjainak általánosítása. Egy chunk 4–12 oszlop széles, típusa és nehézsége van:

| Chunk típus | Leírás | Min. nehézség |
|---|---|---|
| `flat` | sima talaj | 0 |
| `gap` | 2–5 cella széles lyuk | 1 |
| `stairs` | lépcsős emelkedés/ereszkedés | 1 |
| `pipe` | 1–3 cella magas cső | 1 |
| `platform` | lebegő platform + alatta átjárás | 2 |
| `coin_arc` | érmeív ugrási pálya mentén | 0 |
| `surprise_row` | surprise blokkok | 1 |
| `gap_platform` | lyuk + benne lebegő platform | 3 |

Paraméterek: `difficulty` (0–4), `length`, `gapFrequency`, `coinDensity`, `platformDensity`.

Az első 10 és az utolsó 5 oszlop mindig `flat` (biztonságos start és cél).

### 4.3. Validátor: kötelező lépés

Generálás után BFS a jump-graphon `start → goal`:

- **járható** → kész
- **nem járható** → célzott javítás (platform beszúrása a legszélesebb átjárhatatlan szakaszba), újravalidálás
- **3 sikertelen javítás után** → újragenerálás `seed + 1`-gyel

A determinizmus megmarad, mert a retry is a seed-láncból jön. A retry-számot logolni kell: `Seed 12345 (retry 2)`.

**Elérhetőségi ellenőrzés az érmékre is fut**, a nem elérhetőket a generátor eltávolítja.

---

## 5. AI: keresési tér

### 5.1. Miért kétszintű

Ha a keresés közvetlenül a folytonos állapottéren (pozíció + sebesség double-ként) fut, akkor a BFS és a Dijkstra matematikailag azonos (egységnyi élköltség), a Best-First pedig a Greedy-vel esik egybe. Az összehasonlítás így nem mérne semmit. A makró-gráfon az élsúlyok különbözőek, tehát a hat algoritmus tényleg hat különböző viselkedés lesz.

### 5.2. JumpTable (előszámítás, egyszer)

Minden `(dRow, dCol)` párra — a fizikailag elérhető tartományon belül — szimulációval eldöntjük, elérhető-e, és ha igen, milyen akciósorozattal és hány tick alatt.

```js
/** @returns {Map<string, {actions: Uint8Array, ticks: number}>} */
export function buildJumpTable(physics) { ... }
```

Tartomány: `dRow ∈ [-5, +8]`, `dCol ∈ [1, 7]` → ~100 bejegyzés. Futásidő elhanyagolható, cache-elhető.

### 5.3. JumpGraph (pályánként egyszer)

- **Csomópont**: minden olyan cella, amin Mario állhat (talaj- vagy platformtető) → tipikusan 300–800 csomópont egy 250 oszlopos pályán, 500 oszlopnál is csak pár ezer. A keresés méretét ez nem korlátozza.
- **Él**: `from → to`, ha a JumpTable szerint a mozgás végrehajtható **és** a röppálya nem ütközik semmibe (sugárkövetés a szimulált pozíciókon).
- **Élsúly**: a mozgás tick-száma (pozitív egész).
- **Él-metaadat**: az útvonalon érintett érmék listája.

```js
/**
 * @typedef {Object} JumpEdge
 * @property {number} to        - cél csomópont indexe
 * @property {number} cost      - tickek száma (pozitív)
 * @property {Uint8Array} actions
 * @property {number[]} coins   - útközben érintett érmék id-jei
 */
```

### 5.4. Célmódok

| Mód | Probléma | Optimalitás |
|---|---|---|
| `speedrun` | egyetlen cél (a jobb szél), költség = tick | **A\* és Dijkstra bizonyíthatóan optimális**: ez a referencia-mérték, amihez a többit hasonlítjuk |
| `collector` | waypoint-lánc: start → érme₁ → … → cél, a sorrendet nearest-neighbour heurisztika adja | Nem optimális, és ezt a UI-ban ki is írjuk |

**Miért így:** ha az érme jutalma negatív élsúlyként kerülne a költségbe (`cost = tick − λ·reward`, ahogy a régi `Agent.java`-ban: `f = g + w·h − reward`), a Dijkstra és az A\* garanciái megszűnnének. Így viszont marad egy tiszta, mérhető viszonyítási pont.

### 5.5. Heurisztika (`speedrun`)

```
h(n) = (goalCol − n.col) / MAX_RUN_SPEED
```

Ez a hátralévő oszlopok minimális tick-költsége. **Megengedhető** (admissible), mert vízszintesen ennél gyorsabban semmi nem történhet, tehát az A\* optimalitása áll.

Opcionális, kikapcsolható változat magassági taggal (`+ |rowDiff| × k`), ami már nem megengedhető, de gyorsabb. A UI-ban látszik a különbség. Ez önmagában is jó demó.

---

## 6. AI: az algoritmusok

### 6.1. Közös váz

Egyetlen keresőfüggvény, hat frontier-stratégia. Így a hat algoritmus összesen ~200 sor, és garantáltan ugyanazt a kódutat járják. Emiatt fair az összehasonlítás.

```js
/**
 * Generátoros gráfkeresés. Minden kiterjesztésnél yield-el,
 * így időszeletelhető és lépésenként vizualizálható.
 *
 * @param {SearchProblem} problem
 * @param {Frontier} frontier
 * @param {{maxExpansions?: number}} options
 * @yields {SearchStep} - { current, open, closed, metrics }
 * @returns {SearchResult} - { path, found, metrics }
 */
export function* search(problem, frontier, options) { ... }
```

`SearchProblem` interfész: `startNode()`, `isGoal(n)`, `neighbors(n)`, `heuristic(n)`.

### 6.2. A hat algoritmus

| Algoritmus | Frontier | Prioritás | Megjegyzés |
|---|---|---|---|
| **BFS** | FIFO queue | — | Legkevesebb *élt* tartalmazó út, nem a leggyorsabb |
| **DFS** | LIFO stack | — | Mélységkorláttal (`maxDepth`) + opcionális iteratív mélyítés |
| **Dijkstra** | min-heap | `g` | Optimális, de heurisztika nélkül sokat terjeszt |
| **A\*** | min-heap | `g + h` | Optimális megengedhető heurisztikával |
| **Greedy Best-First** | min-heap | `h` | Gyors, gyakran rossz utat ad |
| **Best-First** | min-heap | `g + w·h` | **Paraméterezhető keretrendszer**, `w` csúszkával 0–10 |

**A Best-First megkülönböztetése:** a Best-First a *keretrendszer* szerepét kapja, `w` súllyal. Enélkül ugyanaz lenne, mint a Greedy Best-First:

- `w = 0` → Dijkstra
- `w = 1` → A\*
- `w = 3` → weighted A\* (gyorsabb, szuboptimális)
- `w → ∞` → Greedy Best-First

A UI-ban a csúszka mozgatásakor **valós időben látszik, hogyan alakul át egyik algoritmus a másikba**. Ez a projekt egyik legjobb tanulási és demó eleme, és pontosan az eredeti szándékot szolgálja: a hat algoritmus viszonyának megértését.

### 6.3. DFS kezelése

A nyers DFS platformerben gyakorlatilag használhatatlan (nagyon mély, nagyon rossz út). **Ez nem hiba, hanem a demó része**: legyen kapcsoló a `raw` és a `depth-limited + iterative deepening` változat között, és a statisztikapanel írja ki a különbséget. A README-ben egy bekezdés arról, miért így viselkedik.

### 6.4. Mért metrikák

| Metrika | Forrás |
|---|---|
| `planTimeMs` | `performance.now()`, 5 futás mediánja, vizualizáció nélkül |
| `nodesExpanded` | számláló |
| `nodesGenerated` | számláló |
| `peakOpenSize` | frontier max mérete |
| `closedSize` | a closed halmaz végső mérete |
| `pathLength` | élek száma a megoldásban |
| `pathCost` | tickek összege |
| `optimalityRatio` | `pathCost / dijkstraCost` (csak `speedrun` módban) |
| `runTicks` | a tényleges végrehajtás hossza |
| `coinsCollected`, `score`, `success` | a futásból |

Memóriamérés **nincs**: a `performance.memory` csak Chromiumban létezik és pontatlan. A `peakOpenSize` + `closedSize` pontos, determinisztikus proxy.

---

## 7. Végrehajtás: terv → akciók

A keresés eredménye csomópontok listája. A `PlanExecutor` ezt tick-szintű akciófolyammá alakítja az élek `actions` mezőiből, és tick-enként adja a `step()`-nek.

**Konzisztencia-ellenőrzés:** a végrehajtás után a tényleges pozíciónak egyeznie kell a tervezettel. Eltérés = bug a JumpTable-ben → assert dobása dev módban. Ez a projekt legfontosabb belső ellenőrzése.

---

## 8. Játékmódok

### 8.1. Play Yourself
Billentyűzet: `A`/`←` bal, `D`/`→` jobb, `W`/`↑`/`Space` ugrás, `R` restart, `Esc` menü.

### 8.2. Watch AI
Algoritmus + célmód + `w` súly kiválasztása. Két fázis:
1. **Keresés**: a gráf és a bejárás élőben, rögzített ütemben vizualizálva
2. **Végrehajtás**: a megtalált útvonal lejátszása

### 8.3. Race Against AI

Két almód:

| Almód | Működés | Mit mutat |
|---|---|---|
| `precomputed` | az AI előre teljes tervet készít, majd lejátssza | az **útvonal minőségét** |
| `realtime` | az AI-nak tick-enként X ms a budget-je, újratervez | a **döntéshozatal minőségét** időnyomás alatt |

A `realtime` az érdekesebb: itt a gyenge algoritmusok láthatóan hibáznak, és ez indokolja a hat algoritmus létét. Handicap-csúszka (AI késleltetett indítás) a játszhatóságért.

### 8.4. Benchmark

N seed × 6 algoritmus, vizualizáció nélkül, Web Workerben. Eredmény: rendezhető táblázat + CSV export. **Ez lesz a portfólió legmeggyőzőbb eleme**: valódi mérési adat, nem állítás.

---

## 9. Architektúra

### 9.1. Rétegek és függőségi irány

```
ui/  →  modes/  →  { core, world, ai }  →  config
render/ (Phaser)  →  core  (csak olvas)
```

Szabály: **`core`, `world`, `ai` egyetlen sora sem importálhat Phasert vagy DOM-ot.** Ezt ESLint szabállyal (`no-restricted-imports`) kényszerítjük ki, nem csak megállapodással.

### 9.2. Fájlstruktúra

```
src/
  main.js
  config/
    physics.js          # fizikai konstansok
    scoring.js          # pontozás
    difficulty.js       # nehézségi presetek
  core/
    Rng.js              # mulberry32
    RunState.js         # futásállapot (immutable)
    step.js             # a lépésfüggvény + végfeltételek, pontszámítás
    Controller.js       # getAction(state) interfész
  world/
    ChunkCatalog.js
    LevelGenerator.js
    LevelValidator.js
    Level.js            # immutable pálya + lekérdezők
  ai/
    JumpTable.js
    JumpGraph.js
    SearchProblem.js
    Heuristics.js
    frontiers/
      FifoQueue.js  LifoStack.js  BinaryHeap.js
    algorithms.js       # a hat konfiguráció egy fájlban
    search.js           # a generátoros váz
    PlanExecutor.js
    Metrics.js
  render/
    GameScene.js        # Play Yourself (Phaser)
    WatchAIScene.js     # Watch AI (Phaser)
    RaceScene.js        # Race Against AI (Phaser)
    SearchOverlay.js    # open/closed/útvonal rajzolása
    Sprites.js
    Audio.js            # háttérzene
  ui/
    Landing.js          # kezdőoldal
    HUD.js
    StatsPanel.js       # Watch AI statisztika
    RacePanel.js        # Race eredménypanel
    BenchmarkPanel.js   # Benchmark táblázat + CSV
    WatchAIControls.js  # közös vezérlősáv mind a négy módhoz
    Controls.js         # HumanController (billentyűzet)
  modes/
    PlayYourself.js
    WatchAI.js
    AIController.js     # Race precomputed/realtime AI-vezérlők
    RaceAI.js
    Benchmark.js
  workers/
    benchmark.worker.js
tests/
  physics.test.js
  generator.test.js
  jumpgraph.test.js
  execution.test.js
  algorithms.test.js
  watchai.test.js
  race.test.js
  benchmark.test.js
docs/
  SPEC.md  ALGORITHMS.md
```

### 9.3. Controller absztrakció

```js
/** @interface */
class Controller {
  /** @returns {Action} */
  getAction(state, level) { throw new Error('not implemented'); }
}
```

`HumanController`, `AIController`, `ReplayController`. Mindhárom ugyanezt implementálja. Enélkül a race mód és a replay külön kódutak lennének.

---

## 10. Technológia

| Elem | Választás | Megjegyzés |
|---|---|---|
| Nyelv | Vanilla JS (ES6+) | TS nélkül, de **`jsconfig.json` + `checkJs: true` + JSDoc** → IDE-szintű típusellenőrzés build nélkül |
| Renderelés | Phaser 3 | **csak sprite + input**, fizika nélkül |
| Build | Vite | `base: '/<repo-nev>/'` a Pages miatt |
| Teszt | Vitest | Vite-natív, a `core`/`world`/`ai` Phaser nélkül fut |
| Lint | ESLint + `no-restricted-imports` | a rétegszabály kikényszerítése |
| CI/CD | GitHub Actions → GitHub Pages | teszt + build + deploy |

---

## 11. Tesztelés

| Teszt | Mit ellenőriz |
|---|---|
| `physics.test.js` | ugrásmagasság, esési sebesség, ütközés cellahatáron, súrlódás |
| `generator.test.js` | ugyanaz a seed = ugyanaz a pálya; minden generált pálya járható |
| `jumpgraph.test.js` | minden él végrehajtása valóban a célcellába érkezik (a `step()`-pel visszaellenőrizve) |
| `algorithms.test.js` | mind a hat megoldást talál; A\* és Dijkstra költsége egyezik; A\* ≤ Greedy költség |
| `golden.test.js` | `seed → pálya-hash` és `seed + algoritmus → útvonal-hash` |

A `golden.test.js` fogja meg a nem szándékolt viselkedésváltozásokat. Ez a determinizmus őre.

---

## 12. Hibakezelés

| Eset | Kezelés |
|---|---|
| Érvénytelen seed (nem szám, üres) | fallback véletlen seedre, a UI kiírja a ténylegesen használtat |
| Generált pálya nem járható | javítás → újragenerálás `seed+1`-gyel, a retry-szám látszik |
| Nincs útvonal | „Nincs megoldás" a statisztikapanelen + a részleges legjobb csomópont megjelenítése |
| Keresés túllépi a limitet | leáll `maxExpansions`-nél, `timeout: true` a metrikákban, a legjobb részmegoldás lejátszható |
| Terv és végrehajtás eltér | dev módban assert; prod módban a végrehajtás újratervezéssel folytatódik |

**Tilos:** üres `catch` blokk, néma hiba, konzolra írt és elfelejtett hibaüzenet.

---

## 13. Mérföldkövek

### M1: Mag (Phaser nélkül)
`Rng`, `step()`, `Level`, `LevelGenerator`, `LevelValidator`, tesztek.
*Kész, ha:* egy seedből determinisztikusan, járhatóan legenerálódik a pálya, és a fizika tesztjei zöldek. Ekkor még nincs semmi a képernyőn, és ez így helyes.

### M2: Játszható
Phaser scene, sprite-ok, kamera, input, HUD, Play Yourself, célba érés, halál, restart.

### M3: AI mag
`JumpTable`, `JumpGraph`, `search()`, a hat algoritmus, `PlanExecutor`, Watch AI mód, alap statisztika.

### M4: Vizualizáció
Search overlay (open/closed/útvonal), sebesség-csúszka, `w` súly csúszka, debug nézet.

### M5: Verseny és mérés
Race (mindkét almód), Benchmark mód, összehasonlító táblázat, CSV export.

### M6: Publikálás
README mérési eredményekkel, `docs/ALGORITHMS.md`, GitHub Actions deploy, GIF-ek.

---

## 14. Elfogadási kritériumok

- [ ] Telepítés nélkül fut GitHub Pages-ről
- [ ] Ugyanaz a seed ugyanazt a pályát adja, két különböző gépen is
- [ ] Minden generált pálya járható
- [ ] Mind a hat algoritmus lefut és mérhető
- [ ] A\* és Dijkstra `speedrun` költsége megegyezik (optimalitás-ellenőrzés)
- [ ] A keresés vizualizálva látható, lépésenként léptethető
- [ ] Race mód mindkét almódban működik
- [ ] Benchmark táblázat exportálható
- [ ] A `core`, `world`, `ai` modulok Node alatt, Phaser nélkül tesztelhetők

---

## 15. Lehetséges jövőbeli bővítések

Nem részei a jelenlegi specifikációnak, de a jövőben megfontolandók:

1. **Változó ugrásmagasság**: jobb game feel, de +1 akció a keresésben, ami minden algoritmust és a `JumpTable`-t is érintené.
2. **Ellenfelek (Goomba-szerű)**: dinamikus akadály, ami időfüggővé teszi a keresést. Ez már egy másik projekt (időbővített állapottér), de érdekes bővítés.
3. **Napi challenge**: a dátumból származtatott seed, eredmény `localStorage`-ben. Olcsó és jól mutat.
