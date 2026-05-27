// ─── main.js ──────────────────────────────────────────────────────────────────
import { onResize }     from './renderer.js';
import { initInput }    from './input.js';
import { initPanel, togglePanel } from './panel/index.js';
import { tick }         from './loop.js';
import { playerGroup }  from './player.js';

// Force initial chunk build
import { updateChunks } from './terrain.js';
updateChunks(playerGroup.position);

window.addEventListener('resize', onResize);
initInput({ togglePanel });
tick();
