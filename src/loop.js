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
import { updateLaserProjectiles, resolveAimTarget, aimResult } from './weapons.js';
import { updateEnemies, getEnemyMeshes, tagEnemy, getEnemies } from './enemies.js';
import { updateController } from './input.js';

const clock = new THREE.Clock();
// ── Radar canvas ──────────────────────────────────────────────────────────────
const _radarCanvas = document.getElementById('radar-canvas');
const _radarCtx = _radarCanvas ? _radarCanvas.getContext('2d') : null;

function updateRadar() {
  if (!_radarCtx || !_radarCanvas) return;
  const p = state.params;
  const enabled = p.radarEnabled !== false;
  _radarCanvas.style.display = enabled ? 'block' : 'none';
  if (!enabled) return;

  const radius = Math.max(20, Number(p.radarRadius) || 60);
  const range  = Math.max(1,  Number(p.radarRange)  || 60);
  const size   = radius * 2;
  const opacity = Math.max(0, Math.min(1, Number(p.radarOpacity) ?? 0.82));
  const bgColor     = p.radarBgColor     || '#0a1628';
  const enemyColor  = p.radarEnemyColor  || '#ff3030';

  // Resize canvas if needed
  if (_radarCanvas.width !== size || _radarCanvas.height !== size) {
    _radarCanvas.width  = size;
    _radarCanvas.height = size;
    _radarCanvas.style.width  = `${size}px`;
    _radarCanvas.style.height = `${size}px`;
    _radarCanvas.style.borderRadius = '50%';
  }

  const ctx = _radarCtx;
  ctx.clearRect(0, 0, size, size);
  ctx.globalAlpha = opacity;

  // Clip to circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.clip();

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);

  // Concentric rings
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let r = radius * 0.33; r < radius; r += radius * 0.33) {
    ctx.beginPath();
    ctx.arc(radius, radius, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Cross hairs
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(radius, 0); ctx.lineTo(radius, size);
  ctx.moveTo(0, radius); ctx.lineTo(size, radius);
  ctx.stroke();

  // Player dot (centre)
  ctx.fillStyle = '#4daaff';
  ctx.beginPath();
  ctx.arc(radius, radius, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Get camera yaw for rotation (north = camera forward)
  const camAzimuth = state.params.thirdAzimuth || 0;

  // Enemy dots
  const px = playerGroup.position.x;
  const pz = playerGroup.position.z;

  for (const enemy of getEnemies()) {
    if (!enemy || !enemy.group) continue;
    const dx = enemy.group.position.x - px;
    const dz = enemy.group.position.z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist > range) continue;

    // Rotate relative to camera azimuth so forward is always up
    const angle = Math.atan2(dx, dz) - camAzimuth;
    const scale = (dist / range) * (radius - 4);
    const ex = radius + Math.sin(angle) * scale;
    const ey = radius - Math.cos(angle) * scale;

    const dotR = enemy.tagged ? 4 : 2.5;
    ctx.fillStyle = enemy.tagged ? '#ffee44' : enemyColor;
    ctx.beginPath();
    ctx.arc(ex, ey, dotR, 0, Math.PI * 2);
    ctx.fill();

    // Ring for tagged enemies
    if (enemy.tagged) {
      ctx.strokeStyle = '#ffee44';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ex, ey, dotR + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

let _aimDwellEnemy = null;  // enemy currently being aimed at for tagging
let _aimDwellTimer = 0;     // accumulated aim-on-enemy time
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
  updateRadar();

  // Stage 1 aim resolve — runs every frame so reticle hover and firing share
  // the exact same result. Resolves camera ray → enemy volume or fallback point.
  if (!state.paused) {
    resolveAimTarget();
  }

  // Reticle hover colour + MGSV dwell tagging
  {
    const reticleEl = document.getElementById('target-reticle');
    const isEnemyHit = !state.paused && aimResult.type === 'enemy';
    if (reticleEl && reticleEl.style.display !== 'none') {
      reticleEl.classList.toggle('reticle-enemy-hover', isEnemyHit);
      reticleEl.classList.toggle('is-targeting-enemy', isEnemyHit);
    }

    // Dwell tagging: accumulate time while aiming at the same enemy.
    // Once the threshold is reached, permanently tag that enemy.
    const aimedEnemy = isEnemyHit ? aimResult.enemy : null;
    if (aimedEnemy && aimedEnemy === _aimDwellEnemy) {
      _aimDwellTimer += delta;
      if (_aimDwellTimer >= Math.max(0.1, Number(state.params.tagDwellTime) || 1.2)) {
        tagEnemy(aimedEnemy);
        _aimDwellTimer = 0; // reset so we don't repeatedly call tagEnemy
      }
    } else {
      // Reset timer whenever we switch targets or lose sight of an enemy
      _aimDwellEnemy = aimedEnemy;
      _aimDwellTimer = 0;
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
