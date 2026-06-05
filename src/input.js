// src/input.js
// Keyboard state is stored on state.keys so movement code can poll it every
// frame rather than reacting to events. Dash fires on keydown only.
// Controller support: browser Gamepad API, polled every frame via updateController().
import * as THREE from 'three';
import { state } from './state.js';
import { getMoveForward, getMoveRight, isThirdPersonCameraMode, renderer } from './renderer.js';
import { playDashSound } from './audio.js';
import { reloadCurrentWeapon, syncWeaponAmmoHud } from './weapons.js';
import { applyPlayerWeaponSettings } from './player.js';
import { ASSET_CATALOGUE } from './assets-catalogue.js';
import { isEditorModeEnabled, applyEditorMouseLookDelta } from './editor.js';
import { respawnPlayerAtFullHealth } from './enemies.js';

let _togglePanel = null;

export function initInput({ togglePanel }) {
  _togglePanel = togglePanel;
}

const _dv = new THREE.Vector3();
let _mouseDragActive = false;
let _lastMouseX = 0;
let _lastMouseY = 0;
let _adsHeldAtLockRequest = false; // tracks if right-click was held when pointer lock was requested

const WEAPON_WHEEL_ORDER = ['pistol', 'rifle', 'shotgun', 'sniperRifle', 'grenades', 'rocketLauncher'];
const WHEEL_CYCLE_ORDER = [...WEAPON_WHEEL_ORDER];

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
}

function normalizeYaw(yaw) {
  const tau = Math.PI * 2;
  return ((yaw % tau) + tau) % tau;
}

function snapYawToGridEdge(yaw) {
  const quarterTurn = Math.PI / 2;
  return normalizeYaw(Math.round((Number(yaw) || 0) / quarterTurn) * quarterTurn);
}

function isSidebarTarget(target) {
  return !!target?.closest?.('#sidebar');
}

function isViewportTarget(target) {
  if (!target) return false;
  if (isSidebarTarget(target) || isTypingTarget(target)) return false;
  return target === renderer.domElement || target === document.body || target === document.documentElement;
}

function isMouseLookEnabled() {
  return state.params.thirdMouseLook !== false;
}

function setPointerAimCenter() {
  state.pointerAimX = 0;
  state.pointerAimY = 0;
}

export function clearGameplayInput() {
  state.keys.w = false;
  state.keys.a = false;
  state.keys.s = false;
  state.keys.d = false;
  state.keys.space = false;
  state.keys.shift = false;
  state.keys.ctrl = false;
  state.keys.alt = false;
  state.primaryFire = false;
  state.secondaryFire = false;
  state.jumpQueued = false;
  state.jumpAirJumpsUsed = 0;
  state.isAiming = false;
  _mouseDragActive = false;
  // clear analogue controller axes
  state.controllerMoveX = 0;
  state.controllerMoveZ = 0;
}

function updatePointerAimFromClient(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  state.pointerAimX = ((clientX - rect.left) / rect.width) * 2 - 1;
  state.pointerAimY = -(((clientY - rect.top) / rect.height) * 2 - 1);
}

function canUseMouseLook(target) {
  return isViewportTarget(target)
    && (
      isEditorModeEnabled()
      || (isThirdPersonCameraMode(state.params.cameraMode) && isMouseLookEnabled())
    );
}

function applyMouseLookDelta(dx, dy) {
  if (applyEditorMouseLookDelta(dx, dy)) return;
  if (!isThirdPersonCameraMode(state.params.cameraMode) || !isMouseLookEnabled()) return;

  const sx = Number(state.params.thirdMouseSensitivityX) || 0.003;
  const sy = Number(state.params.thirdMouseSensitivityY) || 0.0024;
  state.params.thirdAzimuth = normalizeYaw((state.params.thirdAzimuth || 0) - dx * sx);
  state.params.thirdPitch = clamp((state.params.thirdPitch || 0) - dy * sy, -1.1, 1.1);
}

function requestMouseLook(target) {
  if (!canUseMouseLook(target)) return;
  if (document.pointerLockElement === renderer.domElement) return;
  _adsHeldAtLockRequest = state.isAiming;
  renderer.domElement.requestPointerLock?.();
}

function trySetPointerCapture(element, pointerId) {
  if (pointerId === undefined || !element?.setPointerCapture) return;
  try {
    element.setPointerCapture(pointerId);
  } catch (_) {
    // Some browsers can invalidate the active pointer before capture runs
    // during pointer lock / right-click input. Mouse look still works without
    // capture, so ignore the capture failure instead of breaking input setup.
  }
}

renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());

renderer.domElement.addEventListener('pointerdown', event => {
  if (state.paused && !isEditorModeEnabled()) {
    state.primaryFire = false;
    state.secondaryFire = false;
    return;
  }

  if (isViewportTarget(event.target)) {
    updatePointerAimFromClient(event.clientX, event.clientY);
  }

  const placerActive = isEditorModeEnabled() || (state.activeSlot ?? 0) === 1;

  if (event.button === 0 && isViewportTarget(event.target)) {
    if (placerActive && (event.ctrlKey || event.metaKey)) {
      state.primaryFire = false;
      state.placerSelectionRequest = { toggle: true, additive: true };
      event.preventDefault();
      return;
    }
    state.primaryFire = true;
  }

  // Right-click removes placed objects while the placer is active; otherwise it enters ADS.
  if (event.button === 2 && isViewportTarget(event.target)) {
    if (placerActive) {
      state.secondaryFire = true;
      state.isAiming = false;
    } else if (state.params.aimEnabled !== false) {
      state.isAiming = true;
    }
  }

  if (!canUseMouseLook(event.target)) return;
  if (event.button !== 0 && event.button !== 2) return;

  _mouseDragActive = true;
  _lastMouseX = event.clientX;
  _lastMouseY = event.clientY;
  state.mouseLookActive = true;
  document.body.classList.add('third-person-mouse-look');
  trySetPointerCapture(renderer.domElement, event.pointerId);
  requestMouseLook(event.target);
  event.preventDefault();
});

window.addEventListener('pointermove', event => {
  if (isViewportTarget(event.target) || _mouseDragActive) {
    updatePointerAimFromClient(event.clientX, event.clientY);
  }

  if (!_mouseDragActive || document.pointerLockElement === renderer.domElement) return;
  const dx = event.clientX - _lastMouseX;
  const dy = event.clientY - _lastMouseY;
  _lastMouseX = event.clientX;
  _lastMouseY = event.clientY;
  applyMouseLookDelta(dx, dy);
});

function stopMouseDrag(event) {
  // pointercancel fires when requestPointerLock() releases pointer capture.
  // The physical button is still held, so don't clear button state.
  if (event?.type === 'pointercancel') return;
  if (!event || event.button === 0) {
    state.primaryFire = false;
  }
  if (!event || event.button === 2) {
    state.isAiming = false;
    state.secondaryFire = false;
  }

  _mouseDragActive = false;
  try {
    if (event?.pointerId !== undefined) renderer.domElement.releasePointerCapture?.(event.pointerId);
  } catch (_) {
    // Pointer capture may already be released by the browser.
  }

  if (document.pointerLockElement !== renderer.domElement) {
    state.mouseLookActive = false;
    document.body.classList.remove('third-person-mouse-look');
  }
}

window.addEventListener('pointerup', stopMouseDrag);
window.addEventListener('pointercancel', stopMouseDrag);

// Pointer-lock path: after clicking the game view, raw mouse movement rotates the
// camera continuously, like a desktop third-person action shooter. ESC exits lock.
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked) {
    setPointerAimCenter();
    // Restore isAiming if right-click was held when pointer lock was requested.
    // pointercancel fires during lock acquisition and clears isAiming, even though
    // the physical button is still held.
    if (_adsHeldAtLockRequest && state.params.aimEnabled !== false) {
      state.isAiming = true;
    }
    _adsHeldAtLockRequest = false;
  }
  state.mouseLookActive = locked || _mouseDragActive;
  document.body.classList.toggle('third-person-mouse-look', state.mouseLookActive);
});

document.addEventListener('mousemove', event => {
  if (state.paused && !isEditorModeEnabled()) return;
  if (document.pointerLockElement !== renderer.domElement) return;
  setPointerAimCenter();
  applyMouseLookDelta(event.movementX || 0, event.movementY || 0);
});

document.addEventListener('mousedown', event => {
  if (state.paused && !isEditorModeEnabled()) return;
  if (document.pointerLockElement !== renderer.domElement) return;
  if (event.button === 0) {
    if ((isEditorModeEnabled() || (state.activeSlot ?? 0) === 1) && (event.ctrlKey || event.metaKey)) {
      state.primaryFire = false;
      state.placerSelectionRequest = { toggle: true, additive: true };
      event.preventDefault();
      return;
    }
    state.primaryFire = true;
  }
  if (event.button === 2) {
    if (isEditorModeEnabled() || (state.activeSlot ?? 0) === 1) {
      state.secondaryFire = true;
      state.isAiming = false;
    } else if (state.params.aimEnabled !== false) {
      state.isAiming = true;
    }
  }
});

document.addEventListener('mouseup', event => {
  if (event.button === 0) state.primaryFire = false;
  if (event.button === 2) {
    state.secondaryFire = false;
    state.isAiming = false;
  }
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement) {
    state.primaryFire = false;
    state.secondaryFire = false;
    state.isAiming = false;
  }
});


function togglePlacerAssetModal() {
  const modal = document.getElementById('placer-modal');
  if (!modal) return;

  const visible = modal.style.display !== 'none' && modal.style.display !== '';
  if (visible) {
    if (window.__closePlacerAssetModal) window.__closePlacerAssetModal();
    else modal.style.display = 'none';
    return;
  }

  state.primaryFire = false;
  state.secondaryFire = false;
  state.isAiming = false;
  document.exitPointerLock?.();
  document.body.classList.remove('third-person-mouse-look');
  if (window.__openPlacerAssetModal) window.__openPlacerAssetModal();
  else modal.style.display = 'flex';
}

function togglePlacerTransformModal() {
  const modal = document.getElementById('placer-transform-modal');
  if (!modal) return;

  const visible = modal.style.display !== 'none' && modal.style.display !== '';
  if (visible) {
    if (window.__closePlacerTransformModal) window.__closePlacerTransformModal();
    else modal.style.display = 'none';
    return;
  }

  state.primaryFire = false;
  state.secondaryFire = false;
  state.isAiming = false;
  document.exitPointerLock?.();
  document.body.classList.remove('third-person-mouse-look');
  if (window.__openPlacerTransformModal) window.__openPlacerTransformModal();
  else modal.style.display = 'flex';
}

window.addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); _togglePanel?.(); return; }
  if (e.key === 'Escape') { e.preventDefault(); _togglePanel?.(); return; }
  if (isTypingTarget(e.target)) return;

  if (state.paused && !isEditorModeEnabled()) return;

  const k = e.key.toLowerCase();
  const editorActive = isEditorModeEnabled();

  if (e.key === 'Shift') state.keys.shift = true;
  if (e.key === 'Control') state.keys.ctrl = true;
  if (e.key === 'Alt') state.keys.alt = true;

  if (editorActive || (state.activeSlot ?? 0) === 1) {
    if ((e.ctrlKey || e.metaKey) && k === 'a' && !e.repeat) {
      e.preventDefault();
      window.__selectAllPlacedObjects?.();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.repeat) {
      e.preventDefault();
      window.__deleteSelectedPlacedObjects?.();
      return;
    }
    if (k === 'c' && !e.repeat && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.__clearPlacedObjectSelection?.();
      return;
    }
  }

  if (k === 'w' || k === 'arrowup')    state.keys.w = true;
  if (k === 's' || k === 'arrowdown')  state.keys.s = true;
  if (k === 'a' || k === 'arrowleft')  state.keys.a = true;
  if (k === 'd' || k === 'arrowright') state.keys.d = true;

  if (editorActive && (k === 'q' || k === 'e') && !e.repeat) {
    e.preventDefault();
    if (state.params.editorPlacementTarget === 'playerSpawn') {
      const current = Number.isFinite(Number(state.params.editorPlayerSpawnYaw))
        ? Number(state.params.editorPlayerSpawnYaw)
        : (Number.isFinite(Number(state.params.playerSpawnYaw)) ? Number(state.params.playerSpawnYaw) : Number(state.params.editorYaw) || 0);
      const step = k === 'q' ? -Math.PI / 2 : Math.PI / 2;
      const next = snapYawToGridEdge(current + step);
      state.params.editorPlayerSpawnYaw = next;
      if (state.params.playerSpawnEnabled === true) state.params.playerSpawnYaw = next;
      return;
    }
    if (state.params.editorPlacementTarget === 'zone') {
      return;
    }
    if (state.params.editorPlacementTarget === 'enemySpawn' || state.params.editorPlacementTarget === 'allySpawn') {
      const ally = state.params.editorPlacementTarget === 'allySpawn';
      const editorYawKey = ally ? 'editorAllySpawnYaw' : 'editorEnemySpawnYaw';
      const spawnYawKey = ally ? 'allySpawnYaw' : 'enemySpawnYaw';
      const spawnEnabledKey = ally ? 'allySpawnEnabled' : 'enemySpawnEnabled';
      const current = Number.isFinite(Number(state.params[editorYawKey]))
        ? Number(state.params[editorYawKey])
        : (Number.isFinite(Number(state.params[spawnYawKey])) ? Number(state.params[spawnYawKey]) : Number(state.params.editorYaw) || 0);
      const step = k === 'q' ? -Math.PI / 2 : Math.PI / 2;
      const next = snapYawToGridEdge(current + step);
      state.params[editorYawKey] = next;
      if (state.params[spawnEnabledKey] === true) state.params[spawnYawKey] = next;
      return;
    }
    const current = Number(state.params.placerRotationDeg) || 0;
    const step = k === 'q' ? -90 : 90;
    state.params.placerRotationDeg = ((Math.round((current + step) / 90) * 90) % 360 + 360) % 360;
    state.placerRotation = THREE.MathUtils.degToRad(state.params.placerRotationDeg);
    return;
  }

  if (!editorActive && (e.key === '0' || e.code === 'Numpad0') && !e.repeat) {
    e.preventDefault();
    respawnPlayerAtFullHealth();
    return;
  }

  if (!editorActive && k === 'q' && state.params.bulletTimeEnabled !== false) {
    e.preventDefault();
    if (!e.repeat) {
      if (state.slowTimer > 0) state.slowStopRequested = true;
      else state.slowRequested = true;
    }
  }

  if (e.code === 'Space') {
    e.preventDefault();
    state.keys.space = true;
    if (!editorActive && !e.repeat && state.params.jumpEnabled) {
      state.jumpQueued = true;
    }
  }


  // F key → open asset picker modal (only when placer slot is active)
  if (k === 'f' && !e.repeat && (editorActive || (state.activeSlot ?? 0) === 1)) {
    e.preventDefault();
    togglePlacerAssetModal();
    return;
  }


  // R key → open transform modal for the current placer shape, or reload while using weapons.
  if (k === 'r' && !e.repeat) {
    e.preventDefault();
    if (editorActive || (state.activeSlot ?? 0) === 1) {
      togglePlacerTransformModal();
    } else {
      reloadCurrentWeapon();
    }
    return;
  }

  // V key → shoulder swap (flip lateral camera offset)
  if (k === 'v' && !e.repeat) {
    state.params.thirdOffsetX = -(state.params.thirdOffsetX || 1.25);
  }

  if (e.key === 'Shift') {
    e.preventDefault();
    state.keys.shift = true;
    if (editorActive) return;
    if (state.params.dashEnabled && !state.isAiming && state.dashCooldown <= 0 && state.dashTimer <= 0) {
      // Build direction from currently held keys + camera-relative vectors
      _dv.set(0, 0, 0);
      if (state.keys.w) _dv.addScaledVector(getMoveForward(),  1);
      if (state.keys.s) _dv.addScaledVector(getMoveForward(), -1);
      if (state.keys.a) _dv.addScaledVector(getMoveRight(),   -1);
      if (state.keys.d) _dv.addScaledVector(getMoveRight(),    1);

      // If no key held, fall back to last walk direction — dash always goes somewhere useful
      if (_dv.lengthSq() > 0) {
        _dv.normalize();
        state.lastMoveX = _dv.x;
        state.lastMoveZ = _dv.z;
      }

      state.dashVX       = state.lastMoveX;
      state.dashVZ       = state.lastMoveZ;
      state.dashTimer    = state.params.dashDuration;
      state.dashCooldown = state.params.dashCooldown;
      state.dashGhostTimer = 0;
      playDashSound();
    }
  }
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup')    state.keys.w = false;
  if (k === 's' || k === 'arrowdown')  state.keys.s = false;
  if (k === 'a' || k === 'arrowleft')  state.keys.a = false;
  if (k === 'd' || k === 'arrowright') state.keys.d = false;
  if (e.code === 'Space') state.keys.space = false;
  if (e.key === 'Shift') state.keys.shift = false;
  if (e.key === 'Control') state.keys.ctrl = false;
  if (e.key === 'Alt') state.keys.alt = false;
});

function getCurrentWheelItem() {
  return WEAPON_WHEEL_ORDER.includes(state.params.playerWeaponType)
    ? state.params.playerWeaponType
    : 'rifle';
}

function syncPlayerWeaponSelect() {
  const select = document.querySelector('[data-param-key="playerWeaponType"]');
  if (!select) return false;
  if (select.value !== state.params.playerWeaponType) {
    select.value = state.params.playerWeaponType;
  }
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function cycleWheelItem(direction) {
  const current = getCurrentWheelItem();
  const currentIndex = Math.max(0, WHEEL_CYCLE_ORDER.indexOf(current));
  const nextIndex = (currentIndex + direction + WHEEL_CYCLE_ORDER.length) % WHEEL_CYCLE_ORDER.length;
  const next = WHEEL_CYCLE_ORDER[nextIndex];

  state.isAiming = false;
  state.secondaryFire = false;

  state.activeSlot = 0;
  state.params.playerWeaponType = next;
  if (!syncPlayerWeaponSelect()) {
    applyPlayerWeaponSettings();
    syncWeaponAmmoHud();
  }
}

function syncPlacerAssetSelect() {
  const select = document.querySelector('[data-param-key="placerSelectedAsset"]');
  if (select) select.value = state.params.placerSelectedAsset;
}

function cyclePlacerAsset(direction) {
  const ids = ASSET_CATALOGUE.map(asset => asset.id);
  if (!ids.length) return;
  const current = ids.includes(state.params.placerSelectedAsset) ? state.params.placerSelectedAsset : ids[0];
  const currentIndex = ids.indexOf(current);
  const nextIndex = (currentIndex + direction + ids.length) % ids.length;
  state.params.placerSelectedAsset = ids[nextIndex];
  syncPlacerAssetSelect();
}

// ── Scroll wheel → cycle player weapons only ─────────────────────────────────
window.addEventListener('wheel', e => {
  if (state.paused && !isEditorModeEnabled()) return;
  if (!isViewportTarget(e.target)) return;

  const placerModal = document.getElementById('placer-modal');
  if (placerModal && placerModal.style.display !== 'none') return;
  const transformModal = document.getElementById('placer-transform-modal');
  if (transformModal && transformModal.style.display !== 'none') return;

  if (isEditorModeEnabled()) {
    if (state.params.editorPlacementTarget === 'asset') {
      cyclePlacerAsset(e.deltaY > 0 ? 1 : -1);
    }
    e.preventDefault();
    return;
  }

  cycleWheelItem(e.deltaY > 0 ? 1 : -1);
  e.preventDefault();
}, { passive: false });

// ── Gamepad / Controller support ───────────────────────────────────────────────
// DualSense / DualShock button layout (standard mapping):
//   0 = Cross    1 = Circle    2 = Square    3 = Triangle
//   4 = L1       5 = R1        6 = L2        7 = R2
//   8 = Share    9 = Options  10 = L3       11 = R3
//  12 = D-Up    13 = D-Down  14 = D-Left   15 = D-Right
// Axes: 0 = LS-X  1 = LS-Y  2 = RS-X  3 = RS-Y

// Per-button edge-detection: track which were pressed last frame.
const _prevButtons = new Map(); // gamepadIndex -> Uint8Array

// Track which one-shot actions were already triggered this press to avoid repeats.
const _jumpHeld     = new Map();
const _dashHeld     = new Map();
const _btHeld       = new Map();
const _optionsHeld  = new Map();


const CONTROLLER_BUTTON_MAPPINGS = [
  { index: 0,  key: 'controllerMapCross',    fallback: 'jump' },
  { index: 1,  key: 'controllerMapCircle',   fallback: 'dash' },
  { index: 2,  key: 'controllerMapSquare',   fallback: 'reload' },
  { index: 3,  key: 'controllerMapTriangle', fallback: 'none' },
  { index: 4,  key: 'controllerMapL1',       fallback: 'bulletTime' },
  { index: 5,  key: 'controllerMapR1',       fallback: 'none' },
  { index: 6,  key: 'controllerMapL2',       fallback: 'ads' },
  { index: 7,  key: 'controllerMapR2',       fallback: 'fire' },
  { index: 8,  key: 'controllerMapShare',    fallback: 'none' },
  { index: 9,  key: 'controllerMapOptions',  fallback: 'toggleSidebar' },
  { index: 10, key: 'controllerMapL3',       fallback: 'none' },
  { index: 11, key: 'controllerMapR3',       fallback: 'none' },
  { index: 12, key: 'controllerMapDpadUp',   fallback: 'none' },
  { index: 13, key: 'controllerMapDpadDown', fallback: 'none' },
  { index: 14, key: 'controllerMapDpadLeft', fallback: 'changeWeaponPrev' },
  { index: 15, key: 'controllerMapDpadRight', fallback: 'changeWeaponNext' },
];

const CONTROLLER_ACTIONS = new Set([
  'none',
  'jump',
  'dash',
  'reload',
  'ads',
  'bulletTime',
  'fire',
  'changeWeaponPrev',
  'changeWeaponNext',
  'toggleSidebar',
]);

let _controllerPrimaryFireActive = false;

function getControllerButtonAction(spec) {
  const value = state.params?.[spec.key];
  return CONTROLLER_ACTIONS.has(value) ? value : spec.fallback;
}

function applyDeadzone(value, deadzone) {
  if (Math.abs(value) < deadzone) return 0;
  // rescale so edge of deadzone maps to 0 and 1.0 stays at 1.0
  return (value - Math.sign(value) * deadzone) / (1 - deadzone);
}

function rumble(pad, strongMagnitude, weakMagnitude, duration) {
  if (!state.params.controllerVibration) return;
  try {
    pad.vibrationActuator?.playEffect?.('dual-rumble', {
      startDelay: 0,
      duration,
      weakMagnitude,
      strongMagnitude,
    });
  } catch (_) { /* unsupported — ignore */ }
}

// Called once per animation frame from loop.js.
export function updateController(delta) {
  if (!state.params.controllerEnabled) {
    state.controllerMoveX = 0;
    state.controllerMoveZ = 0;
    state.controllerConnected = false;
    _controllerPrimaryFireActive = false;
    return;
  }

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let pad = null;
  for (const p of pads) {
    if (p && p.connected) { pad = p; break; }
  }

  state.controllerConnected = !!pad;

  if (!pad) {
    state.controllerMoveX = 0;
    state.controllerMoveZ = 0;
    if (_controllerPrimaryFireActive) {
      state.primaryFire = false;
      _controllerPrimaryFireActive = false;
    }
    return;
  }

  const idx = pad.index;
  const btnCount = pad.buttons.length;

  // Initialise per-pad prev-button state on first encounter.
  if (!_prevButtons.has(idx) || _prevButtons.get(idx).length !== btnCount) {
    _prevButtons.set(idx, new Uint8Array(btnCount));
    _jumpHeld.set(idx, false);
    _dashHeld.set(idx, false);
    _btHeld.set(idx, false);
    _optionsHeld.set(idx, false);
  }
  const prev = _prevButtons.get(idx);
  const fireThresh = Math.max(0, Math.min(1, Number(state.params.controllerFireThreshold) ?? 0.5));

  function buttonDown(i) {
    if (i >= btnCount) return false;
    const button = pad.buttons[i];
    return !!button?.pressed || (Number(button?.value) || 0) >= fireThresh;
  }

  function actionHeld(action) {
    return CONTROLLER_BUTTON_MAPPINGS.some(spec => (
      getControllerButtonAction(spec) === action && buttonDown(spec.index)
    ));
  }

  function actionJustPressed(action) {
    return CONTROLLER_BUTTON_MAPPINGS.some(spec => (
      getControllerButtonAction(spec) === action && buttonDown(spec.index) && !prev[spec.index]
    ));
  }

  function snapshotButtons() {
    for (let i = 0; i < btnCount; i++) {
      prev[i] = buttonDown(i) ? 1 : 0;
    }
  }

  if (state.paused) {
    // In paused state only allow the mapped sidebar toggle.
    if (actionJustPressed('toggleSidebar')) {
      _togglePanel?.();
      rumble(pad, 0, 0.3, 80);
    }
    snapshotButtons();
    return;
  }

  const moveDead = Math.max(0, Math.min(0.99, Number(state.params.controllerMoveDeadzone) ?? 0.12));
  const lookDead = Math.max(0, Math.min(0.99, Number(state.params.controllerLookDeadzone) ?? 0.10));
  const sensX    = Number(state.params.controllerLookSensX) || 0.045;
  const sensY    = Number(state.params.controllerLookSensY) || 0.036;
  const invertY  = !!state.params.controllerInvertY;

  // ── Left stick → movement (analogue) ──────────────────────────────────────
  const lsX = applyDeadzone(pad.axes[0] ?? 0, moveDead);
  const lsY = applyDeadzone(pad.axes[1] ?? 0, moveDead);
  state.controllerMoveX = lsX;
  state.controllerMoveZ = lsY;

  // ── Right stick → camera look ──────────────────────────────────────────────
  if (isThirdPersonCameraMode(state.params.cameraMode)) {
    const rsX = applyDeadzone(pad.axes[2] ?? 0, lookDead);
    const rsY = applyDeadzone(pad.axes[3] ?? 0, lookDead);
    if (rsX !== 0 || rsY !== 0) {
      state.params.thirdAzimuth = normalizeYaw(
        (state.params.thirdAzimuth || 0) - rsX * sensX
      );
      const pitchDir = invertY ? -rsY : rsY;
      state.params.thirdPitch = clamp(
        (state.params.thirdPitch || 0) + pitchDir * sensY,
        -1.1, 1.1
      );
    }
  }

  // ── Mapped hold actions: fire and ADS ─────────────────────────────────────
  const firePressed = actionHeld('fire');
  if (firePressed && !_controllerPrimaryFireActive) {
    rumble(pad, 0, 0.25, 60);
  }
  if (firePressed) {
    state.primaryFire = true;
    _controllerPrimaryFireActive = true;
  } else if (_controllerPrimaryFireActive) {
    state.primaryFire = false;
    _controllerPrimaryFireActive = false;
  }

  const adsPressed = actionHeld('ads');
  if ((state.activeSlot ?? 0) === 1) {
    state.secondaryFire = adsPressed;
    state.isAiming = false;
  } else {
    state.secondaryFire = false;
    state.isAiming = state.params.aimEnabled !== false && adsPressed;
  }

  // ── Mapped one-shot actions ───────────────────────────────────────────────
  if (actionJustPressed('jump') && state.params.jumpEnabled) {
    state.jumpQueued = true;
    rumble(pad, 0.3, 0, 80);
  }

  if (actionJustPressed('dash') && state.params.dashEnabled && !state.isAiming) {
    if (state.dashCooldown <= 0 && state.dashTimer <= 0) {
      // Use analogue stick direction if available, else last move direction.
      const forward = getMoveForward();
      const right   = getMoveRight();
      _dv.set(0, 0, 0);
      if (Math.abs(lsX) > 0.01 || Math.abs(lsY) > 0.01) {
        _dv.addScaledVector(forward, -lsY).addScaledVector(right, lsX);
      } else {
        _dv.x = state.lastMoveX;
        _dv.z = state.lastMoveZ;
      }
      if (_dv.lengthSq() > 0) {
        _dv.normalize();
        state.lastMoveX = _dv.x;
        state.lastMoveZ = _dv.z;
      }
      state.dashVX       = state.lastMoveX;
      state.dashVZ       = state.lastMoveZ;
      state.dashTimer    = state.params.dashDuration;
      state.dashCooldown = state.params.dashCooldown;
      state.dashGhostTimer = 0;
      playDashSound();
      rumble(pad, 0.5, 0.3, 100);
    }
  }

  if (actionJustPressed('reload')) {
    reloadCurrentWeapon();
    rumble(pad, 0.08, 0.12, 70);
  }

  if (actionJustPressed('bulletTime') && state.params.bulletTimeEnabled !== false) {
    if (state.slowTimer > 0) state.slowStopRequested = true;
    else state.slowRequested = true;
    rumble(pad, 0.2, 0.5, 120);
  }

  if (actionJustPressed('changeWeaponPrev')) {
    cycleWheelItem(-1);
    rumble(pad, 0.04, 0.08, 45);
  }

  if (actionJustPressed('changeWeaponNext')) {
    cycleWheelItem(1);
    rumble(pad, 0.04, 0.08, 45);
  }

  if (actionJustPressed('toggleSidebar')) {
    _togglePanel?.();
    rumble(pad, 0, 0.3, 80);
  }

  snapshotButtons();
}
