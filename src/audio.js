// ─── audio.js ─────────────────────────────────────────────────────────────────
// Centralized audio module.
// Usage:
//   import { initAudio, playSound, resumeAudioContext,
//            startMusic, pauseMusic, resumeMusic, stopMusic } from './audio.js';

const ctx = new AudioContext();
const sounds = {};

let musicEl = null;
let _musicKey = 'game';
const MUSIC_URLS = {
  game: './assets/music/theme.wav',
};

function _setMusicKey(key) {
  const next = MUSIC_URLS[key] ? key : 'game';
  if (next === _musicKey) return;
  _musicKey = next;

  // If music element hasn't been created yet (initAudio not finished),
  // just remember the key — initAudio will create the correct element.
  if (!musicEl) return;

  const shouldPlay = _musicWanted && !muted && ctx.state === 'running';
  try { musicEl.pause(); } catch (_) {}
  musicEl.src = MUSIC_URLS[_musicKey] || MUSIC_URLS.game;
  musicEl.loop = true;
  musicEl.volume = musicVolume;
  musicEl.preload = 'auto';
  musicEl.currentTime = 0;
  if (shouldPlay) musicEl.play().catch(() => {});
}
let musicVolume  = 0.4;
let sfxVolume    = 1.0;
let muted        = false;
let _musicWanted = false; // true when music should be playing

// ── Resume AudioContext after user gesture (required by browsers) ─────────────
export function resumeAudioContext() {
  if (ctx.state === 'suspended') ctx.resume();
  if (_musicWanted && !muted && musicEl && musicEl.paused) {
    musicEl.play().catch(() => {});
  }
}

// ── Legacy helper retained as a no-op for old imports. ───────────────────────
export function playSplashSound() {
  return;
}

// Whenever the AudioContext transitions to 'running' (e.g. after any user gesture),
// automatically start music if it was requested but blocked
ctx.addEventListener('statechange', () => {
  if (ctx.state === 'running' && _musicWanted && !muted && musicEl && musicEl.paused) {
    musicEl.play().catch(() => {});
  }
});

// ── Load all SFX up front ─────────────────────────────────────────────────────
let _audioInitialised = false;

export async function initAudio() {
  if (_audioInitialised) return; // idempotent — never recreate musicEl or replay splash
  _audioInitialised = true;

  // ── Load all remaining SFX in parallel ───────────────────────────────────
  const sfxFiles = {
    countdown:    './assets/sfx/countdown.wav',
    shoot:        './assets/sfx/shoot.wav',
    player_hit:   './assets/sfx/player_hit.wav',
    elite_hit:    './assets/sfx/elite_hit.wav',
    elite_shoot:  './assets/sfx/elite_shoot.wav',
    standard_hit: './assets/sfx/standard_hit.wav',
    explode:      './assets/sfx/explode.wav',
    explodeElite: './assets/sfx/explode_elite.wav',
    coin:         './assets/sfx/coin.wav',
    coin_merge:   './assets/sfx/coin.wav',
    level_up_spike:'./assets/sfx/levelup.wav',
    heal:         './assets/sfx/heal.wav',
    levelup:      './assets/sfx/levelup.wav',
    dash:         './assets/sfx/dash.wav',
    gameover:     './assets/sfx/gameover.wav',
    victory:      './assets/sfx/victory.wav',
    laser_sword:  './assets/sfx/laser_sword.wav',

    // Design-doc pickup/chest/armor SFX (safe fallbacks if dedicated files aren't present)
    pickup_double_damage: './assets/sfx/coin.wav',
    pickup_invincibility: ['./assets/sfx/invincibility.wav', './assets/sfx/heal.wav'],
    pickup_coin_value:    './assets/sfx/coin.wav',
    pickup_extra_life:    './assets/sfx/levelup.wav',
    pickup_xp:            './assets/sfx/levelup.wav',
    pickup_armor:         './assets/sfx/heal.wav',
    pickup_clock:         './assets/sfx/levelup.wav',
    pickup_black_hole:    ['./assets/sfx/black_hole.wav', './assets/sfx/levelup.wav'],
    // Use a subtle in-world cue when timed pickup effects expire.
    pickup_expire:        './assets/sfx/coin.wav',
    chest_open:           './assets/sfx/levelup.wav',
    chest_item_select:    './assets/sfx/levelup.wav',
    armor_hit:            './assets/sfx/player_hit.wav',
    armor_break:          './assets/sfx/explode_elite.wav',
    extra_life_revive:    './assets/sfx/victory.wav',
    lightning:            ['./assets/sfx/lightning.wav', './assets/sfx/elite_shoot.wav'],
  };

  await Promise.allSettled(
    Object.entries(sfxFiles).map(async ([name, sourceSpec]) => {
      const urls = Array.isArray(sourceSpec) ? sourceSpec : [sourceSpec];
      let loaded = false;
      let lastErr = null;
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          sounds[name] = await ctx.decodeAudioData(buf);
          loaded = true;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!loaded) {
        console.warn(`[audio] Could not load "${name}" from ${urls.join(' or ')}:`, lastErr?.message || 'unknown error');
      }
    })
  );

  // Set up music element
  musicEl = new Audio(MUSIC_URLS[_musicKey] || MUSIC_URLS.game);
  musicEl.loop    = true;
  musicEl.volume  = musicVolume;
  musicEl.preload = 'auto';

  // If startMusic() was called before we finished loading, play now
  if (_musicWanted && !muted) {
    musicEl.play().catch(() => {});
  }
}

// ── Per-sound volume overrides ────────────────────────────────────────────────
const soundVolumes = {
  countdown:    1.0,
  shoot:        1.0,
  player_hit:   1.0,
  elite_hit:    1.0,
  elite_shoot:  1.0,
  standard_hit: 1.0,
  explode:      1.0,
  explodeElite: 1.0,
  coin:         1.0,
  pickup_expire: 0.22,
  heal:         1.0,
  levelup:      1.0,
  dash:         1.0,
  gameover:     1.0,
  victory:      1.0,
  lightning:    1.0,
};

export function getSoundVolume(name)    { return soundVolumes[name] ?? 1.0; }
export function setSoundVolume(name, v) { soundVolumes[name] = Math.max(0, Math.min(1, v)); }
export function getAllSoundVolumes()    { return { ...soundVolumes }; }
export function setAllSoundVolumes(map){ Object.keys(map).forEach(k => setSoundVolume(k, map[k])); }

// ── Play a named SFX ──────────────────────────────────────────────────────────
// name:   key from sfxFiles above
// volume: 0.0 – 1.0  (multiplied by global sfxVolume)
// pitch:  playback rate, 1.0 = normal, vary slightly for variety
export function playSound(name, volume = 1.0, pitch = 1.0) {
  const buf = sounds[name];
  if (!buf || ctx.state === 'suspended' || muted) return;

  const src  = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  src.playbackRate.value = pitch;
  gain.gain.value = Math.min(1, volume * sfxVolume * (soundVolumes[name] ?? 1.0));
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

// ── Music controls ────────────────────────────────────────────────────────────
export function startMusic(key = 'game') {
  _musicWanted = true;
  _setMusicKey(key);
  if (!musicEl) return;
  // If already playing this track, don't restart it.
  if (!muted && !musicEl.paused) return;
  musicEl.currentTime = 0;
  if (!muted) musicEl.play().catch(() => {});
}


export function pauseMusic() {
  if (!musicEl) return;
  musicEl.pause();
  // don't clear _musicWanted — game is just paused, not stopped
}

export function resumeMusic() {
  if (!musicEl) return;
  if (!muted) musicEl.play().catch(() => {});
}

export function stopMusic() {
  if (!musicEl) return;
  _musicWanted = false;
  musicEl.pause();
  musicEl.currentTime = 0;
}

// ── Mute toggle ───────────────────────────────────────────────────────────────
export function toggleMute() {
  muted = !muted;
  if (musicEl) {
    if (muted) musicEl.pause();
    else if (_musicWanted) musicEl.play().catch(() => {});
  }
  return muted;
}

export function setMuted(v) {
  muted = !!v;
  if (musicEl) {
    if (muted) musicEl.pause();
    else if (_musicWanted) musicEl.play().catch(() => {});
  }
}

// ── Volume helpers ────────────────────────────────────────────────────────────
export function setSfxVolume(v)   { sfxVolume   = Math.max(0, Math.min(1, v)); }
export function setMusicVolume(v) {
  musicVolume = Math.max(0, Math.min(1, v));
  if (musicEl) musicEl.volume = musicVolume;
}

export function getMuted()       { return muted; }
export function getSfxVolume()   { return sfxVolume; }
export function getMusicVolume() { return musicVolume; }
