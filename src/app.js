import Phaser from 'phaser';
import { GameScene } from './render/GameScene.js';
import { WatchAIScene } from './render/WatchAIScene.js';
import { RaceScene } from './render/RaceScene.js';
import { WatchAIControls } from './ui/WatchAIControls.js';
import { StatsPanel } from './ui/StatsPanel.js';
import { RacePanel } from './ui/RacePanel.js';
import { BenchmarkPanel } from './ui/BenchmarkPanel.js';
import { setMusicEnabled } from './render/Audio.js';

const sidebar = document.getElementById('sidebar');
const gameContainer = document.getElementById('game-container');

/** A teljes alkalmazás indítása (Phaser game, scene-ek, vezérlők); a kezdőoldal "Tovább" gombja tölti be dinamikus importtal, így a Phaser nem blokkolja a kezdőoldal kirajzolását. */
export function startApp() {
  const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: '#5c94fc',
    pixelArt: true,
    scale: {
      // RESIZE, letterbox nélkül; a scene-ek maguk zoomolnak a 'resize'-ra, hogy a 16 sor mindig teljesen látsszon (SPEC.md D7).
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
      // Elrejtett canvasnál (benchmark mód) a szülő 0x0, amiből a ScaleManager 0 méretű WebGL render targetet csinálna: az "Incomplete Attachment" kivétel megölné a render loopot. A minimum ezt zárja ki minden útvonalon (poll, DOM resize, explicit refresh).
      min: { width: 1, height: 1 },
    },
    scene: [WatchAIScene, GameScene, RaceScene],
  };

  const game = new Phaser.Game(config);

  const SCENE_KEYS = ['WatchAIScene', 'GameScene', 'RaceScene'];

  /** @type {WatchAIControls} */
  let controls;

  // A panelek a vezérlők UTÁN kerülnek a sidebarba, hogy a vezérlősáv maradjon felül.
  const panelHost = document.createElement('div');

  /** Determinisztikus scene-váltás: MINDEN scene-t leállítunk indítás előtt, állapottól függetlenül — a Phaser `start()` némán no-opol, ha a cél scene még START/LOADING/CREATING fázisban van, a `stop()` viszont bármely állapotból SHUTDOWN-ra visz.
   * @param {string} startKey @param {object} data
   */
  function switchScene(startKey, data) {
    if (game.isBooted) {
      for (const key of SCENE_KEYS) game.scene.stop(key);
      // A ScaleManager csak ~500 ms-onként méri újra a szülőt; ha a canvas épp most lett újra látható, a scene create()-je 0×0 méretet látna.
      if (game.scale.getParentBounds()) game.scale.refresh();
    }
    if (startKey) game.scene.start(startKey, data);
  }

  /** Csak egy panel látszik egyszerre; a benchmark a canvast is elrejti. */
  function showPanel(panel, { hideCanvas = false } = {}) {
    panelHost.replaceChildren();
    if (panel) panelHost.appendChild(panel.el);
    gameContainer.style.display = hideCanvas ? 'none' : '';
  }

  const statsPanel = new StatsPanel(panelHost);
  const racePanel = new RacePanel(panelHost);
  const benchmarkPanel = new BenchmarkPanel(panelHost);

  function startWatchAI(watchConfig) {
    showPanel(statsPanel);
    switchScene('WatchAIScene', {
      seed: watchConfig.seed,
      difficulty: 2,
      watchConfig,
      getStepsPerFrame: () => controls.stepsPerFrame,
      onStats: (stats) => statsPanel.update(stats),
    });
  }

  function startPlayYourself(watchConfig) {
    showPanel(null);
    switchScene('GameScene', { seed: watchConfig.seed, difficulty: 2 });
  }

  function startRace(raceConfig) {
    showPanel(racePanel);
    switchScene('RaceScene', {
      seed: raceConfig.seed,
      difficulty: 2,
      raceConfig,
      onStats: (stats) => racePanel.update(stats),
    });
  }

  function showBenchmark() {
    // A mérés Web Workerben fut; a canvas felesleges, a scene-eket leállítjuk,
    // hogy a render ne vegye el a CPU-t a méréstől.
    switchScene(null, null);
    showPanel(benchmarkPanel, { hideCanvas: true });
  }

  function applyMode() {
    const mode = controls.modeSelect.value;
    // A Worker túléli a panel elrejtését, ezért a mérést explicit le kell állítani, mielőtt az új mód elindul.
    if (mode !== 'benchmark') benchmarkPanel.stopMeasurement();
    if (mode === 'play') startPlayYourself(controls.config);
    else if (mode === 'race') startRace(controls.raceConfig);
    else if (mode === 'benchmark') showBenchmark();
    else startWatchAI(controls.config);
  }

  controls = new WatchAIControls(sidebar, {
    onRestart: () => applyMode(),
    onModeChange: () => {
      controls.syncMode();
      applyMode();
    },
    onRunBenchmark: (benchmarkConfig) => benchmarkPanel.run(benchmarkConfig),
    onToggleMusic: (enabled) => setMusicEnabled(enabled),
  });

  sidebar.appendChild(panelHost);
  controls.syncMode();
  applyMode();
}
