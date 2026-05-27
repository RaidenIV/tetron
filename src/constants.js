// ─── constants.js ─────────────────────────────────────────────────────────────
// Baseline constants. The control panel overrides most of these at runtime
// via state.params.*. These are just the initial defaults.

// ── Player ────────────────────────────────────────────────────────────────────
export const PLAYER_SPEED    = 7;
export const PLAYER_MAX_HP   = 100;
export const DASH_SPEED      = 28;
export const DASH_DURATION   = 0.18;
export const DASH_COOLDOWN   = 1.4;
export const DASH_SLOW_SCALE = 0.15;
export const SLOW_SNAP_RATE  = 22;
export const SLOW_RECOVER_RATE = 7;

// ── Enemy ─────────────────────────────────────────────────────────────────────
export const ENEMY_SPEED          = 3.08;
export const ENEMY_CONTACT_DPS    = 18;
export const ENEMY_BULLET_SPEED   = 8;
export const ENEMY_BULLET_LIFETIME= 3.0;
export const ENEMY_BULLET_DMG     = 8;
export const STAGGER_DURATION     = 0.12;
export const SPAWN_FLASH_DURATION = 0.65;
export const ELITE_FIRE_RATE = { 1: 3.0, 3: 2.5, 5: 2.0, 7: 1.5, 9: 1.2, 10: 0.9 };

// ── Weapons ───────────────────────────────────────────────────────────────────
export const BULLET_SPEED    = 14;
export const BULLET_LIFETIME = 2.2;
export const BASE_BULLET_DMG = 10;

// ── Enemy types ───────────────────────────────────────────────────────────────
export const ENEMY_TYPE = Object.freeze({
  RUSHER:     'rusher',
  ORBITER:    'orbiter',
  TANKER:     'tanker',
  SNIPER:     'sniper',
  TELEPORTER: 'teleporter',
  SHIELDED:   'shielded',
  SPLITTER:   'splitter',
  BOSS:       'boss',
});

export const ELITE_TYPES = ['orbiter', 'tanker', 'sniper', 'shielded'];

export const ENEMY_DEFS = Object.freeze({
  [ENEMY_TYPE.RUSHER]:     { hpPct: 0.50, metallic: false, color: 0x888888, scale: 1.0,  xp: 10, coin: 0 },
  [ENEMY_TYPE.ORBITER]:    { hpPct: 0.60, metallic: true,  color: 0x00ffcc, scale: 1.1,  xp: 20, coin: 1 },
  [ENEMY_TYPE.TANKER]:     { hpPct: 3.00, metallic: true,  color: 0xff8800, scale: 2.0,  xp: 50, coin: 2 },
  [ENEMY_TYPE.SNIPER]:     { hpPct: 0.40, metallic: false, color: 0xcc44ff, scale: 0.85, xp: 25, coin: 1 },
  [ENEMY_TYPE.TELEPORTER]: { hpPct: 0.70, metallic: true,  color: 0x00aaff, scale: 1.0,  xp: 30, coin: 1 },
  [ENEMY_TYPE.SHIELDED]:   { hpPct: 1.50, metallic: true,  color: 0xffee00, scale: 1.3,  xp: 40, coin: 2 },
  [ENEMY_TYPE.SPLITTER]:   { hpPct: 1.20, metallic: false, color: 0x88ff44, scale: 1.4,  xp: 45, coin: 2 },
  [ENEMY_TYPE.BOSS]:       { hpPct: 8.00, metallic: true,  color: 0xff2222, scale: 2.5,  xp:200, coin: 10 },
});

export const STANDARD_ENEMY_SIZE_MULT = 1.0;
export const BOSS_SCALE = 2.5;

// Helper: enemy HP from params
export function getBaseEnemyHP(enemyType, params) {
  const def = ENEMY_DEFS[enemyType];
  if (!def) return Math.round(params.playerMaxHP * params.enemyHPScale);
  return Math.round(params.playerMaxHP * def.hpPct * params.enemyHPScale);
}
