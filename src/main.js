import Phaser from 'phaser';
import { GameScene } from './render/GameScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#5c94fc',
  pixelArt: true,
  scale: {
    // RESIZE: a canvas mindig kitölti a rendelkezésre álló helyet,
    // méretaránytartás (letterbox) nélkül. A GameScene a 'resize' eseményre
    // maga számolja újra a kamera zoomját, hogy a pálya 16 sora bármilyen
    // ablakalaknál teljesen látható maradjon, a szélesség pedig szabadon
    // igazodjon (SPEC.md D7/16.4).
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [GameScene],
};

new Phaser.Game(config);
