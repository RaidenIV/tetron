// ─── loop.js ──────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import {
  renderer, scene, camera, labelRenderer,
  updateIsoCamera, updateThirdCamera, setActiveCamera,
  getMoveForward, getMoveRight,
} from './renderer.js';
import { state } from './state.js';
import { updateSunPosition } from './lighting.js';
import { updateChunks } from './terrain.js';
import { playerGroup, updatePlayer, updateDashStreaks } from './player.js';

const clock = new THREE.Clock();

export function tick() {
  requestAnimationFrame(tick);

  const rawDelta = clock.getDelta();
  const delta    = Math.min(rawDelta, 0.05);

  // Sync camera
  setActiveCamera(state.params.cameraMode);
  if (state.params.cameraMode === 'third') {
    updateThirdCamera(playerGroup.position, delta);
  } else {
    updateIsoCamera(playerGroup.position);
  }

  // Update
  updateChunks(playerGroup.position);
  updateSunPosition(playerGroup.position);
  updatePlayer(delta, getMoveForward(), getMoveRight());
  updateDashStreaks(delta);

  // Render
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
