// ─── state.js ─────────────────────────────────────────────────────────────────
// Central mutable state. `params` is the "source of truth" for everything
// the control panel exposes — all runtime logic reads from here.

export const state = {
  // ── Game flow ───────────────────────────────────────────────────────────────
  gameOver:   false,
  paused:     false,
  loopStarted:false,
  elapsed:    0,
  kills:      0,

  // ── UI ─────────────────────────────────────────────────────────────────────
  panelOpen: true,

  // ── Panel-driven parameters ────────────────────────────────────────────────
  // These are the live values; the panel reads/writes them directly.
  params: {
    // Camera
    cameraMode:        'iso',     // 'iso' | 'third'
    isoCamD:           12,
    thirdDist:         14,
    thirdHeight:       7,
    thirdAzimuth:      2.36,      // ~135° — diagonal over-the-shoulder
    thirdFov:          65,
    thirdLookAhead:    2.0,
    thirdSmoothPos:    8.0,       // lerp speed for camera pos
    thirdSmoothLook:   12.0,      // lerp speed for camera target

    // Player
    playerSpeed:       7,
    playerMaxHP:       100,
    playerColor:       '#0044cc',
    playerMetalness:   0.67,
    playerRoughness:   0.0,
    playerGodMode:     false,
    playerAutoShoot:   true,
    playerDashEnabled: true,

    // Enemies
    enemySpeed:        3.08,
    enemyHPScale:      1.0,
    enemyDMGScale:     1.0,
    enemySizeScale:    1.0,
    enemySpawnRate:    1.0,
    maxEnemies:        40,
    enemyColor:        '#888888',
    spawnPaused:       false,
    enemyTypes: {
      rusher:     true,
      orbiter:    true,
      tanker:     true,
      sniper:     true,
      teleporter: false,
      shielded:   true,
      splitter:   false,
      boss:       true,
    },

    // Weapons (lasers)
    weaponFireInterval: 0.22,
    weaponBulletSpeed:  14,
    weaponDamage:       10,
    weaponBulletScale:  1.0,
    weaponMultishot:    1,
    weaponPiercing:     false,
    // Orbit
    orbitCount:         0,
    orbitRadius:        2.2,
    orbitSpeed:         3.5,
    orbitDamage:        5,

    // Lighting
    lightAmbient:       0.42,
    lightSun:           5.8,
    lightFill:          1.35,
    lightRim:           0.82,
    lightOrbitSpeed:    1.9,
    lightOrbitIntensity:8.2,

    // Bloom / Post
    bloomThreshold:     1.0,
    bloomStrength:      0.0,
    bloomExposure:      0.42,
    bloomEnabled:       true,

    // Scene
    fogNear:            1,
    fogFar:             200,
    bgColor:            '#06080d',
    showGrid:           true,
    showFloor:          true,
    shadows:            'high',
    reflections:        true,
    accentLights:       true,

    // Capsule geometry
    playerRadius:  0.4,
    playerLength:  1.2,
    enemyRadius:   0.4,
    enemyLength:   1.2,
    bulletRadius:  0.045,
    bulletLength:  0.55,
  },

  // ── Runtime game state (not panel-exposed) ─────────────────────────────────
  playerHP:          100,
  shootTimer:        0,
  bulletWaveAngle:   0,
  spawnTimer:        0,
  dashTimer:         0,
  dashCooldown:      0,
  dashVX:            0,
  dashVZ:            0,
  lastMoveX:         0,
  lastMoveZ:         1,
  dashGhostTimer:    0,
  worldScale:        1.0,
  contactDmgAccum:   0,
  contactDmgTimer:   0,

  keys: { w: false, a: false, s: false, d: false },

  enemies:      [],
  bullets:      [],
  enemyBullets: [],
  particles:    [],
  damageNums:   [],
  dashStreaks:  [],
  orbitRings:   [],
  orbitHitActive: new Set(),

  // Camera smooth state (3rd person)
  _camPos:   { x: 28, y: 28, z: 28 },
  _camTarget:{ x: 0,  y: 0,  z: 0  },

  enemySpatialHash: null,
};
