// src/enemies.js
// Lightweight enemy sandbox for Game Lab. Enemies are spawned from the sidebar
// controls, then updated every frame so the controls affect visible gameplay.
import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { playerGroup } from './player.js';

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

const enemies = [];
const enemyBullets = [];
const destructionParticles = [];
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
    mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.88,
      toneMapped: false,
    });
    _enemyBulletMatCache.set(key, mat);
  }
  return mat;
}

function acquireParticle(color) {
  const mesh = particlePool.pop() || new THREE.Mesh(
    _particleGeo,
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 1,
      roughness: 0.45,
      metalness: 0.0,
      depthWrite: false,
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

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeXZ(vec) {
  vec.y = 0;
  if (vec.lengthSq() < 0.0001) return vec.set(0, 0, 1);
  return vec.normalize();
}

function makeEnemyMaterial(def) {
  return new THREE.MeshStandardMaterial({
    color: def.color,
    emissive: def.color,
    emissiveIntensity: 0.06,
    metalness: def.metallic ? 0.72 : 0.08,
    roughness: def.metallic ? 0.32 : 0.58,
  });
}

function makeEnemy(type, position, index = 0) {
  const def = getDef(type);
  const group = new THREE.Group();
  group.name = `Enemy_${type}`;
  group.position.set(position.x, 0, position.z);

  const material = makeEnemyMaterial(def);
  const mesh = new THREE.Mesh(getEnemyGeometry(def.sizeMult), material);
  mesh.name = 'EnemyBody';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = (BASE_RADIUS + BASE_LENGTH / 2) * def.sizeMult;
  group.add(mesh);

  scene.add(group);

  const maxHp = Math.max(1, Number(state.params.enemyHealth) || 100);
  return {
    type,
    def,
    group,
    mesh,
    material,
    maxHp,
    hp: maxHp,
    radius: BASE_RADIUS * def.sizeMult,
    sizeMult: def.sizeMult,
    spawnFlashTimer: 0.65,
    contactCooldown: randomRange(0.1, 0.8),
    shootTimer: randomRange(0.25, 1.4),
    teleportCooldown: randomRange(1.0, 2.5),
    bobOffset: index * 0.81,
    phase: 1,
  };
}

function disposeEnemy(enemy) {
  scene.remove(enemy.group);
  enemy.material?.dispose?.();
}

function disposeEnemyBullet(bullet) {
  scene.remove(bullet.mesh);
}

function getSpawnPosition(index, count) {
  const placement = state.params.enemyPlacement || 'random';
  const origin = playerGroup.position;

  if (placement === 'grouped') {
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    const ring = 7.5 + Math.floor(index / 8) * 1.8;
    return {
      x: origin.x + Math.cos(angle) * ring + randomRange(-0.45, 0.45),
      z: origin.z + Math.sin(angle) * ring + randomRange(-0.45, 0.45),
    };
  }

  const angle = Math.random() * Math.PI * 2;
  const radius = randomRange(7.5, 17.5);
  return {
    x: origin.x + Math.cos(angle) * radius,
    z: origin.z + Math.sin(angle) * radius,
  };
}

// Returns all active enemy mesh objects for raycasting (e.g. reticle hover check).
export function getEnemyMeshes() {
  return enemies.map(e => e.mesh);
}

export function clearEnemies() {
  while (enemies.length) disposeEnemy(enemies.pop());
  while (enemyBullets.length) disposeEnemyBullet(enemyBullets.pop());
  while (destructionParticles.length) releaseParticle(destructionParticles.pop());
}

function getDestructionConfig(enemy) {
  const p = state.params;
  const elite = enemy.type === ENEMY_TYPE.SPLITTER || enemy.type === ENEMY_TYPE.BOSS;

  if (elite) {
    return {
      elite,
      count: Math.max(0, Math.round(Number(p.enemyDestructionEliteCount) || 0)),
      size: Math.max(0.01, Number(p.enemyDestructionEliteSize) || 0.5),
      speed: Math.max(0.01, Number(p.enemyDestructionEliteSpeed) || 1.75),
      glow: Math.max(0, Number(p.enemyDestructionEliteGlow) || 0),
      colors: [enemy.def.color, enemy.def.color, enemy.def.color, 0xffffff, 0xffee88],
    };
  }

  return {
    elite,
    count: Math.max(0, Math.round(Number(p.enemyDestructionStandardCount) || 0)),
    size: Math.max(0.01, Number(p.enemyDestructionStandardSize) || 0.25),
    speed: Math.max(0.01, Number(p.enemyDestructionStandardSpeed) || 1),
    glow: 0,
    colors: [0xcc0000, 0xaa0000, 0xdd0000, 0x880000, 0xff1111, 0xbb0000],
  };
}

function spawnDestructionParticles(enemy) {
  if (state.params.enemyDestructionEnabled === false) return;

  const cfg = getDestructionConfig(enemy);
  if (cfg.count <= 0) return;

  for (let i = 0; i < cfg.count; i++) {
    const color = cfg.colors[Math.floor(Math.random() * cfg.colors.length)];
    const mesh = acquireParticle(color);
    const baseRadius = (0.06 + Math.random() * 0.12) * cfg.size;
    const yaw = Math.random() * Math.PI * 2;
    const pitch = (Math.random() - 0.5) * Math.PI;
    const speed = (4 + Math.random() * 8) * cfg.speed;
    const maxLife = 0.5 + Math.random() * 0.6;

    mesh.position.copy(enemy.group.position);
    mesh.position.y = Math.max(0.55, enemy.mesh.position.y);
    mesh.scale.setScalar(baseRadius);

    destructionParticles.push({
      mesh,
      baseRadius,
      vx: Math.cos(yaw) * Math.cos(pitch) * speed,
      vy: Math.sin(pitch) * speed + 2 * cfg.speed,
      vz: Math.sin(yaw) * Math.cos(pitch) * speed,
      life: maxLife,
      maxLife,
      glowCap: cfg.glow,
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
    particle.vy -= PARTICLE_GRAVITY * delta;

    const t = clamp(particle.life / particle.maxLife, 0, 1);
    particle.mesh.scale.setScalar(Math.max(0.001, t * 1.2 * particle.baseRadius));
    particle.mesh.material.opacity = t;
    particle.mesh.material.emissiveIntensity = Math.min(t * 5, particle.glowCap);
  }
}

function destroyEnemy(enemy) {
  spawnDestructionParticles(enemy);

  if (enemy.type === ENEMY_TYPE.SPLITTER) {
    spawnSplitChildren(enemy);
  }

  const idx = enemies.indexOf(enemy);
  if (idx !== -1) enemies.splice(idx, 1);
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

function getEffectiveBehavior(enemy) {
  const behavior = state.params.enemyBehavior;
  return behavior || enemy.def.defaultBehavior || 'rush';
}

function getEffectiveWeapon(enemy) {
  const weapon = state.params.enemyWeaponType;
  return weapon || enemy.def.defaultWeapon || 'contact';
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

  if (damage > 0) {
    p.playerHealth = Math.max(0, (Number(p.playerHealth) || 0) - damage);
  }

  syncPlayerHud();
}

function syncPlayerHud() {
  const p = state.params;
  const armorValue = document.querySelector('[data-hud-value="armor"]');
  const healthValue = document.querySelector('[data-hud-value="health"]');
  const armorFill = document.querySelector('[data-hud-fill="armor"]');
  const healthFill = document.querySelector('[data-hud-fill="health"]');

  const armorMax = Math.max(1, Number(p.playerMaxArmor) || 100);
  const healthMax = Math.max(1, Number(p.playerMaxHealth) || 100);
  const armor = clamp(Number(p.playerArmor) || 0, 0, armorMax);
  const health = clamp(Number(p.playerHealth) || 0, 0, healthMax);

  if (armorValue) armorValue.textContent = String(Math.round(armor));
  if (healthValue) healthValue.textContent = String(Math.round(health));
  if (armorFill) armorFill.style.width = `${(armor / armorMax) * 100}%`;
  if (healthFill) healthFill.style.width = `${(health / healthMax) * 100}%`;
}

function damageEnemy(enemy, amount) {
  enemy.spawnFlashTimer = Math.max(enemy.spawnFlashTimer, 0.12);
  enemy.material.emissive.set(0xffffff);
  enemy.material.emissiveIntensity = 0.45;

  if (!state.params.enemyInvincible) {
    enemy.hp -= Math.max(0, Number(amount) || 0);
  }

  if (enemy.hp <= 0) {
    destroyEnemy(enemy);
  }
}

function spawnSplitChildren(enemy) {
  const count = randomInt(2, 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = randomRange(0.9, 2.3);
    const pos = {
      x: enemy.group.position.x + Math.cos(angle) * radius,
      z: enemy.group.position.z + Math.sin(angle) * radius,
    };
    enemies.push(makeEnemy(ENEMY_TYPE.RUSHER, pos, enemies.length + i));
  }
}

export function damageEnemiesAt(position, radius = 0.45, amount = 34) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const hitRadius = Math.max(0.45, enemy.radius + radius);
    _tmpVec.copy(enemy.group.position);
    _tmpVec.y = enemy.mesh.position.y;

    if (_tmpVec.distanceTo(position) <= hitRadius) {
      damageEnemy(enemy, amount);
      return true;
    }
  }

  return false;
}

function updateEnemyMovement(enemy, delta) {
  const behavior = getEffectiveBehavior(enemy);
  const playerPos = playerGroup.position;
  _tmpVec.set(playerPos.x - enemy.group.position.x, 0, playerPos.z - enemy.group.position.z);
  const dist = Math.max(0.001, _tmpVec.length());
  const toPlayer = _tmpVec.multiplyScalar(1 / dist);
  const move = _tmpVec2.set(0, 0, 0);
  let speedMult = enemy.def.speedMult || 1;

  if (behavior === 'guard') {
    return;
  }

  if (behavior === 'orbit') {
    const tangent = move.set(-toPlayer.z, 0, toPlayer.x).multiplyScalar(0.9);
    const radialBias = clamp((dist - 6.5) / 2.5, -1, 1) * 0.6;
    tangent.addScaledVector(toPlayer, radialBias);
    normalizeXZ(tangent);
    speedMult = 1.05;
  } else if (behavior === 'keepDistance') {
    const desired = 14;
    if (dist < desired) {
      move.copy(toPlayer).multiplyScalar(-1);
      speedMult = 1.05;
    } else if (dist > desired + 2) {
      move.copy(toPlayer);
      speedMult = 0.85;
    }
  } else if (behavior === 'teleport') {
    enemy.teleportCooldown = Math.max(0, enemy.teleportCooldown - delta);
    if (enemy.teleportCooldown <= 0 && dist < 5.5) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randomRange(9, 14);
      enemy.group.position.x = playerPos.x + Math.cos(angle) * radius;
      enemy.group.position.z = playerPos.z + Math.sin(angle) * radius;
      enemy.teleportCooldown = 4;
      return;
    }
    move.copy(toPlayer);
  } else if (behavior === 'bossPhase') {
    const ratio = enemy.hp / Math.max(1, enemy.maxHp);
    enemy.phase = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
    speedMult = enemy.phase === 3 ? 1.08 : enemy.phase === 2 ? 0.98 : 0.9;
    move.copy(toPlayer);
  } else {
    move.copy(toPlayer);
  }

  if (move.lengthSq() > 0.0001) {
    normalizeXZ(move);
    const configuredSpeed = Number(state.params.enemyMoveSpeed);
    const baseSpeed = Math.max(0, Number.isFinite(configuredSpeed) ? configuredSpeed : BASE_SPEED);
    enemy.group.position.addScaledVector(move, baseSpeed * speedMult * delta);
  }
}

function updateContactDamage(enemy, delta) {
  if (getEffectiveWeapon(enemy) === 'none') return;

  const playerRadius = Math.max(0.35, Number(state.params.playerRadius) || 0.4);
  _tmpVec.set(
    playerGroup.position.x - enemy.group.position.x,
    0,
    playerGroup.position.z - enemy.group.position.z,
  );
  const dist = Math.max(0.001, _tmpVec.length());
  const minDist = enemy.radius + playerRadius;

  if (dist > minDist) {
    enemy.contactCooldown = Math.max(0, enemy.contactCooldown - delta);
    return;
  }

  const normal = _tmpVec.multiplyScalar(1 / dist);
  const push = (minDist - dist) * 0.5;
  enemy.group.position.addScaledVector(normal, -push);
  playerGroup.position.addScaledVector(normal, push * 0.7);

  enemy.contactCooldown = Math.max(0, enemy.contactCooldown - delta);
  if (enemy.contactCooldown <= 0) {
    enemy.contactCooldown = CONTACT_COOLDOWN;
    applyPlayerDamage(Number(state.params.enemyDamage) || 0);
  }
}

function fireEnemyBullet(enemy) {
  const weapon = getEffectiveWeapon(enemy);
  if (weapon === 'none' || weapon === 'contact') return;

  const color = weapon === 'sniper'
    ? 0xd975ff
    : weapon === 'laser'
      ? 0xff3333
      : enemy.def.projectileColor;

  const mesh = new THREE.Mesh(_enemyBulletGeo, getBulletMaterial(color));
  mesh.name = 'EnemyProjectile';
  mesh.position.copy(enemy.group.position);
  mesh.position.y = enemy.mesh.position.y;

  _bulletDir.set(
    playerGroup.position.x - enemy.group.position.x,
    Math.max(0.6, Number(state.params.playerRadius) || 0.4) - mesh.position.y,
    playerGroup.position.z - enemy.group.position.z,
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
    damage: Number(state.params.enemyDamage) || 0,
  });
}

function updateEnemyShooting(enemy, delta) {
  const weapon = getEffectiveWeapon(enemy);
  const interval = FIRE_RATE_SECONDS[weapon];
  if (!interval || enemy.spawnFlashTimer > 0) return;

  enemy.shootTimer -= delta;
  if (enemy.shootTimer <= 0) {
    fireEnemyBullet(enemy);
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

    _tmpVec.copy(playerGroup.position);
    _tmpVec.y += Math.max(0.55, playerRadius + 0.35);
    if (bullet.mesh.position.distanceTo(_tmpVec) <= playerHitRadius) {
      applyPlayerDamage(bullet.damage);
      enemyBullets.splice(i, 1);
      disposeEnemyBullet(bullet);
      continue;
    }

    if (bullet.life <= 0) {
      enemyBullets.splice(i, 1);
      disposeEnemyBullet(bullet);
    }
  }
}

export function updateEnemies(delta, elapsedTime = 0) {
  syncPlayerHud();

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.spawnFlashTimer = Math.max(0, enemy.spawnFlashTimer - delta);

    updateEnemyMovement(enemy, delta);
    updateEnemyShooting(enemy, delta);
    updateContactDamage(enemy, delta);

    const dx = playerGroup.position.x - enemy.group.position.x;
    const dz = playerGroup.position.z - enemy.group.position.z;
    enemy.group.rotation.y = Math.atan2(dx, dz);
    enemy.mesh.position.y = (BASE_RADIUS + BASE_LENGTH / 2) * enemy.sizeMult
      + Math.sin(elapsedTime * 3 + enemy.bobOffset) * 0.05;

    const flash = enemy.spawnFlashTimer > 0;
    enemy.material.opacity = flash ? clamp(1 - enemy.spawnFlashTimer / 0.65, 0.25, 1) : 1;
    enemy.material.transparent = flash;
    if (!flash && enemy.material.emissiveIntensity > 0.06) {
      enemy.material.emissive.set(enemy.def.color);
      enemy.material.emissiveIntensity = 0.06;
    }
  }

  updateEnemyBullets(delta);
  updateDestructionParticles(delta);
}
