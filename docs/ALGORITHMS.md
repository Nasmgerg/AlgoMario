# Algoritmusok

Ez a dokumentum a hat útkereső algoritmust, a Best-First `w`-paraméteres
keretrendszert, és a tervezési döntésnaplót foglalja össze olvasóbarát
formában. A teljes funkcionális specifikáció: [`SPEC.md`](SPEC.md) (5–6.
szakasz a keresésről, 15. szakasz a döntésnapló forrása).

## A közös váz

Mind a hat algoritmus **ugyanazon a generátoros keresési vázon**
(`src/ai/search.js`) fut, egy pályánként egyszer felépített makró-gráfon
(`JumpGraph` — csomópont minden állható cellán, él a `JumpTable`
előszámított mozdulat-menüje alapján, súly = tick). Az algoritmusokat
kizárólag három dolog különbözteti meg (`src/ai/algorithms.js`):

- **frontier**: melyik adatszerkezet adja a következő kiterjesztendő
  csomópontot (FIFO sor, LIFO verem, vagy prioritásos min-heap)
- **prioritásfüggvény**: heap esetén mi dönti el a sorrendet
- **dedup-politika**: `firstSeen` (az első látott út nyer, olcsóbb, de nem
  garantál optimumot) vagy `bestCost` (mindig a legolcsóbb út nyer)

Emiatt fair az összehasonlítás: nem hat különböző implementáció verseng,
hanem egyetlen kód három paraméterének hat konfigurációja.

## A hat algoritmus

| Algoritmus | Frontier | Prioritás | Dedup | Garantáltan optimális (speedrun)? |
|---|---|---|---|---|
| **BFS** | FIFO | — | `firstSeen` | Nem. A legkevesebb *élű* utat adja, ami súlyozott gráfon nem ugyanaz, mint a legolcsóbb (tick-optimális) út. |
| **DFS** | LIFO | — | `firstSeen` | Nem, mélyen és kanyargósan bejár, jellemzően jóval drágább utat talál. |
| **Dijkstra** | min-heap | `g` | `bestCost` | Igen, ez a klasszikus garancia és a referenciaérték a többihez. |
| **A\*** | min-heap | `g + h` | `bestCost` | Igen, ha `h` megengedhető (lásd lent), és emellett mérhetően kevesebb csomópontot terjeszt ki, mint a Dijkstra. |
| **Greedy Best-First** | min-heap | `h` | `firstSeen` | Nem, gyors, de "kapzsi": a heurisztika felé rohan, a tényleges úthosszal nem törődik. |
| **Best-First** (paraméterezett) | min-heap | `g + w·h` | `bestCost` | `w ≤ 1`-nél igen (lásd lent). Ez a keretrendszer, aminek a többi három speciális esete. |

## A Best-First `w`-paraméteres keretrendszer

A `bestFirst(w)` (`src/ai/algorithms.js`) a `f(n) = g(n) + w·h(n)`
prioritásfüggvényt használja. Ennek két szélsőértéke kód szinten esik egybe
a másik kettővel, nem csak koncepcionálisan:

- `w = 0` → `f(n) = g(n)` → pontosan a Dijkstra prioritása.
- `w = 1` → `f(n) = g(n) + h(n)` → pontosan az A\* prioritása.
- `w → ∞` → a `g` tag elhanyagolhatóvá válik → a Greedy-hez tart.

A `tests/algorithms.test.js` ezt a *kiterjesztési sorrend* szintjén is
ellenőrzi, nem csak a talált útköltség alapján: `bestFirst(0)` és a
`dijkstra` minden vizsgált seeden bit-azonos sorrendben terjeszt ki
csomópontokat, ugyanígy `bestFirst(1)` és az `astar`.

### A heurisztika (`src/ai/Heuristics.js`)

```
h(n) = (targetCol − n.col) / MAX_RUN_SPEED
```

Ez a hátralévő oszlopok minimális tick-költsége. A `step()` vízszintes
sebessége ±0,2-re van clampelve, ezért semelyik él nem visz gyorsabban egy
oszloppal odébb, mint `1 / MAX_RUN_SPEED = 5` tick. A heurisztika emiatt
*megengedhető* (sosem becsül túl) és *konzisztens* (élenkénti csökkenése
sosem haladja meg az él költségét). Ez adja az A\* optimalitásának formális
alapját, nem csak a mérési eredményt.

## DFS: nyers vs. iteratív mélyítés

A Watch AI módban a DFS mellett kapcsoló van a **nyers** (mélységkorlát
nélküli, egyszeri bejárás) és az **iteratív mélyítéses** (mélységkorlátot
1-től növelve, minden lépésnél elölről induló bejárás,
`searchIterativeDeepening`) változat között. Egy konkrét, reprodukálható
mérés (seed 5, pályahossz 250, nehézség 2):

| Változat | Élek | Útköltség (tick) | Kiterjesztett csomópont |
|---|---|---|---|
| DFS nyers | 61 | 1865 | 68 |
| DFS iteratív mélyítés | **38** (= BFS minimum) | 1471 | 23 885 |

Az iteratív mélyítés garantáltan a legkevesebb élű utat találja meg, mert
soha nem lép mélyebbre a szükségesnél. Ennek ára itt ~350× annyi
kiterjesztés, mint a nyers DFS-nek. Ez a klasszikus tér–idő csereviszony,
élesben, ugyanazon a pályán mérve.

## Döntésnapló (SPEC.md 15. szakasz)

A projekt egy korábbi (Java) referenciaverzióhoz képest a következő
pontokon változott, indoklással:

| Változás | Indok |
|---|---|
| Pályaméret 13×100 → konfigurálható (alap 16×250) | A 100 oszlop túl rövid ahhoz, hogy az algoritmusok között látható különbség alakuljon ki. A jump-graph 500 oszlopnál is csak pár ezer csomópont — bőven elbírja. |
| Iterációlimit 1 000 → 10 000 (`length × 40`) | 250 oszlop bejárása minimum 1 250 tick; 1 000 tick már a start után megölné a futást. |
| Phaser fizika kivéve | Delta-időfüggő → gépenként más eredmény → a seed-reprodukálhatóság, a race és a replay elromlana. |
| Best-First mint `g + w·h` keretrendszer | Így nem esik egybe a Greedy-vel, és láthatóvá teszi, hogy a másik három ennek speciális esete. |
| Élsúly = tick, jutalom külön célmódban | Negatív élsúllyal a Dijkstra és az A\* garanciái megszűnnének. Így marad egy valódi optimum-referencia. |
| Kétszintű keresési tér (fizikai tick-szint + makró jump-graph) | Folytonos állapottéren a BFS és a Dijkstra azonos lenne; a mérés semmit nem mondana. |
| Memóriametrika → open/closed méret | A `performance.memory` böngészőben nem megbízható. |
| Mobil kikerült | Side project, nem indokolja a plusz munkát. |
| Generátoros keresők (`function*`) | Egy megoldással három probléma: a keresés nem blokkol, lépésenként vizualizálható, és leállítható/időszeletelhető. |

### Ami az eredeti döntésnaplón túl, a fejlesztés során derült ki

Az M3 utáni böngészős/audit-körökben két kritikus, a fenti táblázatban nem
szereplő tervezési tanulság is felmerült. Mindkettő a
`JumpGraph`/`JumpTable` implementációjában van orvosolva:

- **Egy `(dRow, dCol)` kulcshoz több, eltérő röppályájú jelöltet kell
  tárolni**, nem csak a legolcsóbbat. Egy adott terepen a legolcsóbb ívet a
  domborzat blokkolhatja, míg egy drágább, de más időzítésű ív szabadon
  átér. Enélkül léteztek olyan generált pályák, amik a world-validátor
  szerint járhatók voltak, de az AI számára megoldhatatlanok.
- **Az élek "horgony"-fázissal záródnak**: a landolás után egy rövid,
  valódi terepen tuningolt korrekciós szakasz PONTOSAN a célcsomópont
  egész-cella állapotára állítja Máriót. Enélkül a tervek csomópontonkénti
  újrahorgonyzás nélkül, folytonosan lejátszva lebegőpontos zajból
  felhalmozódó sodródással eltértek a tervezettől.
