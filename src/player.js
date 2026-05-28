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
// A screen-visible, player-attached geodesic-style shield made from tangent
// hexagonal panels plus an additive blue glow shell.
const SHIELD_CELL_COUNT = 92;
const _shieldAxis = new THREE.Vector3(0, 0, 1);
const _shieldNormal = new THREE.Vector3();
const _shieldPos = new THREE.Vector3();
const _shieldQuat = new THREE.Quaternion();
const _shieldScale = new THREE.Vector3();
const _shieldMatrix = new THREE.Matrix4();
const _shieldEdgeA = new THREE.Vector3();
const _shieldEdgeB = new THREE.Vector3();
let _shieldGeometryKey = '';

const shieldGroup = new THREE.Group();
shieldGroup.name = 'PlayerHexShield';
playerGroup.add(shieldGroup);

const shieldHexGeo = new THREE.CircleGeometry(1, 6);
shieldHexGeo.rotateZ(Math.PI / 6);

const shieldPanelMat = new THREE.MeshBasicMaterial({
  color: 0x1e7bff,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

const shieldLineMat = new THREE.LineBasicMaterial({
  color: 0x1e7bff,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
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

export const playerShield = new THREE.InstancedMesh(
  shieldHexGeo,
  shieldPanelMat,
  SHIELD_CELL_COUNT
);
playerShield.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
playerShield.frustumCulled = false;
playerShield.renderOrder = 6;
shieldGroup.add(playerShield);

export const playerShieldLines = new THREE.LineSegments(
  new THREE.BufferGeometry(),
  shieldLineMat
);
playerShieldLines.frustumCulled = false;
playerShieldLines.renderOrder = 7;
shieldGroup.add(playerShieldLines);

export const playerShieldGlow = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1, 3),
  shieldGlowMat
);
playerShieldGlow.frustumCulled = false;
playerShieldGlow.renderOrder = 5;
shieldGroup.add(playerShieldGlow);

function rebuildShieldCells(radius, hexSize) {
  const key = `${radius.toFixed(4)}:${hexSize.toFixed(4)}`;
  if (_shieldGeometryKey === key) return;
  _shieldGeometryKey = key;

  const lineVertices = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < SHIELD_CELL_COUNT; i++) {
    const t = SHIELD_CELL_COUNT === 1 ? 0.5 : i / (SHIELD_CELL_COUNT - 1);
    const y = 1 - t * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * goldenAngle;

    _shieldNormal.set(
      Math.cos(theta) * r,
      y,
      Math.sin(theta) * r
    ).normalize();

    _shieldPos.copy(_shieldNormal).multiplyScalar(radius);
    _shieldQuat.setFromUnitVectors(_shieldAxis, _shieldNormal);
    _shieldScale.set(hexSize, hexSize, 1);
    _shieldMatrix.compose(_shieldPos, _shieldQuat, _shieldScale);
    playerShield.setMatrixAt(i, _shieldMatrix);

    for (let j = 0; j < 6; j++) {
      const a = Math.PI / 6 + (j / 6) * Math.PI * 2;
      const b = Math.PI / 6 + ((j + 1) / 6) * Math.PI * 2;
      _shieldEdgeA.set(Math.cos(a) * hexSize, Math.sin(a) * hexSize, 0)
        .applyQuaternion(_shieldQuat)
        .add(_shieldPos);
      _shieldEdgeB.set(Math.cos(b) * hexSize, Math.sin(b) * hexSize, 0)
        .applyQuaternion(_shieldQuat)
        .add(_shieldPos);
      lineVertices.push(
        _shieldEdgeA.x, _shieldEdgeA.y, _shieldEdgeA.z,
        _shieldEdgeB.x, _shieldEdgeB.y, _shieldEdgeB.z
      );
    }
  }

  playerShield.instanceMatrix.needsUpdate = true;

  const nextLineGeo = new THREE.BufferGeometry();
  nextLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineVertices, 3));
  nextLineGeo.computeBoundingSphere();
  playerShieldLines.geometry.dispose();
  playerShieldLines.geometry = nextLineGeo;
}

// ── Apply shield from params ──────────────────────────────────────────────────
export function applyShieldSettings() {
  const p = state.params;
  const radius = Math.max(0.2, Number(p.shieldRadius) || 1.35);
  const hexSize = Math.max(0.03, Number(p.shieldHexSize) || 0.22);
  const opacity = Math.max(0, Math.min(1, Number(p.shieldOpacity) || 0.22));
  const color = p.shieldColor || '#1e7bff';
  const glowEnabled = !!p.shieldGlow;

  rebuildShieldCells(radius, hexSize);

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
  playerShieldGlow.scale.setScalar(radius * 1.04);
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
