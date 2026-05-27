// ─── weapons.js ───────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { BULLET_LIFETIME } from './constants.js';
import { bulletGeo, bulletMat, bulletGeoParams, floorY } from './materials.js';
import { playerGroup } from './player.js';
import { spawnEnemyDamageNum } from './damageNumbers.js';
import { killEnemy, queryEnemiesNear } from './enemies.js';
import { playSound } from './audio.js';

// ── Bullet up vector for quaternion alignment ─────────────────────────────────
const _bulletUp = new THREE.Vector3(0, 1, 0);
const _bulletQ  = new THREE.Quaternion();
const _bulletPool = [];

// ── White core + glow material ────────────────────────────────────────────────
const _coreMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35,
  metalness: 0.15, roughness: 0.35,
});
const _glowMat = new THREE.MeshStandardMaterial({
  color: 0x00aaff, emissive: 0x00aaff, emissiveIntensity: 2.5,
  metalness: 0.0, roughness: 0.0,
  transparent: true, opacity: 0.85,
});

function makeBulletVisual() {
  const grp  = new THREE.Group();
  const core = new THREE.Mesh(bulletGeo, _coreMat);
  core.layers.set(0);
  const glow = new THREE.Mesh(bulletGeo, _glowMat.clone());
  glow.layers.set(1);
  glow.scale.setScalar(1.35);
  grp.add(core, glow);
  return { grp, glow };
}

function acquireBullet() {
  return _bulletPool.pop() || { ...makeBulletVisual(), active: false, vx: 0, vz: 0, life: 0, dmg: 0, pierced: new Set() };
}

function releaseBullet(b) {
  scene.remove(b.grp);
  b.active = false;
  b.pierced.clear();
  _bulletPool.push(b);
}

// ── Shoot a wave of bullets ───────────────────────────────────────────────────
export function shootBulletWave() {
  const p       = state.params;
  const count   = Math.max(1, p.weaponMultishot);
  const spread  = (count - 1) * 0.18;

  // Find nearest enemy for auto-aim
  const playerPos = playerGroup.position;
  let aimAngle = Math.atan2(state.lastMoveX, state.lastMoveZ);

  const nearby = [];
  queryEnemiesNear(playerPos.x, playerPos.z, 20, nearby);
  if (nearby.length > 0) {
    let closest = Infinity, bestE = null;
    for (const e of nearby) {
      const dx = e.grp.position.x - playerPos.x;
      const dz = e.grp.position.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < closest) { closest = d2; bestE = e; }
    }
    if (bestE) {
      const dx = bestE.grp.position.x - playerPos.x;
      const dz = bestE.grp.position.z - playerPos.z;
      aimAngle = Math.atan2(dx, dz);
    }
  }

  for (let i = 0; i < count; i++) {
    const offset = count > 1 ? (i / (count - 1) - 0.5) * spread * 2 : 0;
    const angle  = aimAngle + offset;
    const dirX   = Math.sin(angle);
    const dirZ   = Math.cos(angle);

    const b = acquireBullet();
    const spawnY = floorY(bulletGeoParams);
    b.grp.position.set(
      playerPos.x + dirX * 0.8,
      spawnY,
      playerPos.z + dirZ * 0.8
    );
    // Scale by panel param
    const bs = p.weaponBulletScale;
    b.grp.scale.setScalar(bs);

    _bulletQ.setFromUnitVectors(_bulletUp, new THREE.Vector3(dirX, 0, dirZ).normalize());
    b.grp.quaternion.copy(_bulletQ);

    const speed = p.weaponBulletSpeed;
    b.vx   = dirX * speed;
    b.vz   = dirZ * speed;
    b.life = BULLET_LIFETIME;
    b.dmg  = p.weaponDamage;
    b.active = true;
    b.pierced.clear();
    scene.add(b.grp);
    state.bullets.push(b);
  }

  playSound('shoot', 0.35, 0.95 + Math.random() * 0.1);
}

// ── Update player bullets ─────────────────────────────────────────────────────
const _hitBuf = [];

export function updateBullets(delta) {
  const p = state.params;
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    if (!b.active) { state.bullets.splice(i, 1); continue; }

    b.life -= delta;
    if (b.life <= 0) { releaseBullet(b); state.bullets.splice(i, 1); continue; }

    b.grp.position.x += b.vx * delta;
    b.grp.position.z += b.vz * delta;

    // Hit detection
    const bx = b.grp.position.x;
    const bz = b.grp.position.z;
    const hitR = 0.7 * p.weaponBulletScale;
    queryEnemiesNear(bx, bz, hitR + 1.0, _hitBuf);

    for (const e of _hitBuf) {
      if (b.pierced.has(e)) continue;
      const dx = e.grp.position.x - bx;
      const dz = e.grp.position.z - bz;
      if (dx * dx + dz * dz > hitR * hitR) continue;

      // Damage enemy
      const dmg = b.dmg;
      e.hp -= dmg;
      e.staggerTimer = 0.12;
      e.mat.emissive.set(0xffffff);
      e.mat.emissiveIntensity = 3.0;
      spawnEnemyDamageNum(dmg, e);
      playSound(e.eliteType ? 'elite_hit' : 'standard_hit', 0.4);

      if (e.hp <= 0) {
        killEnemy(e);
      }

      if (p.weaponPiercing) {
        b.pierced.add(e);
      } else {
        releaseBullet(b);
        state.bullets.splice(i, 1);
        break;
      }
    }
  }
}

// ── Orbit bullets ─────────────────────────────────────────────────────────────
function makeOrbitMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x00eeff, emissive: 0x00eeff, emissiveIntensity: 2.0,
    metalness: 1.0, roughness: 0.0,
  });
}

export function destroyOrbitBullets() {
  state.orbitRings.forEach(ring =>
    ring.meshes.forEach(grp => {
      scene.remove(grp);
      grp.traverse(obj => { if (obj.isMesh && obj.material !== _coreMat) obj.material?.dispose?.(); });
    })
  );
  state.orbitRings.length = 0;
  state.orbitHitActive.clear();
}

export function syncOrbitBullets() {
  destroyOrbitBullets();
  const p     = state.params;
  const count = Math.max(0, Math.floor(p.orbitCount));
  if (count < 1) return;

  const meshes = [];
  for (let i = 0; i < count; i++) {
    const grp  = new THREE.Group();
    const core = new THREE.Mesh(bulletGeo, _coreMat);
    core.layers.set(0);
    const glow = new THREE.Mesh(bulletGeo, makeOrbitMat());
    glow.layers.set(1);
    glow.scale.setScalar(1.4);
    grp.add(core, glow);
    grp.scale.setScalar(0.8);
    scene.add(grp);
    meshes.push(grp);
  }
  state.orbitRings.push({ meshes, angle: 0 });
}

const _orbitHitBuf = [];

export function updateOrbitBullets(delta) {
  const p = state.params;
  if (state.orbitRings.length === 0) return;

  const ring      = state.orbitRings[0];
  const count     = ring.meshes.length;
  const playerPos = playerGroup.position;

  ring.angle += p.orbitSpeed * delta;
  const radius = p.orbitRadius;

  for (let i = 0; i < count; i++) {
    const angle = ring.angle + (Math.PI * 2 * i / count);
    const mx    = playerPos.x + Math.cos(angle) * radius;
    const mz    = playerPos.z + Math.sin(angle) * radius;
    ring.meshes[i].position.set(mx, floorY(bulletGeoParams), mz);

    // Hit detection
    queryEnemiesNear(mx, mz, 0.9, _orbitHitBuf);
    for (const e of _orbitHitBuf) {
      const key = `${ring.meshes[i].id}:${e.grp.id}`;
      if (state.orbitHitActive.has(key)) continue;
      state.orbitHitActive.add(key);
      setTimeout(() => state.orbitHitActive.delete(key), 400);

      e.hp -= p.orbitDamage;
      e.mat.emissive.set(0x00eeff);
      e.mat.emissiveIntensity = 2.0;
      spawnEnemyDamageNum(p.orbitDamage, e);
      if (e.hp <= 0) killEnemy(e);
    }
  }
}
