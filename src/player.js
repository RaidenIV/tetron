// ─── player.js ────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { scene } from './renderer.js';
import { state } from './state.js';
import { DASH_SPEED, DASH_DURATION, DASH_COOLDOWN } from './constants.js';
import { playerGeo, playerMat, playerBaseColor, playerGeoParams, floorY } from './materials.js';

// ── Scene graph ───────────────────────────────────────────────────────────────
export const playerGroup = new THREE.Group();
scene.add(playerGroup);

export const playerMesh = new THREE.Mesh(playerGeo, playerMat);
playerMesh.position.y = floorY(playerGeoParams);
playerMesh.castShadow = true;
playerGroup.add(playerMesh);

export const PLAYER_BODY_RADIUS = 0.6;

// ── Health bar (CSS2D) ────────────────────────────────────────────────────────
const hbWrap = document.createElement('div');
hbWrap.className = 'health-bar-wrap';
export const hbFill = document.createElement('div');
hbFill.className = 'health-bar-fill';
hbWrap.appendChild(hbFill);
export const hbObj = new CSS2DObject(hbWrap);
hbObj.position.set(0, 2.6, 0);
playerGroup.add(hbObj);

export function updateHealthBar() {
  const maxHP = state.params.playerMaxHP;
  const pct   = Math.max(0, state.playerHP / maxHP) * 100;
  hbFill.style.width = pct + '%';
  hbFill.style.background = pct < 30
    ? 'linear-gradient(to right,#006600,#00aa00)'
    : 'linear-gradient(to right,#00aa00,#44ff44)';
}

// ── Dash cooldown bar ─────────────────────────────────────────────────────────
const dashWrap = document.createElement('div');
dashWrap.style.cssText = 'width:72px;height:5px;background:rgba(0,0,0,0.6);border:1px solid rgba(0,180,255,0.35);border-radius:3px;overflow:hidden;margin-top:1px;';
const dashFillEl = document.createElement('div');
dashFillEl.style.cssText = 'height:100%;width:100%;background:linear-gradient(to right,#0088cc,#00ccff);border-radius:3px;transition:width 0.05s linear;';
dashWrap.appendChild(dashFillEl);
export const dashBarObj = new CSS2DObject(dashWrap);
dashBarObj.position.set(0, 2.48, 0);
dashBarObj.visible = false;
playerGroup.add(dashBarObj);

export function updateDashBar() {
  if (!state.params.playerDashEnabled) { dashBarObj.visible = false; return; }
  dashBarObj.visible = true;
  const denom = Math.max(0.01, state.dashCooldownMax || (DASH_COOLDOWN * 2));
  const pct   = state.dashCooldown > 0 ? Math.max(0, 1 - state.dashCooldown / denom) : 1;
  dashFillEl.style.width = (pct * 100) + '%';
}

// ── Dash ghost afterimages ────────────────────────────────────────────────────
export function stampDashGhost() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: playerBaseColor.clone(),
    metalness: playerMat.metalness,
    roughness: playerMat.roughness,
    transparent: true, opacity: 0.55, depthWrite: false,
  });
  const ghost = new THREE.Group();
  ghost.position.copy(playerGroup.position);
  const inner = new THREE.Mesh(playerGeo, mat);
  inner.position.copy(playerMesh.position);
  inner.rotation.copy(playerMesh.rotation);
  ghost.add(inner);
  scene.add(ghost);
  const FADE = 0.28;
  state.dashStreaks.push({ mesh: ghost, mat, life: FADE, maxLife: FADE });
}

export function updateDashStreaks(delta) {
  for (let i = state.dashStreaks.length - 1; i >= 0; i--) {
    const ds = state.dashStreaks[i];
    ds.life -= delta;
    if (ds.life <= 0) {
      scene.remove(ds.mesh);
      ds.mat.dispose();
      state.dashStreaks.splice(i, 1);
      continue;
    }
    ds.mat.opacity = (ds.life / ds.maxLife) * 0.55;
  }
}

// ── Per-frame player update ───────────────────────────────────────────────────
const _v = new THREE.Vector3();

export function updatePlayer(delta, moveForward, moveRight) {
  const p = state.params;

  _v.set(0, 0, 0);
  if (state.keys.w) _v.addScaledVector(moveForward,  1);
  if (state.keys.s) _v.addScaledVector(moveForward, -1);
  if (state.keys.a) _v.addScaledVector(moveRight,   -1);
  if (state.keys.d) _v.addScaledVector(moveRight,    1);

  if (_v.lengthSq() > 0) {
    _v.normalize();
    state.lastMoveX = _v.x;
    state.lastMoveZ = _v.z;
    _v.multiplyScalar(p.playerSpeed * delta);
    playerGroup.position.add(_v);
  }

  // Dash
  if (state.dashTimer > 0) {
    state.dashTimer -= delta;
    playerGroup.position.x += state.dashVX * DASH_SPEED * delta;
    playerGroup.position.z += state.dashVZ * DASH_SPEED * delta;
    playerMesh.rotation.z   = state.dashVX * -0.4;
    state.dashGhostTimer -= delta;
    if (state.dashGhostTimer <= 0) { stampDashGhost(); state.dashGhostTimer = 0.035; }
  }
  if (state.dashCooldown > 0) {
    state.dashCooldown -= delta;
    if (state.dashCooldown < 0) state.dashCooldown = 0;
  }
  updateDashBar();

  if (state.dashTimer <= 0) {
    playerMat.color.copy(playerBaseColor);
    playerMat.emissive.setRGB(0, 0, 0);
    playerMat.emissiveIntensity = 1.0;
  }

  // Lean in movement direction
  if (state.dashTimer <= 0) {
    const LEAN = 0.28;
    if (_v.lengthSq() > 0) {
      const mv = _v.clone().normalize();
      playerMesh.rotation.x += ( mv.z * LEAN - playerMesh.rotation.x) * 12 * delta;
      playerMesh.rotation.z += (-mv.x * LEAN - playerMesh.rotation.z) * 12 * delta;
    } else {
      playerMesh.rotation.x += (0 - playerMesh.rotation.x) * 12 * delta;
      playerMesh.rotation.z += (0 - playerMesh.rotation.z) * 12 * delta;
    }
  }
}
