// src/input.js
// Keyboard state is stored on state.keys so movement code can poll it every
// frame rather than reacting to events. Dash fires on keydown only.
import * as THREE from 'three';
import { state } from './state.js';
import { getMoveForward, getMoveRight, renderer } from './renderer.js';

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

function canUseMouseLook(target) {
  return state.params.cameraMode === 'third'
    && isMouseLookEnabled()
    && isViewportTarget(target);
}

function applyMouseLookDelta(dx, dy) {
  if (state.params.cameraMode !== 'third' || !isMouseLookEnabled()) return;

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
  if (!_mouseDragActive || document.pointerLockElement === renderer.domElement) return;
  const dx = event.clientX - _lastMouseX;
  const dy = event.clientY - _lastMouseY;
  _lastMouseX = event.clientX;
  _lastMouseY = event.clientY;
  applyMouseLookDelta(dx, dy);
});

function stopMouseDrag(event) {
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
  state.mouseLookActive = locked || _mouseDragActive;
  document.body.classList.toggle('third-person-mouse-look', state.mouseLookActive);
});

document.addEventListener('mousemove', event => {
  if (document.pointerLockElement !== renderer.domElement) return;
  applyMouseLookDelta(event.movementX || 0, event.movementY || 0);
});

window.addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); _togglePanel?.(); return; }
  if (isTypingTarget(e.target)) return;

  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup')    state.keys.w = true;
  if (k === 's' || k === 'arrowdown')  state.keys.s = true;
  if (k === 'a' || k === 'arrowleft')  state.keys.a = true;
  if (k === 'd' || k === 'arrowright') state.keys.d = true;

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
});
