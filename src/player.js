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
