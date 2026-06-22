// src/loop.js
import * as THREE from 'three';
import {
  renderer, scene, camera, labelRenderer,
  setActiveCamera, updateIsoCamera, updateThirdCamera, isThirdPersonCameraMode,
  getMoveForward, getMoveRight, updateCameraShake,
} from './renderer.js';
import { state, ensureBulletTimeAmount, getBulletTimeMaxAmount, getBulletTimeFraction } from './state.js';
import { updateSunPosition } from './lighting.js';
import { updateChunks, clampPositionToBuildArea } from './terrain.js';
import { playerGroup, updatePlayer, updateDashStreaks } from './player.js';
import { updateLaserProjectiles, resolveAimTarget, aimResult, syncWeaponAmmoHud } from './weapons.js';
import { updateEnemies, updateNpcTeamCombat, getEnemyMeshes, tagEnemy, getEnemies, getAllies, getActiveNpcs, updatePlayerDeath, updatePlayerSpawnInvincibility, spawnZoneReinforcements } from './enemies.js';
import { updatePlacer } from './placer.js';
import { isEditorModeEnabled, updateEditorCamera, updateEditorPlacement } from './editor.js';
import { updateController } from './input.js';
import { updateBulletTimeAudioPitch, playBulletTimeActivationSounds, playBulletTimeEndSound } from './audio.js';
import { updateZones } from './zones.js';

const clock = new THREE.Clock();
// ── Radar canvas ──────────────────────────────────────────────────────────────
const _radarCanvas = document.getElementById('radar-canvas');
const _radarCtx = _radarCanvas ? _radarCanvas.getContext('2d') : null;
const _fpsEl = document.getElementById('fps-val');
const _reticleEl = document.getElementById('target-reticle');
const _bulletTimeIndicatorEl = document.getElementById('bullet-time-indicator');
const _bulletTimeMeterEl = document.getElementById('bullet-time-meter');
const _bulletTimeMeterFillEl = _bulletTimeMeterEl?.querySelector('[data-hud-fill="bullet-time"]') || null;
const _bulletTimeActiveIndicatorEl = document.getElementById('bullet-time-active-indicator');
const _killScreenOverlay = document.getElementById('kill-screen-overlay');
const _killScreenText = document.querySelector('[data-kill-screen-text]');

// Tag icon path for canvas (from tag.svg, viewBox 0 -960 960 960, upside-down triangle)
// Pre-built as Path2D for performance. The SVG coords are in 960-unit space.
const _tagIconPath = new Path2D(
  'M228-212q-18 0-26-15.5t1-30.5l252-403q9-14 25-14t25 14l252 403q9 15 1 30.5T732-212H228Z'
);
// Centre of the SVG triangle in its own coordinate space
const _tagIconCx = 480, _tagIconCy = -431, _tagIconW = 504, _tagIconH = 438;
const _radarPoint = { x: 0, y: 0 };

function projectRadarPoint(worldX, worldZ, px, pz, rightX, rightZ, forwardX, forwardZ, radius, range, out = _radarPoint) {
  const dx = worldX - px;
  const dz = worldZ - pz;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq > range * range) return null;
  const localRight = dx * rightX + dz * rightZ;
  const localForward = dx * forwardX + dz * forwardZ;
  const scale = (radius - 6) / range;
  out.x = radius + localRight * scale;
  out.y = radius - localForward * scale;
  return out;
}

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


function getCssPixelVar(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function resetInlineHud2Position(el) {
  el.style.position = '';
  el.style.left = '';
  el.style.right = '';
  el.style.top = '';
  el.style.bottom = '';
  el.style.margin = '';
}

function positionHud2BulletTimeIndicator(el, size) {
  const p = state.params;
  const radarSize = Math.max(40, (Math.max(20, Number(p.radarRadius) || 90)) * 2);
  const left = getCssPixelVar('--hud-anchor-left', 22) + radarSize + 12;
  const bottom = getCssPixelVar('--hud-anchor-bottom', 28)
    + getCssPixelVar('--hud2-bars-height', 42)
    + Math.max(0, (radarSize - size) / 2);
  el.style.position = 'fixed';
  el.style.left = `${left}px`;
  el.style.right = 'auto';
  el.style.top = 'auto';
  el.style.bottom = `${bottom}px`;
  el.style.margin = '0';
}

function updateBulletTimeActiveIcon() {
  const el = _bulletTimeActiveIndicatorEl;
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
  const el = _bulletTimeIndicatorEl;
  const meter = _bulletTimeMeterEl;
  const meterFill = _bulletTimeMeterFillEl;
  const p = state.params;
  const enabled = p.hudVisible !== false && p.hudBulletTimeIndicator !== false && p.bulletTimeEnabled !== false;
  const hud2 = p.hudLayout === 'hud2';
  const amount = ensureBulletTimeAmount();
  const ready = state.slowTimer > 0 || amount > 0.01;

  if (el) {
    el.style.display = enabled && !hud2 ? '' : 'none';
    if (enabled && !hud2) {
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
      resetInlineHud2Position(el);
    }
  }

  if (meter) {
    meter.style.display = enabled && hud2 ? 'block' : 'none';
    if (enabled && hud2 && meterFill) {
      meterFill.style.height = `${getBulletTimeFraction() * 100}%`;
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

  for (const enemy of getEnemies()) {
    if (!enemy || !enemy.group) continue;
    const point = projectRadarPoint(enemy.group.position.x, enemy.group.position.z, px, pz, rightX, rightZ, forwardX, forwardZ, radius, range);
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
    const point = projectRadarPoint(ally.group.position.x, ally.group.position.z, px, pz, rightX, rightZ, forwardX, forwardZ, radius, range);
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

const FPS_UPDATE_INTERVAL = 0.25;
const RADAR_UPDATE_INTERVAL = 1 / 30;
const LABEL_UPDATE_INTERVAL = 1 / 30;
const HUD_UPDATE_INTERVAL = 1 / 30;
const SHADOW_UPDATE_INTERVAL = 1 / 30;
const ZONE_UPDATE_INTERVAL = 0.1;
let _fpsUpdateAccumulator = FPS_UPDATE_INTERVAL;
let _radarUpdateAccumulator = RADAR_UPDATE_INTERVAL;
let _labelUpdateAccumulator = LABEL_UPDATE_INTERVAL;
let _hudUpdateAccumulator = HUD_UPDATE_INTERVAL;
let _shadowUpdateAccumulator = SHADOW_UPDATE_INTERVAL;
let _zoneUpdateAccumulator = ZONE_UPDATE_INTERVAL;
const _loopNpcBuffer = [];
let _killScreenRuntimeKey = '';

let _elapsed = 0;

const TIME_SLOW_CONFIG = Object.freeze({
  snapRate: 14.0,
  recoverRate: 5.0,
});

const KILL_SCREEN_FONT_STYLES = Object.freeze({
  system: { family: "'Segoe UI', system-ui, sans-serif", weight: 800, stretch: 'normal', letterSpacing: '0.24em' },
  juraBold: { family: "'Jura', 'Segoe UI', system-ui, sans-serif", weight: 700, stretch: 'normal', letterSpacing: '0.2em' },
  juraMedium: { family: "'Jura', 'Segoe UI', system-ui, sans-serif", weight: 500, stretch: 'normal', letterSpacing: '0.2em' },
  juraLight: { family: "'Jura', 'Segoe UI', system-ui, sans-serif", weight: 300, stretch: 'normal', letterSpacing: '0.2em' },
  michroma: { family: "'Michroma', 'Segoe UI', system-ui, sans-serif", weight: 400, stretch: 'normal', letterSpacing: '0.12em' },
  eurostile: { family: "'Eurostile', 'Segoe UI', system-ui, sans-serif", weight: 700, stretch: 'expanded', letterSpacing: '0.16em' },
  rodinDb: { family: "'FOT-Rodin Pro DB', 'Segoe UI', system-ui, sans-serif", weight: 700, stretch: 'normal', letterSpacing: '0.12em' },
  microgrammaExtendedBold: { family: "'Microgramma D Extended Bold', 'Eurostile', 'Segoe UI', system-ui, sans-serif", weight: 800, stretch: 'expanded', letterSpacing: '0.18em' },
  square721TlBoldExtended: { family: "'Square 721 TL Bold Extended', 'Eurostile', 'Segoe UI', system-ui, sans-serif", weight: 800, stretch: 'expanded', letterSpacing: '0.16em' },
  square721ExtendedBold: { family: "'Square 721 Extended Bold', 'Eurostile', 'Segoe UI', system-ui, sans-serif", weight: 800, stretch: 'expanded', letterSpacing: '0.16em' },
});

function getKillScreenFontStyle() {
  const key = Object.prototype.hasOwnProperty.call(KILL_SCREEN_FONT_STYLES, state.params.killScreenFont)
    ? state.params.killScreenFont
    : 'michroma';
  return { key, style: KILL_SCREEN_FONT_STYLES[key] || KILL_SCREEN_FONT_STYLES.system };
}


function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateFpsCounter(rawDelta, delta) {
  _fpsEMA = _fpsEMA * 0.9 + (1 / Math.max(rawDelta, 0.001)) * 0.1;
  _fpsUpdateAccumulator += delta;
  if (_fpsEl && _fpsUpdateAccumulator >= FPS_UPDATE_INTERVAL) {
    _fpsEl.textContent = Math.round(_fpsEMA);
    _fpsUpdateAccumulator %= FPS_UPDATE_INTERVAL;
  }
}

function updateRadarIfDue(delta) {
  _radarUpdateAccumulator += delta;
  if (_radarUpdateAccumulator < RADAR_UPDATE_INTERVAL) return;
  _radarUpdateAccumulator %= RADAR_UPDATE_INTERVAL;
  updateRadar();
}

function updateHudIfDue(delta) {
  _hudUpdateAccumulator += delta;
  if (_hudUpdateAccumulator < HUD_UPDATE_INTERVAL) return;
  _hudUpdateAccumulator %= HUD_UPDATE_INTERVAL;
  syncWeaponAmmoHud();
  updateBulletTimeIndicator();
}

function updateZonesAndNpcBounds(delta) {
  const npcs = getActiveNpcs(_loopNpcBuffer);
  _zoneUpdateAccumulator += Math.max(0, delta);
  if (_zoneUpdateAccumulator >= ZONE_UPDATE_INTERVAL) {
    _zoneUpdateAccumulator %= ZONE_UPDATE_INTERVAL;
    updateZones(npcs, {
      spawnReinforcements: spawnZoneReinforcements,
      playerGroup,
    });
  }

  if (state.params.buildAreaBoundaryCollision === true) {
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      if (npc?.group?.position) clampPositionToBuildArea(npc.group.position, npc.radius || 0.4);
    }
  }
}

function renderFrame(delta) {
  _shadowUpdateAccumulator += delta;
  if (renderer.shadowMap.enabled && _shadowUpdateAccumulator >= SHADOW_UPDATE_INTERVAL) {
    renderer.shadowMap.needsUpdate = true;
    _shadowUpdateAccumulator %= SHADOW_UPDATE_INTERVAL;
  }

  renderer.render(scene, camera);

  _labelUpdateAccumulator += delta;
  if (_labelUpdateAccumulator >= LABEL_UPDATE_INTERVAL) {
    labelRenderer.render(scene, camera);
    _labelUpdateAccumulator %= LABEL_UPDATE_INTERVAL;
  }
}

function syncKillScreenRuntime() {
  const dead = state.playerDead === true;
  const enabled = state.params.killScreenEnabled !== false;
  const killScreenTimeLeft = Number(state.killScreenTimer);
  const active = dead && enabled && Number.isFinite(killScreenTimeLeft) && killScreenTimeLeft > 0;
  const bulletTimeActive = state.params.bulletTimeEnabled !== false && state.slowTimer > 0;
  const rawSaturation = Number(state.params.killScreenSaturation);
  const rawBulletTimeSaturation = Number(state.params.bulletTimeSaturation);
  const rawTextSize = Number(state.params.killScreenTextSize);
  const rawTextOpacity = Number(state.params.killScreenTextOpacity);
  const rawTextOffsetX = Number(state.params.killScreenTextOffsetX);
  const rawTextOffsetY = Number(state.params.killScreenTextOffsetY);
  const saturation = clamp(Number.isFinite(rawSaturation) ? rawSaturation : 0.15, 0, 1);
  const bulletTimeSaturation = clamp(Number.isFinite(rawBulletTimeSaturation) ? rawBulletTimeSaturation : 0.5, 0, 1);
  const displaySaturation = active
    ? saturation
    : (bulletTimeActive ? bulletTimeSaturation : 1);
  const displaySaturationActive = active || bulletTimeActive;
  const textSize = clamp(Number.isFinite(rawTextSize) ? rawTextSize : 42, 12, 160);
  const textOpacity = clamp(Number.isFinite(rawTextOpacity) ? rawTextOpacity : 0.9, 0, 1);
  const textOffsetX = clamp(Number.isFinite(rawTextOffsetX) ? rawTextOffsetX : 0, -600, 600);
  const textOffsetY = clamp(Number.isFinite(rawTextOffsetY) ? rawTextOffsetY : 0, -400, 400);
  const textColor = /^#[0-9a-f]{6}$/i.test(String(state.params.killScreenTextColor || ''))
    ? state.params.killScreenTextColor
    : '#ffffff';
  const text = String(state.params.killScreenText ?? 'PLAYER KILLED');
  const { key: killScreenFontKey, style: killScreenFont } = getKillScreenFontStyle();
  const runtimeKey = [
    dead, enabled, active, bulletTimeActive, saturation, bulletTimeSaturation,
    textSize, textOpacity, textOffsetX, textOffsetY, textColor, text,
    killScreenFontKey,
  ].join('|');
  if (runtimeKey === _killScreenRuntimeKey) return;
  _killScreenRuntimeKey = runtimeKey;

  if (dead) document.body.setAttribute('data-player-dead', 'true');
  else document.body.removeAttribute('data-player-dead');
  document.body.setAttribute('data-kill-screen-active', active ? 'true' : 'false');
  document.body.style.setProperty('--kill-screen-saturation', String(saturation));
  document.documentElement.style.setProperty('--kill-screen-saturation', String(saturation));
  document.body.style.setProperty('--bullet-time-saturation', String(bulletTimeSaturation));
  document.documentElement.style.setProperty('--bullet-time-saturation', String(bulletTimeSaturation));

  const rendererFilter = displaySaturationActive ? `saturate(${displaySaturation})` : '';
  const rendererFilterPriority = displaySaturationActive ? 'important' : '';
  if (renderer?.domElement) renderer.domElement.style.setProperty('filter', rendererFilter, rendererFilterPriority);
  if (labelRenderer?.domElement) labelRenderer.domElement.style.setProperty('filter', rendererFilter, rendererFilterPriority);

  const overlay = _killScreenOverlay;
  if (overlay) {
    overlay.classList.toggle('kill-screen-enabled', enabled);
    overlay.dataset.killScreenActive = active ? 'true' : 'false';
    overlay.setAttribute('aria-hidden', active ? 'false' : 'true');
    overlay.style.setProperty('--kill-screen-saturation', String(saturation));
    overlay.style.setProperty('--kill-screen-text-size', `${textSize}px`);
    overlay.style.setProperty('--kill-screen-text-color', textColor);
    overlay.style.setProperty('--kill-screen-text-opacity', String(textOpacity));
    overlay.style.setProperty('--kill-screen-text-offset-x', `${textOffsetX}px`);
    overlay.style.setProperty('--kill-screen-text-offset-y', `${textOffsetY}px`);
    overlay.dataset.killScreenFont = killScreenFontKey;
    overlay.style.fontFamily = killScreenFont.family;
    overlay.style.fontWeight = String(killScreenFont.weight || 800);
    overlay.style.fontStretch = killScreenFont.stretch || 'normal';
    overlay.style.letterSpacing = killScreenFont.letterSpacing || '0.18em';
    overlay.style.setProperty('display', active ? 'flex' : 'none', 'important');
    overlay.style.setProperty('visibility', active ? 'visible' : 'hidden', 'important');
    overlay.style.setProperty('opacity', active ? '1' : '0', 'important');
    overlay.style.setProperty('pointer-events', 'none');
  }

  const textEl = _killScreenText;
  if (textEl) {
    textEl.textContent = text;
    textEl.style.setProperty('display', active ? 'block' : 'none', 'important');
    textEl.style.setProperty('visibility', active ? 'visible' : 'hidden', 'important');
    textEl.style.setProperty('opacity', String(textOpacity), 'important');
    textEl.style.setProperty('transform', `translate(${textOffsetX}px, ${textOffsetY}px)`, 'important');
    textEl.style.fontFamily = killScreenFont.family;
    textEl.style.fontWeight = String(killScreenFont.weight || 800);
    textEl.style.fontStretch = killScreenFont.stretch || 'normal';
    textEl.style.letterSpacing = killScreenFont.letterSpacing || '0.18em';
  }
}

function getTargetWorldScale() {
  if (state.playerDead) {
    const killScreenActive = state.params.killScreenEnabled !== false && Number(state.killScreenTimer) > 0;
    return killScreenActive ? clamp(Number(state.params.killScreenWorldScale) || 0.25, 0.05, 1.0) : 1.0;
  }
  if (!state.params.bulletTimeEnabled) return 1.0;
  return state.slowTimer > 0 ? clamp(Number(state.slowScale) || 0.35, 0.05, 1.0) : 1.0;
}

function updateTimeSlow(delta) {
  updatePlayerSpawnInvincibility(delta);
  const wasBulletTimeActive = state.slowTimer > 0;
  const p = state.params;
  const maxAmount = getBulletTimeMaxAmount();
  let amount = ensureBulletTimeAmount();

  state.slowCooldown = Math.max(0, state.slowCooldown - delta);

  if (state.slowStopRequested) {
    state.slowStopRequested = false;
    state.slowTimer = 0;
  }

  if (state.slowRequested) {
    state.slowRequested = false;

    if (p.bulletTimeEnabled !== false && state.slowTimer <= 0 && state.slowCooldown <= 0 && amount > 0.01) {
      state.slowScale = clamp(Number(p.bulletTimeScale) || 0.35, 0.05, 1.0);
      state.slowTimer = amount;
      playBulletTimeActivationSounds();
    }
  }

  if (p.bulletTimeEnabled !== false && state.slowTimer > 0) {
    amount = Math.max(0, amount - Math.max(0, delta));
    state.bulletTimeAmount = amount;
    state.slowTimer = amount;
    if (amount <= 0) {
      state.slowTimer = 0;
      state.slowCooldown = Math.max(state.slowCooldown, clamp(Number(p.bulletTimeCooldown) || 0, 0, 120));
    }
  } else {
    const replenishRate = clamp(Number(p.bulletTimeReplenishRate) || 0, 0, 120);
    if (maxAmount > 0 && replenishRate > 0) {
      state.bulletTimeAmount = Math.min(maxAmount, amount + replenishRate * Math.max(0, delta));
    }
    state.slowTimer = 0;
  }

  const targetScale = getTargetWorldScale();
  const rate = targetScale < state.worldScale
    ? TIME_SLOW_CONFIG.snapRate
    : TIME_SLOW_CONFIG.recoverRate;

  state.worldScale += (targetScale - state.worldScale) * Math.min(1, rate * delta);
  if (wasBulletTimeActive && state.slowTimer <= 0) playBulletTimeEndSound();
}

export function tick() {
  requestAnimationFrame(tick);

  // Cap at 50ms — without this, tabbing away and back causes a single enormous
  // delta that teleports the player and breaks dash timers.
  const rawDelta = clock.getDelta();
  const delta    = Math.min(rawDelta, 0.05);
  _elapsed += delta;

  // FPS sampling stays per-frame, while the DOM counter updates at 4 Hz.
  updateFpsCounter(rawDelta, delta);

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
  updateRadarIfDue(delta);
  updateHudIfDue(delta);
  updateBulletTimeAudioPitch();
  syncKillScreenRuntime();
  updatePlacer(delta);
  updateEditorPlacement(delta);

  if (editorActive) {
    state.isAiming = false;

    // Landscape Editor can live-preview NPC combat only when the game is not
    // paused. When the pause/sidebar state is active, allies and enemies must
    // stop just like the player and camera. Plain Editor Mode remains a paused
    // placement camera.
    if (!state.paused && state.params.landscapeEditorModeEnabled === true) {
      const worldDelta = delta * (Number(state.worldScale) || 1);
      updateNpcTeamCombat(worldDelta, _elapsed);
      updateZonesAndNpcBounds(delta);
    }

    updateCameraShake(delta);
    renderFrame(delta);
    return;
  }

  // Stage 1 aim resolve — runs every frame so reticle hover and firing share
  // the exact same result. Resolves camera ray → enemy volume or fallback point.
  if (!state.paused) {
    resolveAimTarget();
  }

  // Reticle hover colour + MGSV dwell tagging
  {
    const reticleEl = _reticleEl;
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
    // Pause means all actors pause. Do not advance ally/enemy movement, burst
    // timers, projectiles, shockwaves, or corpse/destruction effects while the
    // game is paused.
    state.primaryFire = false;
    state.secondaryFire = false;
    updateCameraShake(delta);
    renderFrame(delta);
    return;
  }

  updateTimeSlow(delta);
  syncKillScreenRuntime();
  updateBulletTimeAudioPitch();
  updateBulletTimeIndicator();
  if (state.playerDead) {
    state.primaryFire = false;
    state.secondaryFire = false;
    state.isAiming = false;
    updatePlayerDeath(delta);
  } else {
    updatePlayer(delta, getMoveForward(), getMoveRight(), aimResult.point);
    clampPositionToBuildArea(playerGroup.position, Number(state.params.playerRadius) || 0.4);
    updateDashStreaks(delta);
  }

  const worldDelta = delta * state.worldScale;
  updateEnemies(worldDelta, _elapsed);
  updateZonesAndNpcBounds(delta);
  if ((state.activeSlot ?? 0) === 0) {
    updateLaserProjectiles(delta, worldDelta);
  }

  updateCameraShake(delta);
  renderFrame(delta);
}
