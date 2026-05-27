// ─── state.js ─────────────────────────────────────────────────────────────────
export const state = {
  panelOpen: true,

  keys: { w: false, a: false, s: false, d: false },

  // Dash runtime
  dashTimer:    0,
  dashCooldown: 0,
  dashVX: 0, dashVZ: 0,
  lastMoveX: 0, lastMoveZ: 1,
  dashGhostTimer: 0,
  dashStreaks: [],

  // Camera smooth state (3rd person)
  _camPos:    { x: 28, y: 28, z: 28 },
  _camTarget: { x: 0,  y: 0,  z: 0  },

  // All panel-exposed parameters
  params: {
    // Camera
    cameraMode:      'iso',   // 'iso' | 'third'
    isoCamD:         12,
    thirdDist:       14,
    thirdHeight:     7,
    thirdAzimuth:    2.36,
    thirdFov:        65,
    thirdLookAhead:  2.0,
    thirdSmoothPos:  8.0,
    thirdSmoothLook: 12.0,

    // Player
    playerSpeed:       7,
    playerColor:       '#0044cc',
    playerMetalness:   0.67,
    playerRoughness:   0.0,
    playerRadius:      0.4,
    playerLength:      1.2,
    dashEnabled:       true,
    dashSpeed:         28,
    dashDuration:      0.18,
    dashCooldown:      1.4,

    // Lighting
    ambientIntensity:  0.42,
    sunIntensity:      5.8,
    fillIntensity:     1.35,
    rimIntensity:      0.82,
    sunAngleX:         16,
    sunAngleZ:         14,

    // Scene / floor
    fogNear:    1,
    fogFar:     200,
    bgColor:    '#06080d',
    showFloor:  true,
    showGrid:   true,
    floorColor: '#0c1020',
    gridColor:  '#1a2a4a',
    shadows:    true,
  },
};

export function defaultParams() {
  return JSON.parse(JSON.stringify(state.params));
}
