// src/audio.js
// Shared SFX helpers, including optional listener-based proximity attenuation.
import { state } from './state.js';
import { playerGroup } from './player.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const BULLET_TIME_AUDIO_RATE = Math.pow(2, -7 / 12);
const _managedAudio = new Set();
const _bulletTimeActiveAudio = new Set();

function isBulletTimeActive() {
  return state.params.bulletTimeEnabled !== false && state.slowTimer > 0;
}

function isKillScreenSlowActive() {
  return state.playerDead === true
    && state.params.killScreenEnabled !== false
    && Number(state.killScreenTimer) > 0;
}

function getKillScreenAudioRate() {
  const scale = Number(state.params.killScreenWorldScale);
  return clamp(Number.isFinite(scale) ? scale : 0.25, 0.05, 1);
}

export function getBulletTimeAudioRate() {
  if (isKillScreenSlowActive()) return getKillScreenAudioRate();
  return isBulletTimeActive() ? BULLET_TIME_AUDIO_RATE : 1;
}

export function applyBulletTimeAudioPitch(audio, baseRate = 1) {
  if (!audio) return audio;
  const base = Number(baseRate) || 1;
  const rate = audio.__skipBulletTimePitch ? base : clamp(base * getBulletTimeAudioRate(), 0.25, 4);
  try {
    // Browsers preserve pitch by default when playbackRate changes; disable
    // that so non-bullet-time audio audibly drops by -7 semitones during bullet time.
    audio.preservesPitch = !!audio.__skipBulletTimePitch;
    audio.mozPreservesPitch = !!audio.__skipBulletTimePitch;
    audio.webkitPreservesPitch = !!audio.__skipBulletTimePitch;
  } catch (_) {}
  try { audio.playbackRate = rate; } catch (_) {}
  return audio;
}

export function stopBulletTimeSounds() {
  _bulletTimeActiveAudio.forEach(audio => {
    if (!audio) return;
    try { audio.pause(); } catch (_) {}
    try { audio.currentTime = 0; } catch (_) {}
    audio.__pausedByGame = false;
  });
  _bulletTimeActiveAudio.clear();
}

export function registerManagedAudio(audio, baseRate = 1, options = {}) {
  if (!audio) return audio;
  audio.__basePlaybackRate = Number(baseRate) || 1;
  audio.__skipBulletTimePitch = options.skipBulletTimePitch === true || audio.__skipBulletTimePitch === true;
  if (options.bulletTimeSound === true) _bulletTimeActiveAudio.add(audio);
  _managedAudio.add(audio);

  if (!audio.__bulletTimePitchManaged) {
    audio.__bulletTimePitchManaged = true;
    audio.addEventListener('ended', () => {
      if (!audio.loop) {
        _managedAudio.delete(audio);
        _bulletTimeActiveAudio.delete(audio);
      }
    });
  }

  applyBulletTimeAudioPitch(audio, audio.__basePlaybackRate);
  return audio;
}

export function updateBulletTimeAudioPitch() {
  if (!isBulletTimeActive()) stopBulletTimeSounds();
  _managedAudio.forEach(audio => {
    if (!audio) { _managedAudio.delete(audio); return; }
    applyBulletTimeAudioPitch(audio, audio.__basePlaybackRate || 1);
  });
}

export function pauseManagedAudio() {
  _managedAudio.forEach(audio => {
    if (!audio) { _managedAudio.delete(audio); return; }
    if (audio.paused) return;
    audio.__pausedByGame = true;
    try { audio.pause(); } catch (_) {}
  });
}

export function resumeManagedAudio() {
  _managedAudio.forEach(audio => {
    if (!audio) { _managedAudio.delete(audio); return; }
    if (!audio.__pausedByGame) return;
    audio.__pausedByGame = false;
    if (state.params.soundMuted) return;
    applyBulletTimeAudioPitch(audio, audio.__basePlaybackRate || 1);
    const playRequest = audio.play?.();
    if (playRequest?.catch) playRequest.catch(() => {});
  });
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
  if (state.paused || p.soundMuted) return 0;
  const master = clamp(numeric(p.soundSfxVolume, 1), 0, 1);
  const channel = clamp(numeric(p[key], fallback), 0, 1);
  const proximity = getAudioProximityFactor(sourcePosition);
  return clamp(master * channel * proximity, 0, 1);
}


let _dashSoundEl = null;
export function playDashSound(sourcePosition = null) {
  const volume = getSfxVolume('soundSfx_dash', 1, sourcePosition);
  if (volume <= 0) return;
  if (!_dashSoundEl) _dashSoundEl = registerManagedAudio(new Audio('./assets/dash.wav'));
  const sound = _dashSoundEl.paused ? _dashSoundEl : _dashSoundEl.cloneNode();
  registerManagedAudio(sound, 1);
  sound.currentTime = 0;
  sound.volume = volume;
  applyBulletTimeAudioPitch(sound);
  sound.play().catch(() => {});
}

let _objectExplosionEl = null;
export function playObjectExplosionSound(sourcePosition = null) {
  const fallback = Number(state.params.soundSfx_explode ?? 1);
  const volume = getSfxVolume('soundSfx_object_explode', fallback, sourcePosition);
  if (volume <= 0) return;
  if (!_objectExplosionEl) _objectExplosionEl = registerManagedAudio(new Audio('./assets/xpl1.wav'));
  const sound = _objectExplosionEl.paused ? _objectExplosionEl : _objectExplosionEl.cloneNode();
  registerManagedAudio(sound, 1);
  sound.volume = volume;
  sound.currentTime = 0;
  applyBulletTimeAudioPitch(sound);
  sound.play().catch(() => {});
}

let _bulletTimeSlowEl = null;
let _bulletTimeHeartEl = null;
let _bulletTimeEndEl = null;

function playBulletTimeSound(templateRef, assetPath, volumeKey) {
  const volume = getSfxVolume(volumeKey, 1);
  if (volume <= 0) return templateRef;

  if (!templateRef) {
    templateRef = registerManagedAudio(new Audio(assetPath), 1, {
      skipBulletTimePitch: true,
      bulletTimeSound: true,
    });
  }
  const sound = templateRef.paused ? templateRef : templateRef.cloneNode();
  registerManagedAudio(sound, 1, {
    skipBulletTimePitch: true,
    bulletTimeSound: true,
  });
  sound.volume = volume;
  sound.currentTime = 0;
  applyBulletTimeAudioPitch(sound, 1);
  sound.play().catch(() => {});
  return templateRef;
}

export function playBulletTimeActivationSounds() {
  _bulletTimeSlowEl = playBulletTimeSound(_bulletTimeSlowEl, './assets/slow.wav', 'soundSfx_bullet_time_slow');
  _bulletTimeHeartEl = playBulletTimeSound(_bulletTimeHeartEl, './assets/heart.mp3', 'soundSfx_bullet_time_heart');
}

export function playBulletTimeEndSound() {
  const volume = getSfxVolume('soundSfx_bullet_time_end', 1);
  if (volume <= 0) return;
  if (!_bulletTimeEndEl) {
    _bulletTimeEndEl = registerManagedAudio(new Audio('./assets/bt_end.wav'), 1, { skipBulletTimePitch: true });
  }
  const sound = _bulletTimeEndEl.paused ? _bulletTimeEndEl : _bulletTimeEndEl.cloneNode();
  registerManagedAudio(sound, 1, { skipBulletTimePitch: true });
  sound.volume = volume;
  sound.currentTime = 0;
  applyBulletTimeAudioPitch(sound, 1);
  sound.play().catch(() => {});
}
