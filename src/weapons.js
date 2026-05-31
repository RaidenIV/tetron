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
import { playerGroup, getPlayerWeaponMuzzle } from './player.js';
import { damageEnemiesAt, damageEnemiesInRadius, getEnemies } from './enemies.js';
import { isPlacedObjectHit } from './placer.js';

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
let _weaponCooldown = 0;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function getOverallBloomFactor() {
  const raw = Number(state.params.overallBloomIntensity);
  return clamp(Number.isFinite(raw) ? raw : 1, 0, 4);
}

function applyLaserMaterials() {
  const p = state.params;
  const bloomIntensity = Number(p.laserBloomIntensity);
  _laserGlowMat.color.set(p.laserBloomColor || '#ff1100');
  _laserGlowMat.opacity = p.laserBloom
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

function getWeaponConfig(type = getSelectedWeaponType()) {
  const p = state.params;
  switch (type) {
    case 'pistol':
      return { type, fireRate: 3.6, speed: 70, range: 55, damage: Number(p.weaponPistolDamage) || 24, hitRadius: 0.28, pellets: 1, spread: 0.01, visual: 'solid' };
    case 'shotgun':
      return { type, fireRate: 1.15, speed: 60, range: 28, damage: Number(p.weaponShotgunDamage) || 12, hitRadius: 0.32, pellets: Math.round(Number(p.weaponShotgunPellets) || 8), spread: Number(p.weaponShotgunSpread) || 0.16, visual: 'solid' };
    case 'sniperRifle':
      return { type, fireRate: 0.65, speed: 130, range: 180, damage: Number(p.weaponSniperDamage) || 120, hitRadius: 0.24, pellets: 1, spread: 0.002, visual: 'laser' };
    case 'grenades':
      return { type, fireRate: 0.72, speed: 16, range: 60, damage: Number(p.weaponGrenadeDamage) || 95, radius: Number(p.weaponGrenadeRadius) || 5, hitRadius: 0.25, pellets: 1, spread: 0.01, visual: 'grenade', ballistic: true, explosive: true, fuse: 2.2 };
    case 'rocketLauncher':
      return { type, fireRate: 0.68, speed: 34, range: 95, damage: Number(p.weaponRocketDamage) || 130, radius: Number(p.weaponRocketRadius) || 6, hitRadius: 0.42, pellets: 1, spread: 0.004, visual: 'rocket', explosive: true, fuse: 4.0 };
    case 'rifle':
    default:
      return { type: 'rifle', fireRate: Math.max(0.1, Number(p.laserFireRate) || 5), speed: Math.max(1, Number(p.laserProjectileSpeed) || 80), range: Math.max(1, Number(p.laserRange) || 42), damage: Number(p.weaponRifleDamage) || 34, hitRadius: 0.36, pellets: 1, spread: 0.003, visual: 'laser' };
  }
}

function createProjectileVisual(config) {
  const group = new THREE.Group();
  group.name = `PlayerProjectile_${config.type}`;

  let core;
  if (config.visual === 'grenade') {
    core = new THREE.Mesh(_grenadeGeo, _grenadeMat);
  } else if (config.visual === 'rocket') {
    core = new THREE.Mesh(_rocketGeo, _solidProjectileMat);
  } else {
    core = new THREE.Mesh(_projectileGeo, config.visual === 'laser' ? _laserCoreMat : _solidProjectileMat);
  }
  core.name = 'ProjectileCore';
  core.castShadow = config.visual !== 'laser';
  core.receiveShadow = false;
  group.add(core);

  let glow = null;
  if (config.visual === 'laser' || config.visual === 'rocket') {
    glow = new THREE.Mesh(config.visual === 'rocket' ? _rocketGeo : _projectileGeo, _laserGlowMat);
    glow.name = 'ProjectileGlow';
    glow.scale.set(config.visual === 'rocket' ? 1.45 : 1.85, config.visual === 'rocket' ? 1.08 : 1.18, config.visual === 'rocket' ? 1.45 : 1.85);
    glow.castShadow = false;
    glow.receiveShadow = false;
    group.add(glow);
  }

  scene.add(group);
  return { group, core, glow };
}

function disposeProjectile(projectile) {
  scene.remove(projectile.visual.group);
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

  for (const enemy of getEnemies()) {
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

// ── Shoot sound ───────────────────────────────────────────────────────────────
let _blasterEl = null;
function playShootSound(config) {
  const vol = Math.max(0, Math.min(1,
    Number(state.params.soundSfxVolume ?? 1) * Number(state.params.soundSfx_shoot ?? 1)
  ));
  if (!vol || state.params.soundMuted) return;
  if (!_blasterEl) {
    _blasterEl = new Audio('./assets/blaster1.wav');
  }
  // Clone for overlapping shots; reuse element if already ended.
  const audio = _blasterEl.paused ? _blasterEl : _blasterEl.cloneNode();
  audio.volume = vol;
  const pitchByWeapon = {
    pistol: 1.16,
    rifle: 1.0,
    shotgun: 0.78,
    sniperRifle: 0.62,
    grenades: 0.7,
    rocketLauncher: 0.58,
  };
  audio.playbackRate = (pitchByWeapon[config.type] || 1) * (0.94 + Math.random() * 0.12);
  audio.play().catch(() => {});
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

function createProjectile(config, dir) {
  const visual = createProjectileVisual(config);
  visual.group.position.copy(_spawnPos);
  _tmpQuat.setFromUnitVectors(_up, dir);
  visual.group.quaternion.copy(_tmpQuat);
  if (visual.glow) visual.glow.visible = !!state.params.laserBloom;

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
  };
  _activeProjectiles.push(projectile);
}

function explodeProjectile(projectile) {
  const { config, visual } = projectile;
  const radius = Math.max(0.5, Number(config.radius) || 4);
  const damage = Math.max(1, Number(config.damage) || 1);
  damageEnemiesInRadius(visual.group.position, radius, damage, 1.15);
  spawnExplosionFlash(visual.group.position, radius);
  disposeProjectile(projectile);
}

function fireWeapon() {
  const config = getWeaponConfig();

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
}

export function updateLaserProjectiles(delta, projectileDelta = delta) {
  const p = state.params;
  applyLaserMaterials();
  updateExplosionFlashes(delta);

  const config = getWeaponConfig();
  const fireRate = Math.max(0.1, Number(config.fireRate) || 1);
  const interval = 1 / fireRate;

  if (!p.laserEnabled || !state.primaryFire) {
    _weaponCooldown = 0;
  } else {
    _weaponCooldown -= delta;
    if (_weaponCooldown <= 0) {
      fireWeapon();
      _weaponCooldown = interval;
    }
  }

  for (let i = _activeProjectiles.length - 1; i >= 0; i--) {
    const projectile = _activeProjectiles[i];
    const { visual, config: projectileConfig } = projectile;
    const step = projectile.velocity.length() * projectileDelta;

    projectile.age += delta;
    projectile.life -= delta;
    if (projectileConfig.ballistic) {
      projectile.velocity.y -= PROJECTILE_GRAVITY * projectileDelta;
    }

    visual.group.position.addScaledVector(projectile.velocity, projectileDelta);
    projectile.distance += step;

    if (projectile.velocity.lengthSq() > 0.0001) {
      _tmpQuat.setFromUnitVectors(_up, projectile.velocity.clone().normalize());
      visual.group.quaternion.copy(_tmpQuat);
    }
    if (visual.glow) visual.glow.visible = !!p.laserBloom;

    const hitGround = projectileConfig.ballistic && projectile.age > 0.08 && visual.group.position.y <= 0.09;
    const hitObject = isPlacedObjectHit(visual.group.position, projectileConfig.visual === 'rocket' ? 0.16 : 0.1);

    if (hitGround || hitObject) {
      _activeProjectiles.splice(i, 1);
      if (projectileConfig.explosive) explodeProjectile(projectile);
      else disposeProjectile(projectile);
      continue;
    }

    if (projectileConfig.explosive) {
      if (damageEnemiesAt(visual.group.position, projectileConfig.hitRadius, 0)) {
        _activeProjectiles.splice(i, 1);
        explodeProjectile(projectile);
        continue;
      }
    } else if (damageEnemiesAt(visual.group.position, projectileConfig.hitRadius, projectileConfig.damage)) {
      _activeProjectiles.splice(i, 1);
      disposeProjectile(projectile);
      continue;
    }

    if (projectile.life <= 0 || projectile.distance >= projectile.maxRange) {
      _activeProjectiles.splice(i, 1);
      if (projectileConfig.explosive) explodeProjectile(projectile);
      else disposeProjectile(projectile);
    }
  }
}
