// ─── renderer.js ──────────────────────────────────────────────────────────────
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
renderer.domElement.id = 'webgl-canvas';
document.body.appendChild(renderer.domElement);

// ── CSS2D renderer (for health-bar-style labels if needed) ────────────────────
export const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.id = 'label-layer';
document.body.appendChild(labelRenderer.domElement);

// ── Scene ──────────────────────────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080d);
scene.fog        = new THREE.Fog(0x06080d, 1, 200);

// ── Environment map ───────────────────────────────────────────────────────────
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
export let CAM_D  = 12;

export const ISO_OFFSET = new THREE.Vector3(28, 28, 28);

export const isoCamera = new THREE.OrthographicCamera(
  -CAM_D * aspect, CAM_D * aspect, CAM_D, -CAM_D, -100, 500
);
isoCamera.position.copy(ISO_OFFSET);
isoCamera.lookAt(0, 0, 0);

export const thirdCamera = new THREE.PerspectiveCamera(65, aspect, 0.1, 500);
thirdCamera.position.set(0, 10, 20);

export let camera = isoCamera;

export function setActiveCamera(mode) {
  camera = mode === 'third' ? thirdCamera : isoCamera;
}

// Camera-relative movement vectors
const _fwd   = new THREE.Vector3();
const _right = new THREE.Vector3();

export const ISO_FWD   = new THREE.Vector3(-1, 0, -1).normalize();
export const ISO_RIGHT = new THREE.Vector3( 1, 0, -1).normalize();

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

// ── 3rd-person camera update ──────────────────────────────────────────────────
const _eye = new THREE.Vector3();
const _tgt = new THREE.Vector3();

export function updateThirdCamera(playerPos, delta) {
  const p  = state.params;
  const az = p.thirdAzimuth;

  _eye.set(
    playerPos.x + Math.sin(az) * p.thirdDist,
    playerPos.y + p.thirdHeight,
    playerPos.z + Math.cos(az) * p.thirdDist
  );
  _tgt.set(
    playerPos.x - Math.sin(az) * p.thirdLookAhead,
    playerPos.y + 0.8,
    playerPos.z - Math.cos(az) * p.thirdLookAhead
  );

  const sp = Math.min(1, p.thirdSmoothPos  * delta);
  const sl = Math.min(1, p.thirdSmoothLook * delta);
  const cp = state._camPos;
  const ct = state._camTarget;

  cp.x += (_eye.x - cp.x) * sp;
  cp.y += (_eye.y - cp.y) * sp;
  cp.z += (_eye.z - cp.z) * sp;
  ct.x += (_tgt.x - ct.x) * sl;
  ct.y += (_tgt.y - ct.y) * sl;
  ct.z += (_tgt.z - ct.z) * sl;

  thirdCamera.position.set(cp.x, cp.y, cp.z);
  thirdCamera.lookAt(ct.x, ct.y, ct.z);
  if (thirdCamera.fov !== p.thirdFov) {
    thirdCamera.fov = p.thirdFov;
    thirdCamera.updateProjectionMatrix();
  }
}

export function updateIsoCamera(playerPos) {
  isoCamera.position.set(
    playerPos.x + ISO_OFFSET.x,
    playerPos.y + ISO_OFFSET.y,
    playerPos.z + ISO_OFFSET.z
  );
  isoCamera.lookAt(playerPos.x, playerPos.y, playerPos.z);
}

// ── Resize ─────────────────────────────────────────────────────────────────────
export function onResize() {
  aspect = window.innerWidth / window.innerHeight;
  CAM_D  = state.params.isoCamD;

  isoCamera.left   = -CAM_D * aspect;
  isoCamera.right  =  CAM_D * aspect;
  isoCamera.top    =  CAM_D;
  isoCamera.bottom = -CAM_D;
  isoCamera.updateProjectionMatrix();

  thirdCamera.aspect = aspect;
  thirdCamera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

export function applyIsoCamD(d) {
  CAM_D = d;
  aspect = window.innerWidth / window.innerHeight;
  isoCamera.left   = -CAM_D * aspect;
  isoCamera.right  =  CAM_D * aspect;
  isoCamera.top    =  CAM_D;
  isoCamera.bottom = -CAM_D;
  isoCamera.updateProjectionMatrix();
}
