// src/input.js
// Keyboard state is stored on state.keys so movement code can poll it every
// frame rather than reacting to events. Dash fires on keydown only.
// Controller support: browser Gamepad API, polled every frame via updateController().
import * as THREE from 'three';
import { state } from './state.js';
import { getMoveForward, getMoveRight, isThirdPersonCameraMode, renderer } from './renderer.js';
import { playDashSound } from './audio.js';

let _togglePanel = null;

export function initInput({ togglePanel }) {
  _togglePanel = togglePanel;
}

const _dv = new THREE.Vector3();
let _mouseDragActive = false;
let _lastMouseX = 0;
let _lastMouseY = 0;

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
  return isThirdPersonCameraMode(state.params.cameraMode)
    && isMouseLookEnabled()
    && isViewportTarget(target);
}

function applyMouseLookDelta(dx, dy) {
  if (!isThirdPersonCameraMode(state.params.cameraMode) || !isMouseLookEnabled()) return;

  const sx = Number(state.params.thirdMouseSensitivityX) || 0.003;
  const sy = Number(state.params.thirdMouseSensitivityY) || 0.0024;
  state.params.thirdAzimuth = normalizeYaw((state.params.thirdAzimuth || 0) - dx * sx);
  state.params.thirdPitch = clamp((state.params.thirdPitch || 0) - dy * sy, -1.1, 1.1);
}

function requestMouseLook(target) {
  if (!canUseMouseLook(target)) return;
  if (document.pointerLockElement === renderer.domElement) return;
  renderer.domElement.requestPointerLock?.();
}

renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());

renderer.domElement.addEventListener('pointerdown', event => {
  if (state.paused) {
    state.primaryFire = false;
    state.secondaryFire = false;
    return;
  }

  if (isViewportTarget(event.target)) {
    updatePointerAimFromClient(event.clientX, event.clientY);
  }

  const placerActive = (state.activeSlot ?? 0) === 1;

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
  renderer.domElement.setPointerCapture?.(event.pointerId);
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
  if (locked) setPointerAimCenter();
  state.mouseLookActive = locked || _mouseDragActive;
  document.body.classList.toggle('third-person-mouse-look', state.mouseLookActive);
});

document.addEventListener('mousemove', event => {
  if (state.paused) return;
  if (document.pointerLockElement !== renderer.domElement) return;
  setPointerAimCenter();
  applyMouseLookDelta(event.movementX || 0, event.movementY || 0);
});

document.addEventListener('mousedown', event => {
  if (state.paused) return;
  if (document.pointerLockElement !== renderer.domElement) return;
  if (event.button === 0) {
    if ((state.activeSlot ?? 0) === 1 && (event.ctrlKey || event.metaKey)) {
      state.primaryFire = false;
      state.placerSelectionRequest = { toggle: true, additive: true };
      event.preventDefault();
      return;
    }
    state.primaryFire = true;
  }
  if (event.button === 2) {
    if ((state.activeSlot ?? 0) === 1) {
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

  if (state.paused) return;

  const k = e.key.toLowerCase();

  if ((state.activeSlot ?? 0) === 1) {
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

  if (k === 'q' && state.params.bulletTimeEnabled !== false) {
    e.preventDefault();
    if (!e.repeat) state.slowRequested = true;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    state.keys.space = true;
    if (!e.repeat && state.params.jumpEnabled) {
      state.jumpQueued = true;
    }
  }


  // F key → open asset picker modal (only when placer slot is active)
  if (k === 'f' && !e.repeat && (state.activeSlot ?? 0) === 1) {
    e.preventDefault();
    togglePlacerAssetModal();
    return;
  }


  // R key → open transform modal for the current placer shape
  if (k === 'r' && !e.repeat && (state.activeSlot ?? 0) === 1) {
    e.preventDefault();
    togglePlacerTransformModal();
    return;
  }

  // V key → shoulder swap (flip lateral camera offset)
  if (k === 'v' && !e.repeat) {
    state.params.thirdOffsetX = -(state.params.thirdOffsetX || 1.25);
  }

  if (e.key === 'Shift') {
    e.preventDefault();
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
});


// ── Scroll wheel → switch weapon slot ─────────────────────────────────────────
window.addEventListener('wheel', e => {
  if (state.paused) return;
  // Close placer modal if open
  const modal = document.getElementById('placer-modal');
  if (modal && modal.style.display !== 'none') return;
  const slots = 2; // 0=laser, 1=placer
  const dir   = e.deltaY > 0 ? 1 : -1;
  state.activeSlot = ((state.activeSlot ?? 0) + dir + slots) % slots;
  state.isAiming = false;
  state.secondaryFire = false;
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

  function pressed(i)  { return i < btnCount && pad.buttons[i].pressed; }
  function justPressed(i) { return pressed(i) && !prev[i]; }

  if (state.paused) {
    // In paused state only allow Options toggle.
    if (justPressed(9)) {
      _togglePanel?.();
      rumble(pad, 0, 0.3, 80);
    }
    // Update prev so we don't fire on un-pause.
    for (let i = 0; i < btnCount; i++) prev[i] = pad.buttons[i].pressed ? 1 : 0;
    return;
  }

  const moveDead = Math.max(0, Math.min(0.99, Number(state.params.controllerMoveDeadzone) ?? 0.12));
  const lookDead = Math.max(0, Math.min(0.99, Number(state.params.controllerLookDeadzone) ?? 0.10));
  const sensX    = Number(state.params.controllerLookSensX) || 0.045;
  const sensY    = Number(state.params.controllerLookSensY) || 0.036;
  const fireThresh = Math.max(0, Math.min(1, Number(state.params.controllerFireThreshold) ?? 0.5));
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

  // ── R2 / R1 → primary fire ─────────────────────────────────────────────────
  const r2Value = pad.buttons[7]?.value ?? 0;
  const r1Value = pad.buttons[5]?.value ?? 0;
  const firePressed = r2Value >= fireThresh || r1Value >= fireThresh;
  if (firePressed && !state.primaryFire) {
    rumble(pad, 0, 0.25, 60);
  }
  state.primaryFire = firePressed;

  // ── L2 (button 6) → remove while placing, otherwise aim (ADS) ─────────────
  const l2Value = pad.buttons[6]?.value ?? 0;
  if ((state.activeSlot ?? 0) === 1) {
    state.secondaryFire = l2Value >= fireThresh;
    state.isAiming = false;
  } else {
    state.secondaryFire = false;
    state.isAiming = state.params.aimEnabled !== false && l2Value >= fireThresh;
  }

  // ── Cross (0) → jump ───────────────────────────────────────────────────────
  if (pressed(0)) {
    if (!_jumpHeld.get(idx) && state.params.jumpEnabled) {
      state.jumpQueued = true;
      _jumpHeld.set(idx, true);
      rumble(pad, 0.3, 0, 80);
    }
  } else {
    _jumpHeld.set(idx, false);
  }

  // ── Circle (1) → dash ─────────────────────────────────────────────────────
  if (pressed(1)) {
    if (!_dashHeld.get(idx) && state.params.dashEnabled && !state.isAiming) {
      _dashHeld.set(idx, true);
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
  } else {
    _dashHeld.set(idx, false);
  }

  // ── L1 / L2 (4/6) → bullet time ───────────────────────────────────────────
  const btPressed = pressed(4) || ((state.activeSlot ?? 0) !== 1 && (pad.buttons[6]?.value ?? 0) >= fireThresh);
  if (btPressed) {
    if (!_btHeld.get(idx)) {
      _btHeld.set(idx, true);
      if (state.params.bulletTimeEnabled !== false) {
        state.slowRequested = true;
        rumble(pad, 0.2, 0.5, 120);
      }
    }
  } else {
    _btHeld.set(idx, false);
  }

  // ── Options (9) → toggle sidebar ──────────────────────────────────────────
  if (pressed(9)) {
    if (!_optionsHeld.get(idx)) {
      _optionsHeld.set(idx, true);
      _togglePanel?.();
      rumble(pad, 0, 0.3, 80);
    }
  } else {
    _optionsHeld.set(idx, false);
  }

  // Snapshot button state for edge detection next frame.
  for (let i = 0; i < btnCount; i++) {
    prev[i] = pad.buttons[i].pressed ? 1 : 0;
  }
}
