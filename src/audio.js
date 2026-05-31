// src/audio.js
// Shared SFX helpers, including optional listener-based proximity attenuation.
import { state } from './state.js';
import { playerGroup } from './player.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numeric(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getAudioProximityFactor(sourcePosition = null) {
  const p = state.params;
  if (p.soundProximityEnabled === false || !sourcePosition) return 1;

  const range = Math.max(0.001, numeric(p.soundProximityRange, 40));
  const falloff = clamp(numeric(p.soundProximityFalloff, 1), 0.1, 4);
  const minFactor = clamp(numeric(p.soundProximityMinFactor, 0), 0, 1);
  const dx = numeric(sourcePosition.x, playerGroup.position.x) - playerGroup.position.x;
  const dz = numeric(sourcePosition.z, playerGroup.position.z) - playerGroup.position.z;
  const distance = Math.hypot(dx, dz);

  if (distance >= range) return 0;
  const normalized = clamp(distance / range, 0, 1);
  const factor = 1 - Math.pow(normalized, falloff);
  return Math.max(minFactor, factor);
}

export function getSfxVolume(key, fallback = 1, sourcePosition = null) {
  const p = state.params;
  if (p.soundMuted) return 0;
  const master = clamp(numeric(p.soundSfxVolume, 1), 0, 1);
  const channel = clamp(numeric(p[key], fallback), 0, 1);
  const proximity = getAudioProximityFactor(sourcePosition);
  return clamp(master * channel * proximity, 0, 1);
}


let _dashSoundEl = null;
export function playDashSound(sourcePosition = null) {
  const volume = getSfxVolume('soundSfx_dash', 1, sourcePosition);
  if (volume <= 0) return;
  if (!_dashSoundEl) _dashSoundEl = new Audio('./assets/dash.wav');
  const sound = _dashSoundEl.paused ? _dashSoundEl : _dashSoundEl.cloneNode();
  sound.currentTime = 0;
  sound.volume = volume;
  sound.play().catch(() => {});
}
