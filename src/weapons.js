// src/weapons.js
// Screen-aimed player laser gun. The visual follows the two-mesh laser pattern:
// a bright white core plus a larger additive glow shell whose colour is exposed
// through the Weapons sidebar controls.
import * as THREE from 'three';
import { state } from './state.js';
import { scene, camera } from './renderer.js';
import { playerGroup } from './player.js';
import { damageEnemiesAt } from './enemies.js';

const _up = new THREE.Vector3(0, 1, 0);
const _aimDir = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _aimNdc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _aimPoint = new THREE.Vector3();

const _laserGeo = new THREE.CapsuleGeometry(0.055, 0.7, 6, 12);
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

const _activeLasers = [];
const _laserPool = [];
let _laserCooldown = 0;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function applyLaserMaterials() {
  const p = state.params;
  const bloomIntensity = Number(p.laserBloomIntensity);
  _laserGlowMat.color.set(p.laserBloomColor || '#ff1100');
  _laserGlowMat.opacity = p.laserBloom ? clamp(Number.isFinite(bloomIntensity) ? bloomIntensity : 0.55, 0, 1) : 0;
  _laserGlowMat.needsUpdate = true;
}

function createLaserVisual() {
  const group = new THREE.Group();
  group.name = 'PlayerLaserProjectile';

  const core = new THREE.Mesh(_laserGeo, _laserCoreMat);
  core.name = 'LaserCore';
  core.castShadow = false;
  core.receiveShadow = false;
  group.add(core);

  const glow = new THREE.Mesh(_laserGeo, _laserGlowMat);
  glow.name = 'LaserGlow';
  glow.scale.set(1.85, 1.18, 1.85);
  glow.castShadow = false;
  glow.receiveShadow = false;
  group.add(glow);

  group.visible = false;
  scene.add(group);
  return { group, core, glow, dir: new THREE.Vector3(), distance: 0, maxRange: 0, speed: 0 };
}

function acquireLaser() {
  return _laserPool.pop() || createLaserVisual();
}

function releaseLaser(laser) {
  laser.group.visible = false;
  _laserPool.push(laser);
}

function getAimDirection(target, spawnPos, range) {
  // The reticle is fixed at the exact centre of the viewport, especially during
  // pointer-lock mouse look. Always fire through that centre ray rather than a
  // stale/unlocked mouse cursor position so lasers line up with the visible HUD.
  camera.updateMatrixWorld(true);
  _aimNdc.set(0, 0);
  _raycaster.setFromCamera(_aimNdc, camera);

  const targetDistance = Math.max(1, Number(range) || 1);
  _aimPoint.copy(_raycaster.ray.origin).addScaledVector(_raycaster.ray.direction, targetDistance);
  target.copy(_aimPoint).sub(spawnPos);

  if (target.lengthSq() < 0.0001) {
    target.copy(_raycaster.ray.direction);
  }

  if (target.lengthSq() < 0.0001) {
    camera.getWorldDirection(target);
  }

  return target.normalize();
}

function fireLaser() {
  const p = state.params;
  const speed = Math.max(1, Number(p.laserProjectileSpeed) || 22);
  const range = Math.max(1, Number(p.laserRange) || 42);
  const laser = acquireLaser();

  _spawnPos.copy(playerGroup.position);
  _spawnPos.y += Math.max(0.55, (Number(p.playerRadius) || 0.4) + (Number(p.playerLength) || 1.2) * 0.55);

  const dir = getAimDirection(_aimDir, _spawnPos, range).clone();
  _spawnPos.addScaledVector(dir, Math.max(0.75, (Number(p.playerRadius) || 0.4) + 0.65));

  // Re-aim after offsetting the spawn point so the projectile path still
  // converges on the centre-reticle ray instead of drifting due to muzzle offset.
  dir.copy(_aimPoint).sub(_spawnPos);
  if (dir.lengthSq() < 0.0001) dir.copy(_raycaster.ray.direction);
  dir.normalize();

  _tmpQuat.setFromUnitVectors(_up, dir);
  laser.group.position.copy(_spawnPos);
  laser.group.quaternion.copy(_tmpQuat);
  laser.group.visible = true;
  laser.glow.visible = !!p.laserBloom;
  laser.dir.copy(dir);
  laser.distance = 0;
  laser.maxRange = Math.max(1, _spawnPos.distanceTo(_aimPoint));
  laser.speed = speed;

  _activeLasers.push(laser);
}

export function updateLaserProjectiles(delta, projectileDelta = delta) {
  const p = state.params;
  applyLaserMaterials();

  const fireRate = Math.max(0.1, Number(p.laserFireRate) || 5);
  const interval = 1 / fireRate;

  if (!p.laserEnabled || !state.primaryFire) {
    _laserCooldown = 0;
  } else {
    _laserCooldown -= delta;
    if (_laserCooldown <= 0) {
      fireLaser();
      _laserCooldown = interval;
    }
  }

  for (let i = _activeLasers.length - 1; i >= 0; i--) {
    const laser = _activeLasers[i];
    const step = laser.speed * projectileDelta;
    laser.group.position.addScaledVector(laser.dir, step);
    laser.distance += step;
    laser.glow.visible = !!p.laserBloom;

    if (damageEnemiesAt(laser.group.position, 0.36, 34)) {
      _activeLasers.splice(i, 1);
      releaseLaser(laser);
      continue;
    }

    if (laser.distance >= laser.maxRange) {
      _activeLasers.splice(i, 1);
      releaseLaser(laser);
    }
  }
}
