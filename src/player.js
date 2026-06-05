// src/player.js
import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { resolveCircleAgainstPlacedObjects, getWalkablePlacedObjectHeight } from './placer.js';
import { registerManagedAudio, applyBulletTimeAudioPitch, setManagedAudioVolume } from './audio.js';

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

let _jumpSoundEl = null;

function getOverallBloomFactor() {
  const raw = Number(state.params.overallBloomIntensity);
  const value = Number.isFinite(raw) ? raw : 1;
  return Math.min(4, Math.max(0, value));
}

function playJumpSound() {
  if (state.params.soundMuted) return;
  const master = Number(state.params.soundSfxVolume ?? 1);
  const jumpVol = Number(state.params.soundSfx_jump ?? 1);
  const volume = Math.max(0, Math.min(1, master * jumpVol));
  if (volume <= 0) return;
  if (!_jumpSoundEl) _jumpSoundEl = registerManagedAudio(new Audio('./assets/jump.wav'));
  const sound = _jumpSoundEl.paused ? _jumpSoundEl : _jumpSoundEl.cloneNode();
  registerManagedAudio(sound, 1);
  setManagedAudioVolume(sound, volume);
  applyBulletTimeAudioPitch(sound);
  sound.currentTime = 0;
  sound.play().catch(() => {});
}


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
  const groundHeight = getWalkablePlacedObjectHeight(
    playerGroup.position,
    Math.max(0.25, Number(p.playerRadius) || 0.4)
  );
  playerContactShadow.position.y = groundHeight + 0.008 - playerGroup.position.y;
  playerContactShadow.scale.set(contactSize, contactSize, 1);
  playerContactShadow.visible = !!p.shadows && !!p.showFloor;
}

applyPlayerContactShadow();

// ── Right-hand player weapon visual ───────────────────────────────────────────
// The weapon is a lightweight geometric prop attached to the player capsule. The
// rifle uses a 1.125-unit rectangular prism and sits on the player's right side.
const playerWeaponGroup = new THREE.Group();
playerWeaponGroup.name = 'PlayerWeapon_RightHand';
playerGroup.add(playerWeaponGroup);

const playerWeaponMat = new THREE.MeshStandardMaterial({
  color: 0x20242b,
  metalness: 0.55,
  roughness: 0.38,
});

const playerWeaponMuzzle = new THREE.Object3D();
playerWeaponGroup.add(playerWeaponMuzzle);

let playerWeaponMesh = null;
let playerWeaponModelKey = '';
let playerWeaponLength = 1.125;

// ── Player death corpse physics ───────────────────────────────────────────────
// Player death uses the same visible pattern as enemy/ally deaths: the live
// player mesh is hidden and replaced by a standalone physics corpse that tumbles,
// settles on the floor, and fades out before respawn.
const PLAYER_CORPSE_GRAVITY = 9;
let playerPhysicsCorpse = null;
const _corpseBox = new THREE.Box3();
const _corpseWorldPos = new THREE.Vector3();
const _corpseWorldQuat = new THREE.Quaternion();
const _corpseUp = new THREE.Vector3(0, 1, 0);
const _corpseRestAxis = new THREE.Vector3();
const _corpseRestQuat = new THREE.Quaternion();

const _weaponForwardLocal = new THREE.Vector3(0, 0, -1);
const _weaponUp = new THREE.Vector3(0, 1, 0);
const _weaponWorldPos = new THREE.Vector3();
const _weaponAimDir = new THREE.Vector3();
const _weaponAimQuat = new THREE.Quaternion();
const _weaponParentWorldQuat = new THREE.Quaternion();
const _weaponParentInvQuat = new THREE.Quaternion();
const _weaponAimMatrix = new THREE.Matrix4();
const _weaponRecoilLocal = new THREE.Vector3();
let _weaponRecoilOffset = 0;


function getPlayerWeaponType() {
  const type = state.params.playerWeaponType;
  return ['pistol', 'rifle', 'shotgun', 'sniperRifle', 'grenades', 'rocketLauncher'].includes(type)
    ? type
    : 'rifle';
}

function getPlayerWeaponParamPrefix(type = getPlayerWeaponType()) {
  switch (type) {
    case 'pistol': return 'Pistol';
    case 'shotgun': return 'Shotgun';
    case 'sniperRifle': return 'Sniper';
    case 'grenades': return 'Grenade';
    case 'rocketLauncher': return 'Rocket';
    case 'rifle':
    default: return 'Rifle';
  }
}

function getWeaponNumericParam(type, field, fallback, min, max) {
  const prefix = getPlayerWeaponParamPrefix(type);
  const value = Number(state.params[`weapon${prefix}${field}`]);
  const resolved = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, resolved));
}

function getPlayerWeaponOffsetX(type = getPlayerWeaponType()) {
  return getWeaponNumericParam(type, 'OffsetX', 0, -2, 2);
}

function getPlayerWeaponOffsetY(type = getPlayerWeaponType()) {
  return getWeaponNumericParam(type, 'OffsetY', 0, -2, 2);
}

function getPlayerHeldWeaponColor(type = getPlayerWeaponType()) {
  if (type !== 'grenades') return '#20242b';
  const color = String(state.params.weaponGrenadeProjectileColor || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#ff8844';
}

function getPlayerWeaponRecoil(type = getPlayerWeaponType()) {
  if (type === 'grenades') return 0;
  return getWeaponNumericParam(type, 'Recoil', 0, 0, 1);
}

export function triggerPlayerWeaponRecoil(type = getPlayerWeaponType(), recoilAmount = null) {
  if (type === 'grenades') return;
  const recoil = Number.isFinite(Number(recoilAmount))
    ? Math.min(1, Math.max(0, Number(recoilAmount)))
    : getPlayerWeaponRecoil(type);
  if (recoil <= 0) return;
  _weaponRecoilOffset = Math.max(_weaponRecoilOffset, recoil);
}

function getPlayerWeaponSpec(type = getPlayerWeaponType()) {
  switch (type) {
    case 'pistol':
      return { kind: 'box', width: 0.18, height: 0.16, length: 0.65, grip: 0.12 };
    case 'shotgun':
      return { kind: 'box', width: 0.2, height: 0.14, length: 1.35, grip: 0.16 };
    case 'sniperRifle':
      return { kind: 'box', width: 0.14, height: 0.12, length: 1.8, grip: 0.18 };
    case 'grenades':
      return { kind: 'sphere', width: 0.24, height: 0.24, length: 0.35, grip: 0.08 };
    case 'rocketLauncher':
      return { kind: 'cylinder', width: 0.28, height: 0.28, length: 1.35, grip: 0.2 };
    case 'rifle':
    default:
      return { kind: 'box', width: 0.08, height: 0.18, length: 1.125, grip: 0.16 };
  }
}

function disposePlayerWeaponMesh() {
  if (!playerWeaponMesh) return;
  playerWeaponGroup.remove(playerWeaponMesh);
  playerWeaponMesh.geometry?.dispose?.();
  playerWeaponMesh = null;
}

function rebuildPlayerWeaponVisual(type = getPlayerWeaponType()) {
  const spec = getPlayerWeaponSpec(type);
  disposePlayerWeaponMesh();

  let geo;
  if (spec.kind === 'sphere') {
    geo = new THREE.SphereGeometry(spec.width * 0.5, 16, 10);
  } else if (spec.kind === 'cylinder') {
    geo = new THREE.CylinderGeometry(spec.width * 0.5, spec.width * 0.5, spec.length, 14);
  } else {
    geo = new THREE.BoxGeometry(spec.width, spec.height, spec.length);
  }

  playerWeaponMesh = new THREE.Mesh(geo, playerWeaponMat);
  playerWeaponMesh.name = `PlayerWeapon_${type}`;
  playerWeaponMesh.castShadow = false;
  playerWeaponMesh.receiveShadow = false;

  if (spec.kind === 'cylinder') {
    playerWeaponMesh.rotation.x = Math.PI / 2;
    playerWeaponMesh.position.z = -spec.length * 0.5 + spec.grip;
  } else if (spec.kind === 'sphere') {
    playerWeaponMesh.position.z = -spec.length * 0.5;
  } else {
    playerWeaponMesh.position.z = -spec.length * 0.5 + spec.grip;
  }

  playerWeaponLength = spec.length;
  playerWeaponMuzzle.position.set(0, 0, -spec.length + spec.grip);
  playerWeaponGroup.add(playerWeaponMesh);
  playerWeaponModelKey = type;
}

export function applyPlayerWeaponSettings() {
  const type = getPlayerWeaponType();
  if (playerWeaponModelKey !== type || !playerWeaponMesh) {
    rebuildPlayerWeaponVisual(type);
  }
  playerWeaponMat.color.set(getPlayerHeldWeaponColor(type));
  playerWeaponMat.needsUpdate = true;
  syncPlayerWeaponRestPose();
}

function isVector3Like(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function playerWeaponHasAmmoForVisual(type) {
  if (state.params.weaponInfiniteAmmo === true) return true;
  const record = state.weaponAmmo?.[type];
  if (!record) return true;
  if (type === 'grenades') return Number(record.reserve) > 0;
  return Number(record.magazine) > 0;
}

function aimPlayerWeaponAt(targetPoint, fallbackYaw) {
  if (!isVector3Like(targetPoint)) {
    playerWeaponGroup.rotation.set(0, fallbackYaw, 0);
    return;
  }

  playerWeaponGroup.updateWorldMatrix(true, false);
  playerWeaponGroup.getWorldPosition(_weaponWorldPos);
  _weaponAimDir.copy(targetPoint).sub(_weaponWorldPos);
  if (_weaponAimDir.lengthSq() < 0.0001) {
    playerWeaponGroup.rotation.set(0, fallbackYaw, 0);
    return;
  }

  // Aim the visible prop's local -Z axis at the resolved world target while
  // preserving world-up, then convert the result into the player group's local
  // space. This gives regular aiming and ADS the same pitch/yaw behavior
  // without introducing unnecessary roll.
  _weaponAimDir.normalize();
  _weaponAimMatrix.lookAt(_weaponWorldPos, targetPoint, _weaponUp);
  _weaponAimQuat.setFromRotationMatrix(_weaponAimMatrix);
  playerGroup.getWorldQuaternion(_weaponParentWorldQuat);
  _weaponParentInvQuat.copy(_weaponParentWorldQuat).invert();
  playerWeaponGroup.quaternion.copy(_weaponParentInvQuat).multiply(_weaponAimQuat);
}


function syncPlayerWeaponRestPose() {
  const type = getPlayerWeaponType();
  const p = state.params;
  const az = Number(p.thirdAzimuth) || 0;
  const radius = Math.max(0.25, Number(p.playerRadius) || 0.4);
  const length = Math.max(0.4, Number(p.playerLength) || 1.2);
  const forwardX = -Math.sin(az);
  const forwardZ = -Math.cos(az);
  const rightX = Math.cos(az);
  const rightZ = -Math.sin(az);
  const weaponSideGap = 0.105;
  const rightOffset = radius + weaponSideGap + getPlayerWeaponOffsetX(type);
  const forwardOffset = type === 'grenades' ? 0.02 : 0.12;
  const baseWeaponHeight = radius + length * 0.56 + getPlayerWeaponOffsetY(type);

  playerWeaponGroup.position.set(
    rightX * rightOffset + forwardX * forwardOffset,
    baseWeaponHeight,
    rightZ * rightOffset + forwardZ * forwardOffset
  );
  playerWeaponGroup.rotation.set(0, az, 0);
  playerWeaponGroup.visible = true;
}

function updatePlayerWeaponVisual(delta = 0, aimTarget = null) {
  if ((state.activeSlot ?? 0) === 1) {
    playerWeaponGroup.visible = false;
    return;
  }
  applyPlayerWeaponSettings();
  const type = getPlayerWeaponType();
  const recoilRecover = Math.min(1, Math.max(0, Number(delta) || 0) * 18);
  _weaponRecoilOffset += (0 - _weaponRecoilOffset) * recoilRecover;
  if (_weaponRecoilOffset < 0.0005) _weaponRecoilOffset = 0;
  const p = state.params;
  const az = Number(p.thirdAzimuth) || 0;
  const radius = Math.max(0.25, Number(p.playerRadius) || 0.4);
  const length = Math.max(0.4, Number(p.playerLength) || 1.2);
  const forwardX = -Math.sin(az);
  const forwardZ = -Math.cos(az);
  const rightX = Math.cos(az);
  const rightZ = -Math.sin(az);
  const weaponSideGap = 0.105;
  const rightOffset = radius + weaponSideGap + getPlayerWeaponOffsetX(type);
  const forwardOffset = type === 'grenades' ? 0.02 : 0.12;
  const baseWeaponHeight = radius + length * 0.56 + getPlayerWeaponOffsetY(type);
  const adsLift = (state.isAiming && p.aimEnabled !== false) ? baseWeaponHeight * 0.25 : 0;

  playerWeaponGroup.position.set(
    rightX * rightOffset + forwardX * forwardOffset,
    baseWeaponHeight + adsLift,
    rightZ * rightOffset + forwardZ * forwardOffset
  );
  const shouldTrackAim = isVector3Like(aimTarget);
  if (shouldTrackAim) {
    aimPlayerWeaponAt(aimTarget, az);
  } else {
    playerWeaponGroup.rotation.set(0, az, 0);
  }
  if (_weaponRecoilOffset > 0) {
    _weaponRecoilLocal.set(0, 0, _weaponRecoilOffset).applyQuaternion(playerWeaponGroup.quaternion);
    playerWeaponGroup.position.add(_weaponRecoilLocal);
  }
  playerWeaponGroup.visible = true;
}

export function getPlayerWeaponMuzzle(out = new THREE.Vector3()) {
  const type = getPlayerWeaponType();
  if (playerWeaponModelKey !== type || !playerWeaponMesh) {
    rebuildPlayerWeaponVisual(type);
  }
  playerWeaponGroup.updateWorldMatrix(true, true);
  playerWeaponMuzzle.getWorldPosition(out);
  return out;
}

applyPlayerWeaponSettings();


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

// ── Shield materials — Fresnel rim effect ────────────────────────────────────
// Both the panel fill and the hex lines use a Fresnel shader:
//   alpha = opacity * pow(1 - dot(normal, viewDir), fresnelPower)
// This makes the shield nearly invisible head-on and bright at the silhouette rim,
// exactly like a real energy shield.
// The panel still writes to the depth buffer so rear hex lines are depth-occluded.

const _shieldFresnelUniforms = () => ({
  uColor:        { value: new THREE.Color(0x1e7bff) },
  uOpacity:      { value: 0.22 },
  uFresnelPower: { value: 3.0 },
  uRimMin:       { value: 0.0 },
});

const _shieldVertexShader = /* glsl */`
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    // World-space normal: use the inverse-transpose of modelMatrix.
    // For a uniformly scaled sphere this equals normalize(modelMatrix * vec4(normal,0)).
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir     = normalize(cameraPosition - worldPos.xyz);
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const _shieldFragmentShader = /* glsl */`
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uFresnelPower;
  uniform float uRimMin;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    // Both vectors in world space — Fresnel is camera-position-independent
    // so the rim always appears at the geometric silhouette regardless of orbit.
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(vViewDir);
    float ndotv = abs(dot(N, V));
    float fresnel = pow(1.0 - ndotv, uFresnelPower);
    fresnel = mix(uRimMin, 1.0, fresnel);
    float alpha = uOpacity * fresnel;
    gl_FragColor = vec4(uColor * alpha, alpha);
  }
`;

// Panel fill — Fresnel-shaded, depthWrite:true to occlude rear hex lines.
const shieldPanelMat = new THREE.ShaderMaterial({
  uniforms: _shieldFresnelUniforms(),
  vertexShader:   _shieldVertexShader,
  fragmentShader: _shieldFragmentShader,
  transparent: true,
  depthWrite: true,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  side: THREE.DoubleSide,
});

// Hex lines — Fresnel-shaded, no depth write (depth test blocks rear lines via panel).
const shieldLineMat = new THREE.ShaderMaterial({
  uniforms: {
    ..._shieldFresnelUniforms(),
    uOpacity:      { value: 0.72 },
    uFresnelPower: { value: 2.5 },
    uRimMin:       { value: 0.05 },
  },
  vertexShader:   _shieldVertexShader,
  fragmentShader: _shieldFragmentShader,
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
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

// ── Goldberg polyhedron hex shield ─────────────────────────────────────────────
// Built as the dual of a subdivided icosahedron (Goldberg polyhedron GP(n,0)).
// This gives a proper spherical tessellation: 12 pentagonal cells at the
// icosahedron vertices, all other cells hexagonal. The cells naturally tile the
// sphere without stretching, overlapping, or seams.
// The IcosahedronGeometry subdivision level controls cell density.


function shieldDetailFromHexSize(radius, hexSize) {
  const ratio = hexSize / Math.max(0.2, radius);
  if (ratio <= 0.09) return 3;
  if (ratio <= 0.18) return 2;
  return 1;
}

function vectorKey(v, precision = 100000) {
  return `${Math.round(v.x * precision)},${Math.round(v.y * precision)},${Math.round(v.z * precision)}`;
}

function edgeKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
function pushV(target, v) { target.push(v.x, v.y, v.z); }

function getTriangleData(radius, detail) {
  const source = new THREE.IcosahedronGeometry(radius, detail);
  const pos = source.getAttribute('position');
  const index = source.index;
  const vertices = [];
  const vertexLookup = new Map();
  const faces = [];
  const vertexFaces = [];

  function getVI(si) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, si).normalize().multiplyScalar(radius);
    const key = vectorKey(v);
    let ui = vertexLookup.get(key);
    if (ui === undefined) {
      ui = vertices.length;
      vertexLookup.set(key, ui);
      vertices.push(v);
      vertexFaces.push([]);
    }
    return ui;
  }

  const tc = index ? index.count / 3 : pos.count / 3;
  for (let i = 0; i < tc; i++) {
    const a = getVI(index ? index.getX(i*3)   : i*3);
    const b = getVI(index ? index.getX(i*3+1) : i*3+1);
    const c = getVI(index ? index.getX(i*3+2) : i*3+2);
    if (a === b || b === c || c === a) continue;
    const fi = faces.length;
    faces.push([a, b, c]);
    vertexFaces[a].push(fi);
    vertexFaces[b].push(fi);
    vertexFaces[c].push(fi);
  }

  const faceCenters = faces.map(([a, b, c]) =>
    new THREE.Vector3().add(vertices[a]).add(vertices[b]).add(vertices[c])
      .multiplyScalar(1/3).normalize().multiplyScalar(radius)
  );

  source.dispose();
  return { vertices, vertexFaces, faceCenters };
}

function sortCellCorners(normal, corners) {
  let tangentA = new THREE.Vector3(0, 1, 0).cross(normal);
  if (tangentA.lengthSq() < 0.0001) tangentA.set(1, 0, 0).cross(normal);
  tangentA.normalize();
  const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
  corners.sort((a, b) =>
    Math.atan2(a.dot(tangentB), a.dot(tangentA)) -
    Math.atan2(b.dot(tangentB), b.dot(tangentA))
  );
}

function slerp(a, b, t, radius) {
  const an = a.clone().normalize(), bn = b.clone().normalize();
  const dot = Math.max(-1, Math.min(1, an.dot(bn)));
  const theta = Math.acos(dot);
  if (theta < 0.000001) return an.lerp(bn, t).normalize().multiplyScalar(radius);
  const s = Math.sin(theta);
  return an.multiplyScalar(Math.sin((1-t)*theta)/s)
    .add(bn.multiplyScalar(Math.sin(t*theta)/s))
    .normalize().multiplyScalar(radius);
}

function spherePt(a, b, c, u, v, radius) {
  return new THREE.Vector3()
    .addScaledVector(a, 1-u-v).addScaledVector(b, u).addScaledVector(c, v)
    .normalize().multiplyScalar(radius);
}

function addCurvedTri(tv, ti, a, b, c, radius, subs) {
  const rows = [];
  for (let i = 0; i <= subs; i++) {
    const row = [];
    for (let j = 0; j <= subs - i; j++) {
      const idx = tv.length / 3;
      pushV(tv, spherePt(a, b, c, i/subs, j/subs, radius));
      row.push(idx);
    }
    rows.push(row);
  }
  for (let i = 0; i < subs; i++) {
    for (let j = 0; j < subs - i; j++) {
      const a0 = rows[i][j], b0 = rows[i+1][j], c0 = rows[i][j+1];
      ti.push(a0, b0, c0);
      if (j < subs - i - 1) ti.push(b0, rows[i+1][j+1], c0);
    }
  }
}

function addCurvedLine(lv, li, start, end, radius, thickness) {
  const angle = start.clone().normalize().angleTo(end.clone().normalize());
  const segs = Math.max(4, Math.min(14, Math.ceil(angle / 0.045)));
  const half = Math.max(0.001, thickness) / 2;
  const samples = [];
  for (let i = 0; i <= segs; i++) samples.push(slerp(start, end, i/segs, radius));
  const base = lv.length / 3;
  for (let i = 0; i <= segs; i++) {
    const pt = samples[i];
    const prev = samples[Math.max(0, i-1)];
    const next = samples[Math.min(segs, i+1)];
    const tangent = next.clone().sub(prev).normalize();
    let side = new THREE.Vector3().crossVectors(pt.clone().normalize(), tangent);
    if (side.lengthSq() < 0.000001) side.set(1, 0, 0);
    side.normalize();
    pushV(lv, pt.clone().addScaledVector(side,  half).normalize().multiplyScalar(radius));
    pushV(lv, pt.clone().addScaledVector(side, -half).normalize().multiplyScalar(radius));
  }
  for (let i = 0; i < segs; i++) {
    const l0 = base + i*2, r0 = l0+1, l1 = base+(i+1)*2, r1 = l1+1;
    li.push(l0, l1, r0, r0, l1, r1);
  }
}

function buildGoldbergShieldGeometry(radius, detail, lineThickness) {
  const { vertices, vertexFaces, faceCenters } = getTriangleData(radius, detail);
  const pv = [], pi = [], lv = [], li = [];
  const lineLookup = new Map();
  const subs = Math.max(3, 6 - detail);

  for (let i = 0; i < vertices.length; i++) {
    const adj = vertexFaces[i];
    if (adj.length < 3) continue;
    const normal = vertices[i].clone().normalize();
    const corners = adj.map(fi => faceCenters[fi].clone().normalize().multiplyScalar(radius));
    sortCellCorners(normal, corners);
    const center = vertices[i].clone().normalize().multiplyScalar(radius);
    for (let j = 0; j < corners.length; j++) {
      const ca = corners[j], cb = corners[(j+1) % corners.length];
      addCurvedTri(pv, pi, center, ca, cb, radius, subs);
      const ka = vectorKey(ca), kb = vectorKey(cb);
      const key = edgeKey(ka, kb);
      if (!lineLookup.has(key)) {
        lineLookup.set(key, true);
        addCurvedLine(lv, li, ca, cb, radius, lineThickness);
      }
    }
  }

  const panelGeometry = new THREE.BufferGeometry();
  panelGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pv, 3));
  panelGeometry.setIndex(pi);
  panelGeometry.computeVertexNormals();
  panelGeometry.computeBoundingSphere();

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lv, 3));
  lineGeometry.setIndex(li);
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

  const fresnelPower = Math.max(0.5, Math.min(8, Number(state.params.shieldFresnelPower) ?? 3.0));

  shieldPanelMat.uniforms.uColor.value.set(color);
  shieldPanelMat.uniforms.uOpacity.value = opacity;
  shieldPanelMat.uniforms.uFresnelPower.value = fresnelPower;
  shieldPanelMat.needsUpdate = true;

  const lineBloom = Math.max(0, Math.min(2, Number(p.shieldLineBloom) ?? 0.5));
  // Line opacity = base opacity * multiplier + lineBloom boost for extra edge glow
  const lineBaseOpacity = glowEnabled ? Math.min(1, opacity * 3.2) : Math.min(1, opacity * 1.9);
  // No upper clamp: AdditiveBlending saturates naturally so values > 1 drive bright rim glow.
  const lineOpacity = lineBaseOpacity + lineBloom * 2.0;
  shieldLineMat.uniforms.uColor.value.set(color);
  shieldLineMat.uniforms.uOpacity.value = lineOpacity;
  shieldLineMat.uniforms.uFresnelPower.value = Math.max(0.5, fresnelPower - 0.5);
  shieldLineMat.needsUpdate = true;

  shieldGlowMat.color.set(color);
  shieldGlowMat.opacity = glowEnabled ? Math.min(0.22, opacity * 0.36) : 0;
  shieldGlowMat.needsUpdate = true;
  playerShieldGlow.scale.setScalar(radius);
  playerShieldGlow.visible = !!p.shieldVisible && glowEnabled;

  // Bloom shell: a slightly larger sphere with very low additive opacity
  shieldBloomMat.color.set(color);
  shieldBloomMat.opacity = glowEnabled ? bloomIntensity * opacity * 0.6 * getOverallBloomFactor() : 0;
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
  applyPlayerWeaponSettings();
}

// ── Apply material from params ─────────────────────────────────────────────────
export function applyPlayerMaterial() {
  const p = state.params;
  playerMat.color.set(p.playerColor);
  playerBaseColor.copy(playerMat.color);
  playerMat.metalness = p.playerMetalness;
  playerMat.roughness = p.playerRoughness;
  if (!state.playerDead) {
    playerMat.opacity = 1;
    playerMat.transparent = false;
    playerMesh.visible = true;
  }
  playerMat.needsUpdate = true;
}

function snapPlayerCorpseToFloor(mesh, allowDownwardSnap = false) {
  if (!mesh) return false;
  mesh.updateMatrixWorld(true);
  _corpseBox.setFromObject(mesh);
  const floorY = 0;
  const delta = floorY - _corpseBox.min.y;
  if (delta > 0.0001 || (allowDownwardSnap && Math.abs(delta) > 0.0001)) {
    mesh.position.y += delta;
    mesh.updateMatrixWorld(true);
    return true;
  }
  return delta >= -0.0001;
}

function disposePlayerPhysicsCorpse() {
  if (!playerPhysicsCorpse) return;
  scene.remove(playerPhysicsCorpse.mesh);
  playerPhysicsCorpse.mesh.geometry?.dispose?.();
  playerPhysicsCorpse.mesh.material?.dispose?.();
  playerPhysicsCorpse = null;
}

function createPlayerCorpseMaterial() {
  const material = playerMat.clone();
  material.color?.copy?.(playerBaseColor);
  material.emissive?.set?.(playerBaseColor);
  if ('emissiveIntensity' in material) material.emissiveIntensity = 0.06;
  material.opacity = 1;
  material.transparent = true;
  return material;
}

export function beginPlayerCorpseVisual(duration = 3) {
  disposePlayerPhysicsCorpse();

  const maxLife = Math.max(0.1, Number(duration) || Number(state.params.playerCorpseFadeTime) || 3);
  const material = createPlayerCorpseMaterial();
  const mesh = new THREE.Mesh(playerGeo.clone(), material);
  mesh.name = 'PlayerPhysicsCorpse';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  playerMesh.getWorldPosition(_corpseWorldPos);
  playerMesh.getWorldQuaternion(_corpseWorldQuat);
  mesh.position.copy(_corpseWorldPos);
  mesh.quaternion.copy(_corpseWorldQuat);

  const yaw = Number(state.params.thirdAzimuth) || 0;
  _corpseRestAxis.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  _corpseRestQuat.setFromUnitVectors(_corpseUp, _corpseRestAxis);

  scene.add(mesh);
  snapPlayerCorpseToFloor(mesh, false);

  const shoveYaw = Math.random() * Math.PI * 2;
  const shoveSpeed = 0.35 + Math.random() * 0.55;
  playerPhysicsCorpse = {
    mesh,
    vx: Math.cos(shoveYaw) * shoveSpeed,
    vy: 0,
    vz: Math.sin(shoveYaw) * shoveSpeed,
    rx: (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 1.2),
    ry: (Math.random() - 0.5) * 0.35,
    rz: (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 1.2),
    restQuat: _corpseRestQuat.clone(),
    life: maxLife,
    maxLife,
    fadeTime: maxLife,
    grounded: false,
    groundTime: 0,
    sleepTimer: 0,
    sleeping: false,
  };

  playerMesh.visible = false;
  playerWeaponGroup.visible = false;
  playerContactShadow.visible = false;
  playerMat.opacity = 0;
  playerMat.transparent = true;
  playerMat.needsUpdate = true;
}

export function restorePlayerAliveVisual() {
  disposePlayerPhysicsCorpse();
  playerMat.opacity = 1;
  playerMat.transparent = false;
  playerMesh.visible = true;
  playerWeaponGroup.visible = true;
  playerContactShadow.visible = !!state.params.shadows && !!state.params.showFloor;
  playerMat.needsUpdate = true;
}

export function updatePlayerCorpseVisual(delta = 0) {
  if (!state.playerDead) return;

  if (!playerPhysicsCorpse) {
    beginPlayerCorpseVisual(Math.max(0.1, Number(state.playerDeathDuration) || Number(state.params.playerCorpseFadeTime) || 3));
  }

  const corpse = playerPhysicsCorpse;
  const step = Math.max(0, Number(delta) || 0);
  if (step > 0 && corpse) {
    corpse.life = Math.max(0, corpse.life - step);

    if (!corpse.sleeping) {
      corpse.vy -= PLAYER_CORPSE_GRAVITY * step;
      corpse.mesh.position.x += corpse.vx * step;
      corpse.mesh.position.y += corpse.vy * step;
      corpse.mesh.position.z += corpse.vz * step;
      corpse.mesh.rotation.x += corpse.rx * step;
      corpse.mesh.rotation.y += corpse.ry * step;
      corpse.mesh.rotation.z += corpse.rz * step;

      const onFloor = snapPlayerCorpseToFloor(corpse.mesh, false);
      if (onFloor) {
        corpse.grounded = true;
        corpse.groundTime = (corpse.groundTime || 0) + step;
        corpse.vy = 0;

        const floorFriction = Math.exp(-4.8 * step);
        const angularFriction = Math.exp(-5.6 * step);
        corpse.vx *= floorFriction;
        corpse.vz *= floorFriction;
        corpse.rx *= angularFriction;
        corpse.ry *= angularFriction;
        corpse.rz *= angularFriction;

        const settleAmount = Math.min(1, Math.max(0, step * 5.5));
        corpse.mesh.quaternion.slerp(corpse.restQuat, settleAmount);
        snapPlayerCorpseToFloor(corpse.mesh, true);

        const nearlyStill = corpse.groundTime > 0.18
          && Math.hypot(corpse.vx, corpse.vz) < 0.08
          && Math.hypot(corpse.rx, corpse.ry, corpse.rz) < 0.12;
        corpse.sleepTimer = nearlyStill ? (corpse.sleepTimer || 0) + step : 0;
        if (corpse.sleepTimer > 0.16) {
          corpse.vx = 0;
          corpse.vy = 0;
          corpse.vz = 0;
          corpse.rx = 0;
          corpse.ry = 0;
          corpse.rz = 0;
          corpse.mesh.quaternion.copy(corpse.restQuat);
          snapPlayerCorpseToFloor(corpse.mesh, true);
          corpse.sleeping = true;
        }
      } else {
        corpse.grounded = false;
        corpse.groundTime = 0;
        corpse.sleepTimer = 0;
      }
    } else {
      snapPlayerCorpseToFloor(corpse.mesh, true);
    }

    playerGroup.position.x = corpse.mesh.position.x;
    playerGroup.position.z = corpse.mesh.position.z;
    playerGroup.position.y = 0;
  }

  const duration = Math.max(0.1, Number(state.playerDeathDuration) || Number(state.params.playerCorpseFadeTime) || 3);
  const timer = Math.max(0, Number(state.playerDeathTimer) || 0);
  const fadeWindow = Math.min(duration, Math.max(0.1, Number(state.params.playerCorpseFadeTime) || 3));
  const t = Math.min(1, Math.max(0, timer / fadeWindow));
  if (corpse?.mesh?.material) {
    corpse.mesh.material.opacity = t;
    corpse.mesh.material.transparent = true;
    if ('emissiveIntensity' in corpse.mesh.material) corpse.mesh.material.emissiveIntensity = 0.06 * t;
  }

  playerMesh.visible = false;
  playerWeaponGroup.visible = false;
  playerContactShadow.visible = false;
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

function getPlayerCollisionRadius() {
  return Math.max(0.25, Number(state.params.playerRadius) || 0.4);
}

function getPlayerGroundHeight(stepUp = 0.7, stepDown = 0.75) {
  return getWalkablePlacedObjectHeight(playerGroup.position, getPlayerCollisionRadius(), {
    currentY: playerGroup.position.y,
    stepUp,
    stepDown,
  });
}

function syncPlayerGround(maxStepUp = 0.7, maxStepDown = 0.75) {
  const groundHeight = getPlayerGroundHeight(maxStepUp, maxStepDown);
  const y = playerGroup.position.y;

  if (state.jumpGrounded) {
    const delta = groundHeight - y;
    if (delta >= -maxStepDown && delta <= maxStepUp) {
      playerGroup.position.y = groundHeight;
      state.jumpVelocity = 0;
      state.jumpAirJumpsUsed = 0;
    } else if (delta < -maxStepDown) {
      state.jumpGrounded = false;
    }
  } else if (y <= groundHeight) {
    playerGroup.position.y = groundHeight;
    state.jumpVelocity = 0;
    state.jumpGrounded = true;
    state.jumpAirJumpsUsed = 0;
  }
}

function updateJump(delta) {
  const p = state.params;
  const groundHeight = getPlayerGroundHeight();

  if (!p.jumpEnabled) {
    state.jumpQueued = false;
    state.jumpVelocity = 0;
    state.jumpGrounded = true;
    state.jumpAirJumpsUsed = 0;
    playerGroup.position.y = groundHeight;
    return;
  }

  const jumpForce = Math.max(0, Number(p.jumpForce) || 0);
  const gravity = Math.max(1, Number(p.jumpGravity) || 26);

  if (state.jumpGrounded && playerGroup.position.y < groundHeight) {
    playerGroup.position.y = groundHeight;
  }

  if (state.jumpQueued) {
    if (state.jumpGrounded) {
      state.jumpVelocity = jumpForce;
      state.jumpGrounded = false;
      state.jumpAirJumpsUsed = 0;
      playJumpSound();
    } else {
      const configuredAirJumps = Number(p.doubleJumpAirJumps);
      const maxAirJumps = p.doubleJumpEnabled
        ? Math.max(0, Math.min(5, Math.round(Number.isFinite(configuredAirJumps) ? configuredAirJumps : 1)))
        : 0;
      if ((state.jumpAirJumpsUsed || 0) < maxAirJumps) {
        const configuredMultiplier = Number(p.doubleJumpForceMultiplier);
        const forceMultiplier = Math.max(0.1, Math.min(2, Number.isFinite(configuredMultiplier) ? configuredMultiplier : 1));
        const airJumpForce = jumpForce * forceMultiplier;
        state.jumpVelocity = p.doubleJumpResetVelocity === false
          ? Math.max(state.jumpVelocity, 0) + airJumpForce
          : airJumpForce;
        state.jumpAirJumpsUsed = (state.jumpAirJumpsUsed || 0) + 1;
        playJumpSound();
      }
    }
  }
  state.jumpQueued = false;

  if (!state.jumpGrounded || playerGroup.position.y > groundHeight) {
    state.jumpVelocity -= gravity * delta;
    playerGroup.position.y += state.jumpVelocity * delta;

    // Only land on object tops while descending. This prevents upward jumps near a
    // crate edge from snapping the capsule onto the top face and jittering.
    const landingHeight = state.jumpVelocity <= 0 ? getPlayerGroundHeight(0.7, 0.75) : 0;
    if (state.jumpVelocity <= 0 && playerGroup.position.y <= landingHeight) {
      playerGroup.position.y = landingHeight;
      state.jumpVelocity = 0;
      state.jumpGrounded = true;
      state.jumpAirJumpsUsed = 0;
    }
  } else if (state.jumpGrounded) {
    playerGroup.position.y = groundHeight;
    state.jumpVelocity = 0;
  }
}

const _v = new THREE.Vector3();

export function updatePlayer(delta, moveForward, moveRight, aimTarget = null) {
  if (state.playerDead) { updatePlayerCorpseVisual(delta); return; }
  const p = state.params;
  const movementScale = Math.max(0.05, Math.min(1, Number(state.worldScale) || 1));
  const movementDelta = delta * movementScale;

  updateJump(movementDelta);
  applyPlayerContactShadow();
  updatePlayerWeaponVisual(delta, aimTarget);

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
    // Reduce movement speed when aiming (ADS) — forces tactical positioning
    const aimMult = (state.isAiming && state.params.aimEnabled !== false)
      ? Math.max(0.1, Math.min(1, Number(state.params.aimSpeedMult) || 0.55))
      : 1;
    playerGroup.position.addScaledVector(_v, speed * aimMult * movementDelta);
    resolveCircleAgainstPlacedObjects(playerGroup.position, getPlayerCollisionRadius(), 4, {
      walkableRamps: true,
      footY: playerGroup.position.y,
      stepUp: 0.7,
      stepDown: 0.75,
      grounded: state.jumpGrounded,
    });
    syncPlayerGround(0.7, 0.75);
  }

  // Dash — shunts in a fixed direction at higher speed while dashTimer > 0
  const dashDelta = movementDelta;
  if (state.dashTimer > 0) {
    state.dashTimer -= dashDelta;
    playerGroup.position.x += state.dashVX * p.dashSpeed * dashDelta;
    playerGroup.position.z += state.dashVZ * p.dashSpeed * dashDelta;
    resolveCircleAgainstPlacedObjects(playerGroup.position, getPlayerCollisionRadius(), 4, {
      walkableRamps: true,
      footY: playerGroup.position.y,
      stepUp: 0.7,
      stepDown: 0.75,
      grounded: state.jumpGrounded,
    });
    syncPlayerGround(0.7, 0.75);
    playerMesh.rotation.z   = state.dashVX * -0.35;
    state.dashGhostTimer -= dashDelta;
    if (state.dashGhostTimer <= 0) {
      stampDashGhost();
      state.dashGhostTimer = 0.04; // stamp a ghost every 40ms of world-scaled dash time
    }
  } else {
    playerMesh.rotation.z += (0 - playerMesh.rotation.z) * 12 * delta;
  }

  if (state.dashCooldown > 0) {
    state.dashCooldown = Math.max(0, state.dashCooldown - dashDelta);
  }

  syncPlayerGround();
  applyPlayerContactShadow();

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
