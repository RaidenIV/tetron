// ─── player.js ────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';

// ── Geometry & material ────────────────────────────────────────────────────────
export let playerGeoParams = { radius: 0.4, length: 1.2, capSegs: 8, radial: 16 };

export const playerMat = new THREE.MeshPhysicalMaterial({
  color: 0x0044cc,
  metalness: 0.67, roughness: 0.0,
  clearcoat: 1.0, clearcoatRoughness: 0.0,
});
export const playerBaseColor = playerMat.color.clone();

function makeGeo(p) {
  return new THREE.CapsuleGeometry(p.radius, p.length, p.capSegs, p.radial);
}
export let playerGeo = makeGeo(playerGeoParams);

// ── Scene objects ──────────────────────────────────────────────────────────────
export const playerGroup = new THREE.Group();
scene.add(playerGroup);

export const playerMesh = new THREE.Mesh(playerGeo, playerMat);
playerMesh.castShadow    = true;
playerMesh.position.y    = playerGeoParams.radius + playerGeoParams.length / 2;
playerGroup.add(playerMesh);

// ── Rebuild geometry from params ───────────────────────────────────────────────
export function rebuildPlayerGeo() {
  const p = state.params;
  playerGeoParams.radius = p.playerRadius;
  playerGeoParams.length = p.playerLength;
  const newGeo = makeGeo(playerGeoParams);
  playerMesh.geometry.dispose();
  playerMesh.geometry = newGeo;
  playerGeo = newGeo;
  playerMesh.position.y = p.playerRadius + p.playerLength / 2;
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
function stampDashGhost() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: playerBaseColor.clone(),
    metalness: playerMat.metalness, roughness: playerMat.roughness,
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
      ds.mat.dispose();
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

  // ── Walking ────────────────────────────────────────────────────────────────
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

  // ── Dash ───────────────────────────────────────────────────────────────────
  if (state.dashTimer > 0) {
    state.dashTimer -= delta;
    playerGroup.position.x += state.dashVX * p.dashSpeed * delta;
    playerGroup.position.z += state.dashVZ * p.dashSpeed * delta;
    playerMesh.rotation.z   = state.dashVX * -0.35;
    state.dashGhostTimer -= delta;
    if (state.dashGhostTimer <= 0) { stampDashGhost(); state.dashGhostTimer = 0.04; }
  } else {
    playerMesh.rotation.z += (0 - playerMesh.rotation.z) * 12 * delta;
  }

  if (state.dashCooldown > 0) {
    state.dashCooldown = Math.max(0, state.dashCooldown - delta);
  }

  // ── Lean in movement direction ─────────────────────────────────────────────
  if (state.dashTimer <= 0) {
    const LEAN = 0.25;
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
