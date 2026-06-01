// src/controller.js
// Browser Gamepad API support for DualSense / DualShock-style controllers.
// Standard mapping used by modern browsers:
// left stick = axes 0/1, right stick = axes 2/3, Cross = button 0,
// Circle = 1, L1 = 4, R2 = 7, Options = 9.
import { state } from './state.js';
import {
  getMoveForward,
  getMoveRight,
  getThirdPitchRange,
  isThirdPersonCameraMode,
} from './renderer.js';
import { playDashSound } from './audio.js';

let _togglePanel = null;
let _lastJumpDown = false;
let _lastDashDown = false;
let _lastSlowDown = false;
let _lastToggleDown = false;
let _lastFireDown = false;
let _lastStatusText = '';

export function initController({ togglePanel } = {}) {
  _togglePanel = togglePanel || null;
  window.addEventListener('gamepadconnected', event => {
    state.controllerConnected = true;
    state.controllerName = event.gamepad?.id || 'Controller connected';
    syncControllerStatusText();
  });
  window.addEventListener('gamepaddisconnected', () => {
    resetControllerRuntime('None');
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeYaw(yaw) {
  const tau = Math.PI * 2;
  return ((yaw % tau) + tau) % tau;
}

function applyAxisDeadzone(value, deadzone) {
  const raw = Number(value) || 0;
  const dz = clamp(Number(deadzone) || 0, 0, 0.95);
  const mag = Math.abs(raw);
  if (mag <= dz) return 0;
  return Math.sign(raw) * ((mag - dz) / (1 - dz));
}

function buttonValue(pad, index) {
  const button = pad?.buttons?.[index];
  if (!button) return 0;
  return Number(button.value) || (button.pressed ? 1 : 0);
}

function buttonPressed(pad, index, threshold = 0.5) {
  return buttonValue(pad, index) >= threshold;
}

function getActiveGamepad() {
  const pads = navigator.getGamepads?.() || [];
  const connected = Array.from(pads || []).filter(Boolean);
  if (!connected.length) return null;

  const preferred = connected.find(pad => {
    const id = String(pad.id || '').toLowerCase();
    return id.includes('dualsense')
      || id.includes('dualshock')
      || id.includes('wireless controller')
      || id.includes('playstation')
      || id.includes('sony');
  });

  return preferred || connected[0];
}

function resetControllerRuntime(name = 'None') {
  state.controllerMoveX = 0;
  state.controllerMoveY = 0;
  state.controllerPrimaryFire = false;
  state.controllerConnected = false;
  state.controllerName = name;
  _lastJumpDown = false;
  _lastDashDown = false;
  _lastSlowDown = false;
  _lastToggleDown = false;
  _lastFireDown = false;
  syncControllerStatusText();
}

function syncControllerStatusText() {
  const el = document.getElementById('controller-status');
  if (!el) return;
  const name = state.controllerConnected ? (state.controllerName || 'Controller') : 'None';
  const text = state.params.controllerEnabled === false ? 'Disabled' : name;
  if (text === _lastStatusText) return;
  _lastStatusText = text;
  el.textContent = text;
  el.title = text;
}

function applyControllerLook(dt, lookX, lookY) {
  if (!isThirdPersonCameraMode(state.params.cameraMode)) return;

  const p = state.params;
  const sx = clamp(Number(p.controllerLookSensitivityX) || 3.2, 0, 12);
  const sy = clamp(Number(p.controllerLookSensitivityY) || 2.6, 0, 12);
  const y = p.controllerInvertY ? -lookY : lookY;
  const pitchRange = getThirdPitchRange();

  p.thirdAzimuth = normalizeYaw((Number(p.thirdAzimuth) || 0) - lookX * sx * dt);
  p.thirdPitch = clamp((Number(p.thirdPitch) || 0) - y * sy * dt, pitchRange.min, pitchRange.max);
}

function requestControllerDash(moveX, moveY) {
  const p = state.params;
  if (!p.dashEnabled) return;
  if (state.isAiming) return;
  if (state.dashCooldown > 0 || state.dashTimer > 0) return;

  const forward = getMoveForward();
  const right = getMoveRight();
  const dash = right.clone().multiplyScalar(moveX).addScaledVector(forward, -moveY);

  if (dash.lengthSq() > 0.0001) {
    dash.normalize();
    state.lastMoveX = dash.x;
    state.lastMoveZ = dash.z;
  }

  state.dashVX = state.lastMoveX;
  state.dashVZ = state.lastMoveZ;
  state.dashTimer = p.dashDuration;
  state.dashCooldown = p.dashCooldown;
  state.dashGhostTimer = 0;
  playDashSound();
}

function vibrate(pad, { weak = 0.08, strong = 0.18, duration = 70 } = {}) {
  if (!state.params.controllerVibration) return;
  const actuator = pad?.vibrationActuator;
  if (!actuator?.playEffect) return;
  try {
    actuator.playEffect('dual-rumble', {
      startDelay: 0,
      duration,
      weakMagnitude: weak,
      strongMagnitude: strong,
    });
  } catch (_) {
    // Haptics support varies by browser/controller connection mode.
  }
}

export function updateController(dt) {
  if (state.params.controllerEnabled === false) {
    resetControllerRuntime('Disabled');
    return;
  }

  const pad = getActiveGamepad();
  if (!pad) {
    if (state.controllerConnected || state.controllerName !== 'None') resetControllerRuntime('None');
    syncControllerStatusText();
    return;
  }

  state.controllerConnected = true;
  state.controllerName = pad.id || 'Controller';
  syncControllerStatusText();

  const moveDz = state.params.controllerMoveDeadzone;
  const lookDz = state.params.controllerLookDeadzone;
  const moveX = applyAxisDeadzone(pad.axes?.[0], moveDz);
  const moveY = applyAxisDeadzone(pad.axes?.[1], moveDz);
  const lookX = applyAxisDeadzone(pad.axes?.[2], lookDz);
  const lookY = applyAxisDeadzone(pad.axes?.[3], lookDz);

  const fireThreshold = clamp(Number(state.params.controllerFireThreshold) || 0.35, 0.01, 1);
  const fireDown = buttonValue(pad, 7) >= fireThreshold || buttonPressed(pad, 5);
  const jumpDown = buttonPressed(pad, 0);
  const dashDown = buttonPressed(pad, 1);
  const slowDown = buttonPressed(pad, 4) || buttonValue(pad, 6) >= fireThreshold;
  const toggleDown = buttonPressed(pad, 9);

  if (toggleDown && !_lastToggleDown) {
    _togglePanel?.();
    vibrate(pad, { weak: 0.05, strong: 0.08, duration: 45 });
  }
  _lastToggleDown = toggleDown;

  if (state.paused) {
    state.controllerMoveX = 0;
    state.controllerMoveY = 0;
    state.controllerPrimaryFire = false;
    _lastJumpDown = jumpDown;
    _lastDashDown = dashDown;
    _lastSlowDown = slowDown;
    _lastFireDown = fireDown;
    return;
  }

  state.controllerMoveX = moveX;
  state.controllerMoveY = moveY;
  state.controllerPrimaryFire = fireDown;

  if (fireDown && !_lastFireDown) {
    vibrate(pad, { weak: 0.04, strong: 0.08, duration: 35 });
  }
  _lastFireDown = fireDown;

  if ((lookX || lookY) && state.params.thirdMouseLook !== false) {
    applyControllerLook(dt, lookX, lookY);
  }

  if (jumpDown && !_lastJumpDown && state.params.jumpEnabled) {
    state.jumpQueued = true;
    vibrate(pad, { weak: 0.06, strong: 0.12, duration: 55 });
  }
  _lastJumpDown = jumpDown;

  if (dashDown && !_lastDashDown) {
    requestControllerDash(moveX, moveY);
    vibrate(pad, { weak: 0.12, strong: 0.28, duration: 85 });
  }
  _lastDashDown = dashDown;

  if (slowDown && !_lastSlowDown && state.params.bulletTimeEnabled !== false) {
    state.slowRequested = true;
    vibrate(pad, { weak: 0.18, strong: 0.32, duration: 120 });
  }
  _lastSlowDown = slowDown;
}
