import Phaser from 'phaser';
import { getCachedLevel } from '../ai/graphCache.js';
import { LENGTH_PRESETS } from '../config/difficulty.js';
import { PHYSICS } from '../config/physics.js';
import { PlayYourself } from '../modes/PlayYourself.js';
import { HumanController } from '../ui/Controls.js';
import { HUD } from '../ui/HUD.js';
import { preloadSprites, buildLevelSprites, syncCollectibles, CELL_SIZE } from './Sprites.js';
import { preloadAudio, startBackgroundMusic } from './Audio.js';

const FIXED_STEP_MS = 1000 / PHYSICS.TICK_RATE;

/** Play Yourself Phaser scene (SPEC.md 8.1); a fizikát a `core/step.js` adja, ez a réteg csak renderel fixed-timestep ütemben (D3: Arcade Physics nincs használva). */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  /** @param {{seed?: number, length?: number, difficulty?: number}} data */
  init(data) {
    this.seed = Number.isInteger(data?.seed) ? data.seed : 1;
    this.length = data?.length ?? LENGTH_PRESETS.normal;
    this.difficulty = data?.difficulty ?? 1;
  }

  preload() {
    preloadSprites(this);
    preloadAudio(this);
  }

  create() {
    this.level = getCachedLevel({ seed: this.seed, length: this.length, difficulty: this.difficulty });
    this.session = new PlayYourself(this.level, new HumanController(this.input.keyboard));
    this.accumulatorMs = 0;
    startBackgroundMusic(this);

    this._worldWidthPx = this.level.length * CELL_SIZE;
    this._worldHeightPx = this.level.height * CELL_SIZE;

    this.add.tileSprite(0, 0, this._worldWidthPx, this._worldHeightPx, 'background').setOrigin(0, 0).setDepth(-10);

    this.sprites = buildLevelSprites(this, this.level);

    this.marioSprite = this.add.image(0, 0, 'marioRight').setOrigin(0, 0).setDisplaySize(CELL_SIZE, CELL_SIZE);

    // A world-objektumok pillanatképe a HUD-kamera "ignore" listájához —
    // ezután jövő objektum (a HUD szövegei) már nem kerül bele.
    const worldObjects = [...this.children.list];

    this.cameras.main.setBounds(0, 0, this._worldWidthPx, this._worldHeightPx);
    this.cameras.main.startFollow(this.marioSprite, true, 0.15, 0.15);

    this.hud = new HUD(this);

    // Külön, zoom=1 HUD-kamera, hogy a szöveg ne skálázódjon a világ-kamera
    // zoomjával — a két kamera kölcsönösen kihagyja a másik tartalmát.
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.ignore(worldObjects);
    this.cameras.main.ignore(this.hud.getGameObjects());

    this.input.keyboard.on('keydown-R', () => this.restart());

    // Kezdeti elrendezés + minden átméretezéskor újra (Scale.RESIZE nem igazítja a kamerákat automatikusan); a listener leállításkor lekerül.
    this._applyResponsiveLayout(this.scale.width, this.scale.height);
    const onResize = (gameSize) => this._applyResponsiveLayout(gameSize.width, gameSize.height);
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize));

    this._syncMarioSprite();
    this.hud.update(this.session.state);
  }

  /** A pálya teljes magassága mindig beférjen a viewportba; a zoom kizárólag a magasságból számolódik, a szélesség szabadon igazodik.
   * @param {number} width @param {number} height
   */
  _applyResponsiveLayout(width, height) {
    // Elrejtett canvasnál a ScaleManager 0×0-t ad — abból 0 zoom lenne, ami láthatatlanra állítaná a kamerát.
    if (width <= 0 || height <= 0) return;
    const zoom = height / this._worldHeightPx;
    this.cameras.main.setSize(width, height);
    this.cameras.main.setZoom(zoom);
    if (this.uiCamera) this.uiCamera.setSize(width, height);
    if (this.hud) this.hud.reposition(width);
  }

  /** @param {number} time @param {number} delta */
  update(time, delta) {
    this.accumulatorMs += delta;
    while (this.accumulatorMs >= FIXED_STEP_MS) {
      this.session.tick();
      this.accumulatorMs -= FIXED_STEP_MS;
      syncCollectibles(this.session.state, this.sprites);
    }
    this._syncMarioSprite();
    this.hud.update(this.session.state);
  }

  restart() {
    this.session.restart();
    this.accumulatorMs = 0;
    for (const image of this.sprites.coinSprites.values()) image.setVisible(true);
    for (const image of this.sprites.surpriseSprites.values()) image.setTexture('surprise');
    this._syncMarioSprite();
  }

  _syncMarioSprite() {
    const { row, col, vCol } = this.session.state;
    this.marioSprite.setPosition(col * CELL_SIZE, row * CELL_SIZE);
    if (vCol > 0) this.marioSprite.setTexture('marioRight');
    else if (vCol < 0) this.marioSprite.setTexture('marioLeft');
  }
}
