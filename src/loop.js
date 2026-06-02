// src/loop.js
import * as THREE from 'three';
import {
  renderer, scene, camera, labelRenderer,
  setActiveCamera, updateIsoCamera, updateThirdCamera, isThirdPersonCameraMode,
  getMoveForward, getMoveRight, updateCameraShake,
} from './renderer.js';
import { state } from './state.js';
import { updateSunPosition } from './lighting.js';
import { updateChunks, clampPositionToBuildArea } from './terrain.js';
import { playerGroup, updatePlayer, updateDashStreaks } from './player.js';
import { updateLaserProjectiles, resolveAimTarget, aimResult, syncWeaponAmmoHud } from './weapons.js';
import { updateEnemies, updateNpcTeamCombat, getEnemyMeshes, tagEnemy, getEnemies, getAllies } from './enemies.js';
import { updatePlacer } from './placer.js';
import { isEditorModeEnabled, updateEditorCamera, updateEditorPlacement } from './editor.js';
import { updateController } from './input.js';
import { updateBulletTimeAudioPitch, playBulletTimeActivationSounds } from './audio.js';

const clock = new THREE.Clock();
// ── Radar canvas ──────────────────────────────────────────────────────────────
const _radarCanvas = document.getElementById('radar-canvas');
const _radarCtx = _radarCanvas ? _radarCanvas.getContext('2d') : null;

// Tag icon path for canvas (from tag.svg, viewBox 0 -960 960 960, upside-down triangle)
// Pre-built as Path2D for performance. The SVG coords are in 960-unit space.
const _tagIconPath = new Path2D(
  'M228-212q-18 0-26-15.5t1-30.5l252-403q9-14 25-14t25 14l252 403q9 15 1 30.5T732-212H228Z'
);
// Centre of the SVG triangle in its own coordinate space
const _tagIconCx = 480, _tagIconCy = -431, _tagIconW = 504, _tagIconH = 438;

function drawTagIcon(ctx, x, y, iconSize, color) {
  const sc = iconSize / Math.max(_tagIconW, _tagIconH);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 4;
  ctx.translate(x, y);
  ctx.rotate(Math.PI);
  ctx.scale(sc, sc);
  ctx.translate(-_tagIconCx, -_tagIconCy);
  ctx.fillStyle = color;
  ctx.fill(_tagIconPath);
  ctx.restore();
}


function updateBulletTimeActiveIcon() {
  const el = document.getElementById('bullet-time-active-indicator');
  if (!el) return;
  const p = state.params;
  const active = state.slowTimer > 0;
  const enabled = p.hudVisible !== false
    && p.hudBulletTimeActiveIcon !== false
    && p.bulletTimeEnabled !== false
    && active;
  el.style.display = enabled ? 'block' : 'none';
  if (!enabled) return;
  const size = clamp(Number(p.hudBulletTimeActiveIconSize) || 42, 12, 128);
  const opacity = clamp(Number(p.hudBulletTimeActiveIconOpacity) || 1, 0, 1);
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  const asset = new URL('../assets/time.svg', import.meta.url).href;
  if (el.dataset.btActiveAsset !== asset) {
    el.dataset.btActiveAsset = asset;
    el.style.webkitMaskImage = `url("${asset}")`;
    el.style.maskImage = `url("${asset}")`;
  }
  el.style.opacity = String(opacity);
}

function updateBulletTimeIndicator() {
  const el = document.getElementById('bullet-time-indicator');
  const p = state.params;
  if (el) {
    const enabled = p.hudVisible !== false && p.hudBulletTimeIndicator !== false && p.bulletTimeEnabled !== false;
    el.style.display = enabled ? '' : 'none';
    if (enabled) {
      const ready = state.slowTimer > 0 || state.slowCooldown <= 0;
      const size = clamp(Number(p.hudBulletTimeIndicatorSize) || 24, 8, 64);
      const readyOpacity = clamp(Number(p.hudBulletTimeReadyOpacity) || 1, 0, 1);
      const emptyOpacity = clamp(Number(p.hudBulletTimeEmptyOpacity) || 0.5, 0, 1);
      const asset = ready
        ? new URL('../assets/bt1.svg', import.meta.url).href
        : new URL('../assets/bt2.svg', import.meta.url).href;
      if (el.dataset.btAsset !== asset) {
        el.dataset.btAsset = asset;
        el.style.setProperty('--bt-icon-url', `url("${asset}")`);
        el.style.webkitMaskImage = `url("${asset}")`;
        el.style.maskImage = `url("${asset}")`;
      }
      el.style.background = 'currentColor';
      el.style.backgroundColor = 'currentColor';
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.opacity = String(ready ? readyOpacity : emptyOpacity);
    }
  }
  updateBulletTimeActiveIcon();
}

function updateRadar() {
  if (!_radarCtx || !_radarCanvas) return;
  const p = state.params;
  const enabled = p.radarEnabled !== false;
  _radarCanvas.style.display = enabled ? 'block' : 'none';
  if (!enabled) return;

  const radius = Math.max(20, Number(p.radarRadius) || 90);
  const range  = Math.max(1,  Number(p.radarRange)  || 60);
  const size   = radius * 2;
  const opacity    = Math.max(0, Math.min(1, Number(p.radarOpacity) ?? 0.82));
  const bgColor    = p.radarBgColor      || '#0a1628';
  const enemyColor = p.radarEnemyColor   || '#ff3030';
  const allyColor  = '#35ff00';
  const tagColor   = p.radarTaggedColor  || '#ffee44';

  // Resize canvas if needed
  if (_radarCanvas.width !== size || _radarCanvas.height !== size) {
    _radarCanvas.width  = size;
    _radarCanvas.height = size;
    _radarCanvas.style.width  = `${size}px`;
    _radarCanvas.style.height = `${size}px`;
    _radarCanvas.style.borderRadius = '0px';
    document.documentElement.style.setProperty('--radar-size', `${size}px`);
  }

  const ctx = _radarCtx;
  ctx.clearRect(0, 0, size, size);
  ctx.globalAlpha = opacity;

  // Clip to square radar bounds
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.clip();

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);

  // Player dot (centre) — no rings or crosshairs
  ctx.fillStyle = '#4daaff';
  ctx.beginPath();
  ctx.arc(radius, radius, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Camera-relative radar transform. The third-person camera/player forward
  // vector is (-sin(yaw), -cos(yaw)); projecting blips onto the matching
  // forward/right basis keeps targets in front of the camera at the top of the
  // radar instead of mirrored/upside-down.
  const camAzimuth = Number(state.params.thirdAzimuth) || 0;
  const px = playerGroup.position.x;
  const pz = playerGroup.position.z;
  const forwardX = -Math.sin(camAzimuth);
  const forwardZ = -Math.cos(camAzimuth);
  const rightX = Math.cos(camAzimuth);
  const rightZ = -Math.sin(camAzimuth);

  const projectRadarPoint = (worldX, worldZ) => {
    const dx = worldX - px;
    const dz = worldZ - pz;
    const dist = Math.hypot(dx, dz);
    if (dist > range) return null;
    const localRight = dx * rightX + dz * rightZ;
    const localForward = dx * forwardX + dz * forwardZ;
    const scale = (radius - 6) / range;
    return { x: radius + localRight * scale, y: radius - localForward * scale };
  };

  for (const enemy of getEnemies()) {
    if (!enemy || !enemy.group) continue;
    const point = projectRadarPoint(enemy.group.position.x, enemy.group.position.z);
    if (!point) continue;

    if (enemy.tagged) {
      // Tagged: draw the tag icon (upside-down triangle pointing at enemy)
      drawTagIcon(ctx, point.x, point.y, 10, tagColor);
    } else {
      // Untagged: simple red blip with shadow for legibility
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = enemyColor;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  for (const ally of getAllies()) {
    if (!ally || !ally.group) continue;
    const point = projectRadarPoint(ally.group.position.x, ally.group.position.z);
    if (!point) continue;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = allyColor;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
      playBulletTimeActivationSounds();
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

  const editorActive = isEditorModeEnabled();
  if (editorActive) {
    updateEditorCamera(delta);
  } else if (isThirdPersonCameraMode(state.params.cameraMode)) {
    updateThirdCamera(playerGroup.position, delta);
  } else {
    updateIsoCamera(playerGroup.position);
  }

  const worldFocus = editorActive ? camera.position : playerGroup.position;
  updateChunks(worldFocus);
  updateSunPosition(worldFocus);

  // Poll controller every frame (including paused — Options button must work).
  updateController(delta);
  updateRadar();
  syncWeaponAmmoHud();
  updateBulletTimeAudioPitch();
  updateBulletTimeIndicator();
  updatePlacer(delta);
  updateEditorPlacement(delta);

  if (editorActive) {
    state.isAiming = false;

    // Landscape Editor is a live test-editing mode. The sidebar intentionally
    // keeps the general game paused while it is open, but team combat still has
    // to run here so placed allies/enemies can be tested immediately inside the
    // editor. Plain Editor Mode remains a paused placement camera.
    if (state.params.landscapeEditorModeEnabled === true) {
      const worldDelta = delta * (Number(state.worldScale) || 1);
      updateNpcTeamCombat(worldDelta, _elapsed);
      [...getEnemies(), ...getAllies()].forEach(npc => {
        if (npc?.group?.position) clampPositionToBuildArea(npc.group.position, npc.radius || 0.4);
      });
    }

    updateCameraShake(delta);
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    return;
  }

  // Stage 1 aim resolve — runs every frame so reticle hover and firing share
  // the exact same result. Resolves camera ray → enemy volume or fallback point.
  if (!state.paused) {
    resolveAimTarget();
  }

  // Reticle hover colour + MGSV dwell tagging
  {
    const reticleEl = document.getElementById('target-reticle');
    const isEnemyHit = !state.paused && aimResult.type === 'enemy' && !aimResult.enemy?.isAlly;
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
    // Sidebar-open player mode is paused for the player/camera, but ally-vs-enemy
    // combat should still be testable from the panel. Run team combat only here
    // so NPC factions engage each other without enemies damaging or chasing the
    // paused player.
    const worldDelta = delta * (Number(state.worldScale) || 1);
    updateNpcTeamCombat(worldDelta, _elapsed);
    [...getEnemies(), ...getAllies()].forEach(npc => {
      if (npc?.group?.position) clampPositionToBuildArea(npc.group.position, npc.radius || 0.4);
    });
    state.primaryFire = false;
    state.secondaryFire = false;
    updateCameraShake(delta);
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    return;
  }

  updateTimeSlow(delta);
  updateBulletTimeAudioPitch();
  updateBulletTimeIndicator();
  updatePlayer(delta, getMoveForward(), getMoveRight(), aimResult.point);
  clampPositionToBuildArea(playerGroup.position, Number(state.params.playerRadius) || 0.4);
  updateDashStreaks(delta);

  const worldDelta = delta * state.worldScale;
  updateEnemies(worldDelta, _elapsed);
  [...getEnemies(), ...getAllies()].forEach(npc => {
    if (npc?.group?.position) clampPositionToBuildArea(npc.group.position, npc.radius || 0.4);
  });
  if ((state.activeSlot ?? 0) === 0) {
    updateLaserProjectiles(delta, worldDelta);
  }

  updateCameraShake(delta);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
