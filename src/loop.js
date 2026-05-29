// src/loop.js
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  renderer, scene, camera, labelRenderer,
  setActiveCamera, updateIsoCamera, updateThirdCamera, isThirdPersonCameraMode,
  getMoveForward, getMoveRight,
} from './renderer.js';
import { state } from './state.js';
import { updateSunPosition } from './lighting.js';
import { updateChunks } from './terrain.js';
import { playerGroup, updatePlayer, updateDashStreaks } from './player.js';
import { updateLaserProjectiles, resolveAimTarget, aimResult } from './weapons.js';
import { updateEnemies, getEnemyMeshes } from './enemies.js';
import { updateController } from './input.js';

const clock = new THREE.Clock();
let _fpsEMA = 60;

// ── Enemy aim tag (red enemy icon shown above the targeted enemy) ──────────────
const _tagEl = document.createElement('div');
_tagEl.style.cssText = [
  'width:22px', 'height:22px',
  'display:flex', 'align-items:center', 'justify-content:center',
  'pointer-events:none', 'opacity:0', 'transition:opacity 0.12s ease',
].join(';');
_tagEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="22px" viewBox="0 -960 960 960" width="22px" fill="#ff2020" aria-hidden="true"><path d="M292-132v-152q-36-15-65.5-39T176-378q-21-31-32.5-67T132-520q0-136 97.42-222 97.41-86 250.5-86Q633-828 730.5-742T828-520q0 39-11.5 75T784-378q-21 31-50.5 55T668-283.82V-132H292Zm28-28h62v-56h56v56h84v-56h56v56h62v-142q36-12 65.5-33.5t50.65-50.05q21.15-28.54 32.5-63Q800-483 800-520q0-125-88.5-202.5T480-800q-143 0-231.5 77.5T160-520q0 37 11.35 71.45 11.35 34.46 32.5 63Q225-357 254.5-335.5 284-314 320-302v142Zm110-200h100l-50-100-50 100Zm-89.82-100q24.82 0 42.32-17.68 17.5-17.67 17.5-42.5 0-24.82-17.68-42.32-17.67-17.5-42.5-17.5-24.82 0-42.32 17.68-17.5 17.67-17.5 42.5 0 24.82 17.68 42.32 17.67 17.5 42.5 17.5Zm280 0q24.82 0 42.32-17.68 17.5-17.67 17.5-42.5 0-24.82-17.68-42.32-17.67-17.5-42.5-17.5-24.82 0-42.32 17.68-17.5 17.67-17.5 42.5 0 24.82 17.68 42.32 17.67 17.5 42.5 17.5ZM480-160Z"/></svg>`;
const _tagObject = new CSS2DObject(_tagEl);
_tagObject.center.set(0.5, 0); // anchor bottom-centre of label to the attach point
let _tagCurrentEnemy = null;
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

  // Stage 1 aim resolve — runs every frame so reticle hover and firing share
  // the exact same result. Resolves camera ray → enemy volume or fallback point.
  if (!state.paused) {
    resolveAimTarget();
  }

  // Reticle hover colour + enemy aim tag
  {
    const reticleEl = document.getElementById('target-reticle');
    const isEnemyHit = !state.paused && aimResult.type === 'enemy';

    if (reticleEl && reticleEl.style.display !== 'none') {
      reticleEl.classList.toggle('reticle-enemy-hover', isEnemyHit);
      reticleEl.classList.toggle('is-targeting-enemy', isEnemyHit);
    }

    // Attach / detach the red icon tag above the aimed-at enemy
    const targetEnemy = isEnemyHit ? aimResult.enemy : null;

    if (targetEnemy !== _tagCurrentEnemy) {
      // Remove from old enemy
      if (_tagCurrentEnemy && _tagCurrentEnemy.group) {
        _tagCurrentEnemy.group.remove(_tagObject);
      }
      _tagCurrentEnemy = targetEnemy;

      if (targetEnemy && targetEnemy.group) {
        // Position the tag above the enemy's visual top
        const topY = (targetEnemy.radius * 2 + targetEnemy.sizeMult * 1.2) + 0.45;
        _tagObject.position.set(0, topY, 0);
        targetEnemy.group.add(_tagObject);
        _tagEl.style.opacity = '1';
      } else {
        _tagEl.style.opacity = '0';
      }
    }
  }

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
