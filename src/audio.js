// ─── audio.js ─────────────────────────────────────────────────────────────────
// Minimal audio stub for the testbed. Provides playSound() and volume controls
// without any music or complex loading. SFX can be wired up optionally.

let _sfxVolume   = 0.5;
let _muted       = false;
let _ctx         = null;
const _buffers   = new Map();

export function getSfxVolume()   { return _sfxVolume; }
export function getMuted()       { return _muted; }
export function setSfxVolume(v)  { _sfxVolume = Math.max(0, Math.min(1, v)); }
export function setMuted(v)      { _muted = !!v; }
export function toggleMute()     { _muted = !_muted; }

// Stub — no music in testbed
export function startMusic()     {}
export function stopMusic()      {}
export function pauseMusic()     {}
export function resumeMusic()    {}
export function setMusicVolume() {}
export function getMusicVolume() { return 0; }

export async function resumeAudioContext() {
  if (!_ctx) {
    try { _ctx = new AudioContext(); } catch {}
  }
  if (_ctx && _ctx.state === 'suspended') {
    try { await _ctx.resume(); } catch {}
  }
}

/**
 * Play a named sound. In the testbed we generate simple procedural tones
 * using the Web Audio API so no WAV files are required.
 */
const TONES = {
  shoot:       { freq: 880,  dur: 0.04, type: 'sawtooth', gain: 0.12 },
  player_hit:  { freq: 200,  dur: 0.12, type: 'square',   gain: 0.18 },
  explode:     { freq: 80,   dur: 0.25, type: 'sawtooth', gain: 0.22 },
  explode_elite:{ freq: 60,  dur: 0.35, type: 'sawtooth', gain: 0.28 },
  elite_hit:   { freq: 440,  dur: 0.06, type: 'square',   gain: 0.10 },
  standard_hit:{ freq: 660,  dur: 0.04, type: 'square',   gain: 0.08 },
  dash:        { freq: 1200, dur: 0.08, type: 'sine',     gain: 0.10 },
};

export function playSound(name, volumeMult = 1, _pitch = 1) {
  if (_muted || !_ctx) return;
  const t = TONES[name];
  if (!t) return;
  try {
    const osc  = _ctx.createOscillator();
    const gain = _ctx.createGain();
    osc.type      = t.type;
    osc.frequency.value = t.freq * _pitch;
    gain.gain.setValueAtTime(t.gain * _sfxVolume * volumeMult, _ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _ctx.currentTime + t.dur);
    osc.connect(gain);
    gain.connect(_ctx.destination);
    osc.start();
    osc.stop(_ctx.currentTime + t.dur);
  } catch {}
}
