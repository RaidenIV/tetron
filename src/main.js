// ─── main.js ──────────────────────────────────────────────────────────────────
// Mechanics-lab entry point. Starts directly in gameplay and uses the sidebar as
// the primary control surface for testing mechanics and feature values.

import { state }            from './state.js';
import { onRendererResize } from './renderer.js';
import { onBloomResize }    from './bloom.js';
import { updateXP }         from './xp.js';
import { updateHealthBar }  from './player.js';
import { setLevelUpCallback, setVictoryCallback } from './enemies.js';
import { triggerVictory, restartGame } from './gameFlow.js';
import { initInput }        from './input.js';
import { tick }             from './loop.js';
import { openPanel, togglePanel, togglePause } from './panel/index.js';
import { initAudio, resumeAudioContext, playSound, startMusic } from './audio.js';
import { initHudCoin }      from './hudCoin.js';

// ── Wire cross-module callbacks ───────────────────────────────────────────────
setVictoryCallback(triggerVictory);
setLevelUpCallback(() => playSound('levelup', 0.8));

const guardedTogglePanel = () => { if (state.uiMode === 'playing') togglePanel(); };
const guardedTogglePause = () => { if (state.uiMode === 'playing') togglePause(); };

initInput({
  togglePanel: guardedTogglePanel,
  togglePause: guardedTogglePause,
  restartGame,
  onFirstKey: resumeAudioContext,
});

window.addEventListener('pointerdown', resumeAudioContext, { once: true, passive: true });
window.restartGame = restartGame;

window.addEventListener('resize', () => {
  onRendererResize();
  onBloomResize();
});

// ── Start directly in the mechanics sandbox ──────────────────────────────────
state.uiMode = 'playing';
state.paused = false;
state.panelOpen = true;
document.body.classList.remove('mode-menu');
document.body.classList.add('mode-playing');

updateHealthBar();
updateXP(0);
initHudCoin();

// Load audio without requiring a splash/start screen. Browser autoplay policy may
// keep playback muted until the first key/pointer gesture resumes the AudioContext.
initAudio().then(() => startMusic('game')).catch(err => console.warn('[main] audio init failed:', err));

restartGame({ startCountdown: false, skipInitialSpawn: true });

if (!state.loopStarted) {
  state.loopStarted = true;
  tick();
}

// Keep the testing sidebar visible by default.
openPanel();
