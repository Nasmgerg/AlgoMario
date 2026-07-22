import { Landing } from './ui/Landing.js';

const landingEl = document.getElementById('landing');
const appEl = document.getElementById('app');

/** @type {Promise<typeof import('./app.js')> | null} */
let appModulePromise = null;

// A nehéz bundle (Phaser + játéklogika) külön chunkban van: a kezdőoldal enélkül rajzolódik ki, a ~1,5 MB kiértékelése nem blokkolja az első festést.
function loadApp() {
  appModulePromise ??= import('./app.js');
  return appModulePromise;
}

// Előtöltés a kezdőoldal KIFESTÉSE után, üresjáratban — mire a látogató a gombra kattint, a chunk jellemzően már betöltve és kiértékelve vár. A dupla rAF garantálja, hogy az első festés megtörtént (a requestIdleCallback önmagában festés előtt is tüzelhet, és a chunk-kiértékelés késleltetné az LCP-t).
window.addEventListener('load', () => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
      idle(() => loadApp());
    });
  });
});

new Landing(landingEl, {
  onContinue: async () => {
    const { startApp } = await loadApp();
    landingEl.style.display = 'none';
    appEl.style.display = '';
    startApp();
  },
});
