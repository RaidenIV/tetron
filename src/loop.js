// ─── loop.js ──────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { renderer, scene, camera, labelRenderer, updateIsoCamera, updateThirdCamera, setActiveCamera } from './renderer.js';
import { renderBloom, consumeExplBloomDirty } from './bloom.js';
import { state } from './state.js';
import { updateSunPosition, updateOrbitLights } from './lighting.js';
import { updateChunks } from './terrain.js';
import { updatePlayer, updateDashStreaks } from './player.js';
import { playerGroup } from './player.js';
import { updateEnemies } from './enemies.js';
import { updateSpawner } from './spawner.js';
import { shootBulletWave, updateBullets, updateOrbitBullets, syncOrbitBullets } from './weapons.js';
import { updateParticles } from './particles.js';
import { updateDamageNums } from './damageNumbers.js';
import { getMoveForward, getMoveRight } from './renderer.js';

export const clock = new THREE.Clock();

let fpsEMA  = 60;
let _orbitPrevCount = -1;

function renderFrame() {
  if (state.params.bloomEnabled) {
    renderBloom();
  } else {
    camera.layers.enable(0);
    camera.layers.enable(1);
    camera.layers.enable(2);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);
  }
  labelRenderer.render(scene, camera);
}

export function tick() {
  requestAnimationFrame(tick);

  const rawDelta  = clock.getDelta();
  const delta     = Math.min(rawDelta, 0.05); // cap at 50ms

  // FPS overlay
  fpsEMA = fpsEMA * 0.92 + (1 / Math.max(rawDelta, 0.001)) * 0.08;
  const fpsEl = document.getElementById('fpsVal');
  if (fpsEl) fpsEl.textContent = Math.round(fpsEMA);

  if (state.gameOver) { renderFrame(); return; }

  // ── Sync camera mode ────────────────────────────────────────────────────────
  setActiveCamera(state.params.cameraMode);
  if (state.params.cameraMode === 'third') {
    updateThirdCamera(playerGroup.position, delta);
  } else {
    updateIsoCamera(playerGroup.position);
  }

  // ── Sync orbit bullets if count changed ────────────────────────────────────
  const orbitCount = Math.floor(state.params.orbitCount);
  if (orbitCount !== _orbitPrevCount) {
    _orbitPrevCount = orbitCount;
    syncOrbitBullets();
  }

  state.elapsed += delta;

  // Timer
  const timerEl = document.getElementById('timer-value');
  if (timerEl) {
    const m = Math.floor(state.elapsed / 60).toString().padStart(2, '0');
    const s = Math.floor(state.elapsed % 60).toString().padStart(2, '0');
    timerEl.textContent = m + ':' + s;
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  updateChunks(playerGroup.position);
  updateSunPosition(playerGroup.position);
  updateOrbitLights(delta, playerGroup.position);

  updatePlayer(delta, getMoveForward(), getMoveRight());
  updateDashStreaks(delta);

  // Auto-shoot
  if (state.params.playerAutoShoot) {
    state.shootTimer -= delta;
    if (state.shootTimer <= 0) {
      state.shootTimer = state.params.weaponFireInterval;
      shootBulletWave();
    }
  }

  updateBullets(delta);
  updateOrbitBullets(delta);
  updateEnemies(delta);
  updateSpawner(delta);
  updateParticles(delta);
  updateDamageNums(delta);
  consumeExplBloomDirty();

  renderFrame();
}
