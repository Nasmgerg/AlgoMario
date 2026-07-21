import Phaser from 'phaser';
import { generateLevel } from '../world/LevelGenerator.js';
import { LENGTH_PRESETS } from '../config/difficulty.js';
import { RaceAI } from '../modes/RaceAI.js';
import { HumanController } from '../ui/Controls.js';
import { preloadSprites, buildLevelSprites, syncCollectibles, CELL_SIZE } from './Sprites.js';
import { preloadAudio, startBackgroundMusic } from './Audio.js';

/** Race Against AI scene (SPEC.md 8.3): a Phaser-mentes `modes/RaceAI` tickeli a fizikát, ez a réteg csak kirajzol, a kamera a két futó közti sávot mutatja. */
export class RaceScene extends Phaser.Scene {
  constructor() {
    super('RaceScene');
  }

  /** @param {{seed?: number, length?: number, difficulty?: number, raceConfig?: object, onStats?: (stats: object) => void}} data */
  init(data) {
    this.seed = Number.isInteger(data?.seed) ? data.seed : 5;
    this.levelLength = data?.length ?? LENGTH_PRESETS.normal;
    this.difficulty = data?.difficulty ?? 2;
    this.raceConfig = data?.raceConfig ?? {};
    this.onStats = data?.onStats ?? (() => {});
  }

  preload() {
    preloadSprites(this);
    preloadAudio(this);
  }

  create() {
    this.level = generateLevel({
      seed: this.seed,
      length: this.levelLength,
      difficulty: this.difficulty,
    });
    this.race = new RaceAI(this.level, this.raceConfig);
    this.controller = new HumanController(this.input.keyboard);
    startBackgroundMusic(this);

    const worldWidthPx = this.level.length * CELL_SIZE;
    const worldHeightPx = this.level.height * CELL_SIZE;

    this.add.tileSprite(0, 0, worldWidthPx, worldHeightPx, 'background').setOrigin(0, 0).setDepth(-10);
    this.sprites = buildLevelSprites(this, this.level);

    // Játékos: normál Mario. AI: ugyanaz a sprite lila árnyalattal + felirat,
    // hogy egy képen is szétválaszthatók legyenek.
    this.playerSprite = this.add
      .image(0, 0, 'marioRight')
      .setOrigin(0, 0)
      .setDisplaySize(CELL_SIZE, CELL_SIZE)
      .setDepth(600);
    this.aiSprite = this.add
      .image(0, 0, 'marioRight')
      .setOrigin(0, 0)
      .setDisplaySize(CELL_SIZE, CELL_SIZE)
      .setDepth(599)
      .setTint(0xb388ff)
      .setAlpha(0.9);

    const labelStyle = { fontFamily: 'monospace', fontSize: '16px', stroke: '#000', strokeThickness: 4 };
    this.playerLabel = this.add.text(0, 0, 'TE', { ...labelStyle, color: '#7ee787' }).setDepth(601);
    this.aiLabel = this.add.text(0, 0, 'AI', { ...labelStyle, color: '#b388ff' }).setDepth(601);

    this.cameras.main.setBounds(0, 0, worldWidthPx, worldHeightPx);
    this._applyZoom();
    const onResize = () => this._applyZoom();
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize));

    this.input.keyboard.on('keydown-R', () => this.scene.restart());

    this.accumulatorMs = 0;
    this._syncSprites();
    this.onStats(this.race.stats);
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
    // Fix 60 Hz tick, akkumulátorral — a fizika lépése determinisztikus.
    this.accumulatorMs += delta;
    const stepMs = 1000 / 60;
    let steps = 0;
    while (this.accumulatorMs >= stepMs && steps < 8) {
      if (!this.race.finished) this.race.tick(this.controller.getAction(this.race.playerState));
      this.accumulatorMs -= stepMs;
      steps += 1;
    }
    syncCollectibles(this.race.playerState, this.sprites);
    this._syncSprites();
    this.onStats(this.race.stats);
  }

  _syncSprites() {
    const player = this.race.playerState;
    const ai = this.race.aiState;
    this.playerSprite.setPosition(player.col * CELL_SIZE, player.row * CELL_SIZE);
    this.aiSprite.setPosition(ai.col * CELL_SIZE, ai.row * CELL_SIZE);
    this.playerLabel.setPosition(player.col * CELL_SIZE, player.row * CELL_SIZE - 18);
    this.aiLabel.setPosition(ai.col * CELL_SIZE, ai.row * CELL_SIZE - 18);
    if (player.vCol < 0) this.playerSprite.setTexture('marioLeft');
    else if (player.vCol > 0) this.playerSprite.setTexture('marioRight');
    if (ai.vCol < 0) this.aiSprite.setTexture('marioLeft');
    else if (ai.vCol > 0) this.aiSprite.setTexture('marioRight');

    // A kamera a két futó KÖZÉPÉRE néz, hogy az állás látszódjon; ha
    // messzire szakadnak, a Phaser a pálya-határokra vágja.
    const midCol = (player.col + ai.col) / 2;
    const midRow = (player.row + ai.row) / 2;
    this.cameras.main.centerOn(midCol * CELL_SIZE + CELL_SIZE / 2, midRow * CELL_SIZE + CELL_SIZE / 2);
  }
}
