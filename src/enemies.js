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
import { getSfxVolume } from './audio.js';
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
};

let _enemyGruntEl = null;
const _corpseBox = new THREE.Box3();
const _corpseWorldPos = new THREE.Vector3();
const _splashVec = new THREE.Vector3();

// Same rectangular rifle proportions used by the player rifle visual. NPC rifles
// are shown only while that NPC's effective weapon is set to laser.
const NPC_RIFLE = Object.freeze({ width: 0.08, height: 0.18, length: 1.5, grip: 0.16, sideGap: 0.105, forwardOffset: 0.12 });
const NPC_HEALTH_BAR_RATIO_EPSILON = 0.001;
const NPC_HEALTH_BAR_DISTANCE_DEFAULT = 60;
const _npcRifleGeo = new THREE.BoxGeometry(NPC_RIFLE.width, NPC_RIFLE.height, NPC_RIFLE.length);
const _npcRifleMat = new THREE.MeshStandardMaterial({
  color: 0x20242b,
  metalness: 0.55,
  roughness: 0.38,
});

function playEnemyGruntSound(sourcePosition = null) {
  const fallback = Number(state.params.soundSfx_standard_hit ?? 1);
  const volume = getSfxVolume('soundSfx_enemy_grunt', fallback, sourcePosition);
  if (volume <= 0) return;
  if (!_enemyGruntEl) _enemyGruntEl = new Audio('./assets/grunt.wav');
  const sound = _enemyGruntEl.cloneNode();
  sound.volume = volume;
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

const _enemyGeoCache = new Map();
const _tmpVec = new THREE.Vector3();
const _tmpVec2 = new THREE.Vector3();
const _bulletDir = new THREE.Vector3();
const _enemyBulletGeo = new THREE.CapsuleGeometry(0.065, 0.44, 5, 10);
const _particleGeo = new THREE.SphereGeometry(1, 6, 4);
const _enemyBulletMatCache = new Map();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

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

function getBulletMaterial(color) {
  const key = color.toString(16);
  let mat = _enemyBulletMatCache.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, toneMapped: false });
    _enemyBulletMatCache.set(key, mat);
  }
  return mat;
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
  const enabled = state.params.hudVisible !== false && state.params.hudNpcHealthBars !== false;
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

function updateNpcWeaponVisual(npc) {
  if (!npc?._weaponGroup) return;
  const weapon = getEffectiveWeapon(npc);
  const visible = weapon === 'laser';
  if (npc._weaponVisible !== visible) {
    npc._weaponGroup.visible = visible;
    npc._weaponVisible = visible;
  }
  if (!visible) return;

  const radius = Math.max(0.25, Number(npc.radius) || BASE_RADIUS);
  const bodyLength = Math.max(0.5, BASE_LENGTH * (Number(npc.sizeMult) || 1));
  const transformKey = `${radius.toFixed(3)}:${bodyLength.toFixed(3)}`;
  if (npc._weaponTransformKey === transformKey) return;

  npc._weaponGroup.position.set(
    radius + NPC_RIFLE.sideGap,
    radius + bodyLength * 0.56,
    NPC_RIFLE.forwardOffset,
  );
  npc._weaponGroup.rotation.set(0, 0, 0);
  npc._weaponTransformKey = transformKey;
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
    // Grouping fields
    groupSlot: undefined,
    slotTimer: randomRange(0, 0.5), // stagger initial slot assignment
    lastSteer: null,
  };
  if (!enemy.isAlly) makeTagMarker(enemy);
  makeNpcHealthBar(enemy);
  makeNpcRifleVisual(enemy);
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
  scene.remove(enemy.group);
  enemy.material?.dispose?.();
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

// Returns the full active enemy list for aim volume testing.
export function getEnemies() {
  return enemies;
}

export function getAllies() {
  return allies;
}

export function clearEnemies() {
  while (enemies.length) disposeEnemy(enemies.pop());
  while (enemyBullets.length) disposeEnemyBullet(enemyBullets.pop());
  while (destructionParticles.length) releaseParticle(destructionParticles.pop());
  while (enemyCorpses.length) disposeEnemyCorpse(enemyCorpses.pop());
}

export function clearAllies() {
  while (allies.length) disposeEnemy(allies.pop());
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
  const prefix = ENEMY_DESTRUCTION_PREFIX[enemy.type] || ENEMY_DESTRUCTION_PREFIX[ENEMY_TYPE.RUSHER];
  const fallbackColor = enemy.def?.color ?? 0xff1111;
  return {
    count: Math.max(0, Math.round(Number(getDestructionParam(prefix, 'ParticleCount', defaultParticleCountForEnemy(enemy))) || 0)),
    size: Math.max(0.01, Number(getDestructionParam(prefix, 'ParticleSize', defaultParticleSizeForEnemy(enemy))) || 0.32),
    speed: Math.max(0.01, Number(getDestructionParam(prefix, 'ParticleSpeed', defaultParticleSpeedForEnemy(enemy))) || 1.25),
    glow: Math.max(0, Number(getDestructionParam(prefix, 'ParticleGlow', defaultParticleGlowForEnemy(enemy))) || 0),
    particleDespawnTime: Math.max(0.1, Number(getDestructionParam(prefix, 'ParticleDespawnTime', 1.0)) || 1.0),
    corpseFadeTime: Math.max(0.1, Number(getDestructionParam(prefix, 'CorpseFadeTime', 1.0)) || 1.0),
    color: hexToNumber(getDestructionParam(prefix, 'Color', `#${fallbackColor.toString(16).padStart(6, '0')}`), fallbackColor),
    physics: getDestructionParam(prefix, 'Physics', state.params.enemyDestructionPhysics === false ? 'ethereal' : 'gravity') === 'ethereal' ? 'ethereal' : 'gravity',
    despawnTime: Math.max(0.1, Number(getDestructionParam(prefix, 'DespawnTime', 3.0)) || 3.0),
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
      life: maxLife, maxLife, glowCap: cfg.glow, physics: cfg.physics,
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

  enemy.group.getWorldPosition(_corpseWorldPos);
  mesh.position.copy(_corpseWorldPos);
  mesh.position.y += enemy.mesh.position.y;
  mesh.rotation.set(0, enemy.group.rotation.y, 0);
  mesh.rotateZ((Math.random() < 0.5 ? -1 : 1) * (Math.PI * 0.5 + randomRange(-0.18, 0.18)));
  mesh.rotateY(randomRange(-0.35, 0.35));
  mesh.rotateX(randomRange(-0.18, 0.18));

  scene.add(mesh);
  liftCorpseAboveFloor({ mesh });

  const yaw = Math.random() * Math.PI * 2;
  const speed = (0.55 + Math.random() * 0.85) * Math.max(0.2, cfg.speed);
  enemyCorpses.push({
    mesh,
    vx: Math.cos(yaw) * speed,
    vy: cfg.physics === 'gravity' ? 0.02 + Math.random() * 0.05 : 0.08 + Math.random() * 0.16,
    vz: Math.sin(yaw) * speed,
    rx: (Math.random() - 0.5) * 1.6,
    ry: (Math.random() - 0.5) * 1.2,
    rz: (Math.random() - 0.5) * 1.6,
    life: cfg.despawnTime,
    maxLife: cfg.despawnTime,
    fadeTime: Math.min(cfg.despawnTime, Math.max(0.1, Number(cfg.corpseFadeTime) || 1.0)),
    physics: cfg.physics,
    grounded: false,
    sleepTimer: 0,
  });
}

function liftCorpseAboveFloor(corpse) {
  if (!corpse?.mesh) return false;
  corpse.mesh.updateMatrixWorld(true);
  _corpseBox.setFromObject(corpse.mesh);
  const floorY = 0.018;
  const delta = floorY - _corpseBox.min.y;
  if (delta > 0) {
    corpse.mesh.position.y += delta;
    return true;
  }
  return false;
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
      corpse.vy -= PARTICLE_GRAVITY * delta;
    } else {
      corpse.vy += 0.1 * delta;
    }

    corpse.mesh.position.x += corpse.vx * delta;
    corpse.mesh.position.y += corpse.vy * delta;
    corpse.mesh.position.z += corpse.vz * delta;
    corpse.mesh.rotation.x += corpse.rx * delta;
    corpse.mesh.rotation.y += corpse.ry * delta;
    corpse.mesh.rotation.z += corpse.rz * delta;

    if (corpse.physics === 'gravity') {
      const floorHit = liftCorpseAboveFloor(corpse);
      if (floorHit) {
        corpse.grounded = true;
        corpse.vy = Math.abs(corpse.vy) > 0.28 ? Math.abs(corpse.vy) * 0.1 : 0;

        const floorFriction = Math.exp(-2.8 * delta);
        const angularFriction = Math.exp(-3.4 * delta);
        corpse.vx *= floorFriction;
        corpse.vz *= floorFriction;
        corpse.rx *= angularFriction;
        corpse.ry *= angularFriction;
        corpse.rz *= angularFriction;

        const nearlyStill = Math.abs(corpse.vy) < 0.05
          && Math.hypot(corpse.vx, corpse.vz) < 0.05
          && Math.hypot(corpse.rx, corpse.ry, corpse.rz) < 0.08;
        corpse.sleepTimer = nearlyStill ? (corpse.sleepTimer || 0) + delta : 0;
        if (corpse.sleepTimer > 0.18) {
          corpse.vx = 0;
          corpse.vy = 0;
          corpse.vz = 0;
          corpse.rx = 0;
          corpse.ry = 0;
          corpse.rz = 0;
          liftCorpseAboveFloor(corpse);
        }
      } else {
        corpse.grounded = false;
        corpse.sleepTimer = 0;
      }
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

function getEffectiveBehavior(npc) {
  const key = npc?.isAlly ? 'allyBehavior' : 'enemyBehavior';
  const behavior = state.params[key];
  return behavior || npc?.def?.defaultBehavior || 'rush';
}

function getEffectiveWeapon(npc) {
  const key = npc?.isAlly ? 'allyWeaponType' : 'enemyWeaponType';
  const weapon = state.params[key];
  return weapon || npc?.def?.defaultWeapon || 'contact';
}

function getNpcDamage(npc) {
  const key = npc?.isAlly ? 'allyDamage' : 'enemyDamage';
  return Math.max(0, Number(state.params[key]) || 0);
}

function getNpcMoveSpeed(npc) {
  const key = npc?.isAlly ? 'allyMoveSpeed' : 'enemyMoveSpeed';
  const configuredSpeed = Number(state.params[key]);
  return Math.max(0, Number.isFinite(configuredSpeed) ? configuredSpeed : BASE_SPEED);
}

function getNpcAwarenessRange(npc) {
  const key = npc?.isAlly ? 'allyAwarenessRange' : 'enemyAwarenessRange';
  return Math.max(1, Number(state.params[key]) || 40);
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
  if (!enemy) return;
  enemy.spawnFlashTimer = Math.max(enemy.spawnFlashTimer, 0.12);
  enemy.material.emissive.set(0xffffff);
  enemy.material.emissiveIntensity = 0.45;
  const invincible = enemy.isAlly ? state.params.allyInvincible : state.params.enemyInvincible;
  if (!invincible) enemy.hp -= Math.max(0, Number(amount) || 0);
  updateNpcHealthBar(enemy);
  if (enemy.hp <= 0) destroyEnemy(enemy);
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
    const hitRadius = Math.max(0.45, enemy.radius + radius);
    _tmpVec.copy(enemy.group.position);
    _tmpVec.y = enemy.mesh.position.y;
    if (_tmpVec.distanceTo(position) <= hitRadius) {
      if (Math.max(0, Number(amount) || 0) > 0) damageEnemy(enemy, amount);
      return true;
    }
  }
  return false;
}

export function damageEnemiesInRadius(position, radius = 1, amount = 34, falloff = 1) {
  let hitCount = 0;
  const maxRadius = Math.max(0.001, Number(radius) || 1);
  const baseDamage = Math.max(0, Number(amount) || 0);
  const falloffPower = clamp(Number(falloff) || 1, 0.1, 4);
  const targets = getDamageableNpcs({ includeAllies: isAllyFriendlyFireEnabled() });
  for (let i = targets.length - 1; i >= 0; i--) {
    const enemy = targets[i];
    const enemyRadius = Math.max(0.35, enemy.radius || 0.4);
    _tmpVec.copy(enemy.group.position);
    _tmpVec.y = enemy.mesh.position.y;
    const distance = _tmpVec.distanceTo(position);
    if (distance > maxRadius + enemyRadius) continue;
    const normalized = clamp(distance / maxRadius, 0, 1);
    const damage = baseDamage * (1 - Math.pow(normalized, falloffPower));
    damageEnemy(enemy, Math.max(1, damage));
    hitCount += 1;
  }
  return hitCount;
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
      const playerRadius = Math.max(0.25, Number(state.params.playerRadius) || 0.4);
      const playerDistance = getExplosionSplashDistance(event, playerGroup.position);
      if (playerDistance <= radius + playerRadius) {
        event.hitPlayer = true;
        applyPlayerDamage(getExplosionSplashDamage(event, playerDistance));
      }
    }

    const targets = getDamageableNpcs({ includeAllies: isAllyFriendlyFireEnabled() });
    for (let i = targets.length - 1; i >= 0; i--) {
      const enemy = targets[i];
      const id = enemy.group?.uuid;
      if (!id || hitSet.has(id)) continue;

      const enemyDistance = getExplosionSplashDistance(event, enemy.group.position);
      if (enemyDistance <= radius + Math.max(0.45, enemy.radius || 0)) {
        hitSet.add(id);
        hitNpcIds.push(id);
        damageEnemy(enemy, getExplosionSplashDamage(event, enemyDistance));
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

function fireEnemyBullet(enemy, targetNpc = null) {
  const weapon = getEffectiveWeapon(enemy);
  if (weapon === 'none' || weapon === 'contact') return;
  if (enemy.isAlly && !targetNpc) return;

  const color = weapon === 'sniper' ? 0xd975ff : weapon === 'laser' ? 0xff3333 : enemy.def.projectileColor;
  const mesh = new THREE.Mesh(_enemyBulletGeo, getBulletMaterial(color));
  mesh.name = enemy.isAlly ? 'AllyProjectile' : 'EnemyProjectile';
  if (weapon === 'laser' && enemy._weaponMuzzle) {
    updateNpcWeaponVisual(enemy);
    enemy._weaponMuzzle.getWorldPosition(mesh.position);
  } else {
    mesh.position.copy(enemy.group.position);
    mesh.position.y = enemy.mesh.position.y;
  }

  const targetPosition = targetNpc?.group?.position || playerGroup.position;
  const targetY = targetNpc?.mesh?.position?.y ?? Math.max(0.6, Number(state.params.playerRadius) || 0.4);
  _bulletDir.set(
    targetPosition.x - enemy.group.position.x,
    targetY - mesh.position.y,
    targetPosition.z - enemy.group.position.z,
  );
  if (_bulletDir.lengthSq() < 0.0001) _bulletDir.set(0, 0, 1);
  _bulletDir.normalize();
  _quat.setFromUnitVectors(_up, _bulletDir);
  mesh.quaternion.copy(_quat);
  scene.add(mesh);
  const speedMult = weapon === 'sniper' ? 1.35 : weapon === 'laser' ? 1.6 : 1.0;
  enemyBullets.push({
    mesh,
    dir: _bulletDir.clone(),
    life: ENEMY_BULLET_LIFETIME,
    speed: ENEMY_BULLET_SPEED * speedMult,
    damage: getNpcDamage(enemy),
    ownerTeam: enemy.isAlly ? 'ally' : 'enemy',
    targetTeam: targetNpc ? (targetNpc.isAlly ? 'ally' : 'enemy') : 'player',
  });
}

function updateEnemyShooting(enemy, delta, targetNpc = null) {
  const weapon = getEffectiveWeapon(enemy);
  const interval = FIRE_RATE_SECONDS[weapon];
  if (!interval || enemy.spawnFlashTimer > 0) return;
  if (enemy.isAlly && !targetNpc) return;
  enemy.shootTimer -= delta;
  if (enemy.shootTimer <= 0) {
    fireEnemyBullet(enemy, targetNpc);
    enemy.shootTimer = interval * randomRange(0.82, 1.18);
  }
}

function updateEnemyBullets(delta) {
  const playerRadius = Math.max(0.35, Number(state.params.playerRadius) || 0.4);
  const playerHitRadius = playerRadius + 0.18;
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const bullet = enemyBullets[i];
    bullet.life -= delta;
    bullet.mesh.position.addScaledVector(bullet.dir, bullet.speed * delta);
    if (isPlacedObjectHit(bullet.mesh.position, 0.08)) {
      enemyBullets.splice(i, 1);
      disposeEnemyBullet(bullet);
      continue;
    }

    if ((bullet.targetTeam || 'player') === 'player') {
      _tmpVec.copy(playerGroup.position);
      _tmpVec.y += Math.max(0.55, playerRadius + 0.35);
      if (bullet.mesh.position.distanceTo(_tmpVec) <= playerHitRadius) {
        applyPlayerDamage(bullet.damage);
        enemyBullets.splice(i, 1);
        disposeEnemyBullet(bullet);
        continue;
      }
    } else {
      const targets = bullet.targetTeam === 'ally' ? allies : enemies;
      let hit = false;
      for (let t = targets.length - 1; t >= 0; t--) {
        const target = targets[t];
        if (!target?.group) continue;
        _tmpVec.copy(target.group.position);
        _tmpVec.y = target.mesh.position.y;
        const hitRadius = Math.max(0.22, target.radius || 0.4) + 0.18;
        if (bullet.mesh.position.distanceTo(_tmpVec) <= hitRadius) {
          damageEnemy(target, bullet.damage);
          enemyBullets.splice(i, 1);
          disposeEnemyBullet(bullet);
          hit = true;
          break;
        }
      }
      if (hit) continue;
    }

    if (bullet.life <= 0) {
      enemyBullets.splice(i, 1);
      disposeEnemyBullet(bullet);
    }
  }
}


function findNearestEnemy(position, maxRange = Infinity) {
  let nearest = null;
  let best = Math.max(0, maxRange) ** 2;
  for (const enemy of enemies) {
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
    const dx = ally.group.position.x - position.x;
    const dz = ally.group.position.z - position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= best) { best = d2; nearest = ally; }
  }
  return nearest;
}

function findNearestOpponent(npc) {
  const range = getNpcAwarenessRange(npc);
  return npc?.isAlly
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
  updateNpcWeaponVisual(ally);
  updateNpcHealthBar(ally);
}


function updateAllies(delta, elapsedTime = 0) {
  for (let i = allies.length - 1; i >= 0; i--) {
    const ally = allies[i];
    const target = findNearestOpponent(ally);
    updateAllyMovement(ally, delta, elapsedTime, i, target);
    updateEnemyShooting(ally, delta, target);
    updateContactDamage(ally, delta, target);
  }
}

export function updateEnemies(delta, elapsedTime = 0) {
  syncPlayerHud();
  applyExplosionSplashDamage();
  updateAllies(delta, elapsedTime);

  // Step 1: Rebuild spatial hash before movement (for separation queries)
  _spatialHash.rebuild(getActiveNpcs());

  // Step 2: Move all enemies (includes separation steering + slot bias)
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.spawnFlashTimer = Math.max(0, enemy.spawnFlashTimer - delta);
    const target = findNearestOpponent(enemy);
    updateEnemyMovement(enemy, delta, target);
    updateEnemyShooting(enemy, delta, target);
    updateContactDamage(enemy, delta, target);

    const lookPos = target?.group?.position || playerGroup.position;
    const dx = lookPos.x - enemy.group.position.x;
    const dz = lookPos.z - enemy.group.position.z;
    enemy.group.rotation.y = Math.atan2(dx, dz);
    enemy.mesh.position.y = (BASE_RADIUS + BASE_LENGTH / 2) * enemy.sizeMult;

    const flash = enemy.spawnFlashTimer > 0;
    enemy.material.opacity = flash ? clamp(1 - enemy.spawnFlashTimer / 0.65, 0.25, 1) : 1;
    enemy.material.transparent = flash;
    if (!flash && enemy.material.emissiveIntensity > 0.06) {
      enemy.material.emissive.set(enemy.def.color);
      enemy.material.emissiveIntensity = 0.06;
    }
    updateNpcWeaponVisual(enemy);
    updateNpcHealthBar(enemy);
  }

  // Step 3: Rebuild hash after movement, apply hard decollision
  _spatialHash.rebuild(getActiveNpcs());
  applyHardEnemyDecollision();
  // Step 4: Final rebuild for bullets / later systems
  _spatialHash.rebuild(getActiveNpcs());

  updateEnemyBullets(delta);
  updateDestructionParticles(delta);
  updateEnemyCorpses(delta);
}
