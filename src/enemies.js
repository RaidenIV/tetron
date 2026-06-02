// src/enemies.js
// Lightweight enemy sandbox for Game Lab. Enemies are spawned from the sidebar
// controls, then updated every frame so the controls affect visible gameplay.
//
// Grouping / anti-clumping system per GROUPING.md:
//   - Separation steering (soft, before movement)
//   - Ring / slot bias (distributes enemies around player)
//   - Steering smoothing (prevents jitter)
//   - Hard decollision pass (after movement, spatial-hash-accelerated)
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { scene, camera } from './renderer.js';
import { state } from './state.js';
import { playerGroup } from './player.js';
import { getSfxVolume, applyBulletTimeAudioPitch, registerManagedAudio, playObjectExplosionSound } from './audio.js';
import { resolveCircleAgainstPlacedObjects, isPlacedObjectHit } from './placer.js';

export const ENEMY_TYPE = Object.freeze({
  RUSHER: 'rusher',
  ORBITER: 'orbiter',
  TANKER: 'tanker',
  SNIPER: 'sniper',
  TELEPORTER: 'teleporter',
  SHIELDED: 'shielded',
  SPLITTER: 'splitter',
  BOSS: 'boss',
});

const ENEMY_DEFS = Object.freeze({
  [ENEMY_TYPE.RUSHER]: {
    color: 0x888888, sizeMult: 0.75, metallic: false, speedMult: 1.0,
    defaultBehavior: 'rush', defaultWeapon: 'contact', projectileColor: 0xff8844,
  },
  [ENEMY_TYPE.ORBITER]: {
    color: 0x00cc44, sizeMult: 1.0, metallic: true, speedMult: 1.05,
    defaultBehavior: 'orbit', defaultWeapon: 'projectile', projectileColor: 0x66ff99,
  },
  [ENEMY_TYPE.TANKER]: {
    color: 0x2b2b2b, sizeMult: 1.5, metallic: true, speedMult: 0.9,
    defaultBehavior: 'rush', defaultWeapon: 'projectile', projectileColor: 0xffaa33,
  },
  [ENEMY_TYPE.SNIPER]: {
    color: 0x9b30ff, sizeMult: 1.0, metallic: false, speedMult: 0.85,
    defaultBehavior: 'keepDistance', defaultWeapon: 'sniper', projectileColor: 0xd975ff,
  },
  [ENEMY_TYPE.TELEPORTER]: {
    color: 0xe0e0e0, sizeMult: 0.75, metallic: false, speedMult: 1.0,
    defaultBehavior: 'teleport', defaultWeapon: 'contact', projectileColor: 0xe0e0e0,
  },
  [ENEMY_TYPE.SHIELDED]: {
    color: 0x4aa3ff, sizeMult: 1.25, metallic: false, speedMult: 0.95,
    defaultBehavior: 'guard', defaultWeapon: 'contact', projectileColor: 0x4aa3ff,
  },
  [ENEMY_TYPE.SPLITTER]: {
    color: 0x80fb37, sizeMult: 2.0, metallic: false, speedMult: 0.8,
    defaultBehavior: 'split', defaultWeapon: 'projectile', projectileColor: 0x80fb37,
  },
  [ENEMY_TYPE.BOSS]: {
    color: 0x111111, sizeMult: 2.0, metallic: true, speedMult: 0.9,
    defaultBehavior: 'bossPhase', defaultWeapon: 'laser', projectileColor: 0xff3333,
  },
});

const BASE_RADIUS = 0.4;
const BASE_LENGTH = 1.2;
const BASE_SPEED = 2.2;
const CONTACT_COOLDOWN = 1.0;
const ENEMY_BULLET_SPEED = 11;
const ENEMY_BULLET_LIFETIME = 4.5;
const PARTICLE_GRAVITY = 9;
const FIRE_RATE_SECONDS = {
  projectile: 1.6,
  laser: 1.0,
  sniper: 2.2,
  pistol: 0.8,
  rifle: 1.0,
  shotgun: 1.35,
  sniperRifle: 2.2,
  grenades: 2.6,
  rocketLauncher: 2.4,
};

let _enemyGruntEl = null;
const _corpseBox = new THREE.Box3();
const _corpseWorldPos = new THREE.Vector3();
const _splashVec = new THREE.Vector3();

// Same rectangular rifle proportions used by the player rifle visual. NPC rifles
// are shown only while that NPC's effective weapon is rifle/laser-like.
const NPC_RIFLE = Object.freeze({ width: 0.08, height: 0.18, length: 1.125, grip: 0.16, sideGap: 0.105, forwardOffset: 0.12 });
const NPC_HEALTH_BAR_RATIO_EPSILON = 0.001;
const NPC_HEALTH_BAR_DISTANCE_DEFAULT = 60;
const _npcRifleGeo = new THREE.BoxGeometry(NPC_RIFLE.width, NPC_RIFLE.height, NPC_RIFLE.length);
const _npcRifleMat = new THREE.MeshStandardMaterial({
  color: 0x20242b,
  metalness: 0.55,
  roughness: 0.38,
});
const _awarenessCircleGeo = new THREE.CircleGeometry(1, 128);
const _awarenessOutlineGeo = new THREE.RingGeometry(0.998, 1.002, 128);
const AWARENESS_RING_Y = 0.035;
const AWARENESS_OUTLINE_Y_OFFSET = 0.004;

function normalizeHexSetting(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

function getNpcBodyHeight(npc) {
  const size = Math.max(0.1, Number(npc?.sizeMult) || 1);
  return (BASE_LENGTH + BASE_RADIUS * 2) * size;
}

function distanceToVerticalBody(point, centerX, centerZ, minY, maxY, radius) {
  const px = Number(point?.x) || 0;
  const py = Number(point?.y) || 0;
  const pz = Number(point?.z) || 0;
  const horizontal = Math.max(0, Math.hypot(px - centerX, pz - centerZ) - Math.max(0.001, radius));
  const clampedY = clamp(py, minY, maxY);
  return Math.hypot(horizontal, py - clampedY);
}

function distanceToNpcBody(point, npc) {
  if (!npc?.group) return Infinity;
  const radius = Math.max(0.1, Number(npc.radius) || BASE_RADIUS);
  const minY = Number(npc.group.position.y) || 0;
  const maxY = minY + getNpcBodyHeight(npc);
  return distanceToVerticalBody(point, npc.group.position.x, npc.group.position.z, minY, maxY, radius);
}

function pointHitsNpcBody(point, hitRadius, npc) {
  return distanceToNpcBody(point, npc) <= Math.max(0.001, Number(hitRadius) || 0);
}

function distanceToPlayerBody(point) {
  const radius = Math.max(0.25, Number(state.params.playerRadius) || 0.4);
  const length = Math.max(0.1, Number(state.params.playerLength) || 1.2);
  const minY = Number(playerGroup.position.y) || 0;
  const maxY = minY + length + radius * 2;
  return distanceToVerticalBody(point, playerGroup.position.x, playerGroup.position.z, minY, maxY, radius);
}

function pointHitsPlayerBody(point, hitRadius) {
  return distanceToPlayerBody(point) <= Math.max(0.001, Number(hitRadius) || 0);
}

function getAwarenessSettings(npc) {
  const ally = npc?.isAlly === true;
  return {
    visible: state.params[ally ? 'allyAwarenessVisible' : 'enemyAwarenessVisible'] === true,
    range: Math.max(1, Number(npc?.awarenessRange ?? state.params[ally ? 'allyAwarenessRange' : 'enemyAwarenessRange']) || 40),
    color: normalizeHexSetting(state.params[ally ? 'allyAwarenessColor' : 'enemyAwarenessColor'], ally ? '#00cc44' : '#ff3030'),
    outlineColor: normalizeHexSetting(state.params[ally ? 'allyAwarenessOutlineColor' : 'enemyAwarenessOutlineColor'], '#000000'),
    fillTransparent: state.params[ally ? 'allyAwarenessFillTransparent' : 'enemyAwarenessFillTransparent'] === true,
    opacity: clamp(Number(state.params[ally ? 'allyAwarenessOpacity' : 'enemyAwarenessOpacity']) || 0, 0, 1),
  };
}

function ensureAwarenessRing(npc) {
  if (!npc?.group) return null;
  if (!npc._awarenessRing) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: true,
      depthTest: true,
      depthFunc: THREE.LessDepth,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(_awarenessCircleGeo, material);
    ring.name = npc.isAlly ? 'AllyAwarenessRangeFloorCircle' : 'EnemyAwarenessRangeFloorCircle';
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(npc.group.position.x, AWARENESS_RING_Y, npc.group.position.z);
    ring.renderOrder = 1;
    ring.visible = false;
    scene.add(ring);
    npc._awarenessRing = ring;
  }
  if (!npc._awarenessOutlineRing) {
    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: true,
      depthTest: true,
      depthFunc: THREE.LessDepth,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const outline = new THREE.Mesh(_awarenessOutlineGeo, outlineMaterial);
    outline.name = npc.isAlly ? 'AllyAwarenessRangeFloorOutline' : 'EnemyAwarenessRangeFloorOutline';
    outline.rotation.x = -Math.PI / 2;
    outline.position.set(npc.group.position.x, AWARENESS_RING_Y + AWARENESS_OUTLINE_Y_OFFSET, npc.group.position.z);
    outline.renderOrder = 2;
    outline.visible = false;
    scene.add(outline);
    npc._awarenessOutlineRing = outline;
  }
  return npc._awarenessRing;
}

function updateNpcAwarenessRing(npc) {
  const ring = ensureAwarenessRing(npc);
  if (!ring) return;
  const outline = npc._awarenessOutlineRing || null;
  const cfg = getAwarenessSettings(npc);
  const visible = cfg.visible && (cfg.opacity > 0 || cfg.fillTransparent);
  ring.visible = visible && !cfg.fillTransparent && cfg.opacity > 0;
  if (outline) outline.visible = cfg.visible;
  ring.position.set(npc.group.position.x, AWARENESS_RING_Y, npc.group.position.z);
  ring.rotation.set(-Math.PI / 2, 0, 0);
  ring.scale.set(cfg.range, cfg.range, 1);
  if (outline) {
    outline.position.set(npc.group.position.x, AWARENESS_RING_Y + AWARENESS_OUTLINE_Y_OFFSET, npc.group.position.z);
    outline.rotation.set(-Math.PI / 2, 0, 0);
    outline.scale.set(cfg.range, cfg.range, 1);
  }
  if (!visible) return;
  ring.material.color.set(cfg.color);
  ring.material.opacity = cfg.opacity;
  ring.material.needsUpdate = true;
  if (outline) {
    outline.material.color.set(cfg.outlineColor);
    outline.material.opacity = 1;
    outline.material.needsUpdate = true;
  }
}

function playEnemyGruntSound(sourcePosition = null) {
  const fallback = Number(state.params.soundSfx_standard_hit ?? 1);
  const volume = getSfxVolume('soundSfx_enemy_grunt', fallback, sourcePosition);
  if (volume <= 0) return;
  if (!_enemyGruntEl) _enemyGruntEl = registerManagedAudio(new Audio('./assets/grunt.wav'));
  const sound = _enemyGruntEl.paused ? _enemyGruntEl : _enemyGruntEl.cloneNode();
  registerManagedAudio(sound, 1);
  sound.volume = volume;
  applyBulletTimeAudioPitch(sound);
  sound.currentTime = 0;
  sound.play().catch(() => {});
}


// ── Grouping config (GROUPING.md) ─────────────────────────────────────────────
const ENEMY_GROUPING = {
  hashCellSize: 4.0,
  separation: {
    enabled: true,
    strength: 1.25,
    hardPushStrength: 0.35,
    extraPadding: 0.55,
    queryPadding: 3.0,
    maxForce: 2.25,
  },
  laneing: {
    enabled: true,
    slotCount: 16,
    slotRadiusMin: 3.5,
    slotRadiusMax: 9.0,
    assignmentRefreshMin: 0.75,
    assignmentRefreshMax: 1.75,
    tangentialStrength: 0.45,
  },
  archetypeSpacing: {
    [ENEMY_TYPE.RUSHER]:     1.00,
    [ENEMY_TYPE.TANKER]:     1.55,
    [ENEMY_TYPE.SPLITTER]:   1.25,
    [ENEMY_TYPE.SNIPER]:     2.25,
    [ENEMY_TYPE.ORBITER]:    1.80,
    [ENEMY_TYPE.TELEPORTER]: 1.50,
    [ENEMY_TYPE.SHIELDED]:   1.40,
    [ENEMY_TYPE.BOSS]:       3.00,
  },
  archetypeMass: {
    [ENEMY_TYPE.RUSHER]:     1.0,
    [ENEMY_TYPE.TANKER]:     2.5,
    [ENEMY_TYPE.SPLITTER]:   2.0,
    [ENEMY_TYPE.SNIPER]:     1.0,
    [ENEMY_TYPE.ORBITER]:    1.2,
    [ENEMY_TYPE.TELEPORTER]: 1.0,
    [ENEMY_TYPE.SHIELDED]:   1.5,
    [ENEMY_TYPE.BOSS]:       4.0,
  },
  smoothing: {
    enabled: true,
    steerLerp: 0.18,
  },
};

// Preferred ring radius per archetype (for slot assignment)
const ARCHETYPE_RING_RADIUS = {
  [ENEMY_TYPE.RUSHER]:     4.5,
  [ENEMY_TYPE.ORBITER]:    7.0,
  [ENEMY_TYPE.TANKER]:     5.5,
  [ENEMY_TYPE.SNIPER]:     9.0,
  [ENEMY_TYPE.TELEPORTER]: 6.0,
  [ENEMY_TYPE.SHIELDED]:   5.0,
  [ENEMY_TYPE.SPLITTER]:   5.5,
  [ENEMY_TYPE.BOSS]:       7.0,
};

// Seek/slot/separation weights per archetype
const ARCHETYPE_WEIGHTS = {
  [ENEMY_TYPE.RUSHER]:     { seek: 0.80, slot: 0.20, separation: 1.0 },
  [ENEMY_TYPE.ORBITER]:    { seek: 0.20, slot: 0.65, separation: 0.85 },
  [ENEMY_TYPE.TANKER]:     { seek: 0.70, slot: 0.30, separation: 1.2 },
  [ENEMY_TYPE.SNIPER]:     { seek: 0.35, slot: 0.50, separation: 1.3 },
  [ENEMY_TYPE.TELEPORTER]: { seek: 0.70, slot: 0.30, separation: 1.0 },
  [ENEMY_TYPE.SHIELDED]:   { seek: 0.65, slot: 0.35, separation: 1.1 },
  [ENEMY_TYPE.SPLITTER]:   { seek: 0.75, slot: 0.25, separation: 1.15 },
  [ENEMY_TYPE.BOSS]:       { seek: 0.70, slot: 0.30, separation: 1.5 },
};

// ── Spatial hash ──────────────────────────────────────────────────────────────
class SpatialHash {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear() { this.cells.clear(); }

  _key(ix, iz) { return `${ix},${iz}`; }
  _coord(v) { return Math.floor(v / this.cellSize); }

  insert(enemy) {
    const ix = this._coord(enemy.group.position.x);
    const iz = this._coord(enemy.group.position.z);
    const key = this._key(ix, iz);
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push(enemy);
  }

  query(x, z, radius, out = []) {
    out.length = 0;
    const minX = this._coord(x - radius);
    const maxX = this._coord(x + radius);
    const minZ = this._coord(z - radius);
    const maxZ = this._coord(z + radius);
    const seen = new Set();
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const bucket = this.cells.get(this._key(ix, iz));
        if (!bucket) continue;
        for (const e of bucket) {
          if (seen.has(e)) continue;
          seen.add(e);
          out.push(e);
        }
      }
    }
    return out;
  }

  rebuild(list) {
    this.clear();
    for (const e of list) this.insert(e);
  }
}

const _spatialHash = new SpatialHash(ENEMY_GROUPING.hashCellSize);
const _queryBuf = [];

function getSpacingMultiplier(enemy) {
  return ENEMY_GROUPING.archetypeSpacing[enemy.type] ?? 1.0;
}

function getEnemyMass(enemy) {
  return ENEMY_GROUPING.archetypeMass[enemy.type] ?? 1.0;
}

function getActiveNpcs() {
  return enemies.concat(allies);
}

// ── Separation steering (soft, before movement) ───────────────────────────────
function computeEnemySeparation(enemy, nearby) {
  const cfg = ENEMY_GROUPING.separation;
  let fx = 0, fz = 0;

  const selfR = enemy.radius;
  const selfS = getSpacingMultiplier(enemy);

  for (const other of nearby) {
    if (!other || other === enemy) continue;

    const dx = enemy.group.position.x - other.group.position.x;
    const dz = enemy.group.position.z - other.group.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= 0.00001) continue;

    const dist = Math.sqrt(d2);
    const minDist = selfR * selfS + other.radius * getSpacingMultiplier(other) + cfg.extraPadding;
    if (dist >= minDist) continue;

    const nx = dx / dist;
    const nz = dz / dist;
    const t = 1 - dist / minDist;
    const strength = t * t * cfg.strength;
    fx += nx * strength;
    fz += nz * strength;
  }

  const len = Math.hypot(fx, fz);
  if (len > cfg.maxForce) { fx = (fx / len) * cfg.maxForce; fz = (fz / len) * cfg.maxForce; }
  return { x: fx, z: fz };
}

// ── Slot/ring bias ────────────────────────────────────────────────────────────
function getPreferredRingRadius(enemy) {
  return ARCHETYPE_RING_RADIUS[enemy.type] ?? 5.0;
}

function assignEnemyGroupSlot(enemy, playerPos, dt) {
  enemy.slotTimer = (enemy.slotTimer ?? 0) - dt;
  if (enemy.slotTimer > 0 && enemy.groupSlot !== undefined) return;

  const cfg = ENEMY_GROUPING.laneing;
  const ringRadius = getPreferredRingRadius(enemy);
  const slotCount = cfg.slotCount;
  let bestSlot = 0, bestScore = Infinity;

  for (let i = 0; i < slotCount; i++) {
    const angle = (i / slotCount) * Math.PI * 2;
    const sx = playerPos.x + Math.cos(angle) * ringRadius;
    const sz = playerPos.z + Math.sin(angle) * ringRadius;
    const ddx = enemy.group.position.x - sx;
    const ddz = enemy.group.position.z - sz;
    let score = (ddx * ddx + ddz * ddz) * 0.15;

    // Penalise slots crowded with same-archetype enemies
    for (const other of enemies) {
      if (!other || other === enemy || other.groupSlot !== i) continue;
      if (other.type === enemy.type) score += 120;
      else score += 30;
    }

    if (score < bestScore) { bestScore = score; bestSlot = i; }
  }

  enemy.groupSlot = bestSlot;
  enemy.slotTimer = enemy.slotTimer = ENEMY_GROUPING.laneing.assignmentRefreshMin
    + Math.random() * (ENEMY_GROUPING.laneing.assignmentRefreshMax - ENEMY_GROUPING.laneing.assignmentRefreshMin);
}

function computeSlotBias(enemy, playerPos) {
  if (!ENEMY_GROUPING.laneing.enabled || enemy.groupSlot === undefined) return { x: 0, z: 0 };
  const cfg = ENEMY_GROUPING.laneing;
  const angle = (enemy.groupSlot / cfg.slotCount) * Math.PI * 2;
  const ringRadius = getPreferredRingRadius(enemy);
  const tx = playerPos.x + Math.cos(angle) * ringRadius;
  const tz = playerPos.z + Math.sin(angle) * ringRadius;
  const dx = tx - enemy.group.position.x;
  const dz = tz - enemy.group.position.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.001) return { x: 0, z: 0 };
  return { x: dx / len, z: dz / len };
}

// ── Steering smoothing ─────────────────────────────────────────────────────────
function smoothSteer(enemy, next) {
  if (!ENEMY_GROUPING.smoothing.enabled) return next;
  const prev = enemy.lastSteer ?? next;
  const t = ENEMY_GROUPING.smoothing.steerLerp;
  let x = prev.x + (next.x - prev.x) * t;
  let z = prev.z + (next.z - prev.z) * t;
  const len = Math.hypot(x, z) || 1;
  x /= len; z /= len;
  enemy.lastSteer = { x, z };
  return enemy.lastSteer;
}

// ── Hard decollision (after movement) ─────────────────────────────────────────
function applyHardEnemyDecollision() {
  const cfg = ENEMY_GROUPING.separation;
  const npcs = getActiveNpcs();
  for (const a of npcs) {
    if (!a) continue;
    const ar = a.radius * getSpacingMultiplier(a);
    _spatialHash.query(a.group.position.x, a.group.position.z, ar + cfg.queryPadding, _queryBuf);
    for (const b of _queryBuf) {
      if (!b || b === a) continue;
      if (npcs.indexOf(b) < npcs.indexOf(a)) continue;
      const br = b.radius * getSpacingMultiplier(b);
      const minD = ar + br + cfg.extraPadding;
      const dx = b.group.position.x - a.group.position.x;
      const dz = b.group.position.z - a.group.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= 0.00001 || d2 >= minD * minD) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const overlap = minD - d;
      const massA = getEnemyMass(a), massB = getEnemyMass(b);
      const total = massA + massB;
      const pushA = (massB / total) * overlap * cfg.hardPushStrength;
      const pushB = (massA / total) * overlap * cfg.hardPushStrength;
      a.group.position.x -= nx * pushA;
      a.group.position.z -= nz * pushA;
      b.group.position.x += nx * pushB;
      b.group.position.z += nz * pushB;
      resolveCircleAgainstPlacedObjects(a.group.position, a.radius || ar);
      resolveCircleAgainstPlacedObjects(b.group.position, b.radius || br);
    }
  }
}

// ── Core data ─────────────────────────────────────────────────────────────────
const enemies = [];
const allies = [];
const enemyBullets = [];
const destructionParticles = [];
const enemyCorpses = [];
const particlePool = [];
const npcProjectileShockwaves = [];
let _npcProjectileShockwaveId = 1;

const _enemyGeoCache = new Map();
const _tmpVec = new THREE.Vector3();
const _tmpVec2 = new THREE.Vector3();
const _bulletDir = new THREE.Vector3();
const _enemyBulletGeo = new THREE.CapsuleGeometry(0.065, 0.44, 5, 10);
const _enemyBulletGeoCache = new Map();
const _particleGeo = new THREE.SphereGeometry(1, 6, 4);
const _npcProjectileShockwaveGeo = new THREE.SphereGeometry(1, 32, 16);
const _enemyBulletMatCache = new Map();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _corpseRestAxis = new THREE.Vector3();
const _corpseRestQuat = new THREE.Quaternion();
const _npcProjectileRight = new THREE.Vector3();
const _npcProjectileUp = new THREE.Vector3();
const _npcAimPoint = new THREE.Vector3();
const _npcFireTargetPoint = new THREE.Vector3();

function getDef(type) {
  return ENEMY_DEFS[type] || ENEMY_DEFS[ENEMY_TYPE.RUSHER];
}

function getEnemyGeometry(sizeMult) {
  const key = sizeMult.toFixed(3);
  let geo = _enemyGeoCache.get(key);
  if (!geo) {
    geo = new THREE.CapsuleGeometry(BASE_RADIUS * sizeMult, BASE_LENGTH * sizeMult, 8, 16);
    _enemyGeoCache.set(key, geo);
  }
  return geo;
}

function normalizeHexColor(value, fallback = '#ffffff') {
  const color = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function getBulletMaterial(color, { bloom = false, opacity = 0.88 } = {}) {
  const resolved = typeof color === 'string'
    ? normalizeHexColor(color, '#ffffff')
    : `#${(Number(color) >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
  const key = `${resolved}:${bloom ? 'bloom' : 'solid'}:${opacity.toFixed(2)}`;
  let mat = _enemyBulletMatCache.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color: resolved,
      transparent: true,
      opacity,
      toneMapped: !bloom,
      blending: bloom ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !bloom,
    });
    _enemyBulletMatCache.set(key, mat);
  }
  return mat;
}

function getNpcBulletGeometry(config) {
  const visual = config?.visual || 'solid';
  const radius = clamp(Number(config?.projectileSize) || 0.22, 0.02, 2);
  const length = clamp(Number(config?.projectileLength) || radius * 2, 0.02, 12);
  const key = `${visual}:${radius.toFixed(3)}:${length.toFixed(3)}`;
  let geo = _enemyBulletGeoCache.get(key);
  if (!geo) {
    if (visual === 'grenade') {
      geo = new THREE.SphereGeometry(radius, 14, 10);
    } else {
      geo = new THREE.CapsuleGeometry(Math.max(0.01, radius * 0.5), Math.max(0.01, length), 6, 12);
    }
    _enemyBulletGeoCache.set(key, geo);
  }
  return geo;
}

function acquireParticle(color) {
  const mesh = particlePool.pop() || new THREE.Mesh(
    _particleGeo,
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0,
      transparent: true, opacity: 1, roughness: 0.45, metalness: 0.0, depthWrite: false, toneMapped: false,
    }),
  );
  mesh.material.color.set(color);
  mesh.material.emissive.set(color);
  mesh.material.opacity = 1;
  mesh.material.emissiveIntensity = 0;
  mesh.visible = true;
  scene.add(mesh);
  return mesh;
}

function releaseParticle(particle) {
  scene.remove(particle.mesh);
  particle.mesh.visible = false;
  particlePool.push(particle.mesh);
}

function randomRange(min, max) { return min + Math.random() * (max - min); }
function randomInt(min, max) { return Math.floor(randomRange(min, max + 1)); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function normalizeXZ(vec) {
  vec.y = 0;
  if (vec.lengthSq() < 0.0001) return vec.set(0, 0, 1);
  return vec.normalize();
}

function makeEnemyMaterial(def) {
  return new THREE.MeshStandardMaterial({
    color: def.color, emissive: def.color, emissiveIntensity: 0.06,
    metalness: def.metallic ? 0.72 : 0.08, roughness: def.metallic ? 0.32 : 0.58,
  });
}

// ── MGSV-style tag marker — hidden until the player tags the enemy ────────────
export const TAG_DWELL_SECONDS = 1.2; // seconds of continuous aim needed to tag

// SVG path data extracted from tag.svg — used for inline SVG rendering of the tag marker.
// Inline SVG allows stroke-width control for true line thickness without ghost copies.
const TAG_PATH = 'M228-212q-18 0-26-15.5t1-30.5l252-403q9-14 25-14t25 14l252 403q9 15 1 30.5T732-212H228Zm-4-28h512L480-650 224-240Zm256-205Z';

function getTagColor() {
  return state.params.tagColor || '#ff2828';
}

function getTagSize() {
  return Math.max(8, Math.min(64, Number(state.params.tagSize) || 22));
}

function buildTagImgStyle(color) {
  // Convert hex color to a CSS filter that tints the SVG.
  // We use a known filter chain that produces red; for other colors we blend with hue-rotate.
  // Simple approach: use the SVG fill attribute override via CSS color-mix isn't supported widely,
  // so we set a data-color attr and use brightness/sepia/hue-rotate tricks.
  return 'display:block;transform:rotate(180deg);';
}

function colorToFilter(hex) {
  // Parse hex to rgb
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  // We render the SVG as an <img>. To recolor, we use CSS filter.
  // The tag.svg has a light grey fill, so we:
  // 1. brightness(0) makes it black
  // 2. invert(1) makes it white
  // 3. sepia(1) + hue-rotate + saturate produces a target hue
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) h = ((g-b)/d + (g<b?6:0))/6;
    else if (max === g) h = ((b-r)/d + 2)/6;
    else h = ((r-g)/d + 4)/6;
  }
  const hDeg = Math.round(h * 360);
  // sepia base is ~36deg hue. We rotate from there.
  const rotate = hDeg - 36;
  const sat = max === 0 ? 0 : ((max-min)/max);
  const satPct = Math.round(Math.max(0.3, sat) * 900);
  const bri = Math.round(Math.max(0.5, (r+g+b)/3 * 2.5) * 100);
  return `brightness(0) invert(1) sepia(1) saturate(${satPct}%) hue-rotate(${rotate}deg) brightness(${bri}%)`;
}

function getTagThickness() {
  return Math.max(0, Math.min(12, Number(state.params.tagThickness) ?? 2));
}

function getTagBloom() {
  return Math.max(0, Math.min(20, Number(state.params.tagBloom) ?? 3));
}

function getTagShadow() {
  return Math.max(0, Math.min(30, Number(state.params.tagShadow) ?? 4));
}

function getTagHeight() {
  // Returns pixels for screen-space offset above the enemy head anchor
  return Math.max(0, Math.min(500, Number(state.params.tagHeight) ?? 18));
}

// Wrapper filter: only bloom and shadow — thickness is now handled by SVG stroke-width.
// Keeping thickness off the wrapper prevents ghost-copy duplication.
function buildWrapperFilter(color) {
  const bloom  = getTagBloom();
  const shadow = getTagShadow();
  const parts  = [];
  if (bloom > 0) {
    parts.push(`drop-shadow(0 0 ${bloom}px ${color})`);
    parts.push(`drop-shadow(0 0 ${Math.ceil(bloom * 0.5)}px ${color})`);
  }
  if (shadow > 0) {
    parts.push(`drop-shadow(0 ${Math.ceil(shadow * 0.5)}px ${shadow}px rgba(0,0,0,0.85))`);
  }
  return parts.join(' ') || 'none';
}


function buildTagSvgEl(color, size, thickness) {
  // Inline SVG so we can control stroke-width for true line thickness
  // without creating ghost copies of the icon.
  // The tag is rendered upside-down (rotate 180deg) to point downward.
  const strokeW = thickness > 0 ? thickness : 0;
  const svgEl = document.createElement('div');
  svgEl.style.cssText = [
    `width:${size}px`, `height:${size}px`,
    'display:block', 'transform:rotate(180deg)',
    'pointer-events:none',
  ].join(';');
  svgEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 -960 960 960" style="display:block;overflow:visible"><path d="${TAG_PATH}" fill="${color}" stroke="${color}" stroke-width="${strokeW}" stroke-linejoin="round"/></svg>`;
  return svgEl;
}

function makeTagMarker(enemy) {
  const color     = getTagColor();
  const size      = getTagSize();
  const thickness = getTagThickness();

  const el = document.createElement('div');
  el.style.cssText = [
    `width:${size}px`, `height:${size}px`,
    'pointer-events:none',
    'display:flex', 'align-items:center', 'justify-content:center',
    'opacity:0',
    'transition:opacity 0.2s ease',
  ].join(';');

  el.appendChild(buildTagSvgEl(color, size, thickness));

  // Bloom + shadow on wrapper only (no duplicate-icon problem here)
  const wrapFilter = buildWrapperFilter(color);
  if (wrapFilter !== 'none') el.style.filter = wrapFilter;

  const obj = new CSS2DObject(el);
  // center=(0.5, 0): top-centre of element anchors to the world point.
  // We place the world point at enemyVisualTop + height-offset (world units = 0),
  // then use marginTop to push the element up in screen-space pixels.
  obj.center.set(0.5, 0);
  const enemyVisualTop = (enemy.radius * 2 + enemy.sizeMult * 1.2);
  obj.position.set(0, enemyVisualTop, 0);
  // marginTop: negative value pulls element upward in screen space.
  // This is distance-independent — looks the same near or far.
  el.style.marginTop = `-${getTagHeight()}px`;

  enemy.group.add(obj);
  enemy._tagEl  = el;
  enemy._tagObj = obj;
}


function makeNpcHealthBar(npc) {
  const teamColor = npc.isAlly ? '#35ff00' : '#ff3030';
  const trackColor = npc.isAlly ? 'rgba(77,255,99,0.18)' : 'rgba(255,48,48,0.18)';

  const el = document.createElement('div');
  el.className = 'npc-health-bar game-hud-track';
  el.dataset.team = npc.isAlly ? 'ally' : 'enemy';
  el.style.cssText = [
    'width:92px', 'height:10px', 'box-sizing:border-box',
    `background:${trackColor}`,
    'border:none', 'border-radius:3px', 'overflow:hidden',
    'pointer-events:none', 'display:none', 'margin-top:0',
    'box-shadow:0 0 0 1px rgba(0,0,0,0.95), 1px 2px 4px rgba(0,0,0,0.9)',
    'will-change:opacity,transform',
  ].join(';');

  const fill = document.createElement('div');
  fill.className = 'npc-health-bar-fill game-hud-fill';
  fill.style.cssText = [
    'display:block', 'height:100%', 'width:100%',
    `background:${teamColor}`, 'border-radius:inherit',
    'box-shadow:none', 'transition:width 0.08s linear',
  ].join(';');
  el.appendChild(fill);

  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 0.5);
  const visualTop = (npc.radius * 2 + npc.sizeMult * 1.2);
  obj.position.set(0, visualTop + 0.34, 0);
  npc.group.add(obj);

  npc._healthBarEl = el;
  npc._healthBarFill = fill;
  npc._healthBarObj = obj;
  npc._healthBarState = {
    display: 'none',
    opacity: '',
    ratio: null,
    width: '',
  };
  updateNpcHealthBar(npc, { force: true });
}

function getNpcHealthBarMaxDistance() {
  return Math.max(0, Number(state.params.hudNpcHealthBarRange ?? NPC_HEALTH_BAR_DISTANCE_DEFAULT) || 0);
}

function updateNpcHealthBar(npc, { force = false } = {}) {
  if (!npc?._healthBarEl || !npc._healthBarFill) return;
  const legacyEnabled = state.params.hudNpcHealthBars !== false;
  const teamEnabled = npc.isAlly
    ? state.params.hudAllyHealthBars !== false
    : state.params.hudEnemyHealthBars !== false;
  const enabled = state.params.hudVisible !== false && legacyEnabled && teamEnabled;
  const ratio = clamp((Number(npc.hp) || 0) / Math.max(1, Number(npc.maxHp) || 1), 0, 1);
  const maxDistance = getNpcHealthBarMaxDistance();
  const inRange = maxDistance <= 0 || !camera?.position
    || camera.position.distanceToSquared(npc.group.position) <= maxDistance * maxDistance;
  const visible = enabled && ratio > 0 && inRange;
  const display = visible ? 'block' : 'none';
  const cache = npc._healthBarState || (npc._healthBarState = {});

  if (force || cache.display !== display) {
    npc._healthBarEl.style.display = display;
    cache.display = display;
  }
  if (!visible) return;

  if (force || cache.opacity !== '1') {
    npc._healthBarEl.style.opacity = '1';
    cache.opacity = '1';
  }
  if (force || cache.ratio === null || Math.abs(cache.ratio - ratio) >= NPC_HEALTH_BAR_RATIO_EPSILON) {
    const width = `${Math.round(ratio * 1000) / 10}%`;
    if (force || cache.width !== width) {
      npc._healthBarFill.style.width = width;
      cache.width = width;
    }
    cache.ratio = ratio;
  }
}

function makeNpcRifleVisual(npc) {
  const weaponGroup = new THREE.Group();
  weaponGroup.name = npc.isAlly ? 'AllyWeapon_Rifle_RightHand' : 'EnemyWeapon_Rifle_RightHand';

  const rifle = new THREE.Mesh(_npcRifleGeo, _npcRifleMat);
  rifle.name = npc.isAlly ? 'AllyRifle' : 'EnemyRifle';
  rifle.castShadow = false;
  rifle.receiveShadow = false;
  rifle.position.z = NPC_RIFLE.length * 0.5 - NPC_RIFLE.grip;
  weaponGroup.add(rifle);

  const muzzle = new THREE.Object3D();
  muzzle.name = npc.isAlly ? 'AllyRifleMuzzle' : 'EnemyRifleMuzzle';
  muzzle.position.set(0, 0, NPC_RIFLE.length - NPC_RIFLE.grip);
  weaponGroup.add(muzzle);

  npc.group.add(weaponGroup);
  npc._weaponGroup = weaponGroup;
  npc._weaponMuzzle = muzzle;
  updateNpcWeaponVisual(npc);
}

function isWorldPointLike(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function aimNpcWeaponAt(npc, targetPoint) {
  if (!npc?._weaponGroup || !isWorldPointLike(targetPoint)) {
    npc?._weaponGroup?.rotation.set(0, 0, 0);
    return;
  }

  // NPC rifle/muzzle geometry points down local +Z. lookAt points local -Z at
  // the target, so rotate 180° afterward to make the carried weapon point at
  // the same target without disturbing NPC movement or firing state.
  npc._weaponGroup.lookAt(targetPoint);
  npc._weaponGroup.rotateY(Math.PI);
}

function getNpcAimPoint(targetNpc = null, out = _npcAimPoint) {
  if (targetNpc?.group) {
    out.copy(targetNpc.group.position);
    out.y += targetNpc.mesh?.position?.y ?? Math.max(0.6, (targetNpc.radius || BASE_RADIUS) + 0.35);
    return out;
  }

  const playerRadius = Math.max(0.35, Number(state.params.playerRadius) || 0.4);
  out.copy(playerGroup.position);
  out.y += Math.max(0.6, playerRadius + 0.35);
  return out;
}

function updateNpcWeaponVisual(npc, targetPoint = null) {
  if (!npc?._weaponGroup) return;
  const weapon = getEffectiveWeapon(npc);
  const visible = weapon === 'rifle' || weapon === 'laser';
  if (npc._weaponVisible !== visible) {
    npc._weaponGroup.visible = visible;
    npc._weaponVisible = visible;
  }
  if (!visible) return;

  const radius = Math.max(0.25, Number(npc.radius) || BASE_RADIUS);
  const bodyLength = Math.max(0.5, BASE_LENGTH * (Number(npc.sizeMult) || 1));
  const transformKey = `${radius.toFixed(3)}:${bodyLength.toFixed(3)}`;
  if (npc._weaponTransformKey !== transformKey) {
    npc._weaponGroup.position.set(
      radius + NPC_RIFLE.sideGap,
      radius + bodyLength * 0.56,
      NPC_RIFLE.forwardOffset,
    );
    npc._weaponTransformKey = transformKey;
  }

  if (isWorldPointLike(targetPoint)) {
    aimNpcWeaponAt(npc, targetPoint);
  } else {
    npc._weaponGroup.rotation.set(0, 0, 0);
  }
}


// Call from loop.js when dwell threshold is reached
export function tagEnemy(enemy) {
  if (!enemy || enemy.tagged) return;
  if (state.params.tagEnabled === false) return;
  enemy.tagged = true;
  if (enemy._tagEl) {
    enemy._tagEl.style.opacity = '1';
  }
}

// Refresh all live tag markers when sidebar settings change (color, size).
export function applyTagSettings() {
  for (const enemy of enemies) {
    if (!enemy._tagEl || !enemy._tagObj) continue;
    const color  = getTagColor();
    const size   = getTagSize();
    const thickness = getTagThickness();
    // Replace the inner SVG element with a freshly built one (simplest correct update)
    const oldSvgWrap = enemy._tagEl.querySelector('div');
    const newSvgWrap = buildTagSvgEl(color, size, thickness);
    if (oldSvgWrap) enemy._tagEl.replaceChild(newSvgWrap, oldSvgWrap);
    else enemy._tagEl.appendChild(newSvgWrap);
    // Update wrapper size and filter (bloom + shadow only)
    enemy._tagEl.style.width  = `${size}px`;
    enemy._tagEl.style.height = `${size}px`;
    const wrapFilter = buildWrapperFilter(color);
    if (wrapFilter !== 'none') enemy._tagEl.style.filter = wrapFilter;
    else enemy._tagEl.style.filter = '';
    // Update screen-space height offset (marginTop, distance-independent)
    enemy._tagEl.style.marginTop = `-${getTagHeight()}px`;
    // Show/hide based on tag state and enabled setting
    if (enemy.tagged) {
      enemy._tagEl.style.opacity = state.params.tagEnabled === false ? '0' : '1';
    }
  }
}


function makeEnemy(type, position, index = 0, options = {}) {
  const def = getDef(type);
  const group = new THREE.Group();
  const team = options.team === 'ally' ? 'ally' : 'enemy';
  group.name = team === 'ally' ? `Ally_${type}` : `Enemy_${type}`;
  group.position.set(position.x, 0, position.z);

  const material = makeEnemyMaterial(def);
  const mesh = new THREE.Mesh(getEnemyGeometry(def.sizeMult), material);
  mesh.name = 'EnemyBody';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = (BASE_RADIUS + BASE_LENGTH / 2) * def.sizeMult;
  group.add(mesh);
  scene.add(group);

  const healthKey = team === 'ally' ? 'allyHealth' : 'enemyHealth';
  const maxHp = Math.max(1, Number(options.health ?? state.params[healthKey]) || 100);
  const enemy = {
    type, def, group, mesh, material, maxHp, team, isAlly: team === 'ally',
    hp: maxHp,
    radius: BASE_RADIUS * def.sizeMult,
    sizeMult: def.sizeMult,
    spawnFlashTimer: 0.65,
    contactCooldown: randomRange(0.1, 0.8),
    shootTimer: randomRange(0.25, 1.4),
    teleportCooldown: randomRange(1.0, 2.5),
    bobOffset: index * 0.81,
    phase: 1,
    tagged: false,
    editorPlaced: options.editorPlaced === true,
    editorNpcId: options.editorNpcId || null,
    behavior: options.behavior || null,
    weaponType: options.weaponType || null,
    awarenessRange: Number.isFinite(Number(options.awarenessRange)) ? Number(options.awarenessRange) : null,
    accuracy: Number.isFinite(Number(options.accuracy)) ? Number(options.accuracy) : null,
    moveSpeed: Number.isFinite(Number(options.moveSpeed)) ? Number(options.moveSpeed) : null,
    damage: Number.isFinite(Number(options.damage)) ? Number(options.damage) : null,
    // Grouping fields
    groupSlot: undefined,
    slotTimer: randomRange(0, 0.5), // stagger initial slot assignment
    lastSteer: null,
  };
  mesh.userData.npc = enemy;
  group.userData.npc = enemy;
  if (Number.isFinite(Number(options.ry))) group.rotation.y = Number(options.ry);
  if (!enemy.isAlly) makeTagMarker(enemy);
  makeNpcHealthBar(enemy);
  makeNpcRifleVisual(enemy);
  updateNpcAwarenessRing(enemy);
  return enemy;
}

function disposeEnemy(enemy) {
  // Hide tag element before removing from scene to avoid CSS2D orphan flicker
  if (enemy._tagEl) {
    enemy._tagEl.style.opacity = '0';
    enemy._tagEl.style.display = 'none';
  }
  if (enemy._healthBarEl) {
    enemy._healthBarEl.style.opacity = '0';
    enemy._healthBarEl.style.display = 'none';
  }
  if (enemy._awarenessRing) scene.remove(enemy._awarenessRing);
  if (enemy._awarenessOutlineRing) scene.remove(enemy._awarenessOutlineRing);
  scene.remove(enemy.group);
  enemy.material?.dispose?.();
  if (enemy._awarenessRing?.material) enemy._awarenessRing.material.dispose?.();
  if (enemy._awarenessOutlineRing?.material) enemy._awarenessOutlineRing.material.dispose?.();
}

function disposeEnemyBullet(bullet) {
  scene.remove(bullet.mesh);
}

function getSpawnPosition(index, count, options = {}) {
  const placement = options.placement || state.params.enemyPlacement || 'random';
  const origin = playerGroup.position;
  const existingPositions = options.existingPositions || enemies.map(e => e.group.position);

  if (placement === 'grouped') {
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    const ring = 7.5 + Math.floor(index / 8) * 1.8;
    return {
      x: origin.x + Math.cos(angle) * ring + randomRange(-0.45, 0.45),
      z: origin.z + Math.sin(angle) * ring + randomRange(-0.45, 0.45),
    };
  }

  // Anti-clump spawn: try up to 12 positions, pick one not too close to existing enemies
  const minSpawnSep = 2.2;
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = randomRange(7.5, 17.5);
    const pos = {
      x: origin.x + Math.cos(angle) * radius,
      z: origin.z + Math.sin(angle) * radius,
    };
    let tooClose = false;
    for (const ep of existingPositions) {
      const dx = pos.x - ep.x, dz = pos.z - ep.z;
      if (dx * dx + dz * dz < minSpawnSep * minSpawnSep) { tooClose = true; break; }
    }
    if (!tooClose) return pos;
  }
  // Fallback: spawn slightly farther out
  const angle = Math.random() * Math.PI * 2;
  return {
    x: origin.x + Math.cos(angle) * 20,
    z: origin.z + Math.sin(angle) * 20,
  };
}

// Returns all active enemy mesh objects for raycasting (e.g. reticle hover check).
export function getEnemyMeshes() {
  return enemies.map(e => e.mesh);
}

export function getAllNpcMeshes() {
  return [...enemies, ...allies].map(e => e.mesh).filter(Boolean);
}

// Returns the full active enemy list for aim volume testing.
export function getEnemies() {
  return enemies;
}

export function getAllies() {
  return allies;
}

function removeEditorNpcDataForTeam(team) {
  if (!Array.isArray(state.params.editorPlacedNpcs)) return;
  state.params.editorPlacedNpcs = state.params.editorPlacedNpcs.filter(item => item?.team !== team);
}

export function clearEnemies() {
  while (enemies.length) disposeEnemy(enemies.pop());
  while (enemyBullets.length) disposeEnemyBullet(enemyBullets.pop());
  while (destructionParticles.length) releaseParticle(destructionParticles.pop());
  while (enemyCorpses.length) disposeEnemyCorpse(enemyCorpses.pop());
  removeEditorNpcDataForTeam('enemy');
}

export function clearAllies() {
  while (allies.length) disposeEnemy(allies.pop());
  removeEditorNpcDataForTeam('ally');
}

const ENEMY_DESTRUCTION_PREFIX = Object.freeze({
  [ENEMY_TYPE.RUSHER]: 'destructionRusher',
  [ENEMY_TYPE.ORBITER]: 'destructionOrbiter',
  [ENEMY_TYPE.TANKER]: 'destructionTanker',
  [ENEMY_TYPE.SNIPER]: 'destructionSniper',
  [ENEMY_TYPE.TELEPORTER]: 'destructionTeleporter',
  [ENEMY_TYPE.SHIELDED]: 'destructionShielded',
  [ENEMY_TYPE.SPLITTER]: 'destructionSplitter',
  [ENEMY_TYPE.BOSS]: 'destructionBoss',
});

function hexToNumber(value, fallback = 0xff1111) {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    return Number.parseInt(value.trim().slice(1), 16);
  }
  return fallback;
}

function getDestructionParam(prefix, suffix, fallback) {
  const value = state.params[`${prefix}${suffix}`];
  return value === undefined || value === null ? fallback : value;
}

function getOverallBloomFactor() {
  const raw = Number(state.params.overallBloomIntensity);
  return clamp(Number.isFinite(raw) ? raw : 1, 0, 4);
}

function defaultParticleCountForEnemy(enemy) {
  const elite = enemy.type === ENEMY_TYPE.SPLITTER || enemy.type === ENEMY_TYPE.BOSS;
  if (elite) return Number(state.params.enemyDestructionEliteCount ?? 100);
  return Number(state.params.enemyDestructionParticleCount ?? state.params.enemyDestructionStandardCount ?? 40);
}

function defaultParticleSizeForEnemy(enemy) {
  const elite = enemy.type === ENEMY_TYPE.SPLITTER || enemy.type === ENEMY_TYPE.BOSS;
  if (elite) return Number(state.params.enemyDestructionEliteSize ?? 0.5);
  return Number(state.params.enemyDestructionParticleSize ?? state.params.enemyDestructionStandardSize ?? 0.32);
}

function defaultParticleSpeedForEnemy(enemy) {
  const elite = enemy.type === ENEMY_TYPE.SPLITTER || enemy.type === ENEMY_TYPE.BOSS;
  if (elite) return Number(state.params.enemyDestructionEliteSpeed ?? 1.75);
  return Number(state.params.enemyDestructionParticleSpeed ?? state.params.enemyDestructionStandardSpeed ?? 1.25);
}

function defaultParticleGlowForEnemy(enemy) {
  const elite = enemy.type === ENEMY_TYPE.SPLITTER || enemy.type === ENEMY_TYPE.BOSS;
  if (elite) return Number(state.params.enemyDestructionEliteGlow ?? 12);
  return Number(state.params.enemyDestructionParticleGlow ?? 8);
}

function getDestructionConfig(enemy) {
  const legacyPrefix = ENEMY_DESTRUCTION_PREFIX[enemy.type] || ENEMY_DESTRUCTION_PREFIX[ENEMY_TYPE.RUSHER];
  const prefix = enemy.isAlly ? 'destructionAllies' : 'destructionEnemies';
  const fallbackColor = enemy.isAlly ? 0x35ff00 : 0xff3030;
  const legacyColor = enemy.def?.color ?? fallbackColor;
  const legacyColorHex = `#${legacyColor.toString(16).padStart(6, '0')}`;
  const readGeneric = (suffix, fallback) => getDestructionParam(
    prefix,
    suffix,
    getDestructionParam(legacyPrefix, suffix, fallback),
  );

  return {
    count: Math.max(0, Math.round(Number(readGeneric('ParticleCount', defaultParticleCountForEnemy(enemy))) || 0)),
    size: Math.max(0.01, Number(readGeneric('ParticleSize', defaultParticleSizeForEnemy(enemy))) || 0.32),
    speed: Math.max(0.01, Number(readGeneric('ParticleSpeed', defaultParticleSpeedForEnemy(enemy))) || 1.25),
    glow: Math.max(0, Number(readGeneric('ParticleGlow', defaultParticleGlowForEnemy(enemy))) || 0),
    particleDespawnTime: Math.max(0.1, Number(readGeneric('ParticleDespawnTime', 1.0)) || 1.0),
    corpseFadeTime: Math.max(0.1, Number(readGeneric('CorpseFadeTime', 1.0)) || 1.0),
    color: hexToNumber(readGeneric('Color', legacyColorHex), fallbackColor),
    physics: readGeneric('Physics', state.params.enemyDestructionPhysics === false ? 'ethereal' : 'gravity') === 'ethereal' ? 'ethereal' : 'gravity',
    despawnTime: Math.max(0.1, Number(readGeneric('DespawnTime', 3.0)) || 3.0),
  };
}

function spawnDestructionParticles(enemy, cfg = getDestructionConfig(enemy)) {
  if (state.params.enemyDestructionEnabled === false) return;
  if (cfg.count <= 0) return;
  for (let i = 0; i < cfg.count; i++) {
    const mesh = acquireParticle(cfg.color);
    const baseRadius = (0.06 + Math.random() * 0.12) * cfg.size;
    const yaw = Math.random() * Math.PI * 2;
    const pitch = (Math.random() - 0.5) * Math.PI;
    const speed = (4 + Math.random() * 8) * cfg.speed;
    const maxLife = 0.5 + Math.random() * 0.6;
    mesh.position.copy(enemy.group.position);
    mesh.position.y = Math.max(0.55, enemy.mesh.position.y);
    mesh.scale.setScalar(baseRadius);
    destructionParticles.push({
      mesh, baseRadius,
      vx: Math.cos(yaw) * Math.cos(pitch) * speed,
      vy: Math.sin(pitch) * speed + (cfg.physics === 'gravity' ? 2 * cfg.speed : 0.7 * cfg.speed),
      vz: Math.sin(yaw) * Math.cos(pitch) * speed,
      life: maxLife, maxLife, glowCap: cfg.glow, physics: 'gravity',
    });
  }
}

function updateDestructionParticles(delta) {
  for (let i = destructionParticles.length - 1; i >= 0; i--) {
    const particle = destructionParticles[i];
    particle.life -= delta;
    if (particle.life <= 0) {
      destructionParticles.splice(i, 1);
      releaseParticle(particle);
      continue;
    }
    particle.mesh.position.x += particle.vx * delta;
    particle.mesh.position.y += particle.vy * delta;
    particle.mesh.position.z += particle.vz * delta;
    if (particle.physics === 'gravity') {
      particle.vy -= PARTICLE_GRAVITY * delta;
      if (particle.mesh.position.y < 0.035) {
        particle.mesh.position.y = 0.035;
        particle.vy = Math.abs(particle.vy) * 0.22;
        particle.vx *= 0.84;
        particle.vz *= 0.84;
      }
    } else {
      particle.vy += 0.15 * delta;
    }
    const t = clamp(particle.life / particle.maxLife, 0, 1);
    particle.mesh.scale.setScalar(Math.max(0.001, t * 1.2 * particle.baseRadius));
    particle.mesh.material.opacity = t;
    particle.mesh.material.emissiveIntensity = Math.max(0, t * particle.glowCap * getOverallBloomFactor());
  }
}

function spawnEnemyCorpse(enemy, cfg = getDestructionConfig(enemy)) {
  const corpseMaterial = enemy.material.clone();
  corpseMaterial.color?.set?.(enemy.def?.color ?? 0x888888);
  corpseMaterial.emissive?.set?.(enemy.def?.color ?? 0x888888);
  corpseMaterial.emissiveIntensity = 0.06;
  corpseMaterial.opacity = 1;
  corpseMaterial.transparent = true;

  const mesh = new THREE.Mesh(getEnemyGeometry(enemy.sizeMult), corpseMaterial);
  mesh.name = 'EnemyPhysicsCorpse';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  enemy.mesh.getWorldPosition(_corpseWorldPos);
  mesh.position.copy(_corpseWorldPos);
  mesh.quaternion.copy(enemy.group.quaternion);

  const yaw = enemy.group.rotation.y + randomRange(-0.35, 0.35);
  _corpseRestAxis.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  _corpseRestQuat.setFromUnitVectors(_up, _corpseRestAxis);

  scene.add(mesh);
  snapCorpseToFloor(mesh, false);

  const shoveYaw = Math.random() * Math.PI * 2;
  const speed = (0.35 + Math.random() * 0.55) * Math.max(0.2, cfg.speed);
  enemyCorpses.push({
    mesh,
    vx: Math.cos(shoveYaw) * speed,
    vy: 0,
    vz: Math.sin(shoveYaw) * speed,
    rx: (Math.random() < 0.5 ? -1 : 1) * randomRange(2.2, 3.4),
    ry: (Math.random() - 0.5) * 0.35,
    rz: (Math.random() < 0.5 ? -1 : 1) * randomRange(2.2, 3.4),
    restQuat: _corpseRestQuat.clone(),
    life: cfg.despawnTime,
    maxLife: cfg.despawnTime,
    fadeTime: Math.min(cfg.despawnTime, Math.max(0.1, Number(cfg.corpseFadeTime) || 1.0)),
    physics: 'gravity',
    grounded: false,
    groundTime: 0,
    sleepTimer: 0,
    sleeping: false,
  });
}

function snapCorpseToFloor(mesh, allowDownwardSnap = false) {
  if (!mesh) return false;
  mesh.updateMatrixWorld(true);
  _corpseBox.setFromObject(mesh);
  const floorY = 0;
  const delta = floorY - _corpseBox.min.y;
  if (delta > 0.0001 || (allowDownwardSnap && Math.abs(delta) > 0.0001)) {
    mesh.position.y += delta;
    mesh.updateMatrixWorld(true);
    return true;
  }
  return delta >= -0.0001;
}

function disposeEnemyCorpse(corpse) {
  scene.remove(corpse.mesh);
  corpse.mesh.geometry?.dispose?.();
  corpse.mesh.material?.dispose?.();
}

function updateEnemyCorpses(delta) {
  for (let i = enemyCorpses.length - 1; i >= 0; i--) {
    const corpse = enemyCorpses[i];
    corpse.life -= delta;
    if (corpse.life <= 0) {
      enemyCorpses.splice(i, 1);
      disposeEnemyCorpse(corpse);
      continue;
    }

    if (corpse.physics === 'gravity') {
      if (!corpse.sleeping) {
        corpse.vy -= PARTICLE_GRAVITY * delta;

        corpse.mesh.position.x += corpse.vx * delta;
        corpse.mesh.position.y += corpse.vy * delta;
        corpse.mesh.position.z += corpse.vz * delta;
        corpse.mesh.rotation.x += corpse.rx * delta;
        corpse.mesh.rotation.y += corpse.ry * delta;
        corpse.mesh.rotation.z += corpse.rz * delta;

        const onFloor = snapCorpseToFloor(corpse.mesh, false);
        if (onFloor) {
          corpse.grounded = true;
          corpse.groundTime = (corpse.groundTime || 0) + delta;
          corpse.vy = 0;

          const floorFriction = Math.exp(-4.8 * delta);
          const angularFriction = Math.exp(-5.6 * delta);
          corpse.vx *= floorFriction;
          corpse.vz *= floorFriction;
          corpse.rx *= angularFriction;
          corpse.ry *= angularFriction;
          corpse.rz *= angularFriction;

          const settleAmount = clamp(delta * 5.5, 0, 1);
          corpse.mesh.quaternion.slerp(corpse.restQuat, settleAmount);
          snapCorpseToFloor(corpse.mesh, true);

          const nearlyStill = corpse.groundTime > 0.18
            && Math.hypot(corpse.vx, corpse.vz) < 0.08
            && Math.hypot(corpse.rx, corpse.ry, corpse.rz) < 0.12;
          corpse.sleepTimer = nearlyStill ? (corpse.sleepTimer || 0) + delta : 0;
          if (corpse.sleepTimer > 0.16) {
            corpse.vx = 0;
            corpse.vy = 0;
            corpse.vz = 0;
            corpse.rx = 0;
            corpse.ry = 0;
            corpse.rz = 0;
            corpse.mesh.quaternion.copy(corpse.restQuat);
            snapCorpseToFloor(corpse.mesh, true);
            corpse.sleeping = true;
          }
        } else {
          corpse.grounded = false;
          corpse.groundTime = 0;
          corpse.sleepTimer = 0;
        }
      } else {
        snapCorpseToFloor(corpse.mesh, true);
      }
    } else {
      corpse.vy += 0.1 * delta;
      corpse.mesh.position.x += corpse.vx * delta;
      corpse.mesh.position.y += corpse.vy * delta;
      corpse.mesh.position.z += corpse.vz * delta;
      corpse.mesh.rotation.x += corpse.rx * delta;
      corpse.mesh.rotation.y += corpse.ry * delta;
      corpse.mesh.rotation.z += corpse.rz * delta;
    }

    const fadeWindow = Math.min(corpse.maxLife, Math.max(0.1, Number(corpse.fadeTime) || 1.0));
    const t = corpse.life < fadeWindow ? clamp(corpse.life / fadeWindow, 0, 1) : 1;
    corpse.mesh.material.opacity = t;
    corpse.mesh.material.transparent = true;
    if ('emissiveIntensity' in corpse.mesh.material) corpse.mesh.material.emissiveIntensity = 0.06 * t;
  }
}

function enemyBaseHeight(mesh) {
  return Math.max(0.22, Number(mesh.geometry?.boundingSphere?.radius) * 0.28 || 0.22);
}

function destroyEnemy(enemy) {
  playEnemyGruntSound(enemy.group.position);
  const cfg = getDestructionConfig(enemy);
  spawnEnemyCorpse(enemy, cfg);
  spawnDestructionParticles(enemy, cfg);
  if (!enemy.isAlly && enemy.type === ENEMY_TYPE.SPLITTER) spawnSplitChildren(enemy);
  const list = enemy.isAlly ? allies : enemies;
  const idx = list.indexOf(enemy);
  if (idx !== -1) list.splice(idx, 1);
  disposeEnemy(enemy);
}

export function spawnEnemiesFromSettings() {
  clearEnemies();
  const type = state.params.enemyType || ENEMY_TYPE.RUSHER;
  const count = clamp(Math.round(Number(state.params.enemyCount) || 0), 0, 100);
  for (let i = 0; i < count; i++) {
    enemies.push(makeEnemy(type, getSpawnPosition(i, count), i));
  }
  return enemies.length;
}

export function spawnAlliesFromSettings() {
  clearAllies();
  const type = state.params.allyType || ENEMY_TYPE.RUSHER;
  const count = clamp(Math.round(Number(state.params.allyCount) || 0), 0, 100);
  const existingPositions = [...enemies, ...allies].map(e => e.group.position);
  for (let i = 0; i < count; i++) {
    allies.push(makeEnemy(type, getSpawnPosition(i, count, {
      placement: state.params.allyPlacement || 'random',
      existingPositions,
    }), i, {
      team: 'ally',
      health: state.params.allyHealth,
    }));
    existingPositions.push(allies[allies.length - 1].group.position);
  }
  return allies.length;
}


function nextEditorNpcId() {
  return `editor_npc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeEditorNpcData(data = {}) {
  const team = data.team === 'ally' ? 'ally' : 'enemy';
  const type = data.type || (team === 'ally' ? state.params.allyType : state.params.enemyType) || ENEMY_TYPE.RUSHER;
  return {
    id: data.id || nextEditorNpcId(),
    team,
    type,
    x: Number.isFinite(Number(data.x)) ? Number(data.x) : 0.5,
    z: Number.isFinite(Number(data.z)) ? Number(data.z) : 0.5,
    ry: Number.isFinite(Number(data.ry)) ? Number(data.ry) : 0,
    health: Number.isFinite(Number(data.health)) ? Number(data.health) : (team === 'ally' ? state.params.allyHealth : state.params.enemyHealth),
    behavior: data.behavior || (team === 'ally' ? state.params.allyBehavior : state.params.enemyBehavior),
    moveSpeed: Number.isFinite(Number(data.moveSpeed)) ? Number(data.moveSpeed) : (team === 'ally' ? state.params.allyMoveSpeed : state.params.enemyMoveSpeed),
    damage: Number.isFinite(Number(data.damage)) ? Number(data.damage) : (team === 'ally' ? state.params.allyDamage : state.params.enemyDamage),
    weaponType: data.weaponType || (team === 'ally' ? state.params.allyWeaponType : state.params.enemyWeaponType),
    awarenessRange: Number.isFinite(Number(data.awarenessRange)) ? Number(data.awarenessRange) : (team === 'ally' ? state.params.allyAwarenessRange : state.params.enemyAwarenessRange),
    accuracy: Number.isFinite(Number(data.accuracy)) ? Number(data.accuracy) : (team === 'ally' ? state.params.allyAccuracy : state.params.enemyAccuracy),
  };
}

function spawnEditorNpcFromData(data, { persist = true } = {}) {
  const clean = normalizeEditorNpcData(data);
  const list = clean.team === 'ally' ? allies : enemies;
  const npc = makeEnemy(clean.type, { x: clean.x, z: clean.z }, list.length, {
    team: clean.team,
    health: clean.health,
    ry: clean.ry,
    editorPlaced: true,
    editorNpcId: clean.id,
    behavior: clean.behavior,
    moveSpeed: clean.moveSpeed,
    damage: clean.damage,
    weaponType: clean.weaponType,
    awarenessRange: clean.awarenessRange,
    accuracy: clean.accuracy,
  });
  list.push(npc);

  if (persist !== false) {
    const stored = Array.isArray(state.params.editorPlacedNpcs) ? state.params.editorPlacedNpcs : [];
    stored.push(clean);
    state.params.editorPlacedNpcs = stored;
  }
  return npc;
}

export function spawnEditorNpcAt(data = {}) {
  return spawnEditorNpcFromData(data, { persist: true });
}

function removeEditorNpcInstance(npc) {
  if (!npc?.editorPlaced) return false;
  const list = npc.isAlly ? allies : enemies;
  const idx = list.indexOf(npc);
  if (idx !== -1) list.splice(idx, 1);
  if (npc.editorNpcId && Array.isArray(state.params.editorPlacedNpcs)) {
    state.params.editorPlacedNpcs = state.params.editorPlacedNpcs.filter(item => item?.id !== npc.editorNpcId);
  }
  disposeEnemy(npc);
  return true;
}

export function removeEditorNpcByMesh(mesh) {
  const npc = mesh?.userData?.npc || mesh?.parent?.userData?.npc;
  return removeEditorNpcInstance(npc);
}

function removeLiveEditorNpcs() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i]?.editorPlaced) {
      const npc = enemies.splice(i, 1)[0];
      disposeEnemy(npc);
    }
  }
  for (let i = allies.length - 1; i >= 0; i--) {
    if (allies[i]?.editorPlaced) {
      const npc = allies.splice(i, 1)[0];
      disposeEnemy(npc);
    }
  }
}

export function rebuildEditorPlacedNpcs() {
  removeLiveEditorNpcs();
  const list = Array.isArray(state.params.editorPlacedNpcs) ? state.params.editorPlacedNpcs : [];
  state.params.editorPlacedNpcs = list.map(item => normalizeEditorNpcData(item));
  for (const item of state.params.editorPlacedNpcs) {
    spawnEditorNpcFromData(item, { persist: false });
  }
}

function getEffectiveBehavior(npc) {
  if (npc?.behavior) return npc.behavior;
  const key = npc?.isAlly ? 'allyBehavior' : 'enemyBehavior';
  const behavior = state.params[key];
  return behavior || npc?.def?.defaultBehavior || 'rush';
}

function normalizeNpcWeapon(value, fallback = 'rifle') {
  if (value === 'laser') return 'rifle';
  if (value === 'sniper') return 'sniperRifle';
  if (value === 'projectile') return 'pistol';
  if (value === 'contact' || value === 'none') return value;
  return ['pistol', 'rifle', 'shotgun', 'sniperRifle', 'grenades', 'rocketLauncher'].includes(value)
    ? value
    : fallback;
}

function getEffectiveWeapon(npc) {
  const ownWeapon = normalizeNpcWeapon(npc?.weaponType, null);
  if (ownWeapon) return ownWeapon;
  const key = npc?.isAlly ? 'allyWeaponType' : 'enemyWeaponType';
  const configured = normalizeNpcWeapon(state.params[key], null);
  if (configured) return configured;
  return normalizeNpcWeapon(npc?.def?.defaultWeapon, 'rifle');
}

function isLaserLikeWeapon(weapon) {
  return weapon === 'laser' || weapon === 'rifle' || weapon === 'sniperRifle';
}

const NPC_PLAYER_WEAPON_SPECS = Object.freeze({
  pistol: { prefix: 'Pistol', fireRate: 3.6, speed: 70, range: 55, damage: 24, spread: 0.01, projectileSize: 0.28, projectileLength: 0.65, projectileColor: '#d8dde6', projectileBloomColor: '#d8dde6', projectileBloom: false, projectileBloomIntensity: 1, projectileBloomSize: 1, visual: 'solid' },
  rifle: { prefix: 'Rifle', fireRate: 5, speed: 80, range: 42, damage: 34, spread: 0.003, projectileSize: 0.36, projectileLength: 0.84, projectileColor: '#ff1100', projectileBloomColor: '#ff1100', projectileBloom: true, projectileBloomIntensity: 1, projectileBloomSize: 1, visual: 'laser' },
  shotgun: { prefix: 'Shotgun', fireRate: 1.15, speed: 60, range: 28, damage: 12, spread: 0.16, projectileSize: 0.32, projectileLength: 0.75, projectileColor: '#d8dde6', projectileBloomColor: '#d8dde6', projectileBloom: false, projectileBloomIntensity: 1, projectileBloomSize: 1, visual: 'solid', pellets: 8 },
  sniperRifle: { prefix: 'Sniper', fireRate: 0.65, speed: 130, range: 180, damage: 120, spread: 0.002, projectileSize: 0.24, projectileLength: 0.56, projectileColor: '#d975ff', projectileBloomColor: '#d975ff', projectileBloom: true, projectileBloomIntensity: 1, projectileBloomSize: 1, visual: 'laser' },
  grenades: { prefix: 'Grenade', fireRate: 0.72, speed: 16, range: 60, damage: 95, spread: 0.01, projectileSize: 0.25, projectileLength: 0.27, projectileColor: '#429a5c', projectileBloomColor: '#ff8844', projectileBloom: false, projectileBloomIntensity: 1, projectileBloomSize: 1, visual: 'grenade', radius: 5, explosive: true, ballistic: true, fuse: 2.2 },
  rocketLauncher: { prefix: 'Rocket', fireRate: 0.68, speed: 34, range: 95, damage: 130, spread: 0.004, projectileSize: 0.42, projectileLength: 1.33, projectileColor: '#ff3333', projectileBloomColor: '#ff3333', projectileBloom: true, projectileBloomIntensity: 1, projectileBloomSize: 1, visual: 'rocket', radius: 6, explosive: true, fuse: 4.0 },
});

function weaponNumber(prefix, field, fallback, min = -Infinity, max = Infinity) {
  const value = Number(state.params[`weapon${prefix}${field}`]);
  const resolved = Number.isFinite(value) ? value : fallback;
  return clamp(resolved, min, max);
}

function weaponBoolean(prefix, field, fallback = false) {
  const value = state.params[`weapon${prefix}${field}`];
  return value === true || value === false ? value : fallback;
}

function weaponColor(prefix, field, fallback) {
  return normalizeHexColor(state.params[`weapon${prefix}${field}`], fallback);
}

const NPC_MAGAZINE_WEAPON_TYPES = new Set(['pistol', 'rifle', 'shotgun', 'sniperRifle', 'rocketLauncher']);
const NPC_AMMO_KEYS = Object.freeze({
  pistol: { prefix: 'Pistol', magazineKey: 'weaponPistolMagazineSize', totalKey: 'weaponPistolTotalAmmo', defaultMagazine: 12, defaultTotal: 60, defaultReloadTime: 1.0 },
  rifle: { prefix: 'Rifle', magazineKey: 'weaponRifleMagazineSize', totalKey: 'weaponRifleTotalAmmo', defaultMagazine: 30, defaultTotal: 180, defaultReloadTime: 1.25 },
  shotgun: { prefix: 'Shotgun', magazineKey: 'weaponShotgunMagazineSize', totalKey: 'weaponShotgunTotalAmmo', defaultMagazine: 8, defaultTotal: 40, defaultReloadTime: 1.6 },
  sniperRifle: { prefix: 'Sniper', magazineKey: 'weaponSniperMagazineSize', totalKey: 'weaponSniperTotalAmmo', defaultMagazine: 5, defaultTotal: 25, defaultReloadTime: 2.0 },
  grenades: { prefix: 'Grenade', magazineKey: null, totalKey: 'weaponGrenadeTotalAmmo', defaultMagazine: 0, defaultTotal: 10, defaultReloadTime: 0 },
  rocketLauncher: { prefix: 'Rocket', magazineKey: 'weaponRocketClipCapacity', totalKey: 'weaponRocketTotalAmmo', defaultMagazine: 1, defaultTotal: 8, defaultReloadTime: 2.4 },
});
let _npcRifleTracerShotCounter = 0;

function getNpcAmmoSpec(type) {
  return NPC_AMMO_KEYS[type] || NPC_AMMO_KEYS.rifle;
}

function getNpcConfiguredMagazineSize(type) {
  const spec = getNpcAmmoSpec(type);
  if (!spec.magazineKey) return 0;
  return Math.max(1, Math.round(Number(state.params[spec.magazineKey]) || spec.defaultMagazine));
}

function getNpcConfiguredTotalAmmo(type) {
  const spec = getNpcAmmoSpec(type);
  return Math.max(0, Math.round(Number(state.params[spec.totalKey]) || spec.defaultTotal));
}

function getNpcConfiguredReloadTime(type) {
  const spec = getNpcAmmoSpec(type);
  if (!spec.magazineKey) return 0;
  return clamp(Number(state.params[`weapon${spec.prefix}ReloadTime`]) || spec.defaultReloadTime || 1, 0, 10);
}

function getNpcAmmoRecord(npc, type) {
  const spec = getNpcAmmoSpec(type);
  const magazineSize = getNpcConfiguredMagazineSize(type);
  const totalAmmo = getNpcConfiguredTotalAmmo(type);
  npc._weaponAmmo = npc._weaponAmmo || {};
  let record = npc._weaponAmmo[type];
  if (!record || record._magazineSize !== magazineSize || record._totalAmmo !== totalAmmo) {
    record = {
      magazine: spec.magazineKey ? magazineSize : 0,
      reserve: totalAmmo,
      reloadRemaining: 0,
      _magazineSize: magazineSize,
      _totalAmmo: totalAmmo,
    };
    npc._weaponAmmo[type] = record;
  }
  return record;
}

function startNpcReload(npc, type, record) {
  const reloadTime = getNpcConfiguredReloadTime(type);
  if (reloadTime <= 0) {
    completeNpcReload(npc, type, record);
    return true;
  }
  record.reloadRemaining = Math.max(record.reloadRemaining || 0, reloadTime);
  return true;
}

function completeNpcReload(npc, type, record = getNpcAmmoRecord(npc, type)) {
  const spec = getNpcAmmoSpec(type);
  if (!spec.magazineKey) return false;
  const magazineSize = getNpcConfiguredMagazineSize(type);
  if (state.params.weaponInfiniteAmmo === true) {
    record.magazine = magazineSize;
    record.reloadRemaining = 0;
    return true;
  }
  const missing = Math.max(0, magazineSize - record.magazine);
  if (missing <= 0 || record.reserve <= 0) {
    record.reloadRemaining = 0;
    return false;
  }
  const loaded = Math.min(missing, record.reserve);
  record.magazine += loaded;
  record.reserve -= loaded;
  record.reloadRemaining = 0;
  return loaded > 0;
}

function updateNpcReload(npc, type, delta) {
  const record = getNpcAmmoRecord(npc, type);
  if ((record.reloadRemaining || 0) > 0) {
    record.reloadRemaining = Math.max(0, record.reloadRemaining - Math.max(0, delta));
    if (record.reloadRemaining <= 0) completeNpcReload(npc, type, record);
  }
  return record;
}

function consumeNpcAmmoForShot(npc, config, delta) {
  const type = config?.type;
  if (!type) return false;
  const spec = getNpcAmmoSpec(type);
  const record = updateNpcReload(npc, type, delta);
  if ((record.reloadRemaining || 0) > 0) return false;

  if (state.params.weaponInfiniteAmmo === true) return true;

  if (spec.magazineKey) {
    if (record.magazine <= 0) {
      if (record.reserve > 0) startNpcReload(npc, type, record);
      return false;
    }
    record.magazine = Math.max(0, record.magazine - 1);
    if (record.magazine <= 0 && record.reserve > 0) startNpcReload(npc, type, record);
    return true;
  }

  if (record.reserve <= 0) return false;
  record.reserve = Math.max(0, record.reserve - 1);
  return true;
}

function shouldShowNpcRifleTracer(config) {
  if (!config || config.type !== 'rifle' || state.params.weaponRifleTracers === false) return true;
  _npcRifleTracerShotCounter = (_npcRifleTracerShotCounter + 1) % 5;
  return _npcRifleTracerShotCounter === 0;
}

function getNpcWeaponShockwaveConfig(spec, cfg) {
  const p = state.params;
  const basePrefix = `weapon${spec.prefix}Shockwave`;
  const splashRadiusFallback = spec.prefix === 'Rocket'
    ? (p.destructionDestructibleSplashRadius ?? cfg.radius ?? 6)
    : (p.destructionDestructibleSplashRadius ?? cfg.radius ?? 5);
  return {
    damage: weaponNumber(spec.prefix, 'Damage', spec.damage, 0, 500),
    radius: weaponNumber(spec.prefix, 'Radius', spec.radius || 5, 0.5, 80),
    speed: clamp(Number(p[`${basePrefix}Speed`] ?? p.destructionDestructibleShockwaveSpeed ?? 40), 0, 40),
    color: normalizeHexColor(p[`${basePrefix}Color`], p.destructionDestructibleShockwaveColor || '#ffffff'),
    transparency: clamp(Number(p[`${basePrefix}Transparency`] ?? p.destructionDestructibleShockwaveTransparency ?? 0.1), 0, 1),
    fadeTime: clamp(Number(p[`${basePrefix}FadeTime`] ?? p.destructionDestructibleShockwaveFadeTime ?? 0.12), 0.05, 3),
    delay: clamp(Number(p[`${basePrefix}Delay`] ?? p.destructionDestructibleShockwaveDelay ?? 0), 0, 3),
    splashDamage: weaponNumber(spec.prefix, 'ShockwaveSplashDamage', p.destructionDestructibleSplashDamage ?? cfg.damage, 0, 500),
    splashRadius: weaponNumber(spec.prefix, 'ShockwaveSplashRadius', splashRadiusFallback, 0, 80),
    splashFalloff: weaponNumber(spec.prefix, 'ShockwaveSplashFalloff', p.destructionDestructibleSplashFalloff ?? 1, 0.1, 4),
    splashMinFactor: weaponNumber(spec.prefix, 'ShockwaveSplashMinFactor', p.destructionDestructibleSplashMinFactor ?? 0.15, 0, 1),
    particleCount: Math.max(0, Math.round(clamp(Number(p[`${basePrefix}ParticleCount`] ?? p.destructionDestructibleParticleCount ?? 40), 0, 250))),
    particleSize: clamp(Number(p[`${basePrefix}ParticleSize`] ?? p.destructionDestructibleParticleSize ?? 0.25), 0.05, 2),
    particleSpeed: clamp(Number(p[`${basePrefix}ParticleSpeed`] ?? p.destructionDestructibleParticleSpeed ?? 6), 0.1, 8),
    particleGlow: clamp(Number(p[`${basePrefix}ParticleGlow`] ?? p.destructionDestructibleParticleGlow ?? 8), 0, 24),
    particleDespawnTime: clamp(Number(p[`${basePrefix}ParticleDespawnTime`] ?? p.destructionDestructibleParticleDespawnTime ?? 1), 0.1, 10),
    particleColor: normalizeHexColor(p[`${basePrefix}ParticleColor`], p.destructionDestructibleColor || '#ffffff'),
    particlePhysics: p[`${basePrefix}ParticlePhysics`] === 'ethereal' ? 'ethereal' : 'gravity',
  };
}

function getNpcWeaponConfig(npc) {
  const weapon = getEffectiveWeapon(npc);
  if (weapon === 'none' || weapon === 'contact') return null;
  const spec = NPC_PLAYER_WEAPON_SPECS[weapon] || NPC_PLAYER_WEAPON_SPECS.rifle;
  const prefix = spec.prefix;
  const cfg = {
    type: weapon,
    visual: spec.visual,
    damage: weaponNumber(prefix, 'Damage', spec.damage, 0, 500),
    range: weaponNumber(prefix, 'Range', spec.range, 1, 1000),
    spread: weaponNumber(prefix, 'Spread', spec.spread, 0, 1),
    fireRate: weaponNumber(prefix, 'FireRate', spec.fireRate, 0.1, 60),
    speed: weaponNumber(prefix, 'ProjectileSpeed', spec.speed, 1, 500),
    projectileSize: weaponNumber(prefix, 'ProjectileSize', spec.projectileSize, 0.02, 2),
    projectileLength: weaponNumber(prefix, 'ProjectileLength', spec.projectileLength, 0.02, 12),
    projectileColor: weaponColor(prefix, 'ProjectileColor', spec.projectileColor),
    projectileBloom: weaponBoolean(prefix, 'ProjectileBloom', spec.projectileBloom),
    projectileBloomColor: weaponColor(prefix, 'ProjectileBloomColor', spec.projectileBloomColor || spec.projectileColor),
    projectileBloomIntensity: weaponNumber(prefix, 'ProjectileBloomIntensity', spec.projectileBloomIntensity ?? 1, 0, 12),
    projectileBloomSize: weaponNumber(prefix, 'ProjectileBloomSize', spec.projectileBloomSize ?? 1, 0.1, 8),
    recoil: weaponNumber(prefix, 'Recoil', spec.recoil ?? 0, 0, 1),
    radius: spec.radius ? weaponNumber(prefix, 'Radius', spec.radius, 0.5, 80) : 0,
    explosive: spec.explosive === true,
    ballistic: spec.ballistic === true,
    fuse: spec.fuse || 4,
    pellets: weapon === 'shotgun' ? Math.max(1, Math.min(24, Math.round(Number(state.params.weaponShotgunPellets) || spec.pellets || 8))) : 1,
  };
  const accuracy = getNpcAccuracy(npc);
  cfg.spread = clamp(cfg.spread + (1 - accuracy) * 0.3, 0, 1);
  if (cfg.explosive) cfg.shockwave = getNpcWeaponShockwaveConfig(spec, cfg);
  return cfg;
}

function getNpcDamage(npc) {
  const weaponConfig = getNpcWeaponConfig(npc);
  if (weaponConfig) return weaponConfig.damage;
  if (Number.isFinite(Number(npc?.damage))) return Math.max(0, Number(npc.damage));
  const key = npc?.isAlly ? 'allyDamage' : 'enemyDamage';
  return Math.max(0, Number(state.params[key]) || 0);
}

function getNpcMoveSpeed(npc) {
  if (Number.isFinite(Number(npc?.moveSpeed))) return Math.max(0, Number(npc.moveSpeed));
  const key = npc?.isAlly ? 'allyMoveSpeed' : 'enemyMoveSpeed';
  const configuredSpeed = Number(state.params[key]);
  return Math.max(0, Number.isFinite(configuredSpeed) ? configuredSpeed : BASE_SPEED);
}

function getNpcAwarenessRange(npc) {
  if (Number.isFinite(Number(npc?.awarenessRange))) return Math.max(1, Number(npc.awarenessRange));
  const key = npc?.isAlly ? 'allyAwarenessRange' : 'enemyAwarenessRange';
  return Math.max(1, Number(state.params[key]) || 40);
}

function getNpcAccuracy(npc) {
  if (Number.isFinite(Number(npc?.accuracy))) return clamp(Number(npc.accuracy), 0, 100) / 100;
  const key = npc?.isAlly ? 'allyAccuracy' : 'enemyAccuracy';
  const value = Number(state.params[key]);
  return clamp(Number.isFinite(value) ? value : 100, 0, 100) / 100;
}

function respawnPlayerAfterDeath() {
  const p = state.params;
  const maxHealth = Math.max(1, Number(p.playerMaxHealth) || 100);
  const maxArmor = Math.max(0, Number(p.playerMaxArmor) || 0);
  const hasSpawn = p.playerSpawnEnabled === true;
  const spawnX = hasSpawn && Number.isFinite(Number(p.playerSpawnX)) ? Number(p.playerSpawnX) : 0;
  const spawnY = hasSpawn && Number.isFinite(Number(p.playerSpawnY)) ? Math.max(0, Number(p.playerSpawnY)) : 0;
  const spawnZ = hasSpawn && Number.isFinite(Number(p.playerSpawnZ)) ? Number(p.playerSpawnZ) : 0;
  const rawYaw = hasSpawn && Number.isFinite(Number(p.playerSpawnYaw)) ? Number(p.playerSpawnYaw) : Number(p.thirdAzimuth) || 0;
  const yawStep = Math.PI / 2;
  const spawnYaw = Math.round(rawYaw / yawStep) * yawStep;

  p.playerHealth = maxHealth;
  p.playerArmor = maxArmor;
  p.thirdAzimuth = spawnYaw;
  p.editorYaw = spawnYaw;
  p.editorPlayerSpawnYaw = spawnYaw;

  playerGroup.position.set(spawnX, spawnY, spawnZ);
  state.jumpVelocity = 0;
  state.jumpQueued = false;
  state.jumpGrounded = true;
  state.jumpAirJumpsUsed = 0;
  state.dashTimer = 0;
  state.dashCooldown = 0;
  state.dashVX = 0;
  state.dashVZ = 0;
  state.lastMoveX = -Math.sin(spawnYaw);
  state.lastMoveZ = -Math.cos(spawnYaw);
}

function applyPlayerDamage(amount) {
  const p = state.params;
  if (p.playerInvincible) return;
  let damage = Math.max(0, Number(amount) || 0);
  if (damage <= 0) return;
  const armor = Math.max(0, Number(p.playerArmor) || 0);
  const armorHit = Math.min(armor, damage);
  p.playerArmor = armor - armorHit;
  damage -= armorHit;
  if (damage > 0) p.playerHealth = Math.max(0, (Number(p.playerHealth) || 0) - damage);
  if ((Number(p.playerHealth) || 0) <= 0) respawnPlayerAfterDeath();
  syncPlayerHud();
}

function syncPlayerHud() {
  const p = state.params;
  const armorValue = document.querySelector('[data-hud-value="armor"]');
  const healthValue = document.querySelector('[data-hud-value="health"]');
  const armorFill  = document.querySelector('[data-hud-fill="armor"]');
  const healthFill = document.querySelector('[data-hud-fill="health"]');
  const armorMax  = Math.max(1, Number(p.playerMaxArmor)  || 100);
  const healthMax = Math.max(1, Number(p.playerMaxHealth) || 100);
  const armor  = clamp(Number(p.playerArmor)  || 0, 0, armorMax);
  const health = clamp(Number(p.playerHealth) || 0, 0, healthMax);
  if (armorValue)  armorValue.textContent  = String(Math.round(armor));
  if (healthValue) healthValue.textContent = String(Math.round(health));
  if (armorFill)   armorFill.style.width   = `${(armor  / armorMax)  * 100}%`;
  if (healthFill)  healthFill.style.width  = `${(health / healthMax) * 100}%`;
}

function damageEnemy(enemy, amount) {
  if (!enemy) return false;
  const wasAlive = Number(enemy.hp) > 0;
  enemy.spawnFlashTimer = Math.max(enemy.spawnFlashTimer, 0.12);
  enemy.material.emissive.set(0xffffff);
  enemy.material.emissiveIntensity = 0.45;
  const invincible = enemy.isAlly ? state.params.allyInvincible : state.params.enemyInvincible;
  if (!invincible) enemy.hp -= Math.max(0, Number(amount) || 0);
  updateNpcHealthBar(enemy);
  const killed = wasAlive && enemy.hp <= 0 && !enemy.isAlly;
  if (enemy.hp <= 0) destroyEnemy(enemy);
  return killed;
}

function spawnSplitChildren(enemy) {
  const count = randomInt(2, 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = randomRange(0.9, 2.3);
    enemies.push(makeEnemy(ENEMY_TYPE.RUSHER, {
      x: enemy.group.position.x + Math.cos(angle) * radius,
      z: enemy.group.position.z + Math.sin(angle) * radius,
    }, enemies.length + i));
  }
}

function getDamageableNpcs({ includeAllies = true } = {}) {
  return includeAllies ? enemies.concat(allies) : enemies;
}

function isAllyFriendlyFireEnabled() {
  return state.params.allyFriendlyFire === true;
}

export function damageEnemiesAt(position, radius = 0.45, amount = 34) {
  const targets = getDamageableNpcs({ includeAllies: isAllyFriendlyFireEnabled() });
  for (let i = targets.length - 1; i >= 0; i--) {
    const enemy = targets[i];
    if (pointHitsNpcBody(position, radius, enemy)) {
      const willDamage = Math.max(0, Number(amount) || 0) > 0;
      const killed = willDamage ? damageEnemy(enemy, amount) === true : false;
      return { hit: true, killed, target: enemy };
    }
  }
  return null;
}

export function damageEnemiesInRadius(position, radius = 1, amount = 34, falloff = 1) {
  let hitCount = 0;
  let killed = false;
  const maxRadius = Math.max(0.001, Number(radius) || 1);
  const baseDamage = Math.max(0, Number(amount) || 0);
  const falloffPower = clamp(Number(falloff) || 1, 0.1, 4);
  const targets = getDamageableNpcs({ includeAllies: isAllyFriendlyFireEnabled() });
  for (let i = targets.length - 1; i >= 0; i--) {
    const enemy = targets[i];
    const distance = distanceToNpcBody(position, enemy);
    if (distance > maxRadius) continue;
    const normalized = clamp(distance / maxRadius, 0, 1);
    const damage = baseDamage * (1 - Math.pow(normalized, falloffPower));
    killed = damageEnemy(enemy, Math.max(1, damage)) === true || killed;
    hitCount += 1;
  }
  return hitCount > 0 ? { hit: true, hitCount, killed } : null;
}

function getExplosionSplashDistance(event, position) {
  const dx = Number(position.x) - (Number(event.x) || 0);
  const dz = Number(position.z) - (Number(event.z) || 0);
  return Math.hypot(dx, dz);
}

function getExplosionSplashDamage(event, distance) {
  const baseDamage = Math.max(0, Number(event.damage) || 0);
  const maxRadius = Math.max(0.001, Number(event.maxRadius) || Number(event.currentRadius) || 0.001);
  const falloff = clamp(Number(event.damageFalloff) || 1, 0.1, 4);
  const minFactor = clamp(Number(event.minDamageFactor) || 0, 0, 1);
  const normalized = clamp(distance / maxRadius, 0, 1);
  const proximityFactor = 1 - Math.pow(normalized, falloff);
  return baseDamage * Math.max(minFactor, proximityFactor);
}

function applyExplosionSplashDamage() {
  const events = state.explosionSplashEvents || [];
  if (!events.length) return;

  for (const event of events) {
    if (!event?.active) continue;
    const amount = Math.max(0, Number(event.damage) || 0);
    const radius = Math.max(0, Number(event.currentRadius) || 0);
    if (amount <= 0 || radius <= 0) continue;

    const hitNpcIds = Array.isArray(event.hitNpcIds)
      ? event.hitNpcIds
      : (Array.isArray(event.hitEnemyIds) ? event.hitEnemyIds : []);
    event.hitNpcIds = hitNpcIds;
    event.hitEnemyIds = hitNpcIds; // Backward-compatible alias for older explosion events.
    const hitSet = new Set(hitNpcIds);

    if (!event.hitPlayer) {
      const playerDistance = distanceToPlayerBody(event);
      if (playerDistance <= radius) {
        event.hitPlayer = true;
        applyPlayerDamage(getExplosionSplashDamage(event, playerDistance));
      }
    }

    const targets = getDamageableNpcs({ includeAllies: isAllyFriendlyFireEnabled() });
    for (let i = targets.length - 1; i >= 0; i--) {
      const enemy = targets[i];
      const id = enemy.group?.uuid;
      if (!id || hitSet.has(id)) continue;

      const enemyDistance = distanceToNpcBody(event, enemy);
      if (enemyDistance <= radius) {
        hitSet.add(id);
        hitNpcIds.push(id);
        const killed = damageEnemy(enemy, getExplosionSplashDamage(event, enemyDistance)) === true;
        if (String(event.id || '').startsWith('weapon_splash_')) {
          window.dispatchEvent(new CustomEvent('game-lab-reticle-feedback', {
            detail: { hit: true, killed },
          }));
        }
      }
    }
  }
}

// ── Grouped movement (GROUPING.md) ────────────────────────────────────────────
function updateEnemyMovement(enemy, delta, targetNpc = null) {
  const baseBehavior = getEffectiveBehavior(enemy);
  const behavior = targetNpc && baseBehavior === 'guard' ? 'rush' : baseBehavior;
  const targetPos = targetNpc?.group?.position || playerGroup.position;

  _tmpVec.set(targetPos.x - enemy.group.position.x, 0, targetPos.z - enemy.group.position.z);
  const dist = Math.max(0.001, _tmpVec.length());
  const toTargetX = _tmpVec.x / dist;
  const toTargetZ = _tmpVec.z / dist;

  let speedMult = enemy.def.speedMult || 1;
  let seekX = 0, seekZ = 0;

  if (behavior === 'guard') return;

  if (behavior === 'orbit') {
    // Tangential movement + radial correction
    const tangX = -toTargetZ, tangZ = toTargetX;
    const radialBias = clamp((dist - 6.5) / 2.5, -1, 1) * 0.6;
    seekX = tangX * 0.9 + toTargetX * radialBias;
    seekZ = tangZ * 0.9 + toTargetZ * radialBias;
    speedMult = 1.05;
  } else if (behavior === 'keepDistance') {
    const desired = 14;
    if (dist < desired) { seekX = -toTargetX; seekZ = -toTargetZ; speedMult = 1.05; }
    else if (dist > desired + 2) { seekX = toTargetX; seekZ = toTargetZ; speedMult = 0.85; }
  } else if (behavior === 'teleport') {
    enemy.teleportCooldown = Math.max(0, enemy.teleportCooldown - delta);
    if (enemy.teleportCooldown <= 0 && dist < 5.5) {
      const angle = Math.random() * Math.PI * 2;
      const r = randomRange(9, 14);
      enemy.group.position.x = targetPos.x + Math.cos(angle) * r;
      enemy.group.position.z = targetPos.z + Math.sin(angle) * r;
      enemy.teleportCooldown = 4;
      return;
    }
    seekX = toTargetX; seekZ = toTargetZ;
  } else if (behavior === 'bossPhase') {
    const ratio = enemy.hp / Math.max(1, enemy.maxHp);
    enemy.phase = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
    speedMult = enemy.phase === 3 ? 1.08 : enemy.phase === 2 ? 0.98 : 0.9;
    seekX = toTargetX; seekZ = toTargetZ;
  } else {
    seekX = toTargetX; seekZ = toTargetZ;
  }

  // Normalise seek
  const seekLen = Math.hypot(seekX, seekZ);
  if (seekLen > 0.001) { seekX /= seekLen; seekZ /= seekLen; }

  // Update group slot assignment around the current target.
  assignEnemyGroupSlot(enemy, targetPos, delta);

  // Separation force
  const queryR = enemy.radius * getSpacingMultiplier(enemy) + ENEMY_GROUPING.separation.queryPadding;
  _spatialHash.query(enemy.group.position.x, enemy.group.position.z, queryR, _queryBuf);
  const sep = ENEMY_GROUPING.separation.enabled
    ? computeEnemySeparation(enemy, _queryBuf)
    : { x: 0, z: 0 };

  // Slot bias
  const slot = computeSlotBias(enemy, targetPos);

  // Combine with archetype weights
  const w = ARCHETYPE_WEIGHTS[enemy.type] ?? { seek: 0.75, slot: 0.25, separation: 1.0 };

  let moveX = seekX * w.seek + slot.x * w.slot + sep.x * w.separation;
  let moveZ = seekZ * w.seek + slot.z * w.slot + sep.z * w.separation;

  // Smooth
  const smoothed = smoothSteer(enemy, { x: moveX, z: moveZ });
  moveX = smoothed.x; moveZ = smoothed.z;

  // Apply movement
  const baseSpeed = getNpcMoveSpeed(enemy);
  enemy.group.position.x += moveX * baseSpeed * speedMult * delta;
  enemy.group.position.z += moveZ * baseSpeed * speedMult * delta;
  resolveCircleAgainstPlacedObjects(enemy.group.position, enemy.radius);
}

function updateContactDamage(enemy, delta, targetNpc = null) {
  if (getEffectiveWeapon(enemy) === 'none') return;

  if (targetNpc && !isTargetWithinNpcAwareness(enemy, targetNpc)) return;
  if (!targetNpc && !enemy.isAlly && !isPlayerWithinNpcAwareness(enemy)) return;

  if (targetNpc) {
    _tmpVec.set(
      targetNpc.group.position.x - enemy.group.position.x, 0,
      targetNpc.group.position.z - enemy.group.position.z,
    );
    const dist = Math.max(0.001, _tmpVec.length());
    const minDist = enemy.radius + Math.max(0.35, targetNpc.radius || 0.4);
    if (dist > minDist) { enemy.contactCooldown = Math.max(0, enemy.contactCooldown - delta); return; }
    const normal = _tmpVec.multiplyScalar(1 / dist);
    const push = (minDist - dist) * 0.5;
    enemy.group.position.addScaledVector(normal, -push);
    targetNpc.group.position.addScaledVector(normal, push * 0.7);
    resolveCircleAgainstPlacedObjects(enemy.group.position, enemy.radius);
    resolveCircleAgainstPlacedObjects(targetNpc.group.position, targetNpc.radius || 0.4);
    enemy.contactCooldown = Math.max(0, enemy.contactCooldown - delta);
    if (enemy.contactCooldown <= 0) {
      enemy.contactCooldown = CONTACT_COOLDOWN;
      damageEnemy(targetNpc, getNpcDamage(enemy));
    }
    return;
  }

  if (enemy.isAlly) return;
  const playerRadius = Math.max(0.35, Number(state.params.playerRadius) || 0.4);
  _tmpVec.set(
    playerGroup.position.x - enemy.group.position.x, 0,
    playerGroup.position.z - enemy.group.position.z,
  );
  const dist = Math.max(0.001, _tmpVec.length());
  const minDist = enemy.radius + playerRadius;
  if (dist > minDist) { enemy.contactCooldown = Math.max(0, enemy.contactCooldown - delta); return; }
  const normal = _tmpVec.multiplyScalar(1 / dist);
  const push = (minDist - dist) * 0.5;
  enemy.group.position.addScaledVector(normal, -push);
  playerGroup.position.addScaledVector(normal, push * 0.7);
  enemy.contactCooldown = Math.max(0, enemy.contactCooldown - delta);
  if (enemy.contactCooldown <= 0) {
    enemy.contactCooldown = CONTACT_COOLDOWN;
    applyPlayerDamage(getNpcDamage(enemy));
  }
}

// ── NPC weapon sound / projectile explosion visuals ──────────────────────────
const _npcWeaponAudioCache = new Map();

function playNpcWeaponAsset(path, volume, playbackRate = 1) {
  if (!volume || state.params.soundMuted) return;
  let base = _npcWeaponAudioCache.get(path);
  if (!base) {
    base = registerManagedAudio(new Audio(path), playbackRate);
    _npcWeaponAudioCache.set(path, base);
  }
  const audio = base.paused ? base : base.cloneNode();
  registerManagedAudio(audio, playbackRate);
  audio.currentTime = 0;
  audio.volume = clamp(volume, 0, 1);
  applyBulletTimeAudioPitch(audio, playbackRate);
  audio.play().catch(() => {});
}

function playNpcShootSound(config, sourcePosition = null) {
  const volume = getSfxVolume('soundSfx_shoot', 1, sourcePosition);
  if (!volume || !config) return;
  if (config.type === 'grenades') {
    playNpcWeaponAsset('./assets/throw.wav', volume, 0.94 + Math.random() * 0.12);
    return;
  }
  if (config.type === 'rifle') {
    playNpcWeaponAsset('./assets/blaster2.wav', volume, 0.96 + Math.random() * 0.08);
    return;
  }
  const pitchByWeapon = {
    pistol: 1.16,
    shotgun: 0.78,
    sniperRifle: 0.62,
    rocketLauncher: 0.58,
  };
  playNpcWeaponAsset('./assets/blaster1.wav', volume, (pitchByWeapon[config.type] || 1) * (0.94 + Math.random() * 0.12));
}

function spawnNpcProjectileShockwave(position, cfg = {}) {
  const speed = Math.max(0, Number(cfg.speed) || 0);
  const fadeTime = clamp(Number(cfg.fadeTime) || 0.12, 0.05, 3);
  const visualMaxRadius = Math.max(0, speed * fadeTime);
  const opacity = clamp(Number(cfg.transparency) || 0, 0, 1);
  if (visualMaxRadius <= 0 || opacity <= 0) return;

  const material = new THREE.MeshBasicMaterial({
    color: normalizeHexColor(cfg.color, '#ffffff'),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(_npcProjectileShockwaveGeo, material);
  mesh.name = `NpcWeaponShockwave_${_npcProjectileShockwaveId++}`;
  mesh.position.copy(position);
  mesh.scale.setScalar(0.001);
  mesh.visible = false;
  scene.add(mesh);
  npcProjectileShockwaves.push({
    mesh,
    speed,
    visualMaxRadius,
    opacity,
    fadeTime,
    age: -clamp(Number(cfg.delay) || 0, 0, 3),
  });
}

function updateNpcProjectileShockwaves(delta) {
  for (let i = npcProjectileShockwaves.length - 1; i >= 0; i--) {
    const shockwave = npcProjectileShockwaves[i];
    shockwave.age += delta;
    if (shockwave.age < 0) {
      shockwave.mesh.visible = false;
      continue;
    }
    const t = clamp(shockwave.age / shockwave.fadeTime, 0, 1);
    const visualRadius = Math.max(0.001, Math.min(shockwave.visualMaxRadius, shockwave.speed > 0 ? shockwave.speed * shockwave.age : shockwave.visualMaxRadius * t));
    shockwave.mesh.visible = true;
    shockwave.mesh.scale.setScalar(visualRadius);
    shockwave.mesh.material.opacity = shockwave.opacity * (1 - t);
    if (shockwave.age >= shockwave.fadeTime) {
      scene.remove(shockwave.mesh);
      shockwave.mesh.material?.dispose?.();
      npcProjectileShockwaves.splice(i, 1);
    }
  }
}

function spawnNpcProjectileExplosionParticles(position, cfg = {}) {
  const count = Math.max(0, Math.min(250, Math.round(Number(cfg.particleCount) || 0)));
  if (count <= 0) return;
  const color = hexToNumber(normalizeHexColor(cfg.particleColor, cfg.color || '#ffffff'), 0xffffff);
  const size = clamp(Number(cfg.particleSize) || 0.25, 0.05, 2);
  const speedMult = clamp(Number(cfg.particleSpeed) || 1, 0.1, 8);
  const glow = clamp(Number(cfg.particleGlow) || 0, 0, 24);
  const maxLife = clamp(Number(cfg.particleDespawnTime) || 1, 0.1, 10);
  const physics = cfg.particlePhysics === 'ethereal' ? 'ethereal' : 'gravity';

  for (let i = 0; i < count; i++) {
    const mesh = acquireParticle(color);
    const baseRadius = (0.08 + Math.random() * 0.14) * size;
    const yaw = Math.random() * Math.PI * 2;
    const pitch = (Math.random() - 0.2) * Math.PI * 0.75;
    const speed = (3.5 + Math.random() * 8.5) * speedMult;
    mesh.position.copy(position);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mesh.scale.setScalar(baseRadius);
    destructionParticles.push({
      mesh,
      baseRadius,
      vx: Math.cos(yaw) * Math.cos(pitch) * speed,
      vy: Math.sin(pitch) * speed + (physics === 'gravity' ? 2.25 * speedMult : 0.65 * speedMult),
      vz: Math.sin(yaw) * Math.cos(pitch) * speed,
      life: maxLife,
      maxLife,
      glowCap: glow,
      physics,
    });
  }
}

function applyNpcProjectileSpread(dir, spread = 0) {
  const amount = Math.max(0, Number(spread) || 0);
  if (amount <= 0) return dir;
  _npcProjectileRight.crossVectors(dir, _up);
  if (_npcProjectileRight.lengthSq() < 0.0001) _npcProjectileRight.set(1, 0, 0);
  else _npcProjectileRight.normalize();
  _npcProjectileUp.crossVectors(_npcProjectileRight, dir).normalize();
  dir
    .addScaledVector(_npcProjectileRight, randomRange(-amount, amount))
    .addScaledVector(_npcProjectileUp, randomRange(-amount, amount))
    .normalize();
  return dir;
}

function removeNpcProjectileAt(index) {
  const bullet = enemyBullets[index];
  enemyBullets.splice(index, 1);
  disposeEnemyBullet(bullet);
}

function damagePlayerAt(position, radius, amount) {
  if (distanceToPlayerBody(position) <= Math.max(0.001, Number(radius) || 0)) applyPlayerDamage(amount);
}

function explodeNpcProjectile(bullet) {
  const position = bullet.mesh.position;
  const shockwave = bullet.shockwave || {};
  playObjectExplosionSound(position);
  if (shockwave) {
    spawnNpcProjectileExplosionParticles(position, shockwave);
    spawnNpcProjectileShockwave(position, shockwave);
  }
  const radius = Math.max(0.5, Number(shockwave.splashRadius ?? bullet.explosionRadius ?? bullet.radius ?? 4) || 4);
  const damage = Math.max(0, Number(shockwave.splashDamage ?? bullet.damage) || 0);
  const falloff = clamp(Number(shockwave.splashFalloff) || 1, 0.1, 4);
  const minFactor = clamp(Number(shockwave.splashMinFactor) || 0, 0, 1);

  const falloffDamageFromDistance = (distance) => {
    if (distance > radius) return 0;
    const normalized = clamp(distance / Math.max(0.001, radius), 0, 1);
    return damage * Math.max(minFactor, 1 - Math.pow(normalized, falloff));
  };

  if (bullet.ownerTeam === 'enemy') {
    const playerDamage = falloffDamageFromDistance(distanceToPlayerBody(position));
    if (playerDamage > 0) applyPlayerDamage(playerDamage);
    allies.forEach(target => {
      if (!target?.group) return;
      const amount = falloffDamageFromDistance(distanceToNpcBody(position, target));
      if (amount > 0) damageEnemy(target, amount);
    });
  } else {
    enemies.forEach(target => {
      if (!target?.group) return;
      const amount = falloffDamageFromDistance(distanceToNpcBody(position, target));
      if (amount > 0) damageEnemy(target, amount);
    });
  }
}

function createNpcProjectileMesh(config) {
  const projectileColor = config.projectileBloom ? config.projectileBloomColor : config.projectileColor;
  const mesh = new THREE.Mesh(
    getNpcBulletGeometry(config),
    getBulletMaterial(projectileColor, {
      bloom: config.projectileBloom === true,
      opacity: config.projectileBloom === true ? clamp(0.55 + (Number(config.projectileBloomIntensity) || 1) * 0.08, 0.55, 1) : 0.88,
    }),
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function fireEnemyBullet(enemy, targetNpc = null, config = getNpcWeaponConfig(enemy)) {
  if (!config) return;
  if (enemy.isAlly && !targetNpc) return;

  const shots = Math.max(1, Number(config.pellets) || 1);
  const targetPoint = getNpcAimPoint(targetNpc, _npcFireTargetPoint);
  const showVisual = shouldShowNpcRifleTracer(config);

  for (let shot = 0; shot < shots; shot++) {
    const mesh = createNpcProjectileMesh(config);
    mesh.name = enemy.isAlly ? 'AllyProjectile' : 'EnemyProjectile';
    mesh.visible = showVisual;
    if (isLaserLikeWeapon(config.type) && enemy._weaponMuzzle) {
      updateNpcWeaponVisual(enemy, targetPoint);
      enemy._weaponMuzzle.getWorldPosition(mesh.position);
    } else {
      mesh.position.copy(enemy.group.position);
      mesh.position.y = enemy.mesh.position.y;
    }

    _bulletDir.copy(targetPoint).sub(mesh.position);
    if (_bulletDir.lengthSq() < 0.0001) _bulletDir.set(0, 0, 1);
    _bulletDir.normalize();
    applyNpcProjectileSpread(_bulletDir, config.spread);
    _quat.setFromUnitVectors(_up, _bulletDir);
    mesh.quaternion.copy(_quat);
    scene.add(mesh);

    const speed = Math.max(0.1, Number(config.speed) || ENEMY_BULLET_SPEED);
    const maxRange = Math.max(1, Number(config.range) || ENEMY_BULLET_SPEED * ENEMY_BULLET_LIFETIME);
    const life = config.fuse || Math.max(0.05, maxRange / speed);
    enemyBullets.push({
      mesh,
      dir: _bulletDir.clone(),
      velocity: _bulletDir.clone().multiplyScalar(speed),
      life,
      distance: 0,
      maxRange,
      speed,
      damage: config.damage,
      radius: Math.max(0.04, Number(config.projectileSize) || 0.25) * 0.5,
      explosionRadius: Math.max(0.5, Number(config.radius) || 0),
      shockwave: config.shockwave || null,
      explosive: config.explosive === true,
      ballistic: config.ballistic === true,
      ownerTeam: enemy.isAlly ? 'ally' : 'enemy',
      targetTeam: targetNpc ? (targetNpc.isAlly ? 'ally' : 'enemy') : 'player',
      weapon: config.type,
      spin: new THREE.Vector3(randomRange(-7, 7), randomRange(-7, 7), randomRange(-7, 7)),
    });
  }
  playNpcShootSound(config, enemy.group?.position || null);
}

function updateEnemyShooting(enemy, delta, targetNpc = null) {
  const config = getNpcWeaponConfig(enemy);
  if (!config || enemy.spawnFlashTimer > 0) return;
  if (targetNpc) {
    if (!isTargetWithinNpcAwareness(enemy, targetNpc)) return;
  } else if (enemy.isAlly || !isPlayerWithinNpcAwareness(enemy)) {
    return;
  }
  updateNpcReload(enemy, config.type, delta);
  enemy.shootTimer -= delta;
  if (enemy.shootTimer <= 0) {
    if (consumeNpcAmmoForShot(enemy, config, delta)) fireEnemyBullet(enemy, targetNpc, config);
    const interval = 1 / Math.max(0.1, Number(config.fireRate) || 1);
    enemy.shootTimer = interval * randomRange(0.82, 1.18);
  }
}

function updateEnemyBullets(delta) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const bullet = enemyBullets[i];
    bullet.life -= delta;
    const before = bullet.mesh.position.clone();
    if (bullet.ballistic) {
      bullet.velocity.y -= PARTICLE_GRAVITY * 1.75 * delta;
      bullet.mesh.position.addScaledVector(bullet.velocity, delta);
      bullet.mesh.rotation.x += bullet.spin.x * delta;
      bullet.mesh.rotation.y += bullet.spin.y * delta;
      bullet.mesh.rotation.z += bullet.spin.z * delta;
      const floorY = Math.max(0.02, bullet.radius || 0.1);
      if (bullet.mesh.position.y < floorY) {
        bullet.mesh.position.y = floorY;
        bullet.velocity.y = Math.abs(bullet.velocity.y) * 0.42;
        bullet.velocity.x *= 0.72;
        bullet.velocity.z *= 0.72;
      }
    } else {
      bullet.mesh.position.addScaledVector(bullet.dir, bullet.speed * delta);
    }
    bullet.distance = (Number(bullet.distance) || 0) + before.distanceTo(bullet.mesh.position);

    if (isLaserLikeWeapon(bullet.weapon) && bullet.mesh.position.y <= 0.02) {
      removeNpcProjectileAt(i);
      continue;
    }
    if (isPlacedObjectHit(bullet.mesh.position, Math.max(0.08, bullet.radius || 0.08))) {
      if (bullet.explosive) explodeNpcProjectile(bullet);
      removeNpcProjectileAt(i);
      continue;
    }

    if ((bullet.targetTeam || 'player') === 'player') {
      if (pointHitsPlayerBody(bullet.mesh.position, Math.max(0.08, Number(bullet.radius) || 0.08))) {
        if (bullet.explosive) explodeNpcProjectile(bullet);
        else applyPlayerDamage(bullet.damage);
        removeNpcProjectileAt(i);
        continue;
      }
    } else {
      const targets = bullet.targetTeam === 'ally' ? allies : enemies;
      let hit = false;
      for (let t = targets.length - 1; t >= 0; t--) {
        const target = targets[t];
        if (!target?.group) continue;
        if (pointHitsNpcBody(bullet.mesh.position, Math.max(0.08, Number(bullet.radius) || 0.08), target)) {
          if (bullet.explosive) explodeNpcProjectile(bullet);
          else damageEnemy(target, bullet.damage);
          removeNpcProjectileAt(i);
          hit = true;
          break;
        }
      }
      if (hit) continue;
    }

    if (bullet.life <= 0 || (Number(bullet.maxRange) > 0 && bullet.distance >= bullet.maxRange)) {
      if (bullet.explosive) explodeNpcProjectile(bullet);
      removeNpcProjectileAt(i);
    }
  }
}


function isLiveNpc(npc) {
  return !!npc?.group && Number(npc.hp) > 0;
}

function findNearestEnemy(position, maxRange = Infinity) {
  let nearest = null;
  let best = Math.max(0, maxRange) ** 2;
  for (const enemy of enemies) {
    if (!isLiveNpc(enemy)) continue;
    const dx = enemy.group.position.x - position.x;
    const dz = enemy.group.position.z - position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= best) { best = d2; nearest = enemy; }
  }
  return nearest;
}

function findNearestAlly(position, maxRange = Infinity) {
  let nearest = null;
  let best = Math.max(0, maxRange) ** 2;
  for (const ally of allies) {
    if (!isLiveNpc(ally)) continue;
    const dx = ally.group.position.x - position.x;
    const dz = ally.group.position.z - position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= best) { best = d2; nearest = ally; }
  }
  return nearest;
}

function getNpcAttackRange(npc) {
  return getNpcAwarenessRange(npc);
}

function isTargetWithinNpcAwareness(npc, targetNpc) {
  if (!isLiveNpc(npc) || !isLiveNpc(targetNpc)) return false;
  const range = getNpcAttackRange(npc);
  const dx = targetNpc.group.position.x - npc.group.position.x;
  const dz = targetNpc.group.position.z - npc.group.position.z;
  return dx * dx + dz * dz <= range * range;
}

function isPlayerWithinNpcAwareness(npc) {
  if (!isLiveNpc(npc)) return false;
  const range = getNpcAttackRange(npc);
  const dx = playerGroup.position.x - npc.group.position.x;
  const dz = playerGroup.position.z - npc.group.position.z;
  return dx * dx + dz * dz <= range * range;
}

function findNearestOpponent(npc) {
  if (!isLiveNpc(npc)) return null;
  const range = getNpcAttackRange(npc);
  return npc.isAlly
    ? findNearestEnemy(npc.group.position, range)
    : findNearestAlly(npc.group.position, range);
}

function updateAllyMovement(ally, delta, elapsedTime, index, target = null) {
  if (target) {
    updateEnemyMovement(ally, delta, target);
  } else {
    const behavior = state.params.allyBehavior || 'guard';
    const speed = Math.max(0, Number(state.params.allyMoveSpeed) || BASE_SPEED);
    const playerPos = playerGroup.position;
    let moveX = 0, moveZ = 0;

    if (behavior === 'orbit') {
      const dx = playerPos.x - ally.group.position.x;
      const dz = playerPos.z - ally.group.position.z;
      const d = Math.max(0.001, Math.hypot(dx, dz));
      const radial = clamp((d - 4.5) / 2.0, -1, 1) * 0.7;
      moveX = (-dz / d) * 0.9 + (dx / d) * radial;
      moveZ = ( dx / d) * 0.9 + (dz / d) * radial;
    } else if (behavior === 'teleport') {
      const dx = playerPos.x - ally.group.position.x;
      const dz = playerPos.z - ally.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 16) {
        const angle = (index / Math.max(1, allies.length)) * Math.PI * 2;
        const r = 3.2 + (index % 3) * 0.7;
        ally.group.position.x = playerPos.x + Math.cos(angle) * r;
        ally.group.position.z = playerPos.z + Math.sin(angle) * r;
      }
    } else {
      const slotAngle = (index / Math.max(1, allies.length)) * Math.PI * 2;
      const desiredRadius = behavior === 'keepDistance' ? 6.5 : 3.25 + (index % 3) * 0.45;
      const targetX = playerPos.x + Math.cos(slotAngle) * desiredRadius;
      const targetZ = playerPos.z + Math.sin(slotAngle) * desiredRadius;
      const dx = targetX - ally.group.position.x;
      const dz = targetZ - ally.group.position.z;
      const d = Math.max(0.001, Math.hypot(dx, dz));
      if (d > 0.2) { moveX = dx / d; moveZ = dz / d; }
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 0.001) {
      ally.group.position.x += (moveX / len) * speed * delta;
      ally.group.position.z += (moveZ / len) * speed * delta;
      ally.group.rotation.y = Math.atan2(moveX, moveZ);
    } else {
      ally.group.rotation.y = Math.atan2(playerPos.x - ally.group.position.x, playerPos.z - ally.group.position.z);
    }
    resolveCircleAgainstPlacedObjects(ally.group.position, ally.radius);
  }

  if (target) {
    ally.group.rotation.y = Math.atan2(target.group.position.x - ally.group.position.x, target.group.position.z - ally.group.position.z);
  }
  ally.spawnFlashTimer = Math.max(0, ally.spawnFlashTimer - delta);
  ally.mesh.position.y = (BASE_RADIUS + BASE_LENGTH / 2) * ally.sizeMult;
  const flash = ally.spawnFlashTimer > 0;
  ally.material.opacity = flash ? clamp(1 - ally.spawnFlashTimer / 0.65, 0.25, 1) : 1;
  ally.material.transparent = flash;
  if (!flash && ally.material.emissiveIntensity > 0.06) {
    ally.material.emissive.set(ally.def.color);
    ally.material.emissiveIntensity = 0.06;
  }
  updateNpcWeaponVisual(ally, target ? getNpcAimPoint(target, _npcAimPoint) : null);
  updateNpcHealthBar(ally);
}


function updateAllies(delta, elapsedTime = 0) {
  for (let i = allies.length - 1; i >= 0; i--) {
    const ally = allies[i];
    const target = findNearestOpponent(ally);
    updateAllyMovement(ally, delta, elapsedTime, i, target);
    updateNpcAwarenessRing(ally);
    updateEnemyShooting(ally, delta, target);
    updateContactDamage(ally, delta, target);
  }
}

export function updateEnemies(delta, elapsedTime = 0) {
  syncPlayerHud();
  applyExplosionSplashDamage();

  // Rebuild before allied movement so allies have a current NPC set for
  // targeting/separation after scene loads or editor-spawn changes.
  _spatialHash.rebuild(getActiveNpcs());
  updateAllies(delta, elapsedTime);

  // Step 1: Rebuild spatial hash after allied movement and before enemy movement
  // (for separation queries and ally/enemy engagement after loaded scenes).
  _spatialHash.rebuild(getActiveNpcs());

  // Step 2: Move all enemies (includes separation steering + slot bias)
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.spawnFlashTimer = Math.max(0, enemy.spawnFlashTimer - delta);
    const target = findNearestOpponent(enemy);
    updateEnemyMovement(enemy, delta, target);
    updateNpcAwarenessRing(enemy);

    const lookPos = target?.group?.position || playerGroup.position;
    const dx = lookPos.x - enemy.group.position.x;
    const dz = lookPos.z - enemy.group.position.z;
    enemy.group.rotation.y = Math.atan2(dx, dz);

    updateEnemyShooting(enemy, delta, target);
    updateContactDamage(enemy, delta, target);
    enemy.mesh.position.y = (BASE_RADIUS + BASE_LENGTH / 2) * enemy.sizeMult;

    const flash = enemy.spawnFlashTimer > 0;
    enemy.material.opacity = flash ? clamp(1 - enemy.spawnFlashTimer / 0.65, 0.25, 1) : 1;
    enemy.material.transparent = flash;
    if (!flash && enemy.material.emissiveIntensity > 0.06) {
      enemy.material.emissive.set(enemy.def.color);
      enemy.material.emissiveIntensity = 0.06;
    }
    updateNpcWeaponVisual(enemy, getNpcAimPoint(target, _npcAimPoint));
    updateNpcHealthBar(enemy);
  }

  // Step 3: Rebuild hash after movement, apply hard decollision
  _spatialHash.rebuild(getActiveNpcs());
  applyHardEnemyDecollision();
  // Step 4: Final rebuild for bullets / later systems
  _spatialHash.rebuild(getActiveNpcs());

  updateEnemyBullets(delta);
  updateNpcProjectileShockwaves(delta);
  updateDestructionParticles(delta);
  updateEnemyCorpses(delta);
}
