import { PHYSICS } from '../config/physics.js';
import { RunStatus } from '../core/RunState.js';

const STATUS_LABELS = Object.freeze({
  [RunStatus.GOAL]: 'CÉLBA ÉRTÉL! (R = újra)',
  [RunStatus.FELL]: 'LEESTÉL! (R = újra)',
  [RunStatus.TIMEOUT]: 'LEJÁRT AZ IDŐ! (R = újra)',
});

/** Pontszám + eltelt idő kijelzés (SPEC.md 8.1. szakasz). */
export class HUD {
  /** @param {import('phaser').Scene} scene */
  constructor(scene) {
    const baseStyle = {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    };
    this.scoreText = scene.add.text(12, 10, '', baseStyle).setScrollFactor(0).setDepth(1000);
    this.timeText = scene.add.text(12, 34, '', baseStyle).setScrollFactor(0).setDepth(1000);
    this.statusText = scene.add
      .text(scene.scale.width / 2, 60, '', { ...baseStyle, fontSize: '28px' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);
  }

  /** @param {import('../core/RunState.js').RunState} state */
  update(state) {
    this.scoreText.setText(`Pontszám: ${state.score}`);
    this.timeText.setText(`Idő: ${(state.ticks / PHYSICS.TICK_RATE).toFixed(1)} s`);
    this.statusText.setText(STATUS_LABELS[state.status] ?? '');
  }

  /** A világ-kamerának ezeket kell kihagynia, hogy a HUD ne zoomolódjon. */
  getGameObjects() {
    return [this.scoreText, this.timeText, this.statusText];
  }

  /**
   * Az állapotüzenet vízszintesen középre igazítva — resize-nál a
   * canvas szélessége változik, ezért ezt újra kell számolni.
   * @param {number} width
   */
  reposition(width) {
    this.statusText.setX(width / 2);
  }
}
