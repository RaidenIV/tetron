// ─── main.js ──────────────────────────────────────────────────────────────────
// Testbed entry point. No menus, no splash — game starts immediately.

import { state }           from './state.js';
import { onRendererResize, renderer, labelRenderer } from './renderer.js';
import { onBloomResize }   from './bloom.js';
import { updateHealthBar } from './player.js';
import { initInput }       from './input.js';
import { tick }            from './loop.js';
import { initSpawner }     from './spawner.js';
import { initEliteBar }    from './enemies.js';
import { togglePanel }     from './panel/index.js';
import { resumeAudioContext } from './audio.js';

// ── Resize ─────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  onRendererResize();
  onBloomResize();
});

// ── Input ──────────────────────────────────────────────────────────────────────
initInput({
  togglePanel,
  restartGame: () => window.location.reload(),
});

window.addEventListener('pointerdown', resumeAudioContext, { once: true, passive: true });

// ── Bootstrap ──────────────────────────────────────────────────────────────────
updateHealthBar();
initEliteBar();
initSpawner();

// Start loop immediately
state.loopStarted = true;
tick();
