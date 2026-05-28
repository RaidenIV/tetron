// src/state.js
export const state = {
  panelOpen: true,
  panelMinimized: false,
  activePreset: 'default',
  mouseLookActive: false,
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
    cameraMode: 'iso',    // 'iso' | 'third'
    isoCamD: 12,
    thirdDist: 14, thirdHeight: 7, thirdFov: 65,
    thirdAzimuth: 2.36,   // radians, ~135° behind-right
    thirdLookAhead: 2.0,
    thirdSmoothPos: 8.0, thirdSmoothLook: 12.0,
    thirdMouseLook: true,
    thirdMouseSensitivityX: 0.003,
    thirdMouseSensitivityY: 0.0024,
    thirdPitch: -0.28,
    thirdOffsetMode: 'parallel', // 'parallel' | 'pivot'
    thirdOffsetX: 0.0, thirdOffsetY: 0.0, thirdOffsetZ: 0.0,

    // player
    playerSpeed: 7,
    playerColor: '#0044cc',
    playerMetalness: 0.67, playerRoughness: 0.0,
    playerRadius: 0.4, playerLength: 1.2,
    shieldVisible: true,
    shieldColor: '#1e7bff',
    shieldOpacity: 0.22,
    shieldRadius: 1.45,
    shieldHexSize: 0.22,
    shieldGlow: true,
    dashEnabled: true, dashSpeed: 28,
    dashDuration: 0.18, dashCooldown: 1.4,

    // lighting
    ambientIntensity: 0.42,
    sunIntensity: 5.8, fillIntensity: 1.35, rimIntensity: 0.82,
    sunAngleX: 16, sunAngleZ: 14, shadows: true, shadowQuality: 'high',

    // scene
    fogNear: 1, fogFar: 200,
    bgColor: '#06080d', floorColor: '#0c1020', gridColor: '#1a2a4a',
    showFloor: true, showGrid: true, showFps: false,

    // weapons / reticle
    reticleVisible: true,
    reticleType: 'dot',
    reticleColor: '#ffffff',
    reticleSize: 24,
    reticleThickness: 2,
    reticleOpacity: 1,
    reticleGlow: false,
  },
};

// Snapshot taken at startup — used by Reset button
export const defaultParams = JSON.parse(JSON.stringify(state.params));
