// src/loop.js
import * as THREE from 'three';
import {
  renderer, scene, camera, labelRenderer,
  setActiveCamera, updateIsoCamera, updateThirdCamera, isThirdPersonCameraMode,
  getMoveForward, getMoveRight,
} from './renderer.js';
import { state } from './state.js';
import { updateSunPosition } from './lighting.js';
import { updateChunks } from './terrain.js';
import { playerGroup, updatePlayer, updateDashStreaks } from './player.js';
import { updateLaserProjectiles } from './weapons.js';
import { updateEnemies } from './enemies.js';
import { updateController } from './input.js';

const clock = new THREE.Clock();
let _fpsEMA = 60;
let _elapsed = 0;

const TIME_SLOW_CONFIG = Object.freeze({
  snapRate: 14.0,
  recoverRate: 5.0,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getTargetWorldScale() {
  if (!state.params.bulletTimeEnabled) return 1.0;
  return state.slowTimer > 0 ? clamp(Number(state.slowScale) || 0.35, 0.05, 1.0) : 1.0;
}

function updateTimeSlow(delta) {
  const p = state.params;

  state.slowCooldown = Math.max(0, state.slowCooldown - delta);
  state.slowTimer = Math.max(0, state.slowTimer - delta);

  if (state.slowRequested) {
    state.slowRequested = false;

    if (p.bulletTimeEnabled !== false && state.slowCooldown <= 0 && state.slowTimer <= 0) {
      const duration = clamp(Number(p.bulletTimeDuration) || 3, 0.1, 30);
      const cooldown = clamp(Number(p.bulletTimeCooldown) || 8, 0, 120);
      state.slowScale = clamp(Number(p.bulletTimeScale) || 0.35, 0.05, 1.0);
      state.slowTimer = duration;
      state.slowCooldown = cooldown;
    }
  }

  const targetScale = getTargetWorldScale();
  const rate = targetScale < state.worldScale
    ? TIME_SLOW_CONFIG.snapRate
    : TIME_SLOW_CONFIG.recoverRate;

  state.worldScale += (targetScale - state.worldScale) * Math.min(1, rate * delta);
}

export function tick() {
  requestAnimationFrame(tick);

  // Cap at 50ms — without this, tabbing away and back causes a single enormous
  // delta that teleports the player and breaks dash timers.
  const rawDelta = clock.getDelta();
  const delta    = Math.min(rawDelta, 0.05);
  _elapsed += delta;

  // FPS — exponential moving average, update display every frame
  _fpsEMA = _fpsEMA * 0.9 + (1 / Math.max(rawDelta, 0.001)) * 0.1;
  const fpsEl = document.getElementById('fps-val');
  if (fpsEl) fpsEl.textContent = Math.round(_fpsEMA);

  setActiveCamera(state.params.cameraMode);

  if (isThirdPersonCameraMode(state.params.cameraMode)) {
    updateThirdCamera(playerGroup.position, delta);
  } else {
    updateIsoCamera(playerGroup.position);
  }

  updateChunks(playerGroup.position);
  updateSunPosition(playerGroup.position);

  // Poll controller every frame (including paused — Options button must work).
  updateController(delta);

  if (state.paused) {
    state.primaryFire = false;
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    return;
  }

  updateTimeSlow(delta);
  updatePlayer(delta, getMoveForward(), getMoveRight());
  updateDashStreaks(delta);

  const worldDelta = delta * state.worldScale;
  updateEnemies(worldDelta, _elapsed);
  updateLaserProjectiles(delta, worldDelta);

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
