# Time Slow Effect

Portable reference for recreating the Capsule Havoc time-slow effect in another game project.

The system slows world simulation while keeping player control responsive. It does this by separating real frame time from scaled world time.

---

## 1. Core Design

### Purpose

The time-slow effect should:

- Slow enemies, projectiles, spawners, pickups, particles, and most world animation.
- Keep player movement and input responsive.
- Use real-time timers so the effect does not extend its own duration.
- Smoothly blend into and out of slow motion.
- Stack cleanly with other slow effects by choosing the strongest/lowest time scale.
- Avoid giant frame spikes by clamping delta.

### Key Concept

Use two kinds of delta time:

```js
const delta = realFrameSeconds;
const worldDelta = delta * state.worldScale;
```

Use `delta` for:

- Player input/movement.
- Ability cooldowns and durations.
- UI timers that should be real time.
- Slow-motion blend interpolation.

Use `worldDelta` for:

- Enemy movement.
- Enemy shooting cadence.
- Enemy bullets.
- Spawners.
- Pickups.
- Particles.
- Damage-number animation.
- Most world effects.

This makes the world slow down while the player still feels responsive.

---

## 2. State Model

```js
const state = {
  worldScale: 1.0,

  slowCooldown: 0,
  slowTimer: 0,
  slowScale: 0.5,
  slowRequested: false,

  effects: {
    clock: 0,
  },

  upg: {
    timeSlow: 0,
  },
};
```

### Field Meanings

| Field | Purpose |
|---|---|
| `worldScale` | Current global simulation speed multiplier. `1.0` is normal speed. `0.15` is 15% speed. |
| `slowCooldown` | Real-time cooldown before the ability can be used again. |
| `slowTimer` | Real-time remaining active duration. |
| `slowScale` | Target world scale while ability is active. |
| `slowRequested` | Input flag set by controls and consumed by the main loop. |
| `effects.clock` | Optional pickup-based time slow timer. |
| `upg.timeSlow` | Upgrade tier that unlocks/improves the ability. |

---

## 3. Time Slow Config

```js
const TIME_SLOW_CONFIG = {
  key: 'q',

  cooldownBase: 15.0,

  tiers: {
    1: { duration: 3.0, cooldownMult: 1.00, scale: 0.50 },
    2: { duration: 5.0, cooldownMult: 0.70, scale: 0.50 },
    3: { duration: 5.0, cooldownMult: 0.70, scale: 0.25 },
    4: { duration: 5.0, cooldownMult: 0.50, scale: 0.25 },
    5: { duration: 5.0, cooldownMult: 0.50, scale: 0.15 },
  },

  pickupClockScale: 0.15,

  snapRate: 14.0,
  recoverRate: 5.0,
};
```

The Capsule Havoc implementation supports stronger values than the inline state comment suggests: high tiers can reach `0.15` world speed.

---

## 4. Input Behavior

### Activation Input

The player presses `Q` to request time slow. The input handler should only set a request flag; the main loop decides whether the ability can actually activate.

```js
function handleKeyDown(event) {
  if (state.paused) return;

  if (event.key.toLowerCase() === 'q') {
    if ((state.upg.timeSlow || 0) > 0) {
      state.slowRequested = true;
    }
  }
}
```

### Why Use a Request Flag

A request flag avoids doing ability logic directly inside the input listener. This keeps all timer/cooldown logic in the deterministic game update path.

---

## 5. Activation Logic

```js
function updateTimeSlowAbility(delta) {
  if (state.slowCooldown > 0) {
    state.slowCooldown = Math.max(0, state.slowCooldown - delta);
  }

  if (state.slowTimer > 0) {
    state.slowTimer = Math.max(0, state.slowTimer - delta);
  }

  if (!state.slowRequested) return;

  state.slowRequested = false;

  const tier = Math.max(0, state.upg.timeSlow || 0);
  if (tier <= 0) return;
  if (state.slowCooldown > 0) return;
  if (state.slowTimer > 0) return;

  const config = getTimeSlowTierConfig(tier);

  state.slowTimer = config.duration;
  state.slowCooldown = TIME_SLOW_CONFIG.cooldownBase * config.cooldownMult;
  state.slowScale = config.scale;

  playSound('slowmo', 0.6, 1.0);
}
```

### Tier Config Helper

```js
function getTimeSlowTierConfig(tier) {
  if (tier >= 5) return TIME_SLOW_CONFIG.tiers[5];
  if (tier >= 4) return TIME_SLOW_CONFIG.tiers[4];
  if (tier >= 3) return TIME_SLOW_CONFIG.tiers[3];
  if (tier >= 2) return TIME_SLOW_CONFIG.tiers[2];
  return TIME_SLOW_CONFIG.tiers[1];
}
```

---

## 6. World Scale Calculation

### Combining Multiple Slow Effects

Use the lowest scale value because lower means slower.

```js
function getTargetWorldScale() {
  const abilityScale = state.slowTimer > 0
    ? state.slowScale
    : 1.0;

  const clockPickupScale = state.effects.clock > 0
    ? TIME_SLOW_CONFIG.pickupClockScale
    : 1.0;

  return Math.min(abilityScale, clockPickupScale);
}
```

If another effect, such as dash slow-motion, also changes the world speed, include it in the same minimum-scale calculation.

```js
function getTargetWorldScale() {
  const scales = [1.0];

  if (state.slowTimer > 0) scales.push(state.slowScale);
  if (state.effects.clock > 0) scales.push(0.15);
  if (state.dashTimer > 0) scales.push(DASH_SLOW_SCALE);

  return Math.min(...scales);
}
```

---

## 7. Smooth Blend In / Blend Out

Do not instantly snap `worldScale` unless the game intentionally wants a harsh stop-frame effect.

```js
function updateWorldScale(delta) {
  const target = getTargetWorldScale();
  const rate = target < state.worldScale
    ? TIME_SLOW_CONFIG.snapRate
    : TIME_SLOW_CONFIG.recoverRate;

  state.worldScale +=
    (target - state.worldScale) * Math.min(1, rate * delta);
}
```

Recommended behavior:

- Enter slow motion quickly.
- Recover back to normal speed more gradually.
- Always use real `delta` for interpolation so the blend itself does not slow down too much.

---

## 8. Main Loop Integration

```js
function tick() {
  requestAnimationFrame(tick);

  if (state.paused || state.gameOver || state.upgradeOpen) {
    renderSceneFrame();
    return;
  }

  const delta = Math.min(clock.getDelta(), 0.05);

  updateTimeSlowAbility(delta);
  updateActiveEffectTimers(delta);

  updatePlayer(delta);
  updateWorldScale(delta);

  const worldDelta = delta * state.worldScale;

  updateSpawner(worldDelta);
  updateEnemies(worldDelta);
  updateEnemyBullets(worldDelta);
  updatePickups(worldDelta);
  updateParticles(worldDelta);
  updateDamageNumbers(worldDelta);

  renderSceneFrame();
}
```

### Important Ordering

Recommended order:

1. Read real `delta`.
2. Update real-time ability timers.
3. Update player with real `delta`.
4. Update `worldScale`.
5. Calculate `worldDelta`.
6. Update slowed world systems with `worldDelta`.

This keeps player input immediate while world simulation responds to the latest slow-motion state.

---

## 9. Real-Time Timers vs Slowed Timers

### Use Real Delta for Effect Timers

Time slow should not extend itself. If a five-second time slow is active, it should last five real seconds, not five slowed seconds.

```js
state.slowTimer -= delta;
state.slowCooldown -= delta;
state.effects.clock -= delta;
```

### Use World Delta for World Simulation

```js
enemy.position.x += enemy.velocity.x * worldDelta;
enemy.shootTimer -= worldDelta;
bullet.life -= worldDelta;
particle.life -= worldDelta;
```

This slows movement, firing, projectile travel, animation, and world lifetimes.

---

## 10. Player Responsiveness Rule

The player should usually use real `delta`, not `worldDelta`.

```js
function updatePlayer(delta) {
  const movement = readMovementInput();
  player.position.x += movement.x * PLAYER_SPEED * delta;
  player.position.z += movement.z * PLAYER_SPEED * delta;
}
```

This gives the effect a strong power-fantasy feel: the world slows around the player, but the player remains responsive.

Optional variation:

```js
const playerScale = 0.85;
const playerDelta = delta * playerScale;
```

Use this only if the player feels too fast during slow motion.

---

## 11. Pickup-Based Clock Slow

The same world-scale system can support a pickup effect.

```js
function applyClockPickup(duration = 10) {
  state.effects.clock = Math.max(state.effects.clock || 0, duration);
  playSound('pickup_clock', 0.7, 1.0);
}
```

Because target scale uses `Math.min`, the pickup and ability do not fight each other. The strongest slow wins.

```js
const targetScale = Math.min(
  state.slowTimer > 0 ? state.slowScale : 1.0,
  state.effects.clock > 0 ? 0.15 : 1.0,
);
```

---

## 12. Systems That Need Special Handling

### Pickup Attraction

If pickup attraction uses `worldDelta`, pickups may become too sluggish during slow motion. Capsule Havoc compensates by dividing by world scale for attraction movement.

```js
const attractDelta = worldDelta / Math.max(0.0001, state.worldScale);
```

This keeps attraction responsive while the pickup lifetime and spin can remain slowed.

### UI and HUD

HUD timers for the ability cooldown should use real `delta`, not `worldDelta`, because cooldowns are real-time gameplay timers.

### Audio

The current implementation plays a `slowmo` SFX when activated. Optional enhancements:

- Lower music playback rate during slow motion.
- Add low-pass filtering during active slow.
- Add a short impact/warp sound on activation.
- Restore audio parameters smoothly when ending.

### Camera and Visual Effects

Optional visual treatment:

- Slight vignette.
- Chromatic aberration.
- Desaturated world colors.
- Increased bullet trails.
- Screen ripple on activation.
- Motion streaks on enemies/projectiles.

Keep these visual effects tied to `slowTimer > 0` or `worldScale < 0.98`.

---

## 13. Reset Rules

On restart, clear the time-slow state.

```js
function resetTimeSlowState() {
  state.worldScale = 1.0;
  state.slowCooldown = 0;
  state.slowTimer = 0;
  state.slowScale = 0.5;
  state.slowRequested = false;

  if (state.effects) {
    state.effects.clock = 0;
  }
}
```

If the game has a pause system, do not decrement slow timers while paused because the gameplay update loop should already be gated.

---

## 14. Porting Checklist

- [ ] Add `worldScale` to game state.
- [ ] Add `slowCooldown`, `slowTimer`, `slowScale`, and `slowRequested`.
- [ ] Add a time-slow upgrade/unlock flag or ability config.
- [ ] Add input that sets `slowRequested`.
- [ ] Consume `slowRequested` in the main update loop.
- [ ] Update ability timers with real `delta`.
- [ ] Calculate target world scale from all active slow effects.
- [ ] Smoothly interpolate `worldScale` toward target scale.
- [ ] Calculate `worldDelta = delta * worldScale`.
- [ ] Update enemies/projectiles/world systems with `worldDelta`.
- [ ] Keep player movement on real `delta` unless intentionally slowed.
- [ ] Reset the effect state on restart/new game.
- [ ] Decide whether pickups, UI, and cooldowns use real time or world time.
- [ ] Add activation SFX and optional visual feedback.

---

## 15. Reusable Pseudocode

```js
const state = {
  worldScale: 1.0,
  slowCooldown: 0,
  slowTimer: 0,
  slowScale: 0.5,
  slowRequested: false,
  upg: { timeSlow: 0 },
  effects: { clock: 0 },
};

function requestTimeSlow() {
  if (state.upg.timeSlow > 0) {
    state.slowRequested = true;
  }
}

function updateTimeSlow(delta) {
  state.slowCooldown = Math.max(0, state.slowCooldown - delta);
  state.slowTimer = Math.max(0, state.slowTimer - delta);
  state.effects.clock = Math.max(0, state.effects.clock - delta);

  if (state.slowRequested) {
    state.slowRequested = false;

    const tier = state.upg.timeSlow;
    if (tier > 0 && state.slowCooldown <= 0 && state.slowTimer <= 0) {
      const cfg = getTimeSlowTierConfig(tier);
      state.slowTimer = cfg.duration;
      state.slowCooldown = cfg.cooldown;
      state.slowScale = cfg.scale;
      playSound('slowmo');
    }
  }

  const targetScale = getTargetWorldScale();
  const rate = targetScale < state.worldScale ? 14.0 : 5.0;

  state.worldScale +=
    (targetScale - state.worldScale) * Math.min(1, rate * delta);
}

function getTargetWorldScale() {
  const scales = [1.0];

  if (state.slowTimer > 0) scales.push(state.slowScale);
  if (state.effects.clock > 0) scales.push(0.15);

  return Math.min(...scales);
}

function tick() {
  requestAnimationFrame(tick);

  if (state.paused || state.gameOver || state.upgradeOpen) {
    renderSceneFrame();
    return;
  }

  const delta = Math.min(clock.getDelta(), 0.05);

  updateTimeSlow(delta);
  updatePlayer(delta);

  const worldDelta = delta * state.worldScale;

  updateEnemies(worldDelta);
  updateEnemyBullets(worldDelta);
  updateSpawner(worldDelta);
  updatePickups(worldDelta);
  updateParticles(worldDelta);

  renderSceneFrame();
}
```
