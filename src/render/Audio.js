import Phaser from 'phaser';
import themeUrl from '../assets/audio/main_theme.wav';

const THEME_KEY = 'theme';
const DEFAULT_VOLUME = 0.35;

// Modul-szintű, minden scene-en átívelő állapot: a felhasználó be/ki kapcsolója (SPEC.md 8.1-8.4, minden módban ugyanaz a zene).
let musicEnabled = true;
/** @type {Set<import('phaser').Sound.BaseSound>} */
const activeTracks = new Set();

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
  const music = scene.sound.add(THEME_KEY, {
    loop: true,
    volume: options.volume ?? DEFAULT_VOLUME,
    mute: !musicEnabled,
  });
  music.play();
  activeTracks.add(music);
  // A SoundManager globális, nem scene-enkénti: leállításkor meg is kell semmisíteni, különben minden módváltás egy újabb élő példányt hagy maga után.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    activeTracks.delete(music);
    music.destroy();
  });
  return music;
}

/** @returns {boolean} be van-e kapcsolva a háttérzene */
export function isMusicEnabled() {
  return musicEnabled;
}

/** A jelenleg futó és az ezután induló zeneszámokra is hat.
 * @param {boolean} enabled
 */
export function setMusicEnabled(enabled) {
  musicEnabled = enabled;
  for (const track of activeTracks) {
    // A setMute a konkrét sound-osztályokon él (WebAudio/HTML5Audio), a BaseSound típusán nem — futásidőben mindig ott van.
    /** @type {import('phaser').Sound.WebAudioSound} */ (track).setMute(!enabled);
  }
}
