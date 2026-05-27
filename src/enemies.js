// ─── enemies.js ───────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { scene } from './renderer.js';
import { state } from './state.js';
import {
  ENEMY_SPEED, ENEMY_CONTACT_DPS, ENEMY_BULLET_SPEED, ENEMY_BULLET_LIFETIME,
  ENEMY_BULLET_DMG, STAGGER_DURATION, SPAWN_FLASH_DURATION, ELITE_FIRE_RATE,
  ELITE_TYPES, ENEMY_DEFS, ENEMY_TYPE, getBaseEnemyHP,
} from './constants.js';
import {
  enemyGeo, enemyMat, enemyGeoParams, bulletGeoParams,
  enemyBulletGeo, getEnemyBulletMat, floorY,
} from './materials.js';
import { playerGroup, updateHealthBar, PLAYER_BODY_RADIUS } from './player.js';
import { spawnEnemyDamageNum, spawnPlayerDamageNum } from './damageNumbers.js';
import { spawnExplosion } from './particles.js';
import { playSound } from './audio.js';
import { applyDecollision, checkDespawn } from './enemyAI.js';

const _eBulletUp  = new THREE.Vector3(0, 1, 0);
const _eBulletDir = new THREE.Vector3();
const _eBulletQ   = new THREE.Quaternion();

const _enemyBulletPool = [];
const ENEMY_HASH_CELL  = 4;

function _hashKey(ix, iz) { return `${ix},${iz}`; }
function _hashCoord(v)    { return Math.floor(v / ENEMY_HASH_CELL); }

// ── Callbacks (wired in main.js) ──────────────────────────────────────────────
let _onVictory = null;
export function setVictoryCallback(fn) { _onVictory = fn; }

// ── Elite bar (top HUD) ───────────────────────────────────────────────────────
let _eliteBarEl   = null;
let _eliteFillEl  = null;
let _eliteLabelEl = null;

export function initEliteBar() {
  _eliteBarEl   = document.getElementById('elite-bar-wrap');
  _eliteFillEl  = document.getElementById('elite-bar-fill');
  _eliteLabelEl = document.getElementById('elite-bar-label');
}

export function updateEliteBar(enemy) {
  if (!_eliteBarEl) return;
  if (!enemy || enemy.dead) { _eliteBarEl.style.display = 'none'; return; }
  _eliteBarEl.style.display = '';
  const pct = Math.max(0, enemy.hp / enemy.maxHP) * 100;
  if (_eliteFillEl) _eliteFillEl.style.width = pct + '%';
  if (_eliteLabelEl && enemy.eliteType) _eliteLabelEl.textContent = enemy.eliteType.label || 'ELITE';
}

// ── Spatial hash ──────────────────────────────────────────────────────────────
function rebuildEnemySpatialHash() {
  const map = new Map();
  for (const e of state.enemies) {
    if (!e || e.dead) continue;
    const ix  = _hashCoord(e.grp.position.x);
    const iz  = _hashCoord(e.grp.position.z);
    const key = _hashKey(ix, iz);
    let bucket = map.get(key);
    if (!bucket) { bucket = []; map.set(key, bucket); }
    bucket.push(e);
  }
  state.enemySpatialHash = map;
}

const _enemyQuerySeen = new Set();
export function queryEnemiesNear(x, z, radius = 0, out = []) {
  out.length = 0;
  const map = state.enemySpatialHash;
  if (!map) return out;
  _enemyQuerySeen.clear();
  const cr  = Math.ceil(radius / ENEMY_HASH_CELL) + 1;
  const ix0 = _hashCoord(x), iz0 = _hashCoord(z);
  for (let dx = -cr; dx <= cr; dx++) {
    for (let dz = -cr; dz <= cr; dz++) {
      const bucket = map.get(_hashKey(ix0 + dx, iz0 + dz));
      if (!bucket) continue;
      for (const e of bucket) {
        if (_enemyQuerySeen.has(e)) continue;
        _enemyQuerySeen.add(e);
        if (e.dead) continue;
        const ex = e.grp.position.x - x;
        const ez = e.grp.position.z - z;
        if (radius === 0 || ex * ex + ez * ez <= radius * radius) out.push(e);
      }
    }
  }
  return out;
}

// ── Ground cue helper ─────────────────────────────────────────────────────────
function makeGroundCue(color = 0xffffff, radius = 0.9) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.045, 10, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, depthWrite: false })
  );
  mesh.rotation.x  = Math.PI / 2;
  mesh.position.y  = 0.08;
  mesh.visible     = false;
  return mesh;
}

// ── Kill an enemy ─────────────────────────────────────────────────────────────
export function killEnemy(enemy, { silent = false } = {}) {
  if (!enemy || enemy.dead) return;
  enemy.dead = true;

  spawnExplosion(enemy.grp.position, enemy.eliteType || null);
  if (!silent) playSound(enemy.eliteType ? 'explode_elite' : 'explode', 0.5);

  removeCSS2DFromGroup(enemy.grp);
  if (enemy.cue) { enemy.grp.remove(enemy.cue); enemy.cue = null; }
  scene.remove(enemy.grp);

  // Update stats
  state.kills++;
  const killsEl = document.getElementById('kills-value');
  if (killsEl) killsEl.textContent = state.kills;

  // Remove from array
  const idx = state.enemies.indexOf(enemy);
  if (idx >= 0) state.enemies.splice(idx, 1);
}

export function removeCSS2DFromGroup(grp) {
  const toRemove = [];
  grp.traverse(child => { if (child.isCSS2DObject) toRemove.push(child); });
  toRemove.forEach(c => { c.element?.remove?.(); grp.remove(c); });
}

// ── Bullet pool helpers ───────────────────────────────────────────────────────
function acquireEnemyBullet() {
  return _enemyBulletPool.pop() || {
    mesh: new THREE.Mesh(enemyBulletGeo, getEnemyBulletMat(0xff4444)),
    active: false, vx: 0, vy: 0, vz: 0, life: 0,
  };
}
export function releaseEnemyBulletVisual(b) {
  if (b.mesh) scene.remove(b.mesh);
  b.active = false;
  _enemyBulletPool.push(b);
}

// ── Spawn an enemy ────────────────────────────────────────────────────────────
export function spawnEnemyAtPosition(enemyType, position, opts = {}) {
  const p      = state.params;
  const def    = ENEMY_DEFS[enemyType] || ENEMY_DEFS[ENEMY_TYPE.RUSHER];
  const isElite = ELITE_TYPES.includes(enemyType);
  const isBoss  = enemyType === ENEMY_TYPE.BOSS;

  const scale   = (def.scale || 1.0) * p.enemySizeScale;
  const baseHP  = Math.round(p.playerMaxHP * def.hpPct * p.enemyHPScale);
  const hp      = isBoss ? baseHP * 4 : baseHP;

  const mat = new THREE.MeshStandardMaterial({
    color: def.color ?? 0x888888,
    metalness: def.metallic ? 0.8 : 0.2,
    roughness: def.metallic ? 0.1 : 0.6,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });

  const mesh = new THREE.Mesh(enemyGeo, mat);
  mesh.castShadow = true;
  mesh.position.y = floorY(enemyGeoParams) * scale;
  mesh.scale.setScalar(scale);

  const grp = new THREE.Group();
  grp.position.copy(position);
  grp.add(mesh);

  // Health bar (CSS2D)
  const hbWrap = document.createElement('div');
  hbWrap.className = 'health-bar-wrap';
  const hbFill = document.createElement('div');
  hbFill.className = 'health-bar-fill';
  hbFill.style.background = isBoss ? '#ff2222' : (isElite ? '#ff8800' : '#44ff44');
  hbWrap.appendChild(hbFill);
  const hbObj = new CSS2DObject(hbWrap);
  hbObj.position.set(0, 2.4 * scale, 0);
  grp.add(hbObj);

  // Shot-tell cue
  const cue = makeGroundCue(def.color ?? 0xffffff, 0.9 * scale);
  grp.add(cue);

  const eliteType = isElite ? {
    color:  def.color,
    label:  enemyType.toUpperCase(),
    hp, maxHP: hp,
  } : null;

  const enemy = {
    grp, mesh, mat, cue, hbFill,
    hp, maxHP: hp, dead: false,
    enemyType, eliteType, isBoss,
    scaleMult:  scale,
    baseColor:  new THREE.Color(def.color ?? 0x888888),
    spawnFlashTimer: SPAWN_FLASH_DURATION,
    staggerTimer:    0,
    fireTimer:       (isElite || isBoss) ? (1.0 + Math.random() * 2.0) : Infinity,
    orbitAngle:      Math.random() * Math.PI * 2,
    orbitDir:        Math.random() < 0.5 ? 1 : -1,
    teleportTimer:   enemyType === ENEMY_TYPE.TELEPORTER ? (2 + Math.random() * 3) : Infinity,
    shieldHP:        enemyType === ENEMY_TYPE.SHIELDED ? Math.round(hp * 0.4) : 0,
    shieldActive:    enemyType === ENEMY_TYPE.SHIELDED,
    splitDone:       false,
  };

  scene.add(grp);
  state.enemies.push(enemy);
  return enemy;
}

// ── Per-frame enemy update ────────────────────────────────────────────────────
const _toPlayer   = new THREE.Vector3();
const _moveDir    = new THREE.Vector3();
const _contactBuf = [];

export function updateEnemies(delta) {
  const p        = state.params;
  const playerPos= playerGroup.position;
  const speed    = p.enemySpeed;

  rebuildEnemySpatialHash();
  applyDecollision(state.enemies);
  checkDespawn(state.enemies, playerPos);

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (!e || e.dead) continue;

    // Spawn flash
    if (e.spawnFlashTimer > 0) {
      e.spawnFlashTimer -= delta;
      const t = e.spawnFlashTimer / SPAWN_FLASH_DURATION;
      e.mat.emissiveIntensity = t * 2.5;
      continue; // don't move during spawn flash
    }

    // Stagger
    if (e.staggerTimer > 0) { e.staggerTimer -= delta; }

    _toPlayer.copy(playerPos).sub(e.grp.position);
    const dist2d = Math.sqrt(_toPlayer.x * _toPlayer.x + _toPlayer.z * _toPlayer.z);

    // Movement by type
    const mySpeed = speed * (e.isBoss ? 0.65 : 1.0);
    if (e.staggerTimer <= 0) {
      if (e.enemyType === ENEMY_TYPE.ORBITER) {
        e.orbitAngle += e.orbitDir * 2.2 * delta;
        const orbitR  = 5.0;
        const tx = playerPos.x + Math.cos(e.orbitAngle) * orbitR;
        const tz = playerPos.z + Math.sin(e.orbitAngle) * orbitR;
        e.grp.position.x += (tx - e.grp.position.x) * mySpeed * 0.3 * delta;
        e.grp.position.z += (tz - e.grp.position.z) * mySpeed * 0.3 * delta;
      } else if (e.enemyType === ENEMY_TYPE.SNIPER) {
        // Sniper maintains distance
        const targetDist = 12;
        if (dist2d < targetDist - 1) {
          _moveDir.set(-_toPlayer.x / dist2d, 0, -_toPlayer.z / dist2d);
          e.grp.position.addScaledVector(_moveDir, mySpeed * 0.8 * delta);
        } else if (dist2d > targetDist + 1) {
          _moveDir.set(_toPlayer.x / dist2d, 0, _toPlayer.z / dist2d);
          e.grp.position.addScaledVector(_moveDir, mySpeed * 0.6 * delta);
        }
      } else if (e.enemyType === ENEMY_TYPE.TELEPORTER) {
        e.teleportTimer -= delta;
        if (e.teleportTimer <= 0) {
          // Teleport near player
          const angle = Math.random() * Math.PI * 2;
          const range = 8 + Math.random() * 6;
          e.grp.position.set(
            playerPos.x + Math.cos(angle) * range,
            0,
            playerPos.z + Math.sin(angle) * range
          );
          e.teleportTimer = 2 + Math.random() * 3;
          e.mat.emissive.set(0x00aaff);
          e.mat.emissiveIntensity = 3.0;
        }
        if (dist2d > 0.1) {
          _moveDir.set(_toPlayer.x / dist2d, 0, _toPlayer.z / dist2d);
          e.grp.position.addScaledVector(_moveDir, mySpeed * delta);
        }
      } else {
        // Rush toward player
        if (dist2d > 0.1) {
          _moveDir.set(_toPlayer.x / dist2d, 0, _toPlayer.z / dist2d);
          e.grp.position.addScaledVector(_moveDir, mySpeed * delta);
        }
      }
    }

    // Face player
    if (dist2d > 0.1) {
      e.grp.rotation.y = Math.atan2(_toPlayer.x, _toPlayer.z);
    }

    // Contact damage
    const contactDist = PLAYER_BODY_RADIUS + (enemyGeoParams.radius * e.scaleMult * 1.2);
    if (dist2d < contactDist && !state.params.playerGodMode) {
      state.contactDmgAccum += ENEMY_CONTACT_DPS * p.enemyDMGScale * delta;
      if (state.contactDmgAccum >= 1) {
        const dmg = Math.floor(state.contactDmgAccum);
        state.contactDmgAccum -= dmg;
        applyPlayerDamage(dmg);
      }
    }

    // Elite shooting
    if (e.fireTimer !== Infinity) {
      e.fireTimer -= delta;
      if (e.fireTimer <= 0) {
        const fireRate = e.isBoss ? 0.7 : (ELITE_FIRE_RATE[1] || 3.0);
        e.fireTimer = fireRate * (0.9 + Math.random() * 0.2);
        shootEnemyBullet(e);

        // Shot-tell cue
        if (e.cue) {
          e.cue.visible = true;
          e.cue.material.opacity = 0.55;
          let cueTimer = 0.15;
          const cueId = setInterval(() => {
            cueTimer -= 0.05;
            if (e.cue) e.cue.material.opacity = Math.max(0, e.cue.material.opacity - 0.15);
            if (cueTimer <= 0 || e.dead) {
              clearInterval(cueId);
              if (e.cue) { e.cue.visible = false; e.cue.material.opacity = 0; }
            }
          }, 50);
        }
      }
    }

    // Emissive flash recovery
    if (e.mat.emissiveIntensity > 0 && e.spawnFlashTimer <= 0) {
      e.mat.emissiveIntensity = Math.max(0, e.mat.emissiveIntensity - delta * 5.0);
    }

    // Health bar
    const pct = Math.max(0, e.hp / e.maxHP) * 100;
    e.hbFill.style.width = pct + '%';
  }

  // Splitter: update splitter separating behavior
  updateEnemyBullets(delta);
}

function shootEnemyBullet(enemy) {
  const pos  = enemy.grp.position;
  const plyr = playerGroup.position;
  _eBulletDir.set(plyr.x - pos.x, 0, plyr.z - pos.z).normalize();

  const b = acquireEnemyBullet();
  const bulletColor = enemy.eliteType?.color ?? 0xff4444;
  b.mesh.material = getEnemyBulletMat(bulletColor);
  b.mesh.position.set(pos.x + _eBulletDir.x * 1.2, floorY(bulletGeoParams), pos.z + _eBulletDir.z * 1.2);
  _eBulletQ.setFromUnitVectors(_eBulletUp, _eBulletDir);
  b.mesh.quaternion.copy(_eBulletQ);
  b.mesh.layers.enable(1);
  b.vx   = _eBulletDir.x * ENEMY_BULLET_SPEED;
  b.vz   = _eBulletDir.z * ENEMY_BULLET_SPEED;
  b.life = ENEMY_BULLET_LIFETIME;
  b.active = true;
  scene.add(b.mesh);
  state.enemyBullets.push(b);
}

function updateEnemyBullets(delta) {
  const playerPos = playerGroup.position;
  const p = state.params;
  for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
    const b = state.enemyBullets[i];
    if (!b.active) { state.enemyBullets.splice(i, 1); continue; }
    b.life -= delta;
    if (b.life <= 0) { releaseEnemyBulletVisual(b); state.enemyBullets.splice(i, 1); continue; }
    b.mesh.position.x += b.vx * delta;
    b.mesh.position.z += b.vz * delta;

    // Player hit
    const dx = b.mesh.position.x - playerPos.x;
    const dz = b.mesh.position.z - playerPos.z;
    if (dx * dx + dz * dz < 0.8 && !p.playerGodMode) {
      const dmg = ENEMY_BULLET_DMG * p.enemyDMGScale;
      applyPlayerDamage(dmg);
      spawnPlayerDamageNum(dmg);
      releaseEnemyBulletVisual(b);
      state.enemyBullets.splice(i, 1);
    }
  }
}

// ── Apply damage to player ────────────────────────────────────────────────────
function applyPlayerDamage(dmg) {
  if (state.params.playerGodMode) return;
  state.playerHP = Math.max(0, state.playerHP - dmg);
  updateHealthBar();
  if (state.playerHP <= 0) triggerGameOver();
}

function triggerGameOver() {
  if (state.gameOver) return;
  state.gameOver = true;
  const el = document.getElementById('game-over');
  if (el) {
    el.style.display = 'flex';
    const statsEl = document.getElementById('final-stats');
    if (statsEl) statsEl.textContent = `Kills: ${state.kills} · Time: ${Math.floor(state.elapsed)}s`;
  }
}

// Expose for external use
export { applyPlayerDamage };
