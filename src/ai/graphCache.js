import { generateLevel } from '../world/LevelGenerator.js';
import { buildJumpGraph } from './JumpGraph.js';

/** Pálya- és gráf-cache: a Level immutable, a JumpGraph determinisztikus és csak olvasott, ezért azonos paraméterekre biztonságosan újrafelhasználhatók — enélkül minden UI-interakció (algoritmus/célmód-váltás, restart) szinkron újraépítést fizetne a kattintás-kezelőben. */

const MAX_LEVELS = 4;
/** @type {Map<string, import('../world/Level.js').Level>} */
const levelCache = new Map();
/** @type {WeakMap<import('../world/Level.js').Level, import('./JumpGraph.js').JumpGraph>} */
const graphCache = new WeakMap();

/** Azonos (seed, length, difficulty) paraméterekre a korábban generált pályapéldányt adja vissza (LRU, {@link MAX_LEVELS} bejegyzés).
 * @param {{seed: number, length: number, difficulty: number}} params
 * @returns {import('../world/Level.js').Level}
 */
export function getCachedLevel(params) {
  const key = `${params.seed}:${params.length}:${params.difficulty}`;
  const hit = levelCache.get(key);
  if (hit) {
    // LRU: a találat a sor végére kerül.
    levelCache.delete(key);
    levelCache.set(key, hit);
    return hit;
  }
  const level = generateLevel(params);
  levelCache.set(key, level);
  if (levelCache.size > MAX_LEVELS) levelCache.delete(levelCache.keys().next().value);
  return level;
}

/** Pályapéldányonként egyszer épített JumpGraph; ismételt hívás ugyanarra a Level-re azonnal visszatér.
 * @param {import('../world/Level.js').Level} level
 * @returns {import('./JumpGraph.js').JumpGraph}
 */
export function getCachedGraph(level) {
  let graph = graphCache.get(level);
  if (!graph) {
    graph = buildJumpGraph(level);
    graphCache.set(level, graph);
  }
  return graph;
}
