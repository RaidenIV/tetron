// src/renderer.js
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { state } from './state.js';

// ── WebGL renderer ─────────────────────────────────────────────────────────────
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1;';
document.body.appendChild(renderer.domElement);

// ── CSS2D renderer ─────────────────────────────────────────────────────────────
export const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:5;';
document.body.appendChild(labelRenderer.domElement);

// ── Scene ──────────────────────────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080d);
scene.fog        = new THREE.Fog(0x06080d, 1, 200);

// ── Environment map — a few coloured spheres inside a flipped sphere ───────────
const pmrem    = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const skyGeo   = new THREE.SphereGeometry(5, 16, 16);
skyGeo.scale(-1, -1, -1);
envScene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ color: 0x050510 })));
[
  { col: 0xeaf4ff, pos: [  4,  2,  0 ] },
  { col: 0xbfd7ff, pos: [ -4,  2,  0 ] },
  { col: 0xffffff, pos: [  0,  4,  0 ] },
  { col: 0xa9dbff, pos: [  0, -1,  4 ] },
  { col: 0xcdd8e8, pos: [  0,  2, -4 ] },
].forEach(({ col, pos }) => {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 8, 8),
    new THREE.MeshBasicMaterial({ color: col })
  );
  m.position.set(...pos);
  envScene.add(m);
});
export const envTexture = pmrem.fromScene(envScene).texture;
scene.environment          = envTexture;
scene.environmentIntensity = 1.0;
pmrem.dispose();

// ── Cameras ────────────────────────────────────────────────────────────────────
export let aspect = window.innerWidth / window.innerHeight;
export let CAM_D  = 12; // half-size of the ortho frustum

export const ISO_OFFSET = new THREE.Vector3(28, 28, 28);

export const isoCamera = new THREE.OrthographicCamera(
  -CAM_D * aspect, CAM_D * aspect,
   CAM_D,         -CAM_D,
  -100, 500
);
isoCamera.position.copy(ISO_OFFSET);
isoCamera.lookAt(0, 0, 0);

export const thirdCamera = new THREE.PerspectiveCamera(65, aspect, 0.1, 500);
thirdCamera.position.set(0, 10, 20);

// Mutable export — all modules importing `camera` see the current value
export let camera = isoCamera;

export function setActiveCamera(mode) {
  camera = mode === 'third' ? thirdCamera : isoCamera;
}

// ── Camera update functions ────────────────────────────────────────────────────
export function updateIsoCamera(playerPos) {
  isoCamera.position.set(
    playerPos.x + ISO_OFFSET.x,
    playerPos.y + ISO_OFFSET.y,
    playerPos.z + ISO_OFFSET.z
  );
  isoCamera.lookAt(playerPos.x, playerPos.y, playerPos.z);
}

const _eye = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _thirdForward = new THREE.Vector3();
const _thirdRight = new THREE.Vector3();

export function updateThirdCamera(playerPos, delta) {
  const az = state.params.thirdAzimuth;
  _thirdForward.set(-Math.sin(az), 0, -Math.cos(az));
  _thirdRight.set(Math.cos(az), 0, -Math.sin(az));

  // desired eye position — distance/height plus over-shoulder offset controls
  _eye.copy(playerPos)
    .addScaledVector(_thirdForward, -state.params.thirdDist + state.params.thirdOffsetZ)
    .addScaledVector(_thirdRight, state.params.thirdOffsetX);
  _eye.y = playerPos.y + state.params.thirdHeight + state.params.thirdOffsetY;

  // desired look-at — slightly ahead of the player
  _tgt.copy(playerPos)
    .addScaledVector(_thirdForward, state.params.thirdLookAhead);
  _tgt.y = playerPos.y + 0.8;

  const sp = Math.min(1, state.params.thirdSmoothPos  * delta);
  const sl = Math.min(1, state.params.thirdSmoothLook * delta);

  // lerp toward target
  state._camPos.x += (_eye.x - state._camPos.x) * sp;
  state._camPos.y += (_eye.y - state._camPos.y) * sp;
  state._camPos.z += (_eye.z - state._camPos.z) * sp;
  state._camTarget.x += (_tgt.x - state._camTarget.x) * sl;
  state._camTarget.y += (_tgt.y - state._camTarget.y) * sl;
  state._camTarget.z += (_tgt.z - state._camTarget.z) * sl;

  thirdCamera.position.set(state._camPos.x, state._camPos.y, state._camPos.z);
  thirdCamera.lookAt(state._camTarget.x, state._camTarget.y, state._camTarget.z);

  // sync FOV from params
  if (thirdCamera.fov !== state.params.thirdFov) {
    thirdCamera.fov = state.params.thirdFov;
    thirdCamera.updateProjectionMatrix();
  }
}

// ── Camera-relative movement vectors ──────────────────────────────────────────
// In third-person, WASD pushes relative to where the camera points.
export const ISO_FWD   = new THREE.Vector3(-1, 0, -1).normalize();
export const ISO_RIGHT = new THREE.Vector3( 1, 0, -1).normalize();

const _fwd   = new THREE.Vector3();
const _right = new THREE.Vector3();

export function getMoveForward() {
  if (state.params.cameraMode === 'third') {
    const az = state.params.thirdAzimuth;
    return _fwd.set(-Math.sin(az), 0, -Math.cos(az));
  }
  return ISO_FWD;
}

export function getMoveRight() {
  if (state.params.cameraMode === 'third') {
    const az = state.params.thirdAzimuth;
    return _right.set(Math.cos(az), 0, -Math.sin(az));
  }
  return ISO_RIGHT;
}

// ── Resize ─────────────────────────────────────────────────────────────────────
export function applyIsoCamD(d) {
  CAM_D  = d;
  aspect = window.innerWidth / window.innerHeight;
  isoCamera.left   = -CAM_D * aspect;
  isoCamera.right  =  CAM_D * aspect;
  isoCamera.top    =  CAM_D;
  isoCamera.bottom = -CAM_D;
  isoCamera.updateProjectionMatrix();
}

export function onResize() {
  aspect = window.innerWidth / window.innerHeight;
  applyIsoCamD(state.params.isoCamD);
  thirdCamera.aspect = aspect;
  thirdCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}
