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

export const editorCamera = new THREE.PerspectiveCamera(70, aspect, 0.1, 500);
editorCamera.position.set(0, 1.7, 8);

// Mutable export — all modules importing `camera` see the current value
export let camera = isoCamera;

export function isThirdPersonCameraMode(mode) {
  return mode === 'third' || mode === 'third2';
}

export function setActiveCamera(mode) {
  if (state.params.editorModeEnabled === true) {
    camera = editorCamera;
    return;
  }
  camera = isThirdPersonCameraMode(mode) ? thirdCamera : isoCamera;
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
const _thirdLateral = new THREE.Vector3();
const _thirdViewDir = new THREE.Vector3();
const _thirdBodyAnchor = new THREE.Vector3();
const _thirdFramedEye = new THREE.Vector3();
const _thirdFramedTarget = new THREE.Vector3();
const _thirdCameraUp = new THREE.Vector3();

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

const _shakeOffset = new THREE.Vector3();
let _shakeTime = 0;
let _shakeDuration = 0;
let _shakeAmplitude = 0;
let _shakeSeed = Math.random() * Math.PI * 2;

export function triggerCameraShake(origin, force = 1) {
  const p = state.params;
  if (p.cameraShakeEnabled === false) return;

  const duration = clamp(Number(p.cameraShakeDuration) || 0.35, 0.05, 2);
  const radius = Math.max(0.1, Number(p.cameraShakeRadius) || 24);
  const baseIntensity = Math.max(0, Number(p.cameraShakeIntensity) || 0);
  const appliedForce = Math.max(0, Number(force) || 0);
  let proximity = 1;

  if (p.cameraShakeProximity !== false && origin?.isVector3) {
    const distance = camera.position.distanceTo(origin);
    if (distance >= radius) {
      proximity = 0;
    } else {
      const minFactorRaw = Number(p.cameraShakeMinFactor);
      const minFactor = clamp(Number.isFinite(minFactorRaw) ? minFactorRaw : 0.12, 0, 1);
      proximity = minFactor + (1 - minFactor) * (1 - distance / radius);
    }
  }

  const amplitude = baseIntensity * appliedForce * proximity;
  if (amplitude <= 0.0001) return;

  _shakeTime = Math.max(_shakeTime, duration);
  _shakeDuration = Math.max(_shakeDuration, duration);
  _shakeAmplitude = Math.min(5, Math.max(_shakeAmplitude, amplitude));
  _shakeSeed = Math.random() * Math.PI * 2;
}

export function updateCameraShake(delta) {
  const p = state.params;
  if (p.cameraShakeEnabled === false || _shakeTime <= 0) {
    _shakeTime = 0;
    _shakeAmplitude = 0;
    return;
  }

  _shakeTime = Math.max(0, _shakeTime - Math.max(0, delta));
  const remaining = _shakeTime / Math.max(0.001, _shakeDuration);
  const amplitude = _shakeAmplitude * remaining * remaining;
  const frequency = clamp(Number(p.cameraShakeFrequency) || 28, 1, 80);
  const phase = performance.now() * 0.001 * frequency * Math.PI * 2 + _shakeSeed;

  _shakeOffset.set(
    Math.sin(phase * 1.13) * amplitude,
    Math.sin(phase * 1.71 + 1.8) * amplitude * 0.65,
    Math.cos(phase * 0.97 + 0.6) * amplitude
  );
  camera.position.add(_shakeOffset);

  if (_shakeTime <= 0) _shakeAmplitude = 0;
}

export function getThirdPitchRange() {
  if (state.params.cameraMode !== 'third2') {
    return { min: -1.1, max: 1.1 };
  }

  const minRaw = Number(state.params.third2PitchMin);
  const maxRaw = Number(state.params.third2PitchMax);
  const min = clamp(Number.isFinite(minRaw) ? minRaw : -0.9, -1.4, 0);
  const max = clamp(Number.isFinite(maxRaw) ? maxRaw : 0.85, 0, 1.4);

  return { min, max: Math.max(max, min + 0.05) };
}

// ── Aim (ADS) camera state ────────────────────────────────────────────────────
let _aimBlend = 0; // 0 = hip, 1 = full ADS — smoothly interpolated each frame

export function updateThirdCamera(playerPos, delta) {
  const p = state.params;
  const az = Number(p.thirdAzimuth) || 0;
  const pitchRange = getThirdPitchRange();
  const pitch = clamp(Number(p.thirdPitch) || 0, pitchRange.min, pitchRange.max);
  p.thirdPitch = pitch;

  const baseDist = Math.max(1, Number(p.thirdDist) || 1);
  const minDist = clamp(Number(p.thirdMinDist) || baseDist, 1, baseDist);
  const isThird2 = state.params.cameraMode === 'third2';
  const pitchCompression = isThird2
    ? clamp(Number(p.thirdPitchDistanceCompression) || 0, 0, 1)
    : 0;
  const maxPitchForCompression = Math.max(Math.abs(pitchRange.min), Math.abs(pitchRange.max), 0.2);
  const pitchAmount = clamp(Math.abs(pitch) / maxPitchForCompression, 0, 1);
  const camDist = baseDist + (minDist - baseDist) * pitchAmount * pitchCompression;

  _thirdForward.set(-Math.sin(az), 0, -Math.cos(az)).normalize();
  _thirdRight.set(Math.cos(az), 0, -Math.sin(az)).normalize();

  const pitchCos = Math.cos(pitch);
  _thirdViewDir.set(
    _thirdForward.x * pitchCos,
    Math.sin(pitch),
    _thirdForward.z * pitchCos
  ).normalize();

  _thirdLateral.copy(_thirdRight).multiplyScalar(p.thirdOffsetX);

  // desired eye position — distance/height plus over-shoulder offset controls
  _eye.copy(playerPos)
    .addScaledVector(_thirdForward, -camDist + p.thirdOffsetZ)
    .add(_thirdLateral);
  _eye.y = playerPos.y + p.thirdHeight + p.thirdOffsetY;

  if (p.thirdOffsetMode === 'pivot') {
    // Canted/pivot behavior: offset the camera, but converge back toward the
    // player's forward focal lane. Pitch still controls vertical aim.
    _tgt.copy(playerPos).addScaledVector(_thirdForward, p.thirdLookAhead);
    _tgt.y = _eye.y + Math.tan(pitch) * Math.max(1, camDist + p.thirdLookAhead);
  } else {
    // Parallel OTS behavior: shift the camera sideways without toe-in. The
    // camera looks straight along its yaw/pitch vector, like a PC action game.
    _tgt.copy(_eye).addScaledVector(_thirdViewDir, Math.max(1, camDist + p.thirdLookAhead));
  }

  if (isThird2) {
    // Shooter-style body framing: when the player pitches up/down, the camera
    // boom orbits around a body/shoulder anchor instead of only tilting from a
    // fixed eye height. This keeps the player capsule in frame at steep angles.
    const bodyHeight = Math.max(0.5, (Number(p.playerRadius) || 0.4) * 2 + (Number(p.playerLength) || 1.2));
    const bodyFrameHeightRaw = Number(p.third2BodyFrameHeight);
    const bodyFrameHeight = clamp(
      Number.isFinite(bodyFrameHeightRaw) ? bodyFrameHeightRaw : bodyHeight * 0.68,
      0.25,
      bodyHeight + 1.5
    );
    const bodyFrameStrength = clamp(Number(p.third2BodyFrameStrength) || 0, 0, 1);
    const bodyScreenY = clamp(Number(p.third2BodyScreenY) || 0, -0.75, 0.75);
    const minEyeHeight = clamp(Number(p.third2MinEyeHeight) || 0.15, 0.05, bodyHeight + 2.0);
    const bodyFrameBlend = clamp(pitchAmount * 2, 0, 1) * bodyFrameStrength;

    if (bodyFrameBlend > 0) {
      _thirdBodyAnchor.copy(playerPos);
      _thirdBodyAnchor.y += bodyFrameHeight;
      _thirdCameraUp.crossVectors(_thirdRight, _thirdViewDir).normalize();

      _thirdFramedEye.copy(_thirdBodyAnchor)
        .addScaledVector(_thirdViewDir, -camDist)
        .addScaledVector(_thirdCameraUp, -bodyScreenY * camDist * Math.tan(THREE.MathUtils.degToRad(p.thirdFov * 0.5)))
        .addScaledVector(_thirdRight, p.thirdOffsetX)
        .addScaledVector(_thirdForward, p.thirdOffsetZ);
      _thirdFramedEye.y += p.thirdOffsetY;
      _thirdFramedEye.y = Math.max(playerPos.y + minEyeHeight, _thirdFramedEye.y);

      if (p.thirdOffsetMode === 'pivot') {
        _thirdFramedTarget.copy(_thirdBodyAnchor).addScaledVector(_thirdForward, p.thirdLookAhead);
        _thirdFramedTarget.y = _thirdFramedEye.y + Math.tan(pitch) * Math.max(1, camDist + p.thirdLookAhead);
      } else {
        _thirdFramedTarget.copy(_thirdFramedEye).addScaledVector(
          _thirdViewDir,
          Math.max(1, camDist + p.thirdLookAhead)
        );
      }

      _eye.lerp(_thirdFramedEye, bodyFrameBlend);
      _tgt.lerp(_thirdFramedTarget, bodyFrameBlend);
    }
  }

  const sp = Math.min(1, p.thirdSmoothPos  * delta);
  const sl = Math.min(1, p.thirdSmoothLook * delta);

  // lerp toward target
  state._camPos.x += (_eye.x - state._camPos.x) * sp;
  state._camPos.y += (_eye.y - state._camPos.y) * sp;
  state._camPos.z += (_eye.z - state._camPos.z) * sp;
  state._camTarget.x += (_tgt.x - state._camTarget.x) * sl;
  state._camTarget.y += (_tgt.y - state._camTarget.y) * sl;
  state._camTarget.z += (_tgt.z - state._camTarget.z) * sl;

  thirdCamera.position.set(state._camPos.x, state._camPos.y, state._camPos.z);
  thirdCamera.lookAt(state._camTarget.x, state._camTarget.y, state._camTarget.z);

  // ── ADS (aim-down-sights) blend ──────────────────────────────────────────
  // Smoothly zoom FOV and pull camera closer when state.isAiming is true.
  const aimEnabled = state.params.aimEnabled !== false;
  const aimTarget  = aimEnabled && state.isAiming ? 1 : 0;
  const aimSmooth  = Math.min(1, (Number(state.params.aimSmooth) || 10) * delta);
  _aimBlend += (aimTarget - _aimBlend) * aimSmooth;

  const aimFovDelta  = Number(state.params.aimFovDelta)  || -18;
  const aimDistDelta = Number(state.params.aimDistDelta) || -1.5;
  const targetFov = (Number(p.thirdFov) || 62) + aimFovDelta  * _aimBlend;
  const aimDistOff = aimDistDelta * _aimBlend;

  // Apply ADS camera pull-in along the current view direction
  if (aimDistOff !== 0) {
    const fwd = thirdCamera.getWorldDirection(new THREE.Vector3());
    thirdCamera.position.addScaledVector(fwd, -aimDistOff);
  }

  if (thirdCamera.fov !== targetFov) {
    thirdCamera.fov = targetFov;
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
  if (isThirdPersonCameraMode(state.params.cameraMode)) {
    const az = state.params.thirdAzimuth;
    return _fwd.set(-Math.sin(az), 0, -Math.cos(az));
  }
  return ISO_FWD;
}

export function getMoveRight() {
  if (isThirdPersonCameraMode(state.params.cameraMode)) {
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
  editorCamera.aspect = aspect;
  editorCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}
