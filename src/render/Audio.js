import Phaser from 'phaser';
import themeUrl from '../assets/audio/main_theme.wav';

const THEME_KEY = 'theme';
const DEFAULT_VOLUME = 0.35;

/** @param {import('phaser').Scene} scene */
export function preloadAudio(scene) {
  scene.load.audio(THEME_KEY, themeUrl);
}

/**
 * Elindítja a háttérzenét hurokban (az autoplay-lockot a Phaser SoundManager magától feloldja); a scene leállásakor leállítja.
 * @param {import('phaser').Scene} scene
 * @param {{volume?: number}} [options]
 * @returns {import('phaser').Sound.BaseSound}
 */
export function startBackgroundMusic(scene, options = {}) {
  const music = scene.sound.add(THEME_KEY, { loop: true, volume: options.volume ?? DEFAULT_VOLUME });
  music.play();
  // A SoundManager globális, nem scene-enkénti: leállításkor meg is kell semmisíteni, különben minden módváltás egy újabb élő példányt hagy maga után.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => music.destroy());
  return music;
}
