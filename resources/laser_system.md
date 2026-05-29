# Capsule Havoc — Laser System: Functionality & Design

---

## Overview

The laser system is the primary weapon for the **Blue character** and any loadout
with `characterPrimaryWeapon === 'laser'`. It fires outward in a circular volley
pattern that expands with upgrades, culminating in a rotating firing ring at
maximum tier. All laser projectiles share a distinctive two-mesh visual — a
white core plus a red additive glow — rendered through a dedicated bloom layer
for maximum visual punch.

---

## Core Constants (`constants.js`)

| Parameter | Value | Notes |
|---|---|---|
| `BULLET_SPEED` | `14` units/sec | Base travel speed for all player projectiles |
| `BULLET_LIFETIME` | `2.2` seconds | Default time-to-live before despawn |
| Enemy bullet speed | `8` units/sec | For comparison |

---

## Firing Logic (`weapons.js` → `shootBulletWave`)

### Volley Pattern

Bullets are distributed evenly around a full 360° circle:

```
angle[i] = bulletWaveAngle + (i / dirs) * 2π
```

- **`dirs`** = volley count from the current `laserFire` tier (6–10 projectiles).
- **`bulletWaveAngle`** is a persistent per-shot offset stored in `state`.
- At **Tier 5** (`laserFire >= 5`), the wave angle advances by `π / dirs` after
  every shot, producing a continuously **rotating firing ring**.

### Per-Shot Parameters

| Parameter | Source | Effect |
|---|---|---|
| Damage | `getBulletDamage()` | Base level DMG × damage tier multiplier × active effects |
| Speed | `BULLET_SPEED × (1 + 0.20 × projSpeedTier)` | +20% per `projSpeed` upgrade tier |
| Lifetime | `BULLET_LIFETIME × (1 + 0.22 × laserRangeTier)` | +22% per `laserRange` tier |
| Piercing | `state.upg.piercing` | Bullet survives N additional enemy hits before despawning |

### Multishot Burst

When the `multishot` upgrade is active, every 5th volley fires extra bullets
per direction:

| `multishot` tier | Extra projectiles per direction |
|---|---|
| Tier 1 | +1 (alternating left or right offset) |
| Tier 2+ | +2 (one on each side) |

Spread offset shrinks automatically as volley size grows (≥10 dirs → 0.055 rad,
≥8 → 0.070 rad, otherwise 0.085 rad) to avoid visual overlap.

---

## Visual Design (`weapons.js` — `_makePlayerLaserVisual`)

Each bullet is a **`THREE.Group`** containing two meshes sharing the same
`bulletGeo` (a capsule/cylinder geometry defined in `materials.js`):

### Layer 0 — White Core
```js
_playerLaserCoreMat = MeshStandardMaterial({
  color:            0xffffff,
  emissive:         0xffffff,
  emissiveIntensity: 0.35,
  metalness:        0.0,
  roughness:        0.25,
})
```
Rendered in the standard scene pass. Provides a solid, bright white centre that
reads clearly against dark backgrounds.

### Layer 1 — Red Additive Glow
```js
_playerLaserGlowMat = MeshStandardMaterial({
  color:            0xff1100,
  emissive:         0xff1100,
  emissiveIntensity: 6.0,
  transparent:      true,
  opacity:          0.55,
  depthWrite:       false,
  blending:         THREE.AdditiveBlending,
})
// Scale: 1.25× the core mesh
```
Rendered exclusively in **Layer 1** (the bullet bloom pass). The additive
blending means it accumulates brightness against surrounding geometry, while the
bloom post-process amplifies it into a vivid red halo.

### Object Pooling

Player laser visuals are pooled in `_playerBulletPool` to avoid per-frame
allocations. Acquire/release functions toggle `mesh.visible` and all child
visibility rather than adding/removing from the scene.

---

## Bloom Rendering (`bloom.js`)

The renderer uses **three independent Gaussian bloom layers**:

| Layer | Camera layer mask | Purpose |
|---|---|---|
| 0 — Global | Full scene | Ambient glow, environment |
| **1 — Bullet** | Bullet meshes only | **Tight threshold for laser glow** |
| 2 — Explosion | Particles + dash ghosts | Explosion FX |

Laser glow meshes are placed on Layer 1 (`mesh.layers.set(1)`) so the bullet
bloom pass applies a **tight threshold (0.3)** and **strength (0.9)**
specifically tuned for the laser aesthetic, independent of the global bloom
settings.

The final composite shader additively blends all three bloom layers over the
scene colour:

```glsl
vec3 col = scene
         + tBloom       * strength        // global
         + tBloomBullet * bulletStrength  // laser / bullets
         + tBloomExpl   * explStrength;   // explosions
```

---

## Upgrade Tree

### `laserFire` — Laser Fire (Weapons category)

Controls the volley count and unlocks the rotating pattern.

| Tier | Coins | Effect |
|---|---|---|
| 0 (base) | — | 6 projectiles per volley |
| 1 | 10 | 7 projectiles |
| 2 | 50 | 8 projectiles |
| 3 | 250 | 9 projectiles |
| 4 | 1 000 | 10 projectiles |
| 5 | 2 000 | 10 projectiles **+ rotating firing positions** |

> Locked for Red (slash) loadouts via `RED_LASER_LOCKOUT`.

### Supporting Upgrades (also locked for slash)

| Key | Effect per tier | Max tiers |
|---|---|---|
| `fireRate` | −10% shot cooldown | 5 |
| `projSpeed` | +20% projectile speed | 5 |
| `piercing` | +1 enemy pierced per shot | 5 |
| `multishot` | Tier 1: 2-shot burst / Tier 2: 3-shot burst | 2 |

### Fire Interval Formula

```js
fireInterval = max(0.35s, 1.0 × 0.90^fireRateTier)
```

At Tier 5 fire rate, the minimum cooldown floor of **0.35 s** is reached.

---

## Bullet Lifecycle (`weapons.js` → `updateBullets`)

Each frame, every active bullet:

1. **Ages** — `life -= delta`; despawns when `life <= 0`.
2. **Moves** — position updated by `(vx, vz) * delta`.
3. **Prop collision** — radius check against nearby terrain colliders; despawns
   on contact (no prop piercing).
4. **Enemy collision** — hit radius **0.75 units**:
   - If enemy has a **shield** (`shieldHp > 0`), damage drains shield first;
     overflow carries into HP.
   - Otherwise, reduces enemy HP directly.
   - Spawns a damage number, applies stagger (`0.12 s`).
   - If `pierceLeft > 0`, the bullet survives the hit (pierce count decremented);
     otherwise it despawns.
   - Triggers kill logic and appropriate sound (`explode` / `explodeElite` vs
     `standard_hit` / `elite_hit`).

---

## Targeted Shot — Secondary Laser Variant

A blue-tinted, auto-homing projectile unlocked via `targetedFire`. Visually
distinct from the primary laser:

### Visual Design

```js
_targetedLaserCoreMat = MeshStandardMaterial({
  color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35,
  metalness: 0.15, roughness: 0.35,
})

_targetedLaserGlowMat = MeshPhysicalMaterial({
  color: 0x8ecbff, emissive: 0x3ea0ff, emissiveIntensity: 2.15,
  clearcoat: 1.0, clearcoatRoughness: 0.08,
  transparent: true, opacity: 1.0,
  depthWrite: false,
})
// Scale: 1.55× wide, 1.35× long
```

The `MeshPhysicalMaterial` with `clearcoat: 1.0` adds a sharp specular sheen,
differentiating this laser visually from the primary red-glow variant.

### Behaviour

- Fires automatically at the **nearest enemy** within `maxRange`.
- Speed: `BULLET_SPEED × 2.2 × (1 + tsBonus)` — significantly faster than
  primary fire.
- Cooldown: `max(0.18s, 1.4 × baseCdMult × extraCdMult)`.
- Damage: `getBulletDamage() × (1 + targetedSystemsBonus)`.
- Hit radius: 0.78 units (slightly larger than primary).

### `targetedFire` Upgrade Tiers

| Tier | Effect |
|---|---|
| 1 | Unlocks auto-targeting shot |
| 2 | Fires faster and farther |
| 3 | Improves cadence and reach |
| 4 | Fires much faster |
| 5 | Maximum lock speed |

`targetedCooldown` (alias `targetedSystems`) stacks additional −15% cooldown
and +15% damage/range/speed per tier.

---

## Orbit Bullets — Tertiary Laser Variant

Orbit bullets are a ring of projectiles that **circle the player** continuously,
dealing contact damage to any enemy they pass through.

### Visual Design

Orbiting bullets use the same two-mesh pattern as primary lasers but with a
**cyan (`0x00eeff`) glow** instead of red, signalling their passive nature:

```js
// Core: shared white MeshStandardMaterial (layer 0)
// Glow: MeshPhysicalMaterial, emissive cyan, emissiveIntensity: 1.25 (layer 1)
// Scale: 1.35× core
```

### Behaviour

- Ring radius expands with orbit tier: `1.9 + (tier − 1) × 0.35` units, plus
  an `orbitRange` upgrade bonus.
- Angular speed: `(1.7 × 2.0) × (1 + 0.15 × tier)` rad/sec.
- Orbit bullet count per tier: `[0, 2, 3, 4, 5, 6]`.
- Damage equals `getBulletDamage() × (1 + 0.10 × orbitDamageTier)`, applied
  once per enemy per contact entry (tracked via `state.orbitHitActive`).

---

## Sound Design

| Event | Sound key | Volume | Pitch range |
|---|---|---|---|
| Player fires | `shoot` | 0.45 | 0.92 – 1.08 |
| Slash / laser sword | `laser_sword` | 0.72 | 0.93 – 1.07 |
| Standard enemy hit | `standard_hit` | 0.40 | 0.95 – 1.05 |
| Elite enemy hit | `elite_hit` | 0.40 | 0.95 – 1.05 |
| Enemy destroyed | `explode` | 0.70 | 0.90 – 1.10 |
| Elite destroyed | `explodeElite` | 0.70 | 0.90 – 1.10 |

Pitch randomisation on every shot prevents auditory fatigue during the
rapid-fire late-game.

---

## Design Rationale

| Choice | Reason |
|---|---|
| 360° volley over directional aim | Keeps gameplay about positioning and movement rather than aiming; rewards spatial awareness |
| Rotating wave at Tier 5 | Provides a clear power-fantasy milestone at max upgrade |
| White core + additive glow | White core ensures legibility on any background; additive red glow provides bloom-friendly colour without washing out the scene |
| Separate bloom layer for bullets | Lets bullet glow be tuned independently of environmental effects; avoids bloom budget conflicts with explosions |
| Object pooling for visuals | High fire rates (up to ~3 volleys/sec × 10 bullets = 30 mesh groups/sec) make GC pressure a real concern; pooling eliminates allocation spikes |
| Pierce mechanic over AoE | Rewards smart positioning to line up enemies; fits the 360° radial theme |
