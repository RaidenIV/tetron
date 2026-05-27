// ─── spawner.js ───────────────────────────────────────────────────────────────
import { state } from './state.js';
import { playerGroup } from './player.js';
import { ENEMY_TYPE } from './constants.js';
import { spawnEnemyAtPosition } from './enemies.js';

const SPAWN_RING_MIN = 16;
const SPAWN_RING_MAX = 24;

const TYPE_WEIGHTS = {
  [ENEMY_TYPE.RUSHER]:     10,
  [ENEMY_TYPE.ORBITER]:    4,
  [ENEMY_TYPE.TANKER]:     3,
  [ENEMY_TYPE.SNIPER]:     3,
  [ENEMY_TYPE.TELEPORTER]: 2,
  [ENEMY_TYPE.SHIELDED]:   3,
  [ENEMY_TYPE.SPLITTER]:   2,
  [ENEMY_TYPE.BOSS]:       1,
};

// Timing between individual spawns (seconds)
const BASE_INTERVAL = 1.2;

export function initSpawner() {
  state.spawnTimer = BASE_INTERVAL;
}

export function updateSpawner(delta) {
  const p = state.params;
  if (p.spawnPaused) return;
  if (state.enemies.length >= p.maxEnemies) return;

  state.spawnTimer -= delta * p.enemySpawnRate;
  if (state.spawnTimer > 0) return;

  const interval = BASE_INTERVAL / Math.max(0.1, p.enemySpawnRate);
  state.spawnTimer = interval;

  // Pick a random enabled type
  const enabledTypes = Object.entries(p.enemyTypes)
    .filter(([, enabled]) => enabled)
    .map(([type]) => type);

  if (enabledTypes.length === 0) return;

  // Weighted random selection
  let totalWeight = 0;
  for (const t of enabledTypes) totalWeight += TYPE_WEIGHTS[t] || 1;
  let rand = Math.random() * totalWeight;
  let chosen = enabledTypes[0];
  for (const t of enabledTypes) {
    rand -= TYPE_WEIGHTS[t] || 1;
    if (rand <= 0) { chosen = t; break; }
  }

  // Spawn position: random ring around player
  const angle = Math.random() * Math.PI * 2;
  const dist  = SPAWN_RING_MIN + Math.random() * (SPAWN_RING_MAX - SPAWN_RING_MIN);
  const playerPos = playerGroup.position;
  const spawnPos = {
    x: playerPos.x + Math.cos(angle) * dist,
    y: 0,
    z: playerPos.z + Math.sin(angle) * dist,
  };

  spawnEnemyAtPosition(chosen, spawnPos);
}
