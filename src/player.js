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
  playerContactShadow.scale.set(contactSize, contactSize, 1);
  playerContactShadow.visible = !!p.shadows && !!p.showFloor;
}

applyPlayerContactShadow();


// ── Hex shield ────────────────────────────────────────────────────────────────
// A player-attached Goldberg-style shield. It is generated as the dual of a
// subdivided icosahedron, so the cells share edges and fit together cleanly.
// A closed spherical tiling cannot be made from only hexagons; this creates
// mostly hexagons with the required pentagon cells at the geodesic seams.
let _shieldGeometryKey = '';

const shieldGroup = new THREE.Group();
shieldGroup.name = 'PlayerHexShield';
playerGroup.add(shieldGroup);

const shieldPanelMat = new THREE.MeshBasicMaterial({
  color: 0x1e7bff,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

const shieldLineMat = new THREE.MeshBasicMaterial({
  color: 0x1e7bff,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

const shieldGlowMat = new THREE.MeshBasicMaterial({
  color: 0x1e7bff,
  transparent: true,
  opacity: 0.08,
  depthWrite: false,
  side: THREE.DoubleSide,
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

function shieldDetailFromHexSize(radius, hexSize) {
  const ratio = hexSize / Math.max(0.2, radius);
  if (ratio <= 0.09) return 3;
  if (ratio <= 0.22) return 2;
  return 1;
}

function vectorKey(v, precision = 100000) {
  return `${Math.round(v.x * precision)},${Math.round(v.y * precision)},${Math.round(v.z * precision)}`;
}

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function pushVector(target, v) {
  target.push(v.x, v.y, v.z);
}

function getTriangleData(radius, detail) {
  const source = new THREE.IcosahedronGeometry(radius, detail);
  const pos = source.getAttribute('position');
  const index = source.index;
  const vertices = [];
  const vertexLookup = new Map();
  const faces = [];
  const vertexFaces = [];

  function getVertexIndex(sourceIndex) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, sourceIndex).normalize().multiplyScalar(radius);
    const key = vectorKey(v);
    let uniqueIndex = vertexLookup.get(key);
    if (uniqueIndex === undefined) {
      uniqueIndex = vertices.length;
      vertexLookup.set(key, uniqueIndex);
      vertices.push(v);
      vertexFaces.push([]);
    }
    return uniqueIndex;
  }

  const triangleCount = index ? index.count / 3 : pos.count / 3;
  for (let i = 0; i < triangleCount; i++) {
    const a = getVertexIndex(index ? index.getX(i * 3) : i * 3);
    const b = getVertexIndex(index ? index.getX(i * 3 + 1) : i * 3 + 1);
    const c = getVertexIndex(index ? index.getX(i * 3 + 2) : i * 3 + 2);
    if (a === b || b === c || c === a) continue;

    const faceIndex = faces.length;
    faces.push([a, b, c]);
    vertexFaces[a].push(faceIndex);
    vertexFaces[b].push(faceIndex);
    vertexFaces[c].push(faceIndex);
  }

  const faceCenters = faces.map(([a, b, c]) => (
    new THREE.Vector3()
      .add(vertices[a])
      .add(vertices[b])
      .add(vertices[c])
      .multiplyScalar(1 / 3)
      .normalize()
      .multiplyScalar(radius)
  ));

  source.dispose();
  return { vertices, vertexFaces, faceCenters };
}

function sortCellCorners(normal, corners) {
  const tangentA = new THREE.Vector3(0, 1, 0).cross(normal);
  if (tangentA.lengthSq() < 0.0001) {
    tangentA.set(1, 0, 0).cross(normal);
  }
  tangentA.normalize();

  const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();

  corners.sort((a, b) => {
    const angleA = Math.atan2(a.dot(tangentB), a.dot(tangentA));
    const angleB = Math.atan2(b.dot(tangentB), b.dot(tangentA));
    return angleA - angleB;
  });
}

function sphericalLerp(a, b, t, radius) {
  const start = a.clone().normalize();
  const end = b.clone().normalize();
  const dot = Math.max(-1, Math.min(1, start.dot(end)));
  const theta = Math.acos(dot);

  if (theta < 0.000001) {
    return start.lerp(end, t).normalize().multiplyScalar(radius);
  }

  const sinTheta = Math.sin(theta);
  return start
    .multiplyScalar(Math.sin((1 - t) * theta) / sinTheta)
    .add(end.multiplyScalar(Math.sin(t * theta) / sinTheta))
    .normalize()
    .multiplyScalar(radius);
}

function sphericalTrianglePoint(a, b, c, u, v, radius) {
  return new THREE.Vector3()
    .addScaledVector(a, 1 - u - v)
    .addScaledVector(b, u)
    .addScaledVector(c, v)
    .normalize()
    .multiplyScalar(radius);
}

function addCurvedShieldTriangle(targetVertices, targetIndices, a, b, c, radius, subdivisions) {
  const rows = [];

  for (let i = 0; i <= subdivisions; i++) {
    const row = [];
    for (let j = 0; j <= subdivisions - i; j++) {
      const u = i / subdivisions;
      const v = j / subdivisions;
      const point = sphericalTrianglePoint(a, b, c, u, v, radius);
      const index = targetVertices.length / 3;
      pushVector(targetVertices, point);
      row.push(index);
    }
    rows.push(row);
  }

  for (let i = 0; i < subdivisions; i++) {
    for (let j = 0; j < subdivisions - i; j++) {
      const a0 = rows[i][j];
      const b0 = rows[i + 1][j];
      const c0 = rows[i][j + 1];
      targetIndices.push(a0, b0, c0);

      if (j < subdivisions - i - 1) {
        const d0 = rows[i + 1][j + 1];
        targetIndices.push(b0, d0, c0);
      }
    }
  }
}

function addCurvedShieldLine(targetVertices, targetIndices, start, end, radius, thickness) {
  const angle = start.clone().normalize().angleTo(end.clone().normalize());
  const segments = Math.max(4, Math.min(14, Math.ceil(angle / 0.045)));
  const halfThickness = Math.max(0.001, thickness) / 2;
  const samples = [];

  for (let i = 0; i <= segments; i++) {
    samples.push(sphericalLerp(start, end, i / segments, radius));
  }

  const baseIndex = targetVertices.length / 3;

  for (let i = 0; i <= segments; i++) {
    const point = samples[i];
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(segments, i + 1)];
    const tangent = next.clone().sub(prev).normalize();
    let side = new THREE.Vector3().crossVectors(point.clone().normalize(), tangent);

    if (side.lengthSq() < 0.000001) side = new THREE.Vector3(1, 0, 0);
    side.normalize();

    const left = point.clone().addScaledVector(side, halfThickness).normalize().multiplyScalar(radius);
    const right = point.clone().addScaledVector(side, -halfThickness).normalize().multiplyScalar(radius);
    pushVector(targetVertices, left);
    pushVector(targetVertices, right);
  }

  for (let i = 0; i < segments; i++) {
    const left0 = baseIndex + i * 2;
    const right0 = left0 + 1;
    const left1 = baseIndex + (i + 1) * 2;
    const right1 = left1 + 1;
    targetIndices.push(left0, left1, right0);
    targetIndices.push(right0, left1, right1);
  }
}

function buildGoldbergShieldGeometry(radius, detail, lineThickness) {
  const { vertices, vertexFaces, faceCenters } = getTriangleData(radius, detail);
  const panelVertices = [];
  const panelIndices = [];
  const lineVertices = [];
  const lineIndices = [];
  const lineLookup = new Map();
  const panelSubdivisions = Math.max(3, 6 - detail);

  for (let i = 0; i < vertices.length; i++) {
    const adjacentFaces = vertexFaces[i];
    if (adjacentFaces.length < 3) continue;

    const normal = vertices[i].clone().normalize();
    const corners = adjacentFaces.map(faceIndex => faceCenters[faceIndex].clone().normalize().multiplyScalar(radius));
    sortCellCorners(normal, corners);

    const cellCenter = vertices[i].clone().normalize().multiplyScalar(radius);

    for (let j = 0; j < corners.length; j++) {
      const currentCorner = corners[j];
      const nextCorner = corners[(j + 1) % corners.length];
      addCurvedShieldTriangle(
        panelVertices,
        panelIndices,
        cellCenter,
        currentCorner,
        nextCorner,
        radius,
        panelSubdivisions
      );

      const ka = vectorKey(currentCorner);
      const kb = vectorKey(nextCorner);
      const key = edgeKey(ka, kb);
      if (!lineLookup.has(key)) {
        lineLookup.set(key, true);
        addCurvedShieldLine(lineVertices, lineIndices, currentCorner, nextCorner, radius, lineThickness);
      }
    }
  }

  const panelGeometry = new THREE.BufferGeometry();
  panelGeometry.setAttribute('position', new THREE.Float32BufferAttribute(panelVertices, 3));
  panelGeometry.setIndex(panelIndices);
  panelGeometry.computeVertexNormals();
  panelGeometry.computeBoundingSphere();

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lineVertices, 3));
  lineGeometry.setIndex(lineIndices);
  lineGeometry.computeVertexNormals();
  lineGeometry.computeBoundingSphere();

  return { panelGeometry, lineGeometry };
}

function rebuildShieldCells(radius, hexSize, lineThickness) {
  const detail = shieldDetailFromHexSize(radius, hexSize);
  const key = `${radius.toFixed(4)}:${hexSize.toFixed(4)}:${lineThickness.toFixed(4)}:${detail}`;
  if (_shieldGeometryKey === key) return;
  _shieldGeometryKey = key;

  const { panelGeometry, lineGeometry } = buildGoldbergShieldGeometry(radius, detail, lineThickness);

  playerShield.geometry.dispose();
  playerShield.geometry = panelGeometry;

  playerShieldLines.geometry.dispose();
  playerShieldLines.geometry = lineGeometry;
}

// ── Apply shield from params ──────────────────────────────────────────────────
export function applyShieldSettings() {
  const p = state.params;
  const radius = Math.max(0.2, Number(p.shieldRadius) || 1.35);
  const hexSize = Math.max(0.03, Number(p.shieldHexSize) || 0.22);
  const opacity = Math.max(0, Math.min(1, Number(p.shieldOpacity) || 0.22));
  const lineThickness = Math.max(0.001, Number(p.shieldLineThickness) || 0.012);
  const color = p.shieldColor || '#1e7bff';
  const glowEnabled = !!p.shieldGlow;

  rebuildShieldCells(radius, hexSize, lineThickness);

  shieldGroup.visible = !!p.shieldVisible;
  shieldGroup.position.y = playerMesh.position.y;

  shieldPanelMat.color.set(color);
  shieldPanelMat.opacity = opacity;
  shieldPanelMat.needsUpdate = true;

  shieldLineMat.color.set(color);
  shieldLineMat.opacity = glowEnabled ? Math.min(1, opacity * 3.2) : Math.min(1, opacity * 1.9);
  shieldLineMat.needsUpdate = true;

  shieldGlowMat.color.set(color);
  shieldGlowMat.opacity = glowEnabled ? Math.min(0.22, opacity * 0.36) : 0;
  shieldGlowMat.needsUpdate = true;
  playerShieldGlow.scale.setScalar(radius);
  playerShieldGlow.visible = !!p.shieldVisible && glowEnabled;
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
const _v = new THREE.Vector3();

export function updatePlayer(delta, moveForward, moveRight) {
  const p = state.params;
  applyPlayerContactShadow();

  // Walking — poll state.keys each frame
  _v.set(0, 0, 0);
  if (state.keys.w) _v.addScaledVector(moveForward,  1);
  if (state.keys.s) _v.addScaledVector(moveForward, -1);
  if (state.keys.a) _v.addScaledVector(moveRight,   -1);
  if (state.keys.d) _v.addScaledVector(moveRight,    1);

  if (_v.lengthSq() > 0) {
    _v.normalize();
    state.lastMoveX = _v.x;
    state.lastMoveZ = _v.z;
    playerGroup.position.addScaledVector(_v, p.playerSpeed * delta);
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
