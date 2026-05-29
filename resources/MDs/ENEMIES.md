# Enemy Designs and Attack Behaviors

Portable reference for recreating the enemy roster in another project. This document is intentionally limited to enemy visual design notes, archetype configuration, attack/behavior design, a porting checklist, and reusable pseudocode.

---

## 1. Visual Design Notes

### Shared Enemy Silhouette

All enemy archetypes use a capsule-shaped body so the roster stays visually unified while color, scale, material finish, and behavior communicate role.

```js
const enemyGeoParams = {
  radius: 0.4,
  length: 1.2,
  capSegs: 8,
  radial: 16,
};
```

Implementation notes:

- Place the capsule so the bottom rests on the floor: `mesh.position.y = radius + length / 2` multiplied by the enemy size multiplier.
- Use the same capsule base for every archetype, then vary `sizeMult`, color, metallic/roughness, projectile color, shot tell color, and special effects.
- Enemies face the player each frame with `rotation.y = atan2(dx, dz)`.
- Apply a small idle hover/bob: `mesh.position.y = floorY + sin(elapsed * 3 + index) * 0.05`.
- Enemies fade in at spawn for `0.65s`; they should not look fully active until the fade completes.
- On hit/stagger, flash the body toward white and temporarily raise emissive intensity for `0.12s`.
- Shooting enemies show a ground-ring cue and emissive body charge before firing.
- Enemy bullets use small capsule projectiles aligned to the travel vector.

### Role-Based Visual Language

| Enemy | Body Color | Scale | Material | Visual Read |
|---|---:|---:|---|---|
| Rusher | `0x888888` | `0.75` | Non-metallic | Small, fast baseline swarm unit |
| Orbiter | `0x00cc44` | `1.00` | Metallic | Green flanking shooter |
| Tanker | `0x2b2b2b` | `1.50` | Metallic | Large heavy pressure unit |
| Sniper | `0x9b30ff` | `1.00` | Non-metallic | Purple long-range precision threat |
| Teleporter | `0xe0e0e0` | `0.75` | Non-metallic | Pale blinking displacement bruiser |
| Shielded | `0x4aa3ff` | `1.25` | Non-metallic | Blue protected frontliner |
| Splitter | `0x80fb37` | `2.00` | Non-metallic | Bright ultra-elite that splits on death |
| Boss | `0x111111` | `2.00` | Metallic | Black apex unit with phase escalation |

### Shot Telegraph Visuals

Use a readable charge-up before any enemy projectile attack. The cue should appear only while the enemy is preparing to fire.

```js
const SHOT_TELLS = {
  BOSS:     { prep: 0.34, color: 0xff4444, scale: 1.60 },
  SNIPER:   { prep: 0.58, color: 0xd975ff, scale: 1.45 },
  TANKER:   { prep: 0.42, color: 0xffaa33, scale: 1.75 },
  ORBITER:  { prep: 0.22, color: 0x66ff99, scale: 1.25 },
  SPLITTER: { prep: 0.28, color: 0x80fb37, scale: 1.50 },
  DEFAULT:  { prep: 0.20, color: 0xff8844, scale: 1.30 },
};
```

Telegraph behavior:

- Show a ground ring under the enemy.
- Increase ring opacity during the prep timer.
- Slightly expand the cue ring as the timer approaches zero.
- Set the enemy body emissive color to the shot tell color.
- Reset ring and emissive values immediately after firing.

### Damage Stagger Visuals

Enemy damage should produce both a visual flash and a short mechanical stagger so hits feel readable and impactful.

```js
const STAGGER_DURATION = 0.12;
```

Stagger behavior:

- Trigger the stagger every time an enemy takes valid player damage.
- Set `enemy.staggerTimer = STAGGER_DURATION` on hit.
- While staggered, pause normal enemy movement so the hit briefly interrupts forward pressure.
- Blend the body material from its base color toward white using the remaining stagger ratio.
- Set body emissive color to white during the stagger.
- Drive emissive intensity from high to normal across the timer: `emissiveIntensity = staggerRatio * 4`.
- Restore the base body color, black emissive color, and normal emissive intensity when the timer ends.
- Keep shot telegraphs independent, but do not let shot emissive cleanup overwrite the active stagger flash.

### Destruction Particle Visuals

When an enemy is destroyed, spawn a short burst of sphere particles at the enemy position before removing the enemy group from the scene. Standard enemies use a compact red burst. Elite-style enemies use a larger, faster, glow-heavy burst tinted toward the elite/enemy color.

```js
const EXPLOSION_PARTICLE_CONFIG = {
  standard: { count: 10,  size: 0.25, speed: 1.00, glow: 0.0  },
  elite:    { count: 100, size: 0.50, speed: 1.75, glow: 12.0 },
};
```

Particle behavior:

- Use pooled particle meshes so repeated enemy deaths do not allocate unnecessary geometry.
- Use a low-poly sphere or similarly cheap mesh for each particle.
- Spawn particles at the enemy world position with `y = 1`.
- Give each particle a random outward velocity using random yaw and pitch.
- Add upward velocity bias so the burst lifts before falling.
- Apply gravity each frame: `vy -= 9 * dt`.
- Fade each particle by reducing opacity over its lifetime.
- Shrink each particle by scaling it with remaining life ratio.
- For elite/boss destruction, use enemy-colored particles mixed with white and warm highlight particles.
- Return expired particles to the pool instead of destroying them permanently.

---

## 2. Enemy Archetype Configs

Use this config object as the portable source of truth for enemy visuals and combat behavior. Percent values are fractions of current player max HP. For example, `0.10` means 10% of player max HP.

```js
const ENEMY_TYPE = Object.freeze({
  RUSHER: 'RUSHER',
  ORBITER: 'ORBITER',
  TANKER: 'TANKER',
  SNIPER: 'SNIPER',
  TELEPORTER: 'TELEPORTER',
  SHIELDED: 'SHIELDED',
  SPLITTER: 'SPLITTER',
  BOSS: 'BOSS',
});

const ENEMY_DEFS = Object.freeze({
  [ENEMY_TYPE.RUSHER]: {
    color: 0x888888,
    sizeMult: 0.75,
    hpPct: 0.08,
    contactPct: 0.10,
    shoot: false,
    metallic: false,
  },

  [ENEMY_TYPE.ORBITER]: {
    color: 0x00cc44,
    sizeMult: 1.00,
    hpPct: 0.50,
    contactPct: 0.15,
    shoot: true,
    bulletPct: 0.10,
    fireRate: 4.00,
    bulletSpeedMult: 1.00,
    metallic: true,
    orbitR: 6.5,
  },

  [ENEMY_TYPE.TANKER]: {
    color: 0x2b2b2b,
    sizeMult: 1.50,
    hpPct: 2.00,
    contactPct: 0.20,
    shoot: true,
    bulletPct: 0.20,
    fireRate: 4.50,
    bulletSpeedMult: 0.85,
    metallic: true,
  },

  [ENEMY_TYPE.SNIPER]: {
    color: 0x9b30ff,
    sizeMult: 1.00,
    hpPct: 3.00,
    contactPct: 0.10,
    shoot: true,
    bulletPct: 0.333,
    fireRate: 3.70,
    bulletSpeedMult: 1.35,
    metallic: false,
  },

  [ENEMY_TYPE.TELEPORTER]: {
    color: 0xe0e0e0,
    sizeMult: 0.75,
    hpPct: 3.00,
    contactPct: 0.333,
    shoot: false,
    metallic: false,
    teleportWhenBelow: 0.50,
  },

  [ENEMY_TYPE.SHIELDED]: {
    color: 0x4aa3ff,
    sizeMult: 1.25,
    hpPct: 0.50,
    shieldPct: 1.50,
    contactPct: 0.20,
    shoot: false,
    metallic: false,
  },

  [ENEMY_TYPE.SPLITTER]: {
    color: 0x80fb37,
    sizeMult: 2.00,
    hpPct: 3.00,
    contactPct: 0.30,
    shoot: true,
    bulletPct: 0.25,
    fireRate: 4.00,
    bulletSpeedMult: 1.20,
    metallic: false,
    splitCountMin: 2,
    splitCountMax: 3,
  },

  [ENEMY_TYPE.BOSS]: {
    color: 0x111111,
    sizeMult: 2.00,
    hpPct: 4.00,
    contactPct: 0.50,
    shoot: true,
    bulletPct: 0.33,
    fireRate: 1.75,
    bulletSpeedMult: 1.375,
    metallic: true,
  },
});
```

### Damage Feedback and Destruction VFX Configs

Keep these values near the archetype config so enemy hit feedback and destruction effects can be tuned without editing combat logic.

```js
const STAGGER_DURATION = 0.12;

const EXPLOSION_PARTICLE_CONFIG = Object.freeze({
  standard: {
    count: 10,
    size: 0.25,
    speed: 1.00,
    glow: 0.0,
    colors: [0xcc0000, 0xaa0000, 0xdd0000, 0x880000, 0xff1111, 0xbb0000],
  },

  elite: {
    count: 100,
    size: 0.50,
    speed: 1.75,
    glow: 12.0,
    colorsFor(enemyColor) {
      return [enemyColor, enemyColor, enemyColor, 0xffffff, 0xffee88];
    },
  },
});
```

### Runtime Enemy Shape

```js
const enemy = {
  type: ENEMY_TYPE.RUSHER,
  group: null,
  mesh: null,
  material: null,
  baseColor: null,
  matDirty: false,
  eliteType: null,
  hp: 1,
  maxHp: 1,
  shieldHp: 0,
  dead: false,
  isBoss: false,
  scaleMult: 1,
  contactDamage: 1,
  bulletDamage: 0,
  bulletSpeedMult: 1,
  fireRate: null,
  shootTimer: 0,
  fireTellTimer: 0,
  spawnFlashTimer: 0.65,
  staggerTimer: 0,
  stunTimer: 0,
  teleportPending: null,
  phase: 1,
};
```

---

## 3. Enemy Design and Attack Behaviors

### Shared Damage Stagger Behavior

All enemy archetypes use the same damage stagger rule. The stagger is intentionally short: it reads as a hit reaction without turning normal weapons into permanent crowd control.

**Damage behavior:**

- Any valid player damage triggers `staggerTimer = 0.12`.
- Stagger briefly stops normal movement by skipping movement updates while `staggerTimer > 0`.
- Stagger does not automatically cancel an already-started shot tell unless the target project specifically wants hits to interrupt attacks.
- Stagger should still trigger on shield hits so Shielded enemies communicate impact before their shield breaks.
- Damage numbers, hit sounds, shield effects, and health-bar updates should happen at the same time as the stagger trigger.
- If the hit kills the enemy, destruction logic runs after the stagger is assigned; the enemy is removed immediately and the destruction particles become the death feedback.

**Visual behavior:**

- Store the enemy's original body color as `baseColor` when the enemy is created.
- While staggered, interpolate body color from `baseColor` toward white.
- Set emissive color to white during the stagger.
- Use the remaining stagger ratio to fade intensity down from `4x` to the normal enemy emissive value.
- Mark the material as dirty while the flash is active.
- When the timer reaches zero, restore `baseColor`, black emissive color, and the default enemy emissive intensity.

### Shared Destruction Particle Behavior

All enemy archetypes should create a particle burst when destroyed. The burst is part of the enemy design language because it communicates enemy tier and impact.

**Standard destruction:**

- Spawn `10` small red particles.
- Particle size multiplier: `0.25`.
- Particle speed multiplier: `1.00`.
- No extra glow cap.
- Use red color variation so standard enemies feel explosive but not visually dominant.

**Elite / boss destruction:**

- Spawn `100` particles.
- Particle size multiplier: `0.50`.
- Particle speed multiplier: `1.75`.
- Glow cap: `12.0`.
- Use the enemy/elite color as the dominant particle color, with white and warm yellow highlight particles mixed in.
- This larger burst should be reserved for visually important enemies such as Splitter, Boss, or any project-specific elite variant.

**Particle lifecycle:**

- Each particle has `life`, `maxLife`, velocity, base radius, opacity, and glow cap.
- `life` starts at `1`; `maxLife` is randomized between `0.5s` and `1.1s`.
- Movement uses velocity integration each frame.
- Gravity pulls particles down.
- Opacity and scale shrink with remaining life ratio.
- Expired particles are removed from the scene and returned to a mesh pool.

### Rusher — Standard Swarm Unit

**Design:** Small gray capsule that reads as the default baseline enemy. It should be numerous, easy to parse, and visually less important than special archetypes.

**Behavior:**

- Does not shoot.
- Moves directly toward the player while steering around obstacles and other enemies.
- Applies contact damage on collision.
- Uses full base movement speed.
- Best used as screen pressure and positioning punishment.

**Attack behavior:**

- Primary attack is body contact.
- Contact attack should trigger at a fixed interval rather than every frame, so the player is not instantly drained while overlapping.
- Collision should push both player and enemy apart to keep contact readable.

---

### Orbiter — Flanking Shooter

**Design:** Green metallic capsule. Its role is communicated by lateral movement and frequent smaller shots.

**Behavior:**

- Maintains a circular orbit around the player instead of rushing straight in.
- Uses a desired orbit radius of `6.5` world units.
- Moves slightly faster than the base enemy: `speedMult = 1.05`.
- Blends tangent movement with radial correction so it circles while drifting inward/outward to maintain orbit range.

**Attack behavior:**

- Fires toward the player if within line of sight and projectile range.
- Fire rate: `4.00s` base interval.
- Bullet damage: `10%` of player max HP before any external scaling.
- Bullet speed multiplier: `1.00`.
- Shot tell uses a short green charge cue: `0.22s` prep.

---

### Tanker — Heavy Pressure Shooter

**Design:** Large dark metallic capsule. It should look heavy, durable, and dangerous at close-to-mid range.

**Behavior:**

- Moves toward the player like a pressure unit.
- Slower than base enemy: `speedMult = 0.90`.
- High body size and high HP make it useful as a moving wall.
- Uses contact pressure plus slower heavy projectiles.

**Attack behavior:**

- Fires toward the player if within line of sight and projectile range.
- Fire rate: `4.50s` base interval.
- Bullet damage: `20%` of player max HP before any external scaling.
- Bullet speed multiplier: `0.85`.
- Shot tell uses a larger orange charge cue: `0.42s` prep.

---

### Sniper — Long-Range Kiting Shooter

**Design:** Purple capsule with a precision-threat identity. It should stand out as a high-priority ranged enemy.

**Behavior:**

- Attempts to maintain distance instead of closing directly.
- Desired range: `14.0` world units.
- If the player is closer than desired range, it backs away from the player with `speedMult = 1.05`.
- If the player is outside desired range, it slows to `speedMult = 0.85` instead of aggressively chasing.

**Attack behavior:**

- Fires only with line of sight and within projectile range.
- Fire rate: `3.70s` base interval.
- Bullet damage: `33.3%` of player max HP before any external scaling.
- Bullet speed multiplier: `1.35`.
- Shot tell uses a longer purple charge cue: `0.58s` prep.
- Enemy bullet visual should use purple: `0xd975ff`.

---

### Teleporter — Displacement Bruiser

**Design:** Small pale capsule that looks evasive and unnatural. Its destination marker is a key part of its visual identity.

**Behavior:**

- Does not shoot.
- Moves like a close-range bruiser until damaged below its teleport threshold.
- Teleport threshold: `hp / maxHp <= 0.50`.
- When teleport triggers, do not instantly move the enemy. First create a visible destination marker.
- Destination is picked around the player at roughly `cameraDistance * 1.7 + 6` units.
- The enemy becomes invisible during the pending teleport.
- Teleport delay: `0.42s`.
- Teleport cooldown after arrival: `4.0s`.

**Attack behavior:**

- Primary attack is body contact.
- Contact damage: `33.3%` of player max HP before any external scaling.
- The teleport is not an attack by itself; it is a repositioning behavior that preserves pressure and prevents easy kiting.

---

### Shielded — Protected Frontliner

**Design:** Blue medium-large capsule. It should visually read as a defender or shielded unit.

**Behavior:**

- Does not shoot.
- Moves toward the player as a frontliner.
- Has normal HP plus a separate shield pool.
- Shield amount: `150%` of player max HP before any external scaling.
- Body HP amount: `50%` of player max HP before any external scaling.
- Recommended implementation: absorb incoming damage with `shieldHp` first, then pass overflow damage to body HP.

**Attack behavior:**

- Primary attack is contact damage.
- Contact damage: `20%` of player max HP before any external scaling.
- Its combat role is not burst damage; it is obstruction, durability, and forced target priority.

---

### Splitter — Ultra Elite

**Design:** Large bright green capsule. It should feel like an elite threat and should be visually louder than standard enemies.

**Behavior:**

- Moves toward the player but slower than base enemy: `speedMult = 0.80`.
- High health and size create a durable elite target.
- On death, splits into `2–3` Rusher enemies near its death position.
- Split children should spawn with small random radial offsets so they do not overlap perfectly.

**Attack behavior:**

- Fires toward the player if within line of sight and projectile range.
- Fire rate: `4.00s` base interval.
- Bullet damage: `25%` of player max HP before any external scaling.
- Bullet speed multiplier: `1.20`.
- Shot tell uses a bright green charge cue: `0.28s` prep.

---

### Boss — Apex Unit

**Design:** Large black metallic capsule with boss health-bar treatment. It should read as the apex enemy through scale, dark material, faster firing, red projectiles, and phase changes.

**Behavior:**

- Moves toward the player as a heavy pressure unit.
- Movement speed multiplier: `0.90`.
- Has boss-specific phase escalation based on remaining HP.
- Has contact damage and projectile attacks.
- Should use stronger hit/shot feedback than regular enemies.

**Attack behavior:**

- Fires toward the player if within line of sight and projectile range.
- Base fire rate: `1.75s`.
- Bullet damage: `33%` of player max HP before any external scaling.
- Bullet speed multiplier: `1.375`.
- Shot tell uses red charge cue: `0.34s` prep.
- Enemy bullet visual should use red: `0xff3333`.

**Phase behavior:**

- Phase 1: starts at full HP with base boss fire rate and bullet speed.
- Phase 2: begins when HP ratio reaches `<= 0.66`.
  - Set `phase = 2`.
  - Fire rate becomes `baseFireRate * 0.85`, clamped to at least `0.35s`.
  - Bullet speed becomes `baseBulletSpeedMult * 1.12`.
  - Spawn `3` Rusher support enemies around the boss.
- Phase 3: begins when HP ratio reaches `<= 0.33`.
  - Set `phase = 3`.
  - Fire rate becomes `baseFireRate * 0.68`, clamped to at least `0.28s`.
  - Bullet speed becomes `baseBulletSpeedMult * 1.25`.
  - Spawn `2` support enemies around the boss.
  - Use Sniper support if the player level or project progression equivalent is high enough; otherwise use Tanker support.
  - Optional: increase boss bullet damage slightly during phase 3.

---

## 4. Porting Checklist

Use this checklist when applying the enemy system to another project.

- [ ] Create a shared `ENEMY_TYPE` enum.
- [ ] Create a shared `ENEMY_DEFS` config object.
- [ ] Use one reusable enemy factory that accepts an enemy type and builds visuals/stats from config.
- [ ] Use one shared runtime enemy object shape.
- [ ] Implement capsule or equivalent enemy body visuals.
- [ ] Apply per-type color, scale, and metallic settings.
- [ ] Implement spawn fade-in.
- [ ] Implement hit/stagger flash.
- [ ] Store each enemy's `baseColor` for stagger recovery.
- [ ] Pause enemy movement while `staggerTimer > 0`.
- [ ] Trigger stagger whenever player damage is applied.
- [ ] Implement pooled destruction particles for enemy deaths.
- [ ] Add separate standard and elite/boss particle configs.
- [ ] Implement per-type movement behavior.
- [ ] Implement contact damage with a cooldown interval.
- [ ] Implement line-of-sight projectile shooting for shooting enemies.
- [ ] Implement per-type shot telegraph timing/color/scale.
- [ ] Implement enemy projectile pooling or reusable projectile creation.
- [ ] Implement Teleporter marker, blink delay, and cooldown.
- [ ] Implement Shielded shield-first damage handling.
- [ ] Implement Splitter death split into Rusher children.
- [ ] Implement Boss phase transitions and support enemy spawns.
- [ ] Keep rewards, shop logic, progression systems, and project-specific UI outside the enemy module.

---

## 5. Reusable Pseudocode

### Create Enemy from Archetype

```js
function createEnemy(type, position, playerMaxHP) {
  const def = ENEMY_DEFS[type];

  const group = new Group();
  group.position.set(position.x, 0, position.z);

  const material = createEnemyMaterial({
    color: def.color,
    metallic: def.metallic,
  });

  const mesh = createCapsuleMesh({
    radius: enemyGeoParams.radius * def.sizeMult,
    length: enemyGeoParams.length * def.sizeMult,
    material,
  });

  mesh.position.y = (enemyGeoParams.radius + enemyGeoParams.length / 2) * def.sizeMult;
  group.add(mesh);

  return {
    type,
    group,
    mesh,
    material,
    baseColor: cloneColor(def.color),
    matDirty: false,
    eliteType: type === ENEMY_TYPE.SPLITTER || type === ENEMY_TYPE.BOSS
      ? { color: def.color }
      : null,
    hp: Math.round(playerMaxHP * def.hpPct),
    maxHp: Math.round(playerMaxHP * def.hpPct),
    shieldHp: Math.round(playerMaxHP * (def.shieldPct || 0)),
    dead: false,
    isBoss: type === ENEMY_TYPE.BOSS,
    scaleMult: def.sizeMult,
    contactDamage: Math.round(playerMaxHP * def.contactPct),
    bulletDamage: def.bulletPct ? Math.round(playerMaxHP * def.bulletPct) : 0,
    bulletSpeedMult: def.bulletSpeedMult || 1,
    fireRate: def.shoot ? def.fireRate : null,
    shootTimer: def.shoot ? Math.random() * def.fireRate : 0,
    fireTellTimer: 0,
    spawnFlashTimer: 0.65,
    staggerTimer: 0,
    stunTimer: 0,
    teleportPending: null,
    phase: 1,
  };
}
```

### Update Enemy Per Frame

```js
function updateEnemy(enemy, dt, context) {
  if (enemy.dead) return;

  updateSpawnFade(enemy, dt);
  updateHitFlash(enemy, dt);
  updateBossPhase(enemy, context);
  updateTeleporter(enemy, dt, context);
  updateEnemyShooting(enemy, dt, context);

  if (enemy.staggerTimer <= 0 && enemy.stunTimer <= 0) {
    updateEnemyMovement(enemy, dt, context);
  }

  updateContactDamage(enemy, dt, context);

  facePlayer(enemy, context.player.position);
  applyIdleBob(enemy, context.elapsedTime);
}
```

### Trigger Damage Stagger

```js
function triggerEnemyStagger(enemy) {
  enemy.staggerTimer = STAGGER_DURATION;
  enemy.matDirty = true;
}
```

### Update Damage Stagger Visual

```js
function updateHitFlash(enemy, dt) {
  if (enemy.staggerTimer > 0) {
    enemy.staggerTimer = Math.max(0, enemy.staggerTimer - dt);

    const t = enemy.staggerTimer / STAGGER_DURATION;

    enemy.material.color.setRGB(
      enemy.baseColor.r + (1 - enemy.baseColor.r) * t,
      enemy.baseColor.g + (1 - enemy.baseColor.g) * t,
      enemy.baseColor.b + (1 - enemy.baseColor.b) * t,
    );

    enemy.material.emissive.setRGB(1, 1, 1);
    enemy.material.emissiveIntensity = t > 0
      ? t * 4
      : context.defaultEnemyEmissiveIntensity;

    enemy.matDirty = true;
    return;
  }

  if (enemy.matDirty) {
    enemy.material.color.copy(enemy.baseColor);
    enemy.material.emissive.setRGB(0, 0, 0);
    enemy.material.emissiveIntensity = context.defaultEnemyEmissiveIntensity;
    enemy.matDirty = false;
  }
}
```

### Apply Enemy Damage with Stagger

```js
function applyDamageToEnemy(enemy, amount, context) {
  let remaining = amount;

  triggerEnemyStagger(enemy);

  if (enemy.shieldHp > 0) {
    const absorbed = Math.min(enemy.shieldHp, remaining);
    enemy.shieldHp -= absorbed;
    remaining -= absorbed;
    playShieldHitEffect(enemy);
  }

  if (remaining > 0) {
    enemy.hp -= remaining;
    spawnEnemyDamageNumber(remaining, enemy);
  }

  updateEnemyHealthBar(enemy);

  if (enemy.hp <= 0) {
    onEnemyKilled(enemy, context);
  } else {
    playEnemyHitSound(enemy);
  }
}
```

### Movement Switch

```js
function getEnemyMoveVector(enemy, playerPos, enemies, obstacles) {
  const dx = playerPos.x - enemy.group.position.x;
  const dz = playerPos.z - enemy.group.position.z;
  const dist = Math.hypot(dx, dz) || 1;

  let sx = dx / dist;
  let sz = dz / dist;
  let speedMult = 1.0;

  if (enemy.type === ENEMY_TYPE.TANKER) speedMult = 0.90;
  if (enemy.type === ENEMY_TYPE.SPLITTER) speedMult = 0.80;
  if (enemy.type === ENEMY_TYPE.BOSS) speedMult = 0.90;

  if (enemy.type === ENEMY_TYPE.ORBITER) {
    const orbitR = ENEMY_DEFS.ORBITER.orbitR;
    const rx = dx / dist;
    const rz = dz / dist;
    const tx = -rz;
    const tz = rx;
    const radialErr = dist - orbitR;
    const radialBias = clamp(radialErr / 2.5, -1, 1);

    sx = tx * 0.9 + rx * radialBias * 0.6;
    sz = tz * 0.9 + rz * radialBias * 0.6;

    const len = Math.hypot(sx, sz) || 1;
    sx /= len;
    sz /= len;
    speedMult = 1.05;
  }

  if (enemy.type === ENEMY_TYPE.SNIPER) {
    const desired = 14.0;
    if (dist < desired) {
      sx = -dx / dist;
      sz = -dz / dist;
      speedMult = 1.05;
    } else {
      speedMult = 0.85;
    }
  }

  const steered = steerAroundObstaclesAndEnemies(sx, sz, enemy, enemies, obstacles);
  return { x: steered.x, z: steered.z, speedMult };
}
```

### Shooting with Telegraph

```js
function updateEnemyShooting(enemy, dt, context) {
  if (!enemy.fireRate) return;
  if (enemy.spawnFlashTimer > 0) return;
  if (enemy.stunTimer > 0) return;

  const playerPos = context.player.position;
  const enemyPos = enemy.group.position;
  const dx = playerPos.x - enemyPos.x;
  const dz = playerPos.z - enemyPos.z;
  const dist = Math.hypot(dx, dz);

  const tell = getShotTell(enemy.type, enemy.isBoss);
  const inRange = dist > 0.5 && dist < context.enemyBulletRange;
  const canSeePlayer = hasLineOfSight(enemyPos, playerPos, context.world);

  if (enemy.fireTellTimer > 0) {
    enemy.fireTellTimer = Math.max(0, enemy.fireTellTimer - dt);
    updateShotTellVisual(enemy, tell);

    if (enemy.fireTellTimer <= 0) {
      fireEnemyBullet(enemy, dx / dist, dz / dist, context);
      enemy.shootTimer = enemy.fireRate * randomRange(0.8, 1.2);
      hideShotTellVisual(enemy);
    }

    return;
  }

  enemy.shootTimer -= dt;

  if (enemy.shootTimer <= tell.prep && inRange && canSeePlayer) {
    enemy.fireTellTimer = tell.prep;
    showShotTellVisual(enemy, tell);
  }
}
```

### Fire Enemy Bullet

```js
function fireEnemyBullet(enemy, nx, nz, context) {
  const def = ENEMY_DEFS[enemy.type];
  const speed = context.enemyBulletSpeed * (enemy.bulletSpeedMult || 1);

  const color = enemy.type === ENEMY_TYPE.SNIPER
    ? 0xd975ff
    : enemy.isBoss
      ? 0xff3333
      : 0xff4400;

  const bullet = acquireEnemyBullet(color);
  bullet.position.copy(enemy.group.position);
  bullet.velocity.set(nx * speed, 0, nz * speed);
  bullet.damage = enemy.bulletDamage;
  bullet.life = context.enemyBulletLifetime;

  context.enemyBullets.push(bullet);
}
```

### Contact Damage

```js
function updateContactDamage(enemy, dt, context) {
  const player = context.player;
  const dx = player.position.x - enemy.group.position.x;
  const dz = player.position.z - enemy.group.position.z;
  const dist = Math.hypot(dx, dz) || 1;

  const enemyRadius = enemyGeoParams.radius * enemy.scaleMult * 1.02;
  const playerRadius = player.collisionRadius;
  const minDist = enemyRadius + playerRadius;

  if (dist >= minDist) return;

  const nx = dx / dist;
  const nz = dz / dist;
  const push = (minDist - dist) * 0.55;

  enemy.group.position.x -= nx * push;
  enemy.group.position.z -= nz * push;
  player.position.x += nx * push;
  player.position.z += nz * push;

  enemy.contactCooldown = Math.max(0, (enemy.contactCooldown || 0) - dt);
  if (enemy.contactCooldown > 0) return;

  enemy.contactCooldown = 1.0;
  applyPlayerDamage(player, enemy.contactDamage);
}
```

### Teleporter Behavior

```js
function updateTeleporter(enemy, dt, context) {
  if (enemy.type !== ENEMY_TYPE.TELEPORTER) return;

  enemy.teleportCooldown = Math.max(0, enemy.teleportCooldown || 0);

  if (enemy.teleportPending) {
    enemy.teleportPending.timer -= dt;
    enemy.mesh.visible = false;
    updateTeleportMarker(enemy.teleportMarker, enemy.teleportPending);

    if (enemy.teleportPending.timer <= 0) {
      enemy.group.position.set(enemy.teleportPending.x, 0, enemy.teleportPending.z);
      enemy.mesh.visible = true;
      enemy.teleportCooldown = 4.0;
      destroyTeleportMarker(enemy.teleportMarker);
      enemy.teleportMarker = null;
      enemy.teleportPending = null;
    }

    return;
  }

  enemy.teleportCooldown = Math.max(0, enemy.teleportCooldown - dt);

  const threshold = ENEMY_DEFS.TELEPORTER.teleportWhenBelow;
  const shouldTeleport = enemy.teleportCooldown <= 0 && enemy.hp / enemy.maxHp <= threshold;
  if (!shouldTeleport) return;

  const angle = Math.random() * Math.PI * 2;
  const radius = context.cameraDistance * 1.7 + 6;
  const x = context.player.position.x + Math.cos(angle) * radius;
  const z = context.player.position.z + Math.sin(angle) * radius;

  enemy.teleportMarker = createTeleportMarker(x, z, 0xe0e0e0);
  enemy.teleportPending = { x, z, timer: 0.42, maxTimer: 0.42 };
}
```

### Shielded Damage Handling

```js
function absorbShieldThenBodyDamage(enemy, amount) {
  let remaining = amount;

  if (enemy.shieldHp > 0) {
    const absorbed = Math.min(enemy.shieldHp, remaining);
    enemy.shieldHp -= absorbed;
    remaining -= absorbed;
    playShieldHitEffect(enemy);
  }

  if (remaining > 0) {
    enemy.hp -= remaining;
  }

  return remaining;
}
```

### Spawn Destruction Particles

```js
const particleMeshPool = [];
const particleMaterialCache = new Map();

function spawnDestructionParticles(position, enemy, context) {
  const isElite = !!enemy.eliteType || enemy.type === ENEMY_TYPE.SPLITTER || enemy.type === ENEMY_TYPE.BOSS;
  const cfg = isElite
    ? EXPLOSION_PARTICLE_CONFIG.elite
    : EXPLOSION_PARTICLE_CONFIG.standard;

  const colors = isElite
    ? cfg.colorsFor(enemy.baseColorHex || ENEMY_DEFS[enemy.type].color)
    : cfg.colors;

  for (let i = 0; i < Math.round(cfg.count); i++) {
    const color = randomChoice(colors);
    const mesh = acquireParticleMesh(color);

    const baseRadius = (0.06 + Math.random() * 0.12) * cfg.size;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI;
    const speed = (4 + Math.random() * 8) * cfg.speed;

    mesh.scale.setScalar(baseRadius);
    mesh.position.copy(position);
    mesh.position.y = 1;
    mesh.visible = true;

    context.scene.add(mesh);
    context.particles.push({
      mesh,
      baseRadius,
      vx: Math.cos(theta) * Math.cos(phi) * speed,
      vy: Math.sin(phi) * speed + 2 * cfg.speed,
      vz: Math.sin(theta) * Math.cos(phi) * speed,
      life: 1,
      maxLife: 0.5 + Math.random() * 0.6,
      glowCap: cfg.glow,
    });
  }
}
```

### Update Destruction Particles

```js
function updateDestructionParticles(dt, context) {
  for (let i = context.particles.length - 1; i >= 0; i--) {
    const p = context.particles[i];
    p.life -= dt;

    if (p.life <= 0) {
      context.scene.remove(p.mesh);
      particleMeshPool.push(p.mesh);
      context.particles.splice(i, 1);
      continue;
    }

    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;

    p.vy -= 9 * dt;

    const t = p.life / p.maxLife;
    p.mesh.scale.setScalar(t * 1.2 * p.baseRadius);
    p.mesh.material.emissiveIntensity = Math.min(t * 5, p.glowCap);
    p.mesh.material.opacity = t;
  }
}
```

### Splitter Death Behavior

```js
function onEnemyKilled(enemy, context) {
  spawnDestructionParticles(enemy.group.position, enemy, context);

  if (enemy.teleportMarker) {
    destroyTeleportMarker(enemy.teleportMarker);
    enemy.teleportMarker = null;
  }

  if (enemy.type === ENEMY_TYPE.SPLITTER) {
    const def = ENEMY_DEFS.SPLITTER;
    const count = randomInt(def.splitCountMin, def.splitCountMax);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randomRange(0.9, 2.3);
      const childPos = {
        x: enemy.group.position.x + Math.cos(angle) * radius,
        z: enemy.group.position.z + Math.sin(angle) * radius,
      };

      context.spawnEnemy(ENEMY_TYPE.RUSHER, childPos);
    }
  }

  removeEnemyLabels(enemy);
  destroyEnemyVisuals(enemy);
  enemy.dead = true;
}
```

### Boss Phase Updates

```js
function updateBossPhase(enemy, context) {
  if (!enemy.isBoss) return;

  const ratio = enemy.hp / enemy.maxHp;

  if (enemy.phase < 2 && ratio <= 0.66) {
    enemy.phase = 2;
    enemy.fireRate = Math.max(0.35, enemy.baseFireRate * 0.85);
    enemy.bulletSpeedMult = enemy.baseBulletSpeedMult * 1.12;
    spawnSupportAroundBoss(enemy, ENEMY_TYPE.RUSHER, 3, context);
  }

  if (enemy.phase < 3 && ratio <= 0.33) {
    enemy.phase = 3;
    enemy.fireRate = Math.max(0.28, enemy.baseFireRate * 0.68);
    enemy.bulletSpeedMult = enemy.baseBulletSpeedMult * 1.25;

    const supportType = context.progressLevel >= 21
      ? ENEMY_TYPE.SNIPER
      : ENEMY_TYPE.TANKER;

    spawnSupportAroundBoss(enemy, supportType, 2, context);
  }
}
```
