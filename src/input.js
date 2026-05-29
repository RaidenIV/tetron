// src/input.js
// Keyboard state is stored on state.keys so movement code can poll it every
// frame rather than reacting to events. Dash fires on keydown only.
import * as THREE from 'three';
import { state } from './state.js';
import { getMoveForward, getMoveRight, isThirdPersonCameraMode, renderer } from './renderer.js';

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
  state.jumpQueued = false;
  _mouseDragActive = false;
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
    return;
  }

  if (isViewportTarget(event.target)) {
    updatePointerAimFromClient(event.clientX, event.clientY);
  }

  if (event.button === 0 && isViewportTarget(event.target)) {
    state.primaryFire = true;
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
  if (event.button === 0) state.primaryFire = true;
});

document.addEventListener('mouseup', event => {
  if (event.button === 0) state.primaryFire = false;
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement) {
    state.primaryFire = false;
  }
});

window.addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); _togglePanel?.(); return; }
  if (isTypingTarget(e.target)) return;

  if (state.paused) return;

  const k = e.key.toLowerCase();
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

  if (e.key === 'Shift' && state.params.dashEnabled) {
    e.preventDefault();
    if (state.dashCooldown <= 0 && state.dashTimer <= 0) {
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
