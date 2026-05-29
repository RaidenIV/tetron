// src/state.js
export const state = {
  panelOpen: true,
  panelMinimized: false,
  activePreset: 'g1',
  mouseLookActive: false,
  primaryFire: false,
  pointerAimX: 0,
  pointerAimY: 0,
  keys: { w: false, a: false, s: false, d: false },
  sidebarWidth: 320,

  // dash runtime
  dashTimer: 0, dashCooldown: 0,
  dashVX: 0, dashVZ: 0,
  lastMoveX: 0, lastMoveZ: 1,
  dashGhostTimer: 0,
  dashStreaks: [],

  // 3rd-person camera smooth state
  _camPos:    { x: 28, y: 28, z: 28 },
  _camTarget: { x: 0,  y: 0,  z: 0  },

  params: {
    // camera
    cameraMode: 'third2', // 'iso' | 'third' | 'third2'
    isoCamD: 12,
    thirdDist: 5, thirdHeight: 3, thirdFov: 62,
    thirdMinDist: 3, thirdPitchDistanceCompression: 0.75,
    third2PitchMin: -0.9, third2PitchMax: 0.85,
    third2BodyFrameStrength: 1.0, third2BodyFrameHeight: 1.35, third2BodyScreenY: 0.45, third2MinEyeHeight: 0.15,
    thirdAzimuth: 0,      // radians
    thirdLookAhead: 3.8,
    thirdSmoothPos: 10.0, thirdSmoothLook: 12.0,
    thirdMouseLook: true,
    thirdMouseSensitivityX: 0.003,
    thirdMouseSensitivityY: 0.0024,
    thirdPitch: -0.22,
    thirdOffsetMode: 'parallel', // 'parallel' | 'pivot'
    thirdOffsetX: 1.25, thirdOffsetY: -0.25, thirdOffsetZ: -0.25,

    // player
    playerSpeed: 7,
    playerColor: '#0044cc',
    playerMetalness: 0.67, playerRoughness: 0.0,
    playerRadius: 0.4, playerLength: 1.2,
    shieldVisible: false,
    shieldColor: '#1e7bff',
    shieldOpacity: 0.22,
    shieldRadius: 1.45,
    shieldHexSize: 0.22,
    shieldLineThickness: 0.012,
    shieldGlow: true,
    dashEnabled: true, dashSpeed: 28,
    dashDuration: 0.18, dashCooldown: 1.4,

    // lighting
    ambientIntensity: 0.42,
    sunIntensity: 5.8, fillIntensity: 1.35, rimIntensity: 0.82,
    sunAngleX: 16, sunAngleZ: 14, shadows: true, shadowQuality: 'high',

    // scene
    fogNear: 1, fogFar: 200,
    bgColor: '#142130', floorColor: '#0C1620', gridColor: '#000000',
    showFloor: true, showGrid: true, showFps: true,

    // HUD
    hudVisible: true,
    hudFont: 'system',

    // weapons / reticle
    reticleVisible: true,
    reticleType: 'dot',
    reticleColor: '#ffffff',
    reticleSize: 24,
    reticleThickness: 2,
    reticleOpacity: 1,
    reticleGlow: false,

    // laser gun
    laserEnabled: true,
    laserBloom: true,
    laserBloomColor: '#ff1100',
    laserBloomIntensity: 0.55,
    laserProjectileSpeed: 22,
    laserRange: 42,
    laserFireRate: 5,
  },
};

// Snapshot taken at startup — used by Reset button
export const defaultParams = JSON.parse(JSON.stringify(state.params));
