import Phaser from 'phaser';
import { getCachedLevel } from '../ai/graphCache.js';
import { isTypingIntoForm } from '../ui/Controls.js';
import { LENGTH_PRESETS } from '../config/difficulty.js';
import { WatchAI, WatchPhase } from '../modes/WatchAI.js';
import { SearchOverlay } from './SearchOverlay.js';
import { preloadSprites, buildLevelSprites, syncCollectibles, CELL_SIZE } from './Sprites.js';
import { preloadAudio, startBackgroundMusic } from './Audio.js';

/** Watch AI scene (SPEC.md 8.2, M4): keresés (SearchOverlay festi) → végrehajtás (a talált útvonal lejátszása). Csak OLVASSA a modes/WatchAI kimenetét. */
export class WatchAIScene extends Phaser.Scene {
  constructor() {
    super('WatchAIScene');
  }

  /** @param {{seed?: number, length?: number, difficulty?: number, watchConfig?: object, getStepsPerFrame?: () => number, onStats?: (stats: object) => void}} data */
  init(data) {
    this.seed = data?.seed;
    this.levelLength = data?.length ?? LENGTH_PRESETS.normal;
    this.difficulty = data?.difficulty ?? 2;
    this.watchConfig = data?.watchConfig ?? {};
    this.getStepsPerFrame = data?.getStepsPerFrame ?? (() => 10);
    this.onStats = data?.onStats ?? (() => {});
  }

  preload() {
    preloadSprites(this);
    preloadAudio(this);
  }

  create() {
    this.level = getCachedLevel({
      seed: this.seed,
      length: this.levelLength,
      difficulty: this.difficulty,
    });
    this.watch = new WatchAI(this.level, this.watchConfig);
    startBackgroundMusic(this);

    const worldWidthPx = this.level.length * CELL_SIZE;
    const worldHeightPx = this.level.height * CELL_SIZE;

    this.add.tileSprite(0, 0, worldWidthPx, worldHeightPx, 'background').setOrigin(0, 0).setDepth(-10);
    this.sprites = buildLevelSprites(this, this.level);
    this.overlay = new SearchOverlay(this, this.watch.graph.nodes);

    this.marioSprite = this.add
      .image(0, 0, 'marioRight')
      .setOrigin(0, 0)
      .setDisplaySize(CELL_SIZE, CELL_SIZE)
      .setDepth(600)
      .setVisible(false);

    this.cameras.main.setBounds(0, 0, worldWidthPx, worldHeightPx);
    this._applyZoom();
    // A Scale Manager globális, a listenert a scene leállásakor le kell venni (különben minden újraindítás után halott callback maradna).
    const onResize = () => this._applyZoom();
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize));

    this.input.keyboard.on('keydown-R', () => {
      if (!isTypingIntoForm()) this.scene.restart();
    });

    this._pathShown = false;
    // Lejátszás-állapot a tick-pontos érme-elrejtéshez — újraindításkor
    // (más seed/algoritmus) tisztán indul, ne a korábbi tervé maradjon.
    this._collectedSet = new Set();
    this._coinEventIndex = 0;
    this._poppedSet = new Set();
    this._surpriseEventIndex = 0;
    // Tört sebességekhez (0.25×/0.5× lassított mód): frame-enként gyűlik,
    // és csak egész lépésnyi budget megy a keresőnek.
    this._stepAccumulator = 0;
    this._lastStatsEmit = 0;
    this._emitStats();
  }

  _applyZoom() {
    // Elrejtett canvasnál a ScaleManager 0×0-t ad — abból 0 zoom lenne, ami láthatatlanra állítaná a kamerát.
    const { width, height } = this.scale;
    if (width <= 0 || height <= 0) return;
    this.cameras.main.setSize(width, height);
    this.cameras.main.setZoom(height / (this.level.height * CELL_SIZE));
  }

  /** @param {number} time @param {number} delta */
  update(time, delta) {
    const watch = this.watch;

    if (watch.phase === WatchPhase.SEARCHING) {
      // Frame-enkénti adagolás: a csúszka kiterjesztés/frame értéke a budget.
      // Tört érték (lassított mód) akkumulálódik: 0.25× → 4 frame-enként 1 lépés.
      const requested = this.getStepsPerFrame();
      let budget;
      if (requested === Infinity) {
        budget = Infinity;
        this._stepAccumulator = 0;
      } else {
        this._stepAccumulator += requested;
        budget = Math.floor(this._stepAccumulator);
        this._stepAccumulator -= budget;
      }
      if (budget > 0) watch.stepSearch(budget);
      if (watch.lastStep) {
        this.overlay.syncSearch(watch.lastStep.open, watch.lastStep.closed, watch.lastStep.current);
        this._followNode(watch.lastStep.current);
      }
    }

    if (watch.phase !== WatchPhase.SEARCHING && !this._pathShown && watch.path.length > 0) {
      this.overlay.showPath(watch.path);
      this._pathShown = true;
      this.marioSprite.setVisible(true);
    }

    if (watch.phase === WatchPhase.EXECUTING || watch.phase === WatchPhase.DONE) {
      // A lejátszás valós tempóban (60 tick/s) fut, a fizika fix lépésével.
      const ticks = Math.max(1, Math.round((delta / 1000) * 60));
      const position = watch.advanceExecution(ticks);
      if (position) {
        this.marioSprite.setPosition(position.col * CELL_SIZE, position.row * CELL_SIZE);
        this._panToward(position.col * CELL_SIZE + CELL_SIZE / 2, position.row * CELL_SIZE + CELL_SIZE / 2);
      }
      syncCollectibles(this._executionRunState(), this.sprites);
    }

    // A statisztikapanel teljes DOM-újraépítés (innerHTML): 60 Hz-en mérhetően terheli a fő szálat (~7% CPU + layout), 10 Hz embernek ugyanolyan élő.
    if (time - this._lastStatsEmit >= 100) {
      this._lastStatsEmit = time;
      this._emitStats();
    }
  }

  /** Simított kamera-követés: teleportálás helyett minden frame-ben a cél felé húz, különben a keresés alatti fókuszváltás vibrálna.
   * @param {number} x @param {number} y
   */
  _panToward(x, y) {
    const camera = this.cameras.main;
    const mid = camera.midPoint;
    camera.centerOn(mid.x + (x - mid.x) * 0.18, mid.y + (y - mid.y) * 0.18);
  }

  /** A begyűjtött érmék és a kiütött surprise blokkok tick-pontos frissítése a `runContinuous` eseményei alapján, nem él-végi kötegekben.
   * @returns {{collectedCoins: Set<number>, poppedSurprises: Set<number>}}
   */
  _executionRunState() {
    const tick = this.watch.executionTick;
    const coins = this.watch.coinEvents;
    while (this._coinEventIndex < coins.length && coins[this._coinEventIndex].tick <= tick) {
      this._collectedSet.add(coins[this._coinEventIndex].coinId);
      this._coinEventIndex += 1;
    }
    const surprises = this.watch.surpriseEvents;
    while (this._surpriseEventIndex < surprises.length && surprises[this._surpriseEventIndex].tick <= tick) {
      this._poppedSet.add(surprises[this._surpriseEventIndex].surpriseId);
      this._surpriseEventIndex += 1;
    }
    return { collectedCoins: this._collectedSet, poppedSurprises: this._poppedSet };
  }

  /** @param {number} nodeIndex */
  _followNode(nodeIndex) {
    const node = this.watch.graph.nodes[nodeIndex];
    if (!node) return;
    this._panToward(node.col * CELL_SIZE + CELL_SIZE / 2, node.row * CELL_SIZE + CELL_SIZE / 2);
  }

  _emitStats() {
    this.onStats(this.watch.stats);
  }
}
