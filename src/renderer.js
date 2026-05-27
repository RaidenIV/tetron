// ─── renderer.js ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { state } from './state.js';

// ── WebGL Renderer ────────────────────────────────────────────────────────────
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
if ('useLegacyLights' in renderer) renderer.useLegacyLights = false;
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.42;
document.body.appendChild(renderer.domElement);
renderer.domElement.id = 'webgl-canvas';
renderer.domElement.style.cssText =
  'position:fixed;top:0;left:0;width:100%;height:100%;display:block;z-index:1;';

// ── CSS2D renderer (health bars, damage numbers) ──────────────────────────────
export const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.id = 'label-layer';
labelRenderer.domElement.style.cssText =
  'position:fixed;top:0;left:0;pointer-events:none;z-index:5;';
document.body.appendChild(labelRenderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080d);
scene.fog        = new THREE.Fog(0x06080d, 1, 200);

// ── Environment map ───────────────────────────────────────────────────────────
const pmrem    = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envScene = new THREE.Scene();
const skyGeo   = new THREE.SphereGeometry(5, 32, 32);
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
scene.environment          = _sceneEnvTexture;
scene.environmentIntensity = 1.15;
pmrem.dispose();

export function setEnvironmentReflectionsEnabled(enabled) {
  scene.environment          = enabled ? _sceneEnvTexture : null;
  scene.environmentIntensity = enabled ? 1.15 : 0.0;
  scene.traverse(obj => {
    const mats = obj?.material
      ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
    mats.forEach(m => { if (m) m.needsUpdate = true; });
  });
}

// ── Isometric orthographic camera ─────────────────────────────────────────────
export let CAM_D  = 12;
export let aspect = window.innerWidth / window.innerHeight;

export const isoCamera = new THREE.OrthographicCamera(
  -CAM_D * aspect, CAM_D * aspect, CAM_D, -CAM_D, -100, 500
);
export const CAM_OFFSET = new THREE.Vector3(28, 28, 28);
isoCamera.position.copy(CAM_OFFSET);
isoCamera.lookAt(0, 0, 0);

// ── Third-person perspective camera ──────────────────────────────────────────
export const thirdCamera = new THREE.PerspectiveCamera(65, aspect, 0.1, 500);
thirdCamera.position.set(0, 10, 20);
thirdCamera.lookAt(0, 0, 0);

// ── Active camera (starts as ISO) ─────────────────────────────────────────────
export let camera = isoCamera;

export function setActiveCamera(mode) {
  camera = mode === 'third' ? thirdCamera : isoCamera;
  if (mode === 'third') {
    thirdCamera.aspect = aspect;
    thirdCamera.updateProjectionMatrix();
  }
}

// ── Isometric movement direction vectors ──────────────────────────────────────
export const ISO_FWD   = new THREE.Vector3(-1, 0, -1).normalize();
export const ISO_RIGHT = new THREE.Vector3( 1, 0, -1).normalize();

const _moveFwd   = new THREE.Vector3();
const _moveRight = new THREE.Vector3();

export function getMoveForward() {
  const p = state.params;
  if (p.cameraMode === 'third') {
    const az = p.thirdAzimuth;
    _moveFwd.set(-Math.sin(az), 0, -Math.cos(az));
    return _moveFwd;
  }
  return ISO_FWD;
}

export function getMoveRight() {
  const p = state.params;
  if (p.cameraMode === 'third') {
    const az = p.thirdAzimuth;
    _moveRight.set(Math.cos(az), 0, -Math.sin(az));
    return _moveRight;
  }
  return ISO_RIGHT;
}

// ── Third-person camera update ────────────────────────────────────────────────
const _tgt = new THREE.Vector3();
const _eye = new THREE.Vector3();

export function updateThirdCamera(playerPos, delta) {
  const p    = state.params;
  const az   = p.thirdAzimuth;
  const dist = p.thirdDist;
  const h    = p.thirdHeight;

  _eye.set(
    playerPos.x + Math.sin(az) * dist,
    playerPos.y + h,
    playerPos.z + Math.cos(az) * dist
  );
  _tgt.set(
    playerPos.x + (-Math.sin(az)) * p.thirdLookAhead,
    playerPos.y + 0.8,
    playerPos.z + (-Math.cos(az)) * p.thirdLookAhead
  );

  const sp = Math.min(1, p.thirdSmoothPos  * delta);
  const sl = Math.min(1, p.thirdSmoothLook * delta);

  state._camPos.x += (_eye.x - state._camPos.x) * sp;
  state._camPos.y += (_eye.y - state._camPos.y) * sp;
  state._camPos.z += (_eye.z - state._camPos.z) * sp;
  state._camTarget.x += (_tgt.x - state._camTarget.x) * sl;
  state._camTarget.y += (_tgt.y - state._camTarget.y) * sl;
  state._camTarget.z += (_tgt.z - state._camTarget.z) * sl;

  thirdCamera.position.set(state._camPos.x, state._camPos.y, state._camPos.z);
  thirdCamera.lookAt(state._camTarget.x, state._camTarget.y, state._camTarget.z);

  // Update FOV from params
  if (thirdCamera.fov !== p.thirdFov) {
    thirdCamera.fov = p.thirdFov;
    thirdCamera.updateProjectionMatrix();
  }
}

// ── ISO camera follow ─────────────────────────────────────────────────────────
export function updateIsoCamera(playerPos) {
  isoCamera.position.set(
    playerPos.x + CAM_OFFSET.x,
    playerPos.y + CAM_OFFSET.y,
    playerPos.z + CAM_OFFSET.z
  );
  isoCamera.lookAt(playerPos.x, playerPos.y, playerPos.z);
}

// ── Resize ─────────────────────────────────────────────────────────────────────
export function onRendererResize() {
  aspect = window.innerWidth / window.innerHeight;

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
