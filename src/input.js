// ─── input.js ─────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { DASH_SPEED, DASH_DURATION } from './constants.js';
import { getMoveForward, getMoveRight } from './renderer.js';
import * as THREE from 'three';
import { playSound, toggleMute, resumeAudioContext } from './audio.js';

let _togglePanel  = null;
let _restartGame  = null;
let _firstKeyFired = false;

export function initInput({ togglePanel, restartGame }) {
  _togglePanel = togglePanel;
  _restartGame = restartGame;
}

const _dv = new THREE.Vector3();

window.addEventListener('keydown', e => {
  if (!_firstKeyFired) { resumeAudioContext(); _firstKeyFired = true; }

  if (e.key === 'Tab') {
    e.preventDefault();
    if (_togglePanel) _togglePanel();
    return;
  }
  if (e.key.toLowerCase() === 'm') { toggleMute(); return; }
  if (state.paused) return;

  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup')    state.keys.w = true;
  if (k === 's' || k === 'arrowdown')  state.keys.s = true;
  if (k === 'a' || k === 'arrowleft')  state.keys.a = true;
  if (k === 'd' || k === 'arrowright') state.keys.d = true;

  if (e.key === 'Shift' && !state.gameOver && state.params.playerDashEnabled) {
    e.preventDefault();
    if (state.dashCooldown <= 0 && state.dashTimer <= 0) {
      _dv.set(0, 0, 0);
      const fwd   = getMoveForward();
      const right = getMoveRight();
      if (state.keys.w) _dv.addScaledVector(fwd,    1);
      if (state.keys.s) _dv.addScaledVector(fwd,   -1);
      if (state.keys.a) _dv.addScaledVector(right, -1);
      if (state.keys.d) _dv.addScaledVector(right,  1);
      if (_dv.lengthSq() > 0) { _dv.normalize(); state.lastMoveX = _dv.x; state.lastMoveZ = _dv.z; }
      state.dashVX          = state.lastMoveX;
      state.dashVZ          = state.lastMoveZ;
      state.dashTimer       = DASH_DURATION;
      state.dashCooldownMax = 1.4;
      state.dashCooldown    = 1.4;
      state.dashGhostTimer  = 0;
      playSound('dash', 0.55, 0.95 + Math.random() * 0.1);
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

window.addEventListener('pointerdown', () => {
  if (!_firstKeyFired) { resumeAudioContext(); _firstKeyFired = true; }
}, { once: true });
