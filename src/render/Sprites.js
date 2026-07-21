import { CellType } from '../world/Level.js';
import brickUrl from '../assets/sprites/brick.png';
import coinUrl from '../assets/sprites/coin.png';
import surpriseUrl from '../assets/sprites/surprise.png';
import pipeUrl from '../assets/sprites/pipe.png';
import marioRightUrl from '../assets/sprites/mario_r.png';
import marioLeftUrl from '../assets/sprites/mario_l.png';
import backgroundUrl from '../assets/sprites/background.png';

/** Egy cella mérete pixelben — a natív asset-felbontáshoz igazítva. */
export const CELL_SIZE = 45;

const CELL_TEXTURE = Object.freeze({
  [CellType.WALL]: 'brick',
  [CellType.PIPE]: 'pipe',
  [CellType.SURPRISE]: 'surprise',
  [CellType.COIN]: 'coin',
});

/** @param {import('phaser').Scene} scene */
export function preloadSprites(scene) {
  scene.load.image('brick', brickUrl);
  scene.load.image('coin', coinUrl);
  scene.load.image('surprise', surpriseUrl);
  scene.load.image('background', backgroundUrl);
  // A pipe.png 2 cellányi széles — spritesheetként töltve az első keret
  // (bal fél) a mi 1 cella széles PIPE celláinknak megfelelő méretű.
  scene.load.spritesheet('pipe', pipeUrl, { frameWidth: CELL_SIZE, frameHeight: CELL_SIZE });
  scene.load.image('marioRight', marioRightUrl);
  scene.load.image('marioLeft', marioLeftUrl);
}

/** Statikus cellák kirajzolása + a gyűjthető cellák (COIN/SURPRISE) image-referenciáinak megőrzése ({@link syncCollectibles}-hez).
 * @param {import('phaser').Scene} scene
 * @param {import('../world/Level.js').Level} level
 */
export function buildLevelSprites(scene, level) {
  const coinSprites = new Map();
  const surpriseSprites = new Map();

  for (let row = 0; row < level.height; row += 1) {
    for (let col = 0; col < level.length; col += 1) {
      const cellType = level.cellAt(row, col);
      const x = col * CELL_SIZE;
      const y = row * CELL_SIZE;

      if (cellType === CellType.GOAL) {
        // Nincs külön zászlórúd-asset — egy keskeny, világos csík minden
        // GOAL cellára stackelve célzászlóként olvasható.
        scene.add.rectangle(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 6, CELL_SIZE, 0xf5f5f5).setOrigin(0.5, 0.5);
        continue;
      }

      const texture = CELL_TEXTURE[cellType];
      if (!texture) continue;

      const image = scene.add.image(x, y, texture, cellType === CellType.PIPE ? 0 : undefined).setOrigin(0, 0);

      if (cellType === CellType.COIN) {
        coinSprites.set(level.coinIdAt(row, col), image);
      } else if (cellType === CellType.SURPRISE) {
        surpriseSprites.set(level.surpriseIdAt(row, col), image);
      }
    }
  }

  return { coinSprites, surpriseSprites };
}

/** A begyűjtött érmék eltűnnek, a kiütött surprise-ok WALL-textúrára váltanak; csak a halmazokat olvassa, ezért részleges állapot is elég.
 * @param {{collectedCoins: ReadonlySet<number>, poppedSurprises: ReadonlySet<number>}} state
 * @param {{coinSprites: Map<number, import('phaser').GameObjects.Image>, surpriseSprites: Map<number, import('phaser').GameObjects.Image>}} sprites
 */
export function syncCollectibles(state, sprites) {
  for (const [id, image] of sprites.coinSprites) {
    if (state.collectedCoins.has(id) && image.visible) {
      image.setVisible(false);
    }
  }
  for (const [id, image] of sprites.surpriseSprites) {
    if (state.poppedSurprises.has(id) && image.texture.key !== 'brick') {
      image.setTexture('brick');
    }
  }
}
