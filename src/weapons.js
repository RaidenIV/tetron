// src/weapons.js
// Screen-aimed player weapons. Aiming uses a two-stage approach:
//   Stage 1: camera ray through reticle centre → resolve world aim target
//            (enemy aim volumes first, then fallback to far point)
//   Stage 2: projectiles spawn at the right-hand weapon muzzle, then aim toward
//            that resolved target. This keeps shots accurate at all distances
//            regardless of camera offset.
import * as THREE from 'three';
import { state } from './state.js';
import { scene, camera } from './renderer.js';
import { playerGroup, getPlayerWeaponMuzzle, triggerPlayerWeaponRecoil } from './player.js';
import { damageEnemiesAt, damageEnemiesAlongSegment, damageEnemiesInRadius, getEnemies, getAllies } from './enemies.js';
import { isPlacedObjectHit } from './placer.js';
import { getSfxVolume, applyBulletTimeAudioPitch, registerManagedAudio, playObjectExplosionSound } from './audio.js';

const _up = new THREE.Vector3(0, 1, 0);
const _spawnPos = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _aimRaycaster = new THREE.Raycaster();
const _aimNdc = new THREE.Vector2(0, 0); // always reticle centre

// ── Aim constants (from AIMING.md) ───────────────────────────────────────────
const AIM_FALLBACK_DISTANCE = 1000;
const AIM_ENEMY_RADIUS_PADDING = 0.15;
const AIM_MIN_TARGET_DISTANCE = 0.75;
const PROJECTILE_GRAVITY = 16;

// ── Aim result cached each frame — shared between firing and reticle hover ───
// Stored outside state so Three.js objects don't pollute serialisable state.
export const aimResult = {
  type: 'fallback',       // 'enemy' | 'fallback'
  point: new THREE.Vector3(),
  enemy: null,
};

// ── Projectile visuals ───────────────────────────────────────────────────────
const _projectileGeo = new THREE.CapsuleGeometry(0.055, 0.7, 6, 12);
const _rocketGeo = new THREE.CapsuleGeometry(0.09, 0.95, 8, 14);
const _grenadeGeo = new THREE.SphereGeometry(0.16, 14, 10);
const _explosionGeo = new THREE.SphereGeometry(1, 24, 12);
const _projectileShockwaveGeo = new THREE.SphereGeometry(1, 32, 16);

const _laserCoreMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xffffff,
  emissiveIntensity: 0.45,
  metalness: 0.0,
  roughness: 0.25,
});
const _laserGlowMat = new THREE.MeshBasicMaterial({
  color: 0xff1100,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});
const _solidProjectileMat = new THREE.MeshStandardMaterial({
  color: 0xd8dde6,
  emissive: 0x111111,
  emissiveIntensity: 0.08,
  metalness: 0.2,
  roughness: 0.36,
});
const _grenadeMat = new THREE.MeshStandardMaterial({
  color: 0x2d332d,
  emissive: 0x0b120b,
  emissiveIntensity: 0.04,
  metalness: 0.1,
  roughness: 0.62,
});
const _explosionMat = new THREE.MeshBasicMaterial({
  color: 0xffb24a,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

const _activeProjectiles = [];
const _activeExplosions = [];
const _activeProjectileShockwaves = [];
const _activeProjectileParticles = [];
const _projectileParticlePool = [];
const PROJECTILE_PARTICLE_GRAVITY = 18;
let _weaponCooldown = 0;
let _projectileShockwaveId = 1;
let _rifleTracerShotCounter = 0;

const MAGAZINE_WEAPON_TYPES = new Set(['pistol', 'rifle', 'shotgun', 'sniperRifle', 'rocketLauncher']);
const WEAPON_AMMO_SPECS = Object.freeze({
  pistol: { prefix: 'Pistol', label: 'PISTOL', magazineKey: 'weaponPistolMagazineSize', totalKey: 'weaponPistolTotalAmmo', defaultMagazine: 12, defaultTotal: 60, defaultReloadTime: 1.0 },
  rifle: { prefix: 'Rifle', label: 'RIFLE', magazineKey: 'weaponRifleMagazineSize', totalKey: 'weaponRifleTotalAmmo', defaultMagazine: 30, defaultTotal: 180, defaultReloadTime: 1.25 },
  shotgun: { prefix: 'Shotgun', label: 'SHOTGUN', magazineKey: 'weaponShotgunMagazineSize', totalKey: 'weaponShotgunTotalAmmo', defaultMagazine: 8, defaultTotal: 40, defaultReloadTime: 1.6 },
  sniperRifle: { prefix: 'Sniper', label: 'SNIPER', magazineKey: 'weaponSniperMagazineSize', totalKey: 'weaponSniperTotalAmmo', defaultMagazine: 5, defaultTotal: 25, defaultReloadTime: 2.0 },
  grenades: { prefix: 'Grenade', label: 'GRENADES', magazineKey: null, totalKey: 'weaponGrenadeTotalAmmo', defaultMagazine: 0, defaultTotal: 10, defaultReloadTime: 0 },
  rocketLauncher: { prefix: 'Rocket', label: 'ROCKET', magazineKey: 'weaponRocketClipCapacity', totalKey: 'weaponRocketTotalAmmo', defaultMagazine: 1, defaultTotal: 8, defaultReloadTime: 2.4 },
});

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function getOverallBloomFactor() {
  const raw = Number(state.params.overallBloomIntensity);
  return clamp(Number.isFinite(raw) ? raw : 1, 0, 4);
}

function hexColor(value, fallback = '#ffffff') {
  const color = typeof value === 'string' && value.trim() ? value : fallback;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function boolParam(value, fallback = false) {
  if (value === true || value === false) return value;
  return fallback;
}

function numParam(value, fallback, min = -Infinity, max = Infinity) {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) ? numeric : fallback;
  return clamp(resolved, min, max);
}

function intParam(value, fallback, min = 0, max = 9999) {
  return Math.round(numParam(value, fallback, min, max));
}

function getAmmoSpec(type = getSelectedWeaponType()) {
  return WEAPON_AMMO_SPECS[type] || WEAPON_AMMO_SPECS.rifle;
}

function getConfiguredMagazineSize(type = getSelectedWeaponType()) {
  const spec = getAmmoSpec(type);
  if (!spec.magazineKey) return 0;
  return intParam(state.params[spec.magazineKey], spec.defaultMagazine, 1, 9999);
}

function getConfiguredTotalAmmo(type = getSelectedWeaponType()) {
  const spec = getAmmoSpec(type);
  return intParam(state.params[spec.totalKey], spec.defaultTotal, 0, 99999);
}

function getConfiguredReloadTime(type = getSelectedWeaponType()) {
  const spec = getAmmoSpec(type);
  if (!spec.magazineKey) return 0;
  const key = `weapon${spec.prefix}ReloadTime`;
  return numParam(state.params[key], spec.defaultReloadTime || 1, 0, 10);
}

function getReloadRecord(type = getSelectedWeaponType()) {
  state.weaponReloads = state.weaponReloads || {};
  return state.weaponReloads[type] || null;
}

function isWeaponReloading(type = getSelectedWeaponType()) {
  const record = getReloadRecord(type);
  return !!record && Number(record.timeRemaining) > 0;
}

function clearWeaponReload(type = getSelectedWeaponType()) {
  if (state.weaponReloads) delete state.weaponReloads[type];
}

function canReloadWeapon(type = getSelectedWeaponType()) {
  const spec = getAmmoSpec(type);
  if (!spec.magazineKey || isWeaponReloading(type)) return false;
  const magazineSize = getConfiguredMagazineSize(type);
  const record = getAmmoRecord(type);
  const missing = Math.max(0, magazineSize - record.magazine);
  if (missing <= 0) return false;
  return state.params.weaponInfiniteAmmo === true || record.reserve > 0;
}

function completeWeaponReload(type = getSelectedWeaponType()) {
  const spec = getAmmoSpec(type);
  if (!spec.magazineKey) return false;

  const magazineSize = getConfiguredMagazineSize(type);
  const record = getAmmoRecord(type);
  if (state.params.weaponInfiniteAmmo === true) {
    record.magazine = magazineSize;
    clearWeaponReload(type);
    syncWeaponAmmoHud();
    return true;
  }

  const missing = Math.max(0, magazineSize - record.magazine);
  if (missing <= 0 || record.reserve <= 0) {
    clearWeaponReload(type);
    syncWeaponAmmoHud();
    return false;
  }
  const loaded = Math.min(missing, record.reserve);
  record.magazine += loaded;
  record.reserve -= loaded;
  clearWeaponReload(type);
  syncWeaponAmmoHud();
  return loaded > 0;
}

function updateWeaponReloads(delta) {
  if (!state.weaponReloads) return;
  Object.entries(state.weaponReloads).forEach(([type, record]) => {
    if (!record || Number(record.timeRemaining) <= 0) {
      clearWeaponReload(type);
      return;
    }
    record.timeRemaining = Math.max(0, Number(record.timeRemaining) - Math.max(0, delta));
    if (record.timeRemaining <= 0) completeWeaponReload(type);
  });
}

function getAmmoRecord(type = getSelectedWeaponType()) {
  const spec = getAmmoSpec(type);
  const magazineSize = getConfiguredMagazineSize(type);
  const totalAmmo = getConfiguredTotalAmmo(type);
  state.weaponAmmo = state.weaponAmmo || {};
  let record = state.weaponAmmo[type];
  if (!record || record._magazineSize !== magazineSize || record._totalAmmo !== totalAmmo) {
    record = {
      magazine: spec.magazineKey ? magazineSize : 0,
      reserve: totalAmmo,
      _magazineSize: magazineSize,
      _totalAmmo: totalAmmo,
    };
    state.weaponAmmo[type] = record;
    clearWeaponReload(type);
  }
  return record;
}

export function resetWeaponAmmo(type = getSelectedWeaponType()) {
  const spec = getAmmoSpec(type);
  const magazineSize = getConfiguredMagazineSize(type);
  const totalAmmo = getConfiguredTotalAmmo(type);
  state.weaponAmmo = state.weaponAmmo || {};
  state.weaponAmmo[type] = {
    magazine: spec.magazineKey ? magazineSize : 0,
    reserve: totalAmmo,
    _magazineSize: magazineSize,
    _totalAmmo: totalAmmo,
  };
  clearWeaponReload(type);
  syncWeaponAmmoHud();
}

export function resetAllWeaponAmmo() {
  state.weaponAmmo = {};
  state.weaponReloads = {};
  Object.keys(WEAPON_AMMO_SPECS).forEach(type => resetWeaponAmmo(type));
  syncWeaponAmmoHud();
}

function consumeWeaponAmmo(type = getSelectedWeaponType()) {
  if (isWeaponReloading(type)) {
    syncWeaponAmmoHud();
    return false;
  }

  if (state.params.weaponInfiniteAmmo === true) {
    syncWeaponAmmoHud();
    return true;
  }

  const spec = getAmmoSpec(type);
  const record = getAmmoRecord(type);
  if (spec.magazineKey) {
    if (record.magazine <= 0) {
      playEmptyMagazineSound();
      syncWeaponAmmoHud();
      return false;
    }
    record.magazine = Math.max(0, record.magazine - 1);
    syncWeaponAmmoHud();
    return true;
  }

  if (record.reserve <= 0) {
    syncWeaponAmmoHud();
    return false;
  }
  record.reserve = Math.max(0, record.reserve - 1);
  syncWeaponAmmoHud();
  return true;
}

export function reloadCurrentWeapon() {
  const type = getSelectedWeaponType();
  const spec = getAmmoSpec(type);
  if (!spec.magazineKey || !canReloadWeapon(type)) {
    syncWeaponAmmoHud();
    return false;
  }

  const reloadTime = getConfiguredReloadTime(type);
  if (reloadTime <= 0) {
    const completed = completeWeaponReload(type);
    if (completed) playReloadSound(type);
    return completed;
  }

  state.weaponReloads = state.weaponReloads || {};
  state.weaponReloads[type] = { timeRemaining: reloadTime, duration: reloadTime };
  playReloadSound(type);
  syncWeaponAmmoHud();
  return true;
}

export function syncWeaponAmmoHud() {
  const hud = document.getElementById('ammo-hud');
  if (!hud) return;
  const p = state.params;
  const type = getSelectedWeaponType();
  const spec = getAmmoSpec(type);
  const record = getAmmoRecord(type);
  const infinite = p.weaponInfiniteAmmo === true;
  const ammoHudVisible = p.hudVisible !== false && p.laserEnabled !== false && p.hudWeaponAmmoVisible !== false;
  hud.style.display = ammoHudVisible ? '' : 'none';
  const numericSetting = (value, fallback, min, max) => {
    const numeric = Number(value);
    return Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : fallback));
  };
  const scale = numericSetting(p.hudWeaponAmmoScale, 1, 0.5, 2);
  const opacity = numericSetting(p.hudWeaponAmmoOpacity, 1, 0, 1);
  const bgOpacity = numericSetting(p.hudWeaponAmmoBgOpacity, 0.36, 0, 1);
  const offsetX = numericSetting(p.hudWeaponAmmoOffsetX, 0, -400, 400);
  const offsetY = numericSetting(p.hudWeaponAmmoOffsetY, 0, -300, 300);
  hud.style.transformOrigin = 'bottom right';
  hud.style.transform = `scale(${scale})`;
  hud.style.opacity = String(opacity);
  hud.style.background = `rgba(0, 0, 0, ${bgOpacity})`;
  if (p.hudLayout === 'hud2') {
    hud.style.right = `calc(var(--sb-width, 320px) + 28px + ${offsetX}px)`;
  } else {
    hud.style.right = `calc(var(--sb-width, 320px) + 28px + var(--radar-size, 180px) + 14px + ${offsetX}px)`;
  }
  hud.style.bottom = `${28 + offsetY}px`;
  const magazineSize = getConfiguredMagazineSize(type);
  const reserveText = infinite ? '∞' : String(Math.max(0, record.reserve));
  const magazineText = spec.magazineKey ? (infinite ? String(magazineSize) : String(Math.max(0, record.magazine))) : '—';
  const magLabel = spec.magazineKey ? (type === 'rocketLauncher' ? 'CLIP' : 'MAG') : 'MAG';
  const title = hud.querySelector('[data-ammo-title]');
  const mag = hud.querySelector('[data-ammo-mag]');
  const reserve = hud.querySelector('[data-ammo-reserve]');
  const magLabelEl = hud.querySelector('[data-ammo-mag-label]');
  if (title) title.textContent = spec.label;
  if (mag) mag.textContent = magazineText;
  if (reserve) reserve.textContent = reserveText;
  if (magLabelEl) magLabelEl.textContent = magLabel;
}

function weaponValue(prefix, field, fallback, min = -Infinity, max = Infinity) {
  return numParam(state.params[`weapon${prefix}${field}`], fallback, min, max);
}

function weaponColor(prefix, fallback) {
  return hexColor(state.params[`weapon${prefix}ProjectileColor`], fallback);
}

function weaponBloomColor(prefix, fallback) {
  return hexColor(state.params[`weapon${prefix}ProjectileBloomColor`], fallback);
}

function weaponBloom(prefix, fallback = false) {
  return boolParam(state.params[`weapon${prefix}ProjectileBloom`], fallback);
}

function weaponBloomIntensity(prefix, fallback = 1) {
  return weaponValue(prefix, 'ProjectileBloomIntensity', fallback, 0, 3);
}

function weaponBloomSize(prefix, fallback = 1) {
  return weaponValue(prefix, 'ProjectileBloomSize', fallback, 0.25, 4);
}

function makeWeaponConfig(type, prefix, defaults, extra = {}) {
  const projectileSize = weaponValue(prefix, 'ProjectileSize', defaults.projectileSize, 0.05, 2);
  const projectileLength = weaponValue(prefix, 'ProjectileLength', defaults.projectileLength, 0.05, 8);
  const projectileBloomIntensity = weaponBloomIntensity(prefix, defaults.projectileBloomIntensity ?? 1);
  const projectileBloomSize = weaponBloomSize(prefix, defaults.projectileBloomSize ?? 1);
  return {
    type,
    fireRate: weaponValue(prefix, 'FireRate', defaults.fireRate, 0.1, 30),
    speed: weaponValue(prefix, 'ProjectileSpeed', defaults.speed, 1, 500),
    range: weaponValue(prefix, 'Range', defaults.range, 1, 500),
    damage: weaponValue(prefix, 'Damage', defaults.damage, 0, 1000),
    hitRadius: projectileSize,
    projectileSize,
    projectileLength,
    projectileColor: weaponColor(prefix, defaults.projectileColor),
    projectileBloomColor: weaponBloomColor(prefix, defaults.projectileBloomColor || defaults.projectileColor),
    projectileBloom: weaponBloom(prefix, defaults.projectileBloom),
    projectileBloomIntensity,
    projectileBloomSize,
    pellets: 1,
    spread: weaponValue(prefix, 'Spread', defaults.spread, 0, 1),
    recoil: type === 'grenades' ? 0 : weaponValue(prefix, 'Recoil', defaults.recoil ?? 0, 0, 1),
    visual: defaults.visual,
    ...extra,
  };
}

function applyLaserMaterials(config = null) {
  const p = state.params;
  const bloomIntensity = Number(p.laserBloomIntensity);
  _laserGlowMat.color.set(config?.projectileBloomColor || config?.projectileColor || p.laserBloomColor || '#ff1100');
  _laserGlowMat.opacity = (config ? config.projectileBloom !== false : p.laserBloom)
    ? clamp((Number.isFinite(bloomIntensity) ? bloomIntensity : 0.55) * getOverallBloomFactor(), 0, 3)
    : 0;
  _laserGlowMat.needsUpdate = true;
}

function getSelectedWeaponType() {
  const type = state.params.playerWeaponType;
  return ['pistol', 'rifle', 'shotgun', 'sniperRifle', 'grenades', 'rocketLauncher'].includes(type)
    ? type
    : 'rifle';
}

function getWeaponShockwaveConfig(prefix, radius, damage) {
  const p = state.params;
  const basePrefix = `weapon${prefix}Shockwave`;
  const splashRadiusFallback = prefix === 'Rocket'
    ? (p.destructionDestructibleSplashRadius ?? radius ?? 6)
    : (p.destructionDestructibleSplashRadius ?? radius ?? 5);
  return {
    speed: numParam(p[`${basePrefix}Speed`], p.destructionDestructibleShockwaveSpeed ?? 40, 0, 40),
    color: hexColor(p[`${basePrefix}Color`], p.destructionDestructibleShockwaveColor || '#ffffff'),
    transparency: numParam(p[`${basePrefix}Transparency`], p.destructionDestructibleShockwaveTransparency ?? 0.1, 0, 1),
    fadeTime: numParam(p[`${basePrefix}FadeTime`], p.destructionDestructibleShockwaveFadeTime ?? 0.12, 0.05, 3),
    delay: numParam(p[`${basePrefix}Delay`], p.destructionDestructibleShockwaveDelay ?? 0, 0, 3),
    splashDamage: numParam(p[`${basePrefix}SplashDamage`], p.destructionDestructibleSplashDamage ?? damage ?? 0, 0, 500),
    splashRadius: numParam(p[`${basePrefix}SplashRadius`], splashRadiusFallback, 0, 80),
    splashFalloff: numParam(p[`${basePrefix}SplashFalloff`], p.destructionDestructibleSplashFalloff ?? 1, 0.1, 4),
    splashMinFactor: numParam(p[`${basePrefix}SplashMinFactor`], p.destructionDestructibleSplashMinFactor ?? 0.15, 0, 1),
    particleCount: Math.max(0, Math.round(numParam(p[`${basePrefix}ParticleCount`], p.destructionDestructibleParticleCount ?? 40, 0, 250))),
    particleSize: numParam(p[`${basePrefix}ParticleSize`], p.destructionDestructibleParticleSize ?? 0.25, 0.05, 2),
    particleSpeed: numParam(p[`${basePrefix}ParticleSpeed`], p.destructionDestructibleParticleSpeed ?? 6, 0.1, 8),
    particleGlow: numParam(p[`${basePrefix}ParticleGlow`], p.destructionDestructibleParticleGlow ?? 8, 0, 24),
    particleDespawnTime: numParam(p[`${basePrefix}ParticleDespawnTime`], p.destructionDestructibleParticleDespawnTime ?? 1, 0.1, 10),
    particleColor: hexColor(p[`${basePrefix}ParticleColor`], p.destructionDestructibleColor || '#ffffff'),
    particlePhysics: p[`${basePrefix}ParticlePhysics`] === 'ethereal' ? 'ethereal' : 'gravity',
    radius: Math.max(0.5, Number(radius) || 5),
    damage: Math.max(0, Number(damage) || 0),
  };
}

function getWeaponConfig(type = getSelectedWeaponType()) {
  switch (type) {
    case 'pistol':
      return makeWeaponConfig('pistol', 'Pistol', { fireRate: 3.6, speed: 70, range: 55, damage: 24, spread: 0.01, projectileSize: 0.28, projectileLength: 0.65, projectileBloomIntensity: 1, projectileBloomSize: 1, projectileColor: '#d8dde6', projectileBloomColor: '#d8dde6', projectileBloom: false, visual: 'solid' });
    case 'shotgun': {
      const cfg = makeWeaponConfig('shotgun', 'Shotgun', { fireRate: 1.15, speed: 60, range: 28, damage: 12, spread: 0.16, projectileSize: 0.32, projectileLength: 0.75, projectileBloomIntensity: 1, projectileBloomSize: 1, projectileColor: '#d8dde6', projectileBloomColor: '#d8dde6', projectileBloom: false, visual: 'solid' });
      cfg.pellets = Math.max(1, Math.min(24, Math.round(Number(state.params.weaponShotgunPellets) || 8)));
      return cfg;
    }
    case 'sniperRifle':
      return makeWeaponConfig('sniperRifle', 'Sniper', { fireRate: 0.65, speed: 130, range: 180, damage: 120, spread: 0.002, projectileSize: 0.24, projectileLength: 0.56, projectileBloomIntensity: 1, projectileBloomSize: 1, projectileColor: '#d975ff', projectileBloomColor: '#d975ff', projectileBloom: true, visual: 'laser' });
    case 'grenades': {
      const cfg = makeWeaponConfig('grenades', 'Grenade', { fireRate: 0.72, speed: 16, range: 60, damage: 95, spread: 0.01, projectileSize: 0.25, projectileLength: 0.27, projectileBloomIntensity: 1, projectileBloomSize: 1, projectileColor: '#ff8844', projectileBloomColor: '#ff8844', projectileBloom: false, visual: 'grenade' }, { ballistic: true, physicsObject: true, explosive: true, fuse: 2.2 });
      cfg.radius = weaponValue('Grenade', 'Radius', 5, 0.5, 50);
      cfg.shockwave = getWeaponShockwaveConfig('Grenade', cfg.radius, cfg.damage);
      return cfg;
    }
    case 'rocketLauncher': {
      const cfg = makeWeaponConfig('rocketLauncher', 'Rocket', { fireRate: 0.68, speed: 34, range: 95, damage: 130, spread: 0.004, projectileSize: 0.42, projectileLength: 1.33, projectileBloomIntensity: 1, projectileBloomSize: 1, projectileColor: '#ff3333', projectileBloomColor: '#ff3333', projectileBloom: true, visual: 'rocket' }, { explosive: true, fuse: 4.0 });
      cfg.radius = weaponValue('Rocket', 'Radius', 6, 0.5, 60);
      cfg.shockwave = getWeaponShockwaveConfig('Rocket', cfg.radius, cfg.damage);
      return cfg;
    }
    case 'rifle':
    default:
      return makeWeaponConfig('rifle', 'Rifle', {
        fireRate: Math.max(0.1, Number(state.params.laserFireRate) || 5),
        speed: Math.max(1, Number(state.params.laserProjectileSpeed) || 80),
        range: Math.max(1, Number(state.params.laserRange) || 42),
        damage: 34,
        spread: 0.003,
        projectileSize: 0.36,
        projectileLength: 0.84,
        projectileBloomIntensity: 1,
        projectileBloomSize: 1,
        projectileColor: state.params.laserBloomColor || '#ff1100',
        projectileBloomColor: state.params.laserBloomColor || '#ff1100',
        projectileBloom: state.params.laserBloom !== false,
        visual: 'laser',
      });
  }
}

function createProjectileVisual(config) {
  const group = new THREE.Group();
  group.name = `PlayerProjectile_${config.type}`;

  const projectileColor = new THREE.Color(config.projectileColor || '#ffffff');
  const baseMat = config.visual === 'laser' ? _laserCoreMat : config.visual === 'grenade' ? _grenadeMat : _solidProjectileMat;
  const coreMat = baseMat.clone();
  const bloomIntensityValue = Number(config.projectileBloomIntensity);
  const bloomSizeValue = Number(config.projectileBloomSize);
  const bloomIntensity = clamp(Number.isFinite(bloomIntensityValue) ? bloomIntensityValue : 1, 0, 3);
  const bloomSize = clamp(Number.isFinite(bloomSizeValue) ? bloomSizeValue : 1, 0.25, 4);
  coreMat.color?.copy?.(projectileColor);
  if (coreMat.emissive) {
    coreMat.emissive.copy(projectileColor);
    coreMat.emissiveIntensity = config.projectileBloom ? 0.55 * bloomIntensity : Math.min(coreMat.emissiveIntensity ?? 0.08, 0.08);
  }

  let core;
  if (config.visual === 'grenade') {
    core = new THREE.Mesh(_grenadeGeo, coreMat);
  } else if (config.visual === 'rocket') {
    core = new THREE.Mesh(_rocketGeo, coreMat);
  } else {
    core = new THREE.Mesh(_projectileGeo, coreMat);
  }
  core.name = 'ProjectileCore';
  core.castShadow = false;
  core.receiveShadow = false;
  group.add(core);

  const sizeScale = clamp((Number(config.projectileSize) || 0.3) / 0.3, 0.15, 4);
  const baseLength = config.visual === 'rocket' ? 0.95 : config.visual === 'grenade' ? 0.32 : 0.7;
  const fallbackLength = baseLength * sizeScale;
  const desiredLength = clamp(Number(config.projectileLength) || fallbackLength, 0.05, 8);
  const lengthScale = clamp(desiredLength / Math.max(0.001, fallbackLength), 0.1, 12);
  core.scale.y = lengthScale;
  group.scale.setScalar(sizeScale);

  let glow = null;
  let glowMat = null;
  if (config.projectileBloom) {
    glowMat = _laserGlowMat.clone();
    glowMat.color.set(config.projectileBloomColor || config.projectileColor || '#ffffff');
    glowMat.opacity = clamp(0.55 * bloomIntensity * getOverallBloomFactor(), 0, 3);
    glow = new THREE.Mesh(config.visual === 'rocket' ? _rocketGeo : config.visual === 'grenade' ? _grenadeGeo : _projectileGeo, glowMat);
    glow.name = 'ProjectileGlow';
    const glowScaleX = config.visual === 'rocket' ? 1.45 : 1.85;
    const glowScaleY = config.visual === 'rocket' ? 1.08 : 1.18;
    glow.scale.set(glowScaleX * bloomSize, glowScaleY * bloomSize * lengthScale, glowScaleX * bloomSize);
    glow.castShadow = false;
    glow.receiveShadow = false;
    group.add(glow);
  }

  scene.add(group);
  return { group, core, glow, materials: glowMat ? [coreMat, glowMat] : [coreMat] };
}

function disposeProjectile(projectile) {
  scene.remove(projectile.visual.group);
  projectile.visual.materials?.forEach(material => material?.dispose?.());
}

function spawnExplosionFlash(position, radius) {
  const mesh = new THREE.Mesh(_explosionGeo, _explosionMat.clone());
  mesh.name = 'PlayerWeaponExplosion';
  mesh.position.copy(position);
  mesh.scale.setScalar(0.01);
  scene.add(mesh);
  _activeExplosions.push({ mesh, radius: Math.max(0.25, radius), life: 0.22, maxLife: 0.22 });
}

function updateExplosionFlashes(delta) {
  for (let i = _activeExplosions.length - 1; i >= 0; i--) {
    const fx = _activeExplosions[i];
    fx.life -= delta;
    if (fx.life <= 0) {
      scene.remove(fx.mesh);
      fx.mesh.material?.dispose?.();
      _activeExplosions.splice(i, 1);
      continue;
    }
    const t = 1 - fx.life / fx.maxLife;
    fx.mesh.scale.setScalar(Math.max(0.01, fx.radius * t));
    fx.mesh.material.opacity = (1 - t) * 0.55;
  }
}

function spawnProjectileShockwave(position, cfg = {}) {
  const speed = Math.max(0, Number(cfg.speed) || 0);
  const fadeTime = clamp(Number(cfg.fadeTime) || 0.12, 0.05, 3);
  const visualMaxRadius = Math.max(0, speed * fadeTime);
  const opacity = clamp(Number(cfg.transparency) || 0, 0, 1);
  const damage = Math.max(0, Number(cfg.splashDamage ?? cfg.damage) || 0);
  const splashRadius = clamp(Number(cfg.splashRadius ?? cfg.radius) || 0, 0, 80);
  const damageMaxRadius = splashRadius > 0 ? splashRadius : Math.max(0, Number(cfg.radius) || visualMaxRadius);
  if (visualMaxRadius <= 0 && (damage <= 0 || damageMaxRadius <= 0)) return;

  const event = {
    id: `weapon_splash_${_projectileShockwaveId++}`,
    x: position.x, y: position.y, z: position.z,
    currentRadius: 0,
    maxRadius: damageMaxRadius,
    damage,
    damageFalloff: clamp(Number(cfg.splashFalloff) || 1, 0.1, 4),
    minDamageFactor: clamp(Number(cfg.splashMinFactor) || 0, 0, 1),
    active: false,
    hitNpcIds: [],
    hitEnemyIds: [],
    hitObjectIds: [],
    hitPlayer: false,
  };
  state.explosionSplashEvents = state.explosionSplashEvents || [];
  state.explosionSplashEvents.push(event);

  const material = new THREE.MeshBasicMaterial({
    color: hexColor(cfg.color, '#ffffff'),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(_projectileShockwaveGeo, material);
  mesh.name = `WeaponShockwave_${event.id}`;
  mesh.position.copy(position);
  mesh.scale.setScalar(0.001);
  mesh.visible = false;
  scene.add(mesh);
  _activeProjectileShockwaves.push({
    mesh,
    event,
    speed,
    visualMaxRadius,
    damageMaxRadius,
    opacity,
    fadeTime,
    age: -clamp(Number(cfg.delay) || 0, 0, 3),
  });
}

function updateProjectileShockwaves(delta) {
  for (let i = _activeProjectileShockwaves.length - 1; i >= 0; i--) {
    const shockwave = _activeProjectileShockwaves[i];
    shockwave.age += delta;
    if (shockwave.age < 0) {
      shockwave.mesh.visible = false;
      if (shockwave.event) {
        shockwave.event.active = false;
        shockwave.event.currentRadius = 0;
      }
      continue;
    }
    const t = clamp(shockwave.age / shockwave.fadeTime, 0, 1);
    const visualRadius = Math.max(0.001, Math.min(shockwave.visualMaxRadius, shockwave.speed > 0 ? shockwave.speed * shockwave.age : shockwave.visualMaxRadius * t));
    const damageRadius = Math.max(0, Math.min(shockwave.damageMaxRadius, shockwave.damageMaxRadius * t));
    shockwave.mesh.visible = shockwave.visualMaxRadius > 0 && shockwave.opacity > 0;
    shockwave.mesh.scale.setScalar(visualRadius);
    shockwave.mesh.material.opacity = shockwave.opacity * (1 - t);
    if (shockwave.event) {
      shockwave.event.active = true;
      shockwave.event.currentRadius = damageRadius;
    }
    if (shockwave.age >= shockwave.fadeTime) {
      scene.remove(shockwave.mesh);
      shockwave.mesh.material?.dispose?.();
      if (shockwave.event) {
        state.explosionSplashEvents = (state.explosionSplashEvents || []).filter(event => event !== shockwave.event);
      }
      _activeProjectileShockwaves.splice(i, 1);
    }
  }
}

function acquireProjectileParticle(color) {
  const mesh = _projectileParticlePool.pop() || new THREE.Mesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 1,
      roughness: 0.52,
      metalness: 0.05,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.material.color.set(color);
  mesh.material.emissive.set(color);
  mesh.material.opacity = 1;
  mesh.material.emissiveIntensity = 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = true;
  scene.add(mesh);
  return mesh;
}

function releaseProjectileParticle(particle) {
  scene.remove(particle.mesh);
  particle.mesh.visible = false;
  _projectileParticlePool.push(particle.mesh);
}

function spawnProjectileExplosionParticles(position, cfg = {}) {
  const count = Math.max(0, Math.min(250, Math.round(Number(cfg.particleCount) || 0)));
  if (count <= 0) return;
  const color = new THREE.Color(hexColor(cfg.particleColor, cfg.color || '#ffffff'));
  const size = clamp(Number(cfg.particleSize) || 0.25, 0.05, 2);
  const speedMult = clamp(Number(cfg.particleSpeed) || 1, 0.1, 8);
  const glow = clamp(Number(cfg.particleGlow) || 0, 0, 24);
  const maxLife = clamp(Number(cfg.particleDespawnTime) || 1, 0.1, 10);
  const physics = cfg.particlePhysics === 'ethereal' ? 'ethereal' : 'gravity';

  for (let i = 0; i < count; i++) {
    const mesh = acquireProjectileParticle(color);
    const baseRadius = (0.08 + Math.random() * 0.14) * size;
    const yaw = Math.random() * Math.PI * 2;
    const pitch = (Math.random() - 0.2) * Math.PI * 0.75;
    const speed = (3.5 + Math.random() * 8.5) * speedMult;
    mesh.position.copy(position);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mesh.scale.setScalar(baseRadius);
    _activeProjectileParticles.push({
      mesh,
      baseRadius,
      vx: Math.cos(yaw) * Math.cos(pitch) * speed,
      vy: Math.sin(pitch) * speed + (physics === 'gravity' ? 2.25 * speedMult : 0.65 * speedMult),
      vz: Math.sin(yaw) * Math.cos(pitch) * speed,
      rx: (Math.random() - 0.5) * 8,
      ry: (Math.random() - 0.5) * 8,
      rz: (Math.random() - 0.5) * 8,
      life: maxLife,
      maxLife,
      glowCap: glow,
      physics,
    });
  }
}

function updateProjectileExplosionParticles(delta) {
  for (let i = _activeProjectileParticles.length - 1; i >= 0; i--) {
    const particle = _activeProjectileParticles[i];
    particle.life -= delta;
    if (particle.life <= 0) {
      _activeProjectileParticles.splice(i, 1);
      releaseProjectileParticle(particle);
      continue;
    }
    particle.mesh.position.x += particle.vx * delta;
    particle.mesh.position.y += particle.vy * delta;
    particle.mesh.position.z += particle.vz * delta;
    particle.mesh.rotation.x += particle.rx * delta;
    particle.mesh.rotation.y += particle.ry * delta;
    particle.mesh.rotation.z += particle.rz * delta;
    if (particle.physics === 'gravity') {
      particle.vy -= PROJECTILE_PARTICLE_GRAVITY * delta;
      if (particle.mesh.position.y < 0.03) {
        particle.mesh.position.y = 0.03;
        particle.vy = Math.abs(particle.vy) * 0.24;
        particle.vx *= 0.82;
        particle.vz *= 0.82;
      }
    } else {
      particle.vy += 0.18 * delta;
    }
    const t = clamp(particle.life / particle.maxLife, 0, 1);
    particle.mesh.scale.setScalar(Math.max(0.001, t * 1.15 * particle.baseRadius));
    particle.mesh.material.opacity = t;
    particle.mesh.material.emissiveIntensity = Math.max(0, t * particle.glowCap * getOverallBloomFactor());
  }
}


// ── Two-stage aim resolver (AIMING.md) ───────────────────────────────────────

/**
 * Test a ray against a sphere centred at the enemy's visual mid-point.
 * Returns { point, distance } or null.
 */
function intersectEnemyAimVolume(rayOrigin, rayDir, enemy) {
  if (!enemy || !enemy.group) return null;

  const center = enemy.group.position.clone();
  // Aim at visual centre, not the floor origin.
  const bodyHeight = (enemy.radius * 2 + (enemy.sizeMult || 1) * 1.2);
  center.y += bodyHeight * 0.5;

  const radius = (enemy.radius || 0.4) + AIM_ENEMY_RADIUS_PADDING;

  const toCenter = center.clone().sub(rayOrigin);
  const proj = toCenter.dot(rayDir);
  if (proj < 0) return null;

  const closest = rayOrigin.clone().addScaledVector(rayDir, proj);
  const miss = closest.distanceTo(center);
  if (miss > radius) return null;

  const offset = Math.sqrt(Math.max(0, radius * radius - miss * miss));
  const hitDist = Math.max(0, proj - offset);

  return {
    point: rayOrigin.clone().addScaledVector(rayDir, hitDist),
    distance: hitDist,
  };
}

/**
 * Stage 1: cast camera ray through reticle centre, test enemy volumes,
 * fall back to far point. Updates the shared `aimResult` object.
 * Called once per frame from loop.js so both hover colour and firing use it.
 */
export function resolveAimTarget() {
  camera.updateMatrixWorld(true);
  _aimNdc.set(0, 0);
  _aimRaycaster.setFromCamera(_aimNdc, camera);

  const rayOrigin = _aimRaycaster.ray.origin;
  const rayDir    = _aimRaycaster.ray.direction;

  let bestHit = null;

  const aimTargets = state.params.allyFriendlyFire === true
    ? getEnemies().concat(getAllies())
    : getEnemies();

  for (const enemy of aimTargets) {
    if (!enemy || !enemy.group) continue;
    const hit = intersectEnemyAimVolume(rayOrigin, rayDir, enemy);
    if (!hit) continue;
    if (!bestHit || hit.distance < bestHit.distance) {
      bestHit = { type: 'enemy', enemy, point: hit.point, distance: hit.distance };
    }
  }

  if (bestHit) {
    aimResult.type  = 'enemy';
    aimResult.enemy = bestHit.enemy;
    aimResult.point.copy(bestHit.point);
  } else {
    aimResult.type  = 'fallback';
    aimResult.enemy = null;
    aimResult.point.copy(rayOrigin).addScaledVector(rayDir, AIM_FALLBACK_DISTANCE);
  }
}

/**
 * Stage 2: given the resolved aim target and the projectile spawn position,
 * return the normalised direction the projectile should travel.
 */
function getProjectileDirection(spawnPos, targetPoint, out) {
  out.copy(targetPoint).sub(spawnPos);
  if (out.lengthSq() < AIM_MIN_TARGET_DISTANCE * AIM_MIN_TARGET_DISTANCE) {
    // Target is essentially at the muzzle — fall back to camera forward.
    camera.getWorldDirection(out);
  }
  return out.normalize();
}

function restartFeedbackAnimation(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

function triggerReticleHitFeedback(result = {}) {
  const p = state.params;
  if (p.hudVisible === false || p.reticleVisible === false) return;

  const marker = document.getElementById('hit-marker');
  if (marker && p.reticleHitMarkerEnabled !== false) {
    marker.style.display = 'block';
    marker.setAttribute('aria-hidden', 'false');
    const color = /^#[0-9a-f]{6}$/i.test(String(p.reticleHitMarkerColor || '')) ? p.reticleHitMarkerColor : '#ffffff';
    const size = clamp(Number(p.reticleHitMarkerSize) || 54, 12, 160);
    const weight = clamp(Number(p.reticleHitMarkerWeight) || 3, 0.5, 12);
    const opacity = clamp(Number(p.reticleHitMarkerOpacity) || 1, 0, 1);
    const duration = clamp(Number(p.reticleHitMarkerDuration) || 190, 80, 500);
    marker.style.setProperty('--hit-marker-color', color);
    marker.style.setProperty('--hit-marker-size', `${size}px`);
    marker.style.setProperty('--hit-marker-weight', `${weight}px`);
    marker.style.setProperty('--hit-marker-opacity', String(opacity));
    marker.style.setProperty('--hit-marker-duration', `${duration}ms`);
    marker.classList.remove('hit-marker-armor', 'hit-marker-critical');
    if (result.hitType === 'armor' || result.hitType === 'shield') marker.classList.add('hit-marker-armor');
    if (result.hitType === 'critical' || result.hitType === 'headshot') marker.classList.add('hit-marker-critical');
    restartFeedbackAnimation(marker, 'is-active');
  }

  if (result.killed === true && p.reticleKillConfirmEnabled !== false) {
    const kill = document.getElementById('kill-confirmation');
    if (kill) {
      const color = /^#[0-9a-f]{6}$/i.test(String(p.reticleKillConfirmColor || '')) ? p.reticleKillConfirmColor : '#ffffff';
      const size = clamp(Number(p.reticleKillConfirmSize) || 64, 12, 160);
      const opacity = clamp(Number(p.reticleKillConfirmOpacity) || 0.9, 0, 1);
      const duration = clamp(Number(p.reticleKillConfirmDuration) || 320, 80, 800);
      kill.style.setProperty('--kill-confirm-color', color);
      kill.style.setProperty('--kill-confirm-size', `${size}px`);
      kill.style.setProperty('--kill-confirm-opacity', String(opacity));
      kill.style.setProperty('--kill-confirm-duration', `${duration}ms`);
      restartFeedbackAnimation(kill, 'is-active');
    }
  }
}

window.addEventListener('game-lab-reticle-feedback', event => {
  triggerReticleHitFeedback(event.detail || {});
});

// ── Shoot sound ───────────────────────────────────────────────────────────────
const _audioCache = new Map();

function playWeaponAsset(path, volume, playbackRate = 1) {
  if (!volume || state.params.soundMuted) return;
  let base = _audioCache.get(path);
  if (!base) {
    base = registerManagedAudio(new Audio(path), playbackRate);
    _audioCache.set(path, base);
  }
  const audio = base.paused ? base : base.cloneNode();
  registerManagedAudio(audio, playbackRate);
  audio.currentTime = 0;
  audio.volume = clamp(volume, 0, 1);
  applyBulletTimeAudioPitch(audio, playbackRate);
  audio.play().catch(() => {});
}

function playShootSound(config) {
  const vol = getSfxVolume('soundSfx_shoot', 1);
  if (!vol || state.params.soundMuted) return;
  if (config.type === 'grenades') {
    playWeaponAsset('./assets/throw.wav', vol, 0.94 + Math.random() * 0.12);
    return;
  }
  if (config.type === 'rifle') {
    playWeaponAsset('./assets/blaster2.wav', vol, 0.96 + Math.random() * 0.08);
    return;
  }
  if (config.type === 'shotgun') {
    playWeaponAsset('./assets/shotgun2.wav', vol, 0.96 + Math.random() * 0.08);
    return;
  }
  if (config.type === 'sniperRifle') {
    playWeaponAsset('./assets/sniper.wav', vol, 0.98 + Math.random() * 0.04);
    return;
  }
  const pitchByWeapon = {
    pistol: 1.16,
    rocketLauncher: 0.58,
  };
  playWeaponAsset('./assets/blaster1.wav', vol, (pitchByWeapon[config.type] || 1) * (0.94 + Math.random() * 0.12));
}


function playReloadSound(type = getSelectedWeaponType()) {
  const vol = getSfxVolume(type === 'pistol' ? 'soundSfx_pistol_reload' : 'soundSfx_reload', 1);
  if (!vol || state.params.soundMuted) return;
  const path = type === 'sniperRifle' ? './assets/sniper_reload.wav' : './assets/reload.wav';
  playWeaponAsset(path, vol, 1);
}

function playEmptyMagazineSound() {
  const vol = getSfxVolume('soundSfx_empty', 1);
  if (!vol || state.params.soundMuted) return;
  playWeaponAsset('./assets/empty.wav', vol, 1);
}

// ── Firing ────────────────────────────────────────────────────────────────────
const _fireDir = new THREE.Vector3();
const _pelletDir = new THREE.Vector3();
const _cameraRight = new THREE.Vector3();
const _cameraUp = new THREE.Vector3();
const _velocity = new THREE.Vector3();

function randomSpreadDirection(baseDir, spread, out) {
  out.copy(baseDir);
  if (spread > 0) {
    _cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    _cameraUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * spread;
    out.addScaledVector(_cameraRight, Math.cos(angle) * radius);
    out.addScaledVector(_cameraUp, Math.sin(angle) * radius);
  }
  return out.normalize();
}



function shouldShowRifleTracer(config) {
  if (!config || config.type !== 'rifle' || state.params.weaponRifleTracers === false) return true;
  _rifleTracerShotCounter = (_rifleTracerShotCounter + 1) % 5;
  return _rifleTracerShotCounter === 0;
}

function getProjectileMuzzleClearance(config) {
  const length = Number(config?.projectileLength);
  const size = Number(config?.projectileSize);
  const halfLength = Number.isFinite(length) ? Math.max(0, length) * 0.5 : 0;
  const radius = Number.isFinite(size) ? Math.max(0.025, size * 0.5) : 0.125;
  return Math.max(radius, halfLength);
}

function createProjectile(config, dir) {
  const visual = createProjectileVisual(config);
  const showVisual = shouldShowRifleTracer(config);
  visual.group.visible = showVisual;
  if (visual.glow) visual.glow.visible = showVisual && config.projectileBloom !== false;
  visual.group.position.copy(_spawnPos).addScaledVector(dir, getProjectileMuzzleClearance(config));
  _tmpQuat.setFromUnitVectors(_up, dir);
  visual.group.quaternion.copy(_tmpQuat);
  if (visual.glow) visual.glow.visible = showVisual && config.projectileBloom !== false;

  if (config.ballistic) {
    _velocity.copy(dir).multiplyScalar(config.speed);
    _velocity.y += 3.8;
  } else {
    _velocity.copy(dir).multiplyScalar(config.speed);
  }

  const projectile = {
    config,
    visual,
    velocity: _velocity.clone(),
    distance: 0,
    maxRange: Math.max(1, config.range),
    life: config.fuse || 4,
    age: 0,
    radius: Math.max(0.05, Number(config.projectileSize) || 0.25) * 0.5,
    spin: new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
    ),
    previousPosition: visual.group.position.clone(),
  };
  _activeProjectiles.push(projectile);
}

function explodeProjectile(projectile) {
  const { config, visual } = projectile;
  const radius = Math.max(0.5, Number(config.radius) || Number(config.shockwave?.splashRadius) || 4);
  playObjectExplosionSound(visual.group.position);
  spawnExplosionFlash(visual.group.position, radius);
  if (config.shockwave) {
    spawnProjectileExplosionParticles(visual.group.position, config.shockwave);
    spawnProjectileShockwave(visual.group.position, config.shockwave);
  } else {
    const result = damageEnemiesInRadius(visual.group.position, radius, Math.max(1, Number(config.damage) || 1), 1.15);
    if (result?.hit) triggerReticleHitFeedback(result);
  }
  disposeProjectile(projectile);
}

function fireWeapon() {
  const config = getWeaponConfig();
  if (isWeaponReloading(config.type)) return;
  if (!consumeWeaponAmmo(config.type)) return;

  // Muzzle position: actual right-hand weapon muzzle from the player visual.
  getPlayerWeaponMuzzle(_spawnPos);

  // Stage 2: aim from muzzle toward the pre-resolved aim target point.
  const targetPoint = aimResult.point;
  getProjectileDirection(_spawnPos, targetPoint, _fireDir);

  const pelletCount = Math.max(1, Math.min(24, Math.round(config.pellets || 1)));
  for (let i = 0; i < pelletCount; i++) {
    randomSpreadDirection(_fireDir, Number(config.spread) || 0, _pelletDir);
    createProjectile(config, _pelletDir);
  }

  playShootSound(config);
  triggerPlayerWeaponRecoil(config.type, config.recoil);
}

export function updateLaserProjectiles(delta, projectileDelta = delta) {
  const p = state.params;
  const config = getWeaponConfig();
  updateWeaponReloads(delta);
  syncWeaponAmmoHud();
  applyLaserMaterials(config);
  updateExplosionFlashes(delta);
  updateProjectileShockwaves(delta);
  updateProjectileExplosionParticles(delta);
  const fireRate = Math.max(0.1, Number(config.fireRate) || 1);
  const interval = 1 / fireRate;
  const cooldownDelta = Math.max(0, Number(projectileDelta) || delta);

  if (!p.laserEnabled || !state.primaryFire) {
    _weaponCooldown = 0;
  } else {
    _weaponCooldown -= cooldownDelta;
    if (_weaponCooldown <= 0) {
      fireWeapon();
      _weaponCooldown = interval;
    }
  }

  for (let i = _activeProjectiles.length - 1; i >= 0; i--) {
    const projectile = _activeProjectiles[i];
    const { visual, config: projectileConfig } = projectile;
    const step = projectile.velocity.length() * projectileDelta;
    const previousPosition = projectile.previousPosition || (projectile.previousPosition = visual.group.position.clone());
    previousPosition.copy(visual.group.position);

    projectile.age += delta;
    projectile.life -= delta;
    if (projectileConfig.ballistic) {
      projectile.velocity.y -= PROJECTILE_GRAVITY * projectileDelta;
    }

    visual.group.position.addScaledVector(projectile.velocity, projectileDelta);
    projectile.distance += step;

    if (projectileConfig.physicsObject) {
      visual.group.rotation.x += projectile.spin.x * projectileDelta;
      visual.group.rotation.y += projectile.spin.y * projectileDelta;
      visual.group.rotation.z += projectile.spin.z * projectileDelta;
      const floorY = Math.max(0.035, projectile.radius);
      if (visual.group.position.y <= floorY) {
        visual.group.position.y = floorY;
        if (projectile.velocity.y < 0) {
          projectile.velocity.y = Math.abs(projectile.velocity.y) * 0.34;
          projectile.velocity.x *= 0.72;
          projectile.velocity.z *= 0.72;
          projectile.spin.multiplyScalar(0.68);
        }
      }
    } else if (projectile.velocity.lengthSq() > 0.0001) {
      _tmpQuat.setFromUnitVectors(_up, projectile.velocity.clone().normalize());
      visual.group.quaternion.copy(_tmpQuat);
    }
    if (visual.glow) visual.glow.visible = visual.group.visible && projectileConfig.projectileBloom !== false;

    const rocketFloorY = Math.max(0.035, projectile.radius);
    const hitGround = projectileConfig.ballistic && !projectileConfig.physicsObject && projectile.age > 0.08 && visual.group.position.y <= 0.09;
    const rocketHitFloor = projectileConfig.visual === 'rocket' && projectile.age > 0.02 && visual.group.position.y <= rocketFloorY;
    const laserThroughFloor = projectileConfig.visual === 'laser' && visual.group.position.y <= 0.02;
    const hitObject = isPlacedObjectHit(visual.group.position, projectileConfig.visual === 'rocket' ? 0.16 : 0.1);

    if (rocketHitFloor) {
      visual.group.position.y = rocketFloorY;
    }

    if (laserThroughFloor || hitGround || rocketHitFloor || hitObject) {
      _activeProjectiles.splice(i, 1);
      if (projectileConfig.explosive) explodeProjectile(projectile);
      else disposeProjectile(projectile);
      continue;
    }

    if (projectileConfig.explosive) {
      const impactResult = damageEnemiesAlongSegment(previousPosition, visual.group.position, projectileConfig.hitRadius, 0)
        || damageEnemiesAt(visual.group.position, projectileConfig.hitRadius, 0);
      if (impactResult?.hit) {
        _activeProjectiles.splice(i, 1);
        explodeProjectile(projectile);
        continue;
      }
    } else {
      const hitResult = damageEnemiesAlongSegment(previousPosition, visual.group.position, projectileConfig.hitRadius, projectileConfig.damage)
        || damageEnemiesAt(visual.group.position, projectileConfig.hitRadius, projectileConfig.damage);
      if (hitResult?.hit) {
        triggerReticleHitFeedback(hitResult);
        _activeProjectiles.splice(i, 1);
        disposeProjectile(projectile);
        continue;
      }
    }

    if (projectile.life <= 0 || projectile.distance >= projectile.maxRange) {
      _activeProjectiles.splice(i, 1);
      if (projectileConfig.explosive) explodeProjectile(projectile);
      else disposeProjectile(projectile);
    }
  }
}
