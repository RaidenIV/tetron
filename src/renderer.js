// ─── renderer.js ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

// ── WebGL Renderer ────────────────────────────────────────────────────────────
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if ('useLegacyLights' in renderer) renderer.useLegacyLights = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.42;
document.body.appendChild(renderer.domElement);
renderer.domElement.id = 'webgl-canvas';
// Ensure WebGL canvas covers the full viewport (prevents top bars from layout)
renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:block;z-index:1;';

// ── CSS2D Renderer (health bars, damage numbers) ──────────────────────────────
export const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.id = 'label-layer';
labelRenderer.domElement.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:5;';
document.body.appendChild(labelRenderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080d);
scene.fog = new THREE.Fog(0x06080d, 1, 200);

// ── Environment Map (makes metallic capsules reflect vivid colours) ───────────
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

const envScene = new THREE.Scene();
const skyGeo = new THREE.SphereGeometry(5, 32, 32);
skyGeo.scale(-1, -1, -1);
envScene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ color: 0x050510 })));

[
  { col: 0xeaf4ff, pos: [  4,  2,  0 ] },
  { col: 0xbfd7ff, pos: [ -4,  2,  0 ] },
  { col: 0xffffff, pos: [  0,  4,  0 ] },
  { col: 0xa9dbff, pos: [  0, -1,  4 ] },
  { col: 0xcdd8e8, pos: [  0,  2, -4 ] },
  { col: 0x8db7ff, pos: [  2, -1, -3 ] },
].forEach(({ col, pos }) => {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 16, 16),
    new THREE.MeshBasicMaterial({ color: col })
  );
  m.position.set(...pos);
  envScene.add(m);
});

const _sceneEnvTexture = pmrem.fromScene(envScene).texture;
scene.environment = _sceneEnvTexture;
scene.environmentIntensity = 1.15;
pmrem.dispose();

export function setEnvironmentReflectionsEnabled(enabled) {
  scene.environment = enabled ? _sceneEnvTexture : null;
  scene.environmentIntensity = enabled ? 1.15 : 0.0;
  scene.traverse((obj) => {
    const mats = obj?.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
    mats.forEach((mat) => { if (mat) mat.needsUpdate = true; });
  });
}

// ── Camera rigs ───────────────────────────────────────────────────────────────
export const CAMERA_TYPES = Object.freeze({
  ISOMETRIC: 'isometric',
  THIRD_PERSON: 'third-person',
});

export const CAM_D = 12;
export let aspect = window.innerWidth / window.innerHeight;

export const cameraSettings = {
  type: CAMERA_TYPES.ISOMETRIC,
  isoDistance: 28,
  isoHeight: 28,
  thirdPersonDistance: 7,
  thirdPersonHeight: 4,
  lookAhead: 4,
  fov: 60,
};

const isoCamera = new THREE.OrthographicCamera(
  -CAM_D * aspect, CAM_D * aspect, CAM_D, -CAM_D, -100, 500
);
const thirdPersonCamera = new THREE.PerspectiveCamera(cameraSettings.fov, aspect, 0.1, 500);

export let camera = isoCamera;
export const CAM_OFFSET = new THREE.Vector3(cameraSettings.isoDistance, cameraSettings.isoHeight, cameraSettings.isoDistance);

// Movement vectors are intentionally mutable. Player/input modules import these
// live vector objects and the active camera rig updates their direction.
export const ISO_FWD   = new THREE.Vector3(-1, 0, -1).normalize();
export const ISO_RIGHT = new THREE.Vector3( 1, 0, -1).normalize();

const _isoForward = new THREE.Vector3(-1, 0, -1).normalize();
const _isoRight = new THREE.Vector3(1, 0, -1).normalize();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _target = new THREE.Vector3();

function _syncIsoMovementVectors() {
  ISO_FWD.copy(_isoForward);
  ISO_RIGHT.copy(_isoRight);
}

function _syncThirdPersonMovementVectors(stateLike = {}) {
  _forward.set(Number(stateLike.lastMoveX) || 0, 0, Number(stateLike.lastMoveZ) || 1);
  if (_forward.lengthSq() < 0.001) _forward.set(0, 0, 1);
  _forward.normalize();
  _right.set(_forward.z, 0, -_forward.x).normalize();
  ISO_FWD.copy(_forward);
  ISO_RIGHT.copy(_right);
}

export function getCameraType() {
  return cameraSettings.type;
}

export function setCameraType(type) {
  cameraSettings.type = type === CAMERA_TYPES.THIRD_PERSON ? CAMERA_TYPES.THIRD_PERSON : CAMERA_TYPES.ISOMETRIC;
  camera = cameraSettings.type === CAMERA_TYPES.THIRD_PERSON ? thirdPersonCamera : isoCamera;
  onRendererResize();
  return cameraSettings.type;
}

export function updateCameraForPlayer(playerGroup, stateLike = {}) {
  const p = playerGroup?.position || new THREE.Vector3();

  if (cameraSettings.type === CAMERA_TYPES.THIRD_PERSON) {
    _syncThirdPersonMovementVectors(stateLike);
    thirdPersonCamera.fov = cameraSettings.fov;
    thirdPersonCamera.updateProjectionMatrix();
    thirdPersonCamera.position.set(
      p.x - ISO_FWD.x * cameraSettings.thirdPersonDistance,
      p.y + cameraSettings.thirdPersonHeight,
      p.z - ISO_FWD.z * cameraSettings.thirdPersonDistance
    );
    _target.set(
      p.x + ISO_FWD.x * cameraSettings.lookAhead,
      p.y + 1.2,
      p.z + ISO_FWD.z * cameraSettings.lookAhead
    );
    thirdPersonCamera.lookAt(_target);
    return;
  }

  _syncIsoMovementVectors();
  CAM_OFFSET.set(cameraSettings.isoDistance, cameraSettings.isoHeight, cameraSettings.isoDistance);
  isoCamera.position.set(
    p.x + cameraSettings.isoDistance,
    p.y + cameraSettings.isoHeight,
    p.z + cameraSettings.isoDistance
  );
  isoCamera.lookAt(p);
}

updateCameraForPlayer({ position: new THREE.Vector3(0, 0, 0) }, {});
// ── Resize handler ────────────────────────────────────────────────────────────
// bloom.js calls onResize() too — both are registered in main.js
export function onRendererResize() {
  aspect = window.innerWidth / window.innerHeight;
  isoCamera.left   = -CAM_D * aspect;
  isoCamera.right  =  CAM_D * aspect;
  isoCamera.top    =  CAM_D;
  isoCamera.bottom = -CAM_D;
  isoCamera.updateProjectionMatrix();
  thirdPersonCamera.aspect = aspect;
  thirdPersonCamera.fov = cameraSettings.fov;
  thirdPersonCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}
