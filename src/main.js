// src/main.js
import { onResize }              from './renderer.js';
import { initInput }             from './input.js';
import { initPanel, togglePanel } from './panel/index.js';
import { initController }          from './controller.js';
import { tick }                  from './loop.js';
import { playerGroup }           from './player.js';
import { updateChunks }          from './terrain.js';

window.addEventListener('resize', onResize);
initPanel();
initInput({ togglePanel });
initController({ togglePanel });

// Build initial floor chunks around origin
updateChunks(playerGroup.position);

tick();
