// src/player.js
import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';

// ── Geometry & material ────────────────────────────────────────────────────────
// The player is a CapsuleGeometry inside a Group.
// The group moves through the world; the mesh rotates inside it for the lean.
export const playerMat = new THREE.MeshPhysicalMaterial({
  color: 0x0044cc,
  metalness: 0.67, roughness: 0.0,
  clearcoat: 1.0, clearcoatRoughness: 0.0,
});
export const playerBaseColor = playerMat.color.clone();

export let playerGeo = new THREE.CapsuleGeometry(0.4, 1.2, 8, 16);

export const playerGroup = new THREE.Group();
scene.add(playerGroup);

export const playerMesh = new THREE.Mesh(playerGeo, playerMat);
playerMesh.castShadow = true;
// position.y = radius + length/2 — puts capsule bottom exactly at y=0
playerMesh.position.y = 0.4 + 1.2 / 2;
playerGroup.add(playerMesh);

function createContactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0.0, 'rgba(0, 0, 0, 0.58)');
  gradient.addColorStop(0.46, 'rgba(0, 0, 0, 0.32)');
  gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const contactShadowMat = new THREE.MeshBasicMaterial({
  map: createContactShadowTexture(),
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
});

export const playerContactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  contactShadowMat
);
playerContactShadow.rotation.x = -Math.PI / 2;
playerContactShadow.position.y = 0.008;
playerContactShadow.renderOrder = 2;
playerGroup.add(playerContactShadow);

function applyPlayerContactShadow() {
  const p = state.params;
  const contactSize = Math.max(0.82, p.playerRadius * 3.1);
  playerContactShadow.position.y = 0.008 - playerGroup.position.y;
  playerContactShadow.scale.set(contactSize, contactSize, 1);
  playerContactShadow.visible = !!p.shadows && !!p.showFloor;
}

applyPlayerContactShadow();


// ── Hex shield ────────────────────────────────────────────────────────────────
// Flat-top hex grid mapped onto a sphere.
// Flat-top means each hexagon's top/bottom edges are horizontal (parallel to the
// horizon), with vertices pointing left and right.
// The grid is parameterised in (longitude, latitude) UV space, then projected
// onto the sphere surface. Every cell is a hexagon — no pentagons.
let _shieldGeometryKey = '';

const shieldGroup = new THREE.Group();
shieldGroup.name = 'PlayerHexShield';
playerGroup.add(shieldGroup);

// Shield fill — front-side only so back hemisphere doesn't render through.
// We use a small positive depth offset so the fill sits just behind the lines.
const shieldPanelMat = new THREE.MeshBasicMaterial({
  color: 0x1e7bff,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  side: THREE.FrontSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

// Shield lines — ShaderMaterial that fades out back-facing fragments using the
// dot product of the surface normal with the view direction.
// Only front-facing normals (dot > 0) remain visible, eliminating the rear
// hemisphere lines that created the overlapping diamond pattern.
const shieldLineMat = new THREE.ShaderMaterial({
  uniforms: {
    uColor:   { value: new THREE.Color(0x1e7bff) },
    uOpacity: { value: 0.72 },
    uEdgeFade: { value: 0.15 }, // fraction of sphere edge to fade at silhouette
  },
  vertexShader: /* glsl */`
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vNormal  = normalize(normalMatrix * normal);
      vViewDir = normalize(cameraPosition - worldPos.xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3  uColor;
    uniform float uOpacity;
    uniform float uEdgeFade;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      float ndotv = dot(normalize(vNormal), normalize(vViewDir));
      // Discard back-facing fragments entirely
      if (ndotv <= 0.0) discard;
      // Soft fade at grazing angles (silhouette edge)
      float alpha = uOpacity * smoothstep(0.0, uEdgeFade, ndotv);
      gl_FragColor = vec4(uColor * alpha, alpha);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  side: THREE.FrontSide,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

const shieldGlowMat = new THREE.MeshBasicMaterial({
  color: 0x1e7bff,
  transparent: true,
  opacity: 0.08,
  depthWrite: false,
  side: THREE.FrontSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

const shieldBloomMat = new THREE.MeshBasicMaterial({
  color: 0x1e7bff,
  transparent: true,
  opacity: 0.0,
  depthWrite: false,
  side: THREE.FrontSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

export const playerShield = new THREE.Mesh(
  new THREE.BufferGeometry(),
  shieldPanelMat
);
playerShield.frustumCulled = false;
playerShield.renderOrder = 6;
shieldGroup.add(playerShield);

export const playerShieldLines = new THREE.Mesh(
  new THREE.BufferGeometry(),
  shieldLineMat
);
playerShieldLines.frustumCulled = false;
playerShieldLines.renderOrder = 7;
shieldGroup.add(playerShieldLines);

export const playerShieldGlow = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 32),
  shieldGlowMat
);
playerShieldGlow.frustumCulled = false;
playerShieldGlow.renderOrder = 5;
shieldGroup.add(playerShieldGlow);

// Extra bloom shell (larger sphere, very low opacity additive)
export const playerShieldBloom = new THREE.Mesh(
  new THREE.SphereGeometry(1, 32, 16),
  shieldBloomMat
);
playerShieldBloom.frustumCulled = false;
playerShieldBloom.renderOrder = 4;
shieldGroup.add(playerShieldBloom);

// ── Flat-top hex grid on sphere ────────────────────────────────────────────────
// Flat-top hex: pointy sides on top and bottom (left/right vertices).
// Hex size r = circumradius. For flat-top:
//   width  w = sqrt(3) * r   (horizontal distance between hex centres in same row)
//   height h = 2 * r         (vertical distance, where rows offset by r * sqrt(3)/2)
// We tile in angular space then project to sphere.

function lonLatToSphere(lon, lat, radius) {
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    cosLat * Math.sin(lon),
    Math.sin(lat),
    cosLat * Math.cos(lon),
  ).multiplyScalar(radius);
}

// Flat-top hex corners (in 2-D UV/angle space), centred at origin.
// angle 0 = right, going counter-clockwise. Flat-top: corners at 0°, 60°, 120°, 180°, 240°, 300°.
function flatTopHexCorners(cx, cy, r) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i); // flat-top: start at 0°
    corners.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return corners;
}

function buildFlatTopHexShieldGeometry(radius, hexAngularSize, lineThickness) {
  // hexAngularSize: angular radius of each hex in radians.
  // Flat-top grid: step in longitude = sqrt(3) * hexAngularSize, in latitude = 1.5 * hexAngularSize.
  const r = hexAngularSize;
  const lonStep = Math.sqrt(3) * r;
  const latStep = 1.5 * r;

  const panelVerts = [];
  const panelIdx   = [];
  const lineVerts  = [];
  const lineIdx    = [];
  const seenEdges  = new Set();

  // How many latitude rows fit (-PI/2 to PI/2)
  const latRows = Math.ceil(Math.PI / latStep) + 1;

  function addFilledHex(cx, cy) {
    // Triangulate hex as fan from centre. All 6 triangles.
    const corners = flatTopHexCorners(cx, cy, r * 0.98); // slight inset so panels don't overlap lines
    const base = panelVerts.length / 3;
    // Centre point
    const cPt = lonLatToSphere(cx, cy, radius);
    panelVerts.push(cPt.x, cPt.y, cPt.z);
    for (let i = 0; i < 6; i++) {
      const [lon, lat] = corners[i];
      const pt = lonLatToSphere(lon, Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lat)), radius);
      panelVerts.push(pt.x, pt.y, pt.z);
    }
    for (let i = 0; i < 6; i++) {
      panelIdx.push(base, base + 1 + i, base + 1 + ((i + 1) % 6));
    }
  }

  function addHexEdge(ax, ay, bx, by) {
    // Deduplicate edges using sorted key
    const key = ax < bx || (ax === bx && ay <= by)
      ? `${ax.toFixed(6)},${ay.toFixed(6)}|${bx.toFixed(6)},${by.toFixed(6)}`
      : `${bx.toFixed(6)},${by.toFixed(6)}|${ax.toFixed(6)},${ay.toFixed(6)}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);

    const startPt = lonLatToSphere(ax, Math.max(-Math.PI/2, Math.min(Math.PI/2, ay)), radius);
    const endPt   = lonLatToSphere(bx, Math.max(-Math.PI/2, Math.min(Math.PI/2, by)), radius);

    const angleSpan = startPt.clone().normalize().angleTo(endPt.clone().normalize());
    const segments  = Math.max(2, Math.ceil(angleSpan / 0.04));
    const half = Math.max(0.001, lineThickness) / 2;
    const baseLV = lineVerts.length / 3;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      // Spherical interpolation
      const pt = startPt.clone().lerp(endPt, t).normalize().multiplyScalar(radius);
      const prev = i > 0 ? startPt.clone().lerp(endPt, (i-1)/segments).normalize().multiplyScalar(radius) : pt;
      const next = i < segments ? startPt.clone().lerp(endPt, (i+1)/segments).normalize().multiplyScalar(radius) : pt;
      const tangent = next.clone().sub(prev).normalize();
      let side = new THREE.Vector3().crossVectors(pt.clone().normalize(), tangent);
      if (side.lengthSq() < 0.000001) side.set(1, 0, 0);
      side.normalize();
      const L = pt.clone().addScaledVector(side,  half).normalize().multiplyScalar(radius);
      const R = pt.clone().addScaledVector(side, -half).normalize().multiplyScalar(radius);
      lineVerts.push(L.x, L.y, L.z, R.x, R.y, R.z);
    }
    for (let i = 0; i < segments; i++) {
      const l0 = baseLV + i * 2, r0 = l0 + 1;
      const l1 = baseLV + (i+1) * 2, r1 = l1 + 1;
      lineIdx.push(l0, l1, r0, r0, l1, r1);
    }
  }

  function addHexLines(cx, cy) {
    const corners = flatTopHexCorners(cx, cy, r);
    for (let i = 0; i < 6; i++) {
      const [ax, ay] = corners[i];
      const [bx, by] = corners[(i + 1) % 6];
      addHexEdge(ax, ay, bx, by);
    }
  }

  for (let row = -latRows; row <= latRows; row++) {
    const cy = row * latStep;
    if (cy < -Math.PI / 2 - r || cy > Math.PI / 2 + r) continue;

    // Flat-top grid: even rows offset by lonStep/2
    const offset = (row % 2 === 0) ? 0 : lonStep / 2;

    // How many columns fit around the full longitude circle at this latitude
    const cosLat = Math.max(0.01, Math.cos(cy));
    const lonCols = Math.ceil((2 * Math.PI) / lonStep * cosLat) + 2;

    for (let col = -lonCols; col <= lonCols; col++) {
      const cx = col * lonStep + offset;
      const wrappedCx = cx % (2 * Math.PI);
      addFilledHex(wrappedCx, cy);
      addHexLines(wrappedCx, cy);
    }
  }

  const panelGeometry = new THREE.BufferGeometry();
  panelGeometry.setAttribute('position', new THREE.Float32BufferAttribute(panelVerts, 3));
  panelGeometry.setIndex(panelIdx);
  panelGeometry.computeVertexNormals();
  panelGeometry.computeBoundingSphere();

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3));
  lineGeometry.setIndex(lineIdx);
  lineGeometry.computeVertexNormals();
  lineGeometry.computeBoundingSphere();

  return { panelGeometry, lineGeometry };
}

function rebuildShieldCells(radius, hexSize, lineThickness) {
  // hexSize is stored in world units; convert to angular size for the sphere
  const hexAngularSize = Math.max(0.05, Math.min(1.2, hexSize / Math.max(0.1, radius)));
  const key = `${radius.toFixed(4)}:${hexSize.toFixed(4)}:${lineThickness.toFixed(4)}`;
  if (_shieldGeometryKey === key) return;
  _shieldGeometryKey = key;

  const { panelGeometry, lineGeometry } = buildFlatTopHexShieldGeometry(radius, hexAngularSize, lineThickness);

  playerShield.geometry.dispose();
  playerShield.geometry = panelGeometry;
  playerShieldLines.geometry.dispose();
  playerShieldLines.geometry = lineGeometry;
}

// ── Apply shield from params ──────────────────────────────────────────────────
export function applyShieldSettings() {
  const p = state.params;
  const radius        = Math.max(0.2, Number(p.shieldRadius) || 1.35);
  const hexSize       = Math.max(0.03, Number(p.shieldHexSize) || 0.22);
  const opacity       = Math.max(0, Math.min(1, Number(p.shieldOpacity) || 0.22));
  const lineThickness = Math.max(0.001, Number(p.shieldLineThickness) || 0.012);
  const color         = p.shieldColor || '#1e7bff';
  const glowEnabled   = !!p.shieldGlow;
  const bloomIntensity = Math.max(0, Math.min(1, Number(p.shieldBloomIntensity) ?? 0.12));
  const bloomRadius    = Math.max(1.0, Math.min(3.0, Number(p.shieldBloomRadius) ?? 1.18));

  rebuildShieldCells(radius, hexSize, lineThickness);

  shieldGroup.visible = !!p.shieldVisible;
  shieldGroup.position.y = playerMesh.position.y;

  shieldPanelMat.color.set(color);
  shieldPanelMat.opacity = opacity;
  shieldPanelMat.needsUpdate = true;

  shieldLineMat.uniforms.uColor.value.set(color);
  shieldLineMat.uniforms.uOpacity.value = glowEnabled
    ? Math.min(1, opacity * 3.2)
    : Math.min(1, opacity * 1.9);
  shieldLineMat.needsUpdate = true;

  shieldGlowMat.color.set(color);
  shieldGlowMat.opacity = glowEnabled ? Math.min(0.22, opacity * 0.36) : 0;
  shieldGlowMat.needsUpdate = true;
  playerShieldGlow.scale.setScalar(radius);
  playerShieldGlow.visible = !!p.shieldVisible && glowEnabled;

  // Bloom shell: a slightly larger sphere with very low additive opacity
  shieldBloomMat.color.set(color);
  shieldBloomMat.opacity = glowEnabled ? bloomIntensity * opacity * 0.6 : 0;
  shieldBloomMat.needsUpdate = true;
  playerShieldBloom.scale.setScalar(radius * bloomRadius);
  playerShieldBloom.visible = !!p.shieldVisible && glowEnabled && bloomIntensity > 0;
}

applyShieldSettings();

// ── Rebuild geometry at runtime ────────────────────────────────────────────────
// The panel calls this after changing playerRadius or playerLength.
export function rebuildPlayerGeo() {
  const p = state.params;
  const newGeo = new THREE.CapsuleGeometry(p.playerRadius, p.playerLength, 8, 16);
  playerMesh.geometry.dispose();
  playerMesh.geometry = newGeo;
  playerGeo = newGeo;
  playerMesh.position.y = p.playerRadius + p.playerLength / 2;
  applyPlayerContactShadow();
  applyShieldSettings();
}

// ── Apply material from params ─────────────────────────────────────────────────
export function applyPlayerMaterial() {
  const p = state.params;
  playerMat.color.set(p.playerColor);
  playerBaseColor.copy(playerMat.color);
  playerMat.metalness = p.playerMetalness;
  playerMat.roughness = p.playerRoughness;
  playerMat.needsUpdate = true;
}

// ── Dash ghost afterimages ─────────────────────────────────────────────────────
// Each ghost has its own material instance so it can be made transparent
// without affecting others. The material is disposed when the ghost fades out.
function stampDashGhost() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: playerBaseColor.clone(),
    metalness: playerMat.metalness,
    roughness: playerMat.roughness,
    transparent: true, opacity: 0.45, depthWrite: false,
  });
  const ghost = new THREE.Group();
  ghost.position.copy(playerGroup.position);
  const inner = new THREE.Mesh(playerGeo, mat);
  inner.position.copy(playerMesh.position);
  inner.rotation.copy(playerMesh.rotation);
  ghost.add(inner);
  scene.add(ghost);
  state.dashStreaks.push({ mesh: ghost, mat, life: 0.25, maxLife: 0.25 });
}

export function updateDashStreaks(delta) {
  for (let i = state.dashStreaks.length - 1; i >= 0; i--) {
    const ds = state.dashStreaks[i];
    ds.life -= delta;
    if (ds.life <= 0) {
      scene.remove(ds.mesh);
      ds.mat.dispose(); // free GPU resource
      state.dashStreaks.splice(i, 1);
    } else {
      ds.mat.opacity = (ds.life / ds.maxLife) * 0.45;
    }
  }
}

// ── Per-frame update ───────────────────────────────────────────────────────────

function updateJump(delta) {
  const p = state.params;

  if (!p.jumpEnabled) {
    state.jumpQueued = false;
    state.jumpVelocity = 0;
    state.jumpGrounded = true;
    playerGroup.position.y = 0;
    return;
  }

  const jumpForce = Math.max(0, Number(p.jumpForce) || 0);
  const gravity = Math.max(1, Number(p.jumpGravity) || 26);

  if (state.jumpQueued && state.jumpGrounded) {
    state.jumpVelocity = jumpForce;
    state.jumpGrounded = false;
  }
  state.jumpQueued = false;

  if (!state.jumpGrounded || playerGroup.position.y > 0) {
    state.jumpVelocity -= gravity * delta;
    playerGroup.position.y += state.jumpVelocity * delta;

    if (playerGroup.position.y <= 0) {
      playerGroup.position.y = 0;
      state.jumpVelocity = 0;
      state.jumpGrounded = true;
    }
  }
}

const _v = new THREE.Vector3();

export function updatePlayer(delta, moveForward, moveRight) {
  const p = state.params;
  updateJump(delta);
  applyPlayerContactShadow();

  // Walking — poll state.keys each frame + analogue controller left stick
  _v.set(0, 0, 0);
  if (state.keys.w) _v.addScaledVector(moveForward,  1);
  if (state.keys.s) _v.addScaledVector(moveForward, -1);
  if (state.keys.a) _v.addScaledVector(moveRight,   -1);
  if (state.keys.d) _v.addScaledVector(moveRight,    1);

  // Blend analogue stick — the stick values are already post-deadzone in [-1,1].
  // Keyboard wins if both are active; analogue adds on top for diagonal precision.
  const ctrlX = state.controllerMoveX || 0;
  const ctrlZ = state.controllerMoveZ || 0;
  if (ctrlX !== 0 || ctrlZ !== 0) {
    // ctrlZ is forward on the stick (negative Y axis = forward in 3-D)
    _v.addScaledVector(moveForward, -ctrlZ);
    _v.addScaledVector(moveRight,    ctrlX);
  }

  // Clamp analogue blend to unit length so diagonal isn't faster.
  const lenSq = _v.lengthSq();
  if (lenSq > 0) {
    if (lenSq > 1) _v.normalize();
    // Preserve analogue speed scaling when only controller is used.
    const speed = (state.keys.w || state.keys.s || state.keys.a || state.keys.d)
      ? p.playerSpeed
      : p.playerSpeed * Math.min(1, Math.sqrt(ctrlX * ctrlX + ctrlZ * ctrlZ) || 1);
    state.lastMoveX = _v.x;
    state.lastMoveZ = _v.z;
    playerGroup.position.addScaledVector(_v, speed * delta);
  }

  // Dash — shunts in a fixed direction at higher speed while dashTimer > 0
  if (state.dashTimer > 0) {
    state.dashTimer -= delta;
    playerGroup.position.x += state.dashVX * p.dashSpeed * delta;
    playerGroup.position.z += state.dashVZ * p.dashSpeed * delta;
    playerMesh.rotation.z   = state.dashVX * -0.35;
    state.dashGhostTimer -= delta;
    if (state.dashGhostTimer <= 0) {
      stampDashGhost();
      state.dashGhostTimer = 0.04; // stamp a ghost every 40ms
    }
  } else {
    playerMesh.rotation.z += (0 - playerMesh.rotation.z) * 12 * delta;
  }

  if (state.dashCooldown > 0) {
    state.dashCooldown = Math.max(0, state.dashCooldown - delta);
  }

  // Lean — mesh tilts slightly in direction of travel
  // lerp factor 10*delta reaches ~63% of target in 0.1s — responsive without snapping
  const LEAN = 0.25;
  if (state.dashTimer <= 0) {
    if (_v.lengthSq() > 0) {
      const mv = _v.clone().normalize();
      playerMesh.rotation.x += ( mv.z * LEAN - playerMesh.rotation.x) * 10 * delta;
      playerMesh.rotation.z += (-mv.x * LEAN - playerMesh.rotation.z) * 10 * delta;
    } else {
      playerMesh.rotation.x += (0 - playerMesh.rotation.x) * 10 * delta;
      playerMesh.rotation.z += (0 - playerMesh.rotation.z) * 10 * delta;
    }
  }
}
