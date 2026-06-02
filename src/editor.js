// src/editor.js
// First-person in-game editor controller and NPC placement preview.
// This mode is intentionally layered on top of the existing object placer so
// asset placement keeps the same grid snap, ghost preview, collision footprint,
// transform modal, selection, and JSON serialization behavior.
import * as THREE from 'three';
import { state } from './state.js';
import { camera, editorCamera, renderer, scene } from './renderer.js';
import { playerGroup } from './player.js';
import {
  spawnEditorNpcAt,
  removeEditorNpcByMesh,
  getAllNpcMeshes,
} from './enemies.js';

const _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2(0, 0);
const _hitPoint = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

let _hudEl = null;
let _npcGhost = null;
let _npcGhostKey = '';
let _editorWasEnabled = false;
let _primaryPrev = false;
let _secondaryPrev = false;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeYaw(yaw) {
  const tau = Math.PI * 2;
  return ((yaw % tau) + tau) % tau;
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function validTarget(value) {
  return value === 'enemy' || value === 'ally' || value === 'asset' ? value : 'asset';
}

function ensureEditorHud() {
  if (_hudEl) return _hudEl;
  _hudEl = document.createElement('div');
  _hudEl.id = 'editor-mode-hud';
  _hudEl.style.cssText = [
    'position:fixed',
    'left:22px',
    'bottom:92px',
    'z-index:28',
    'pointer-events:none',
    'max-width:min(720px,calc(100vw - 44px))',
    'padding:10px 12px',
    'border:1px solid rgba(255,255,255,0.18)',
    'border-radius:10px',
    'background:rgba(4,8,14,0.78)',
    'box-shadow:0 12px 36px rgba(0,0,0,0.35)',
    'backdrop-filter:blur(10px)',
    'color:rgba(255,255,255,0.82)',
    'font-family:var(--hud-font-family,Inter,system-ui,sans-serif)',
    'font-size:11px',
    'font-weight:700',
    'letter-spacing:0.08em',
    'line-height:1.55',
    'text-transform:uppercase',
    'display:none',
  ].join(';');
  document.body.appendChild(_hudEl);
  return _hudEl;
}

function setHudVisible(visible) {
  const hud = ensureEditorHud();
  hud.style.display = visible ? 'block' : 'none';
}

function editorPlacementLabel() {
  const target = validTarget(state.params.editorPlacementTarget);
  if (target === 'enemy') return `Enemy · ${state.params.enemyType || 'rusher'}`;
  if (target === 'ally') return `Ally · ${state.params.allyType || 'rusher'}`;
  return `Asset · ${state.params.placerSelectedAsset || 'box'}`;
}

function updateHudText() {
  const hud = ensureEditorHud();
  const fly = state.params.editorFlyMode === true ? 'Fly' : 'Grounded';
  hud.textContent = `EDITOR MODE · ${editorPlacementLabel()} · ${fly} · WASD move · Mouse look · Left place · Right delete · F asset picker · R transform · Q/E rotate · Wheel cycles assets`;
}

function sanitizeEditorParams() {
  const p = state.params;
  p.editorModeEnabled = p.editorModeEnabled === true;
  p.editorPlacementTarget = validTarget(p.editorPlacementTarget);
  p.editorMoveSpeed = clamp(numberOr(p.editorMoveSpeed, 7), 0.1, 80);
  p.editorSprintMultiplier = clamp(numberOr(p.editorSprintMultiplier, 2.25), 1, 8);
  p.editorPrecisionMultiplier = clamp(numberOr(p.editorPrecisionMultiplier, 0.28), 0.05, 1);
  p.editorEyeHeight = clamp(numberOr(p.editorEyeHeight, 1.7), 0.25, 12);
  p.editorFov = clamp(numberOr(p.editorFov, 70), 30, 110);
  p.editorMouseSensitivityX = clamp(numberOr(p.editorMouseSensitivityX, 0.003), 0.0002, 0.03);
  p.editorMouseSensitivityY = clamp(numberOr(p.editorMouseSensitivityY, 0.0024), 0.0002, 0.03);
  p.editorYaw = normalizeYaw(numberOr(p.editorYaw, state.params.thirdAzimuth || 0));
  p.editorPitch = clamp(numberOr(p.editorPitch, -0.1), -1.45, 1.45);
  p.editorCameraX = numberOr(p.editorCameraX, playerGroup.position.x);
  p.editorCameraY = clamp(numberOr(p.editorCameraY, p.editorEyeHeight), 0.1, 200);
  p.editorCameraZ = numberOr(p.editorCameraZ, playerGroup.position.z + 6);
  if (!Array.isArray(p.editorPlacedNpcs)) p.editorPlacedNpcs = [];
}

function cameraDirectionToYawPitch(sourceCamera) {
  const dir = new THREE.Vector3();
  sourceCamera.getWorldDirection(dir);
  const yaw = normalizeYaw(Math.atan2(-dir.x, -dir.z));
  const pitch = clamp(Math.asin(clamp(dir.y, -1, 1)), -1.45, 1.45);
  return { yaw, pitch };
}

export function isEditorModeEnabled() {
  return state.params.editorModeEnabled === true;
}

export function setEditorModeEnabled(enabled, options = {}) {
  sanitizeEditorParams();
  const next = enabled === true;
  const wasEnabled = state.params.editorModeEnabled === true;
  state.params.editorModeEnabled = next;

  if (next) {
    state.activeSlot = 1;
    state.isAiming = false;
    state.primaryFire = false;
    state.secondaryFire = false;

    if (!wasEnabled || options.captureCurrentCamera !== false) {
      const source = camera || editorCamera;
      source.updateMatrixWorld?.(true);
      const sourcePos = source.position || playerGroup.position;
      const derived = cameraDirectionToYawPitch(source);
      state.params.editorCameraX = Number.isFinite(sourcePos.x) ? sourcePos.x : playerGroup.position.x;
      state.params.editorCameraY = Math.max(state.params.editorEyeHeight, Number.isFinite(sourcePos.y) ? sourcePos.y : state.params.editorEyeHeight);
      state.params.editorCameraZ = Number.isFinite(sourcePos.z) ? sourcePos.z : playerGroup.position.z + 6;
      state.params.editorYaw = derived.yaw;
      state.params.editorPitch = derived.pitch;
    }
  } else {
    hideNpcGhost();
    setHudVisible(false);
    state.primaryFire = false;
    state.secondaryFire = false;
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
  }

  document.body.classList.toggle('editor-mode-active', next);
  _editorWasEnabled = next;
}

export function applyEditorSettings() {
  sanitizeEditorParams();
  const enabled = isEditorModeEnabled();
  if (enabled && !_editorWasEnabled) {
    setEditorModeEnabled(true, { captureCurrentCamera: false });
  }
  if (!enabled && _editorWasEnabled) {
    setEditorModeEnabled(false);
  }
  document.body.classList.toggle('editor-mode-active', enabled);
}

export function applyEditorMouseLookDelta(dx, dy) {
  if (!isEditorModeEnabled()) return false;
  sanitizeEditorParams();
  const p = state.params;
  p.editorYaw = normalizeYaw(p.editorYaw - (Number(dx) || 0) * p.editorMouseSensitivityX);
  p.editorPitch = clamp(p.editorPitch - (Number(dy) || 0) * p.editorMouseSensitivityY, -1.45, 1.45);
  return true;
}

export function updateEditorCamera(delta = 1 / 60) {
  applyEditorSettings();
  if (!isEditorModeEnabled()) {
    hideNpcGhost();
    setHudVisible(false);
    return false;
  }

  const p = state.params;
  state.activeSlot = 1;
  state.isAiming = false;

  const yaw = p.editorYaw;
  const pitch = p.editorPitch;
  const cosPitch = Math.cos(pitch);
  _forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  _right.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
  _move.set(0, 0, 0);

  if (state.keys.w) _move.add(_forward);
  if (state.keys.s) _move.sub(_forward);
  if (state.keys.d) _move.add(_right);
  if (state.keys.a) _move.sub(_right);

  const speedMult = state.keys.shift
    ? p.editorSprintMultiplier
    : (state.keys.alt ? p.editorPrecisionMultiplier : 1);
  const speed = p.editorMoveSpeed * speedMult;

  if (_move.lengthSq() > 0) {
    _move.normalize().multiplyScalar(speed * delta);
    p.editorCameraX += _move.x;
    p.editorCameraZ += _move.z;
  }

  if (p.editorFlyMode === true) {
    if (state.keys.space) p.editorCameraY += speed * delta;
    if (state.keys.ctrl) p.editorCameraY -= speed * delta;
    p.editorCameraY = clamp(p.editorCameraY, 0.25, 200);
  } else {
    p.editorCameraY = p.editorEyeHeight;
  }

  if (editorCamera.fov !== p.editorFov) {
    editorCamera.fov = p.editorFov;
    editorCamera.updateProjectionMatrix();
  }

  editorCamera.position.set(p.editorCameraX, p.editorCameraY, p.editorCameraZ);
  _lookTarget.set(
    p.editorCameraX - Math.sin(yaw) * cosPitch,
    p.editorCameraY + Math.sin(pitch),
    p.editorCameraZ - Math.cos(yaw) * cosPitch,
  );
  editorCamera.lookAt(_lookTarget);

  updateHudText();
  setHudVisible(!state.paused);
  return true;
}

function snapNpcAxis(v) {
  return Math.floor(v) + 0.5;
}

function getNpcPreviewColor(target) {
  if (target === 'ally') return state.params.allyAwarenessColor || '#35ff00';
  return state.params.enemyAwarenessColor || '#ff3030';
}

function getNpcPreviewRange(target) {
  const key = target === 'ally' ? 'allyAwarenessRange' : 'enemyAwarenessRange';
  return Math.max(1, Number(state.params[key]) || 40);
}

function disposeNpcGhost() {
  if (!_npcGhost) return;
  sceneRemove(_npcGhost);
  _npcGhost.traverse(child => {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  });
  _npcGhost = null;
  _npcGhostKey = '';
}

function sceneRemove(object) {
  object?.parent?.remove?.(object);
}

function hideNpcGhost() {
  if (_npcGhost) _npcGhost.visible = false;
}

function ensureNpcGhost(target) {
  const color = getNpcPreviewColor(target);
  const key = `${target}:${color}`;
  if (_npcGhost && _npcGhostKey === key) return _npcGhost;
  disposeNpcGhost();

  _npcGhost = new THREE.Group();
  _npcGhost.name = 'EditorNpcPlacementGhost';
  _npcGhost.renderOrder = 20;

  const bodyMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    toneMapped: false,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 8, 16), bodyMat);
  body.name = 'EditorNpcGhostBody';
  body.position.y = 1.0;
  body.renderOrder = 21;
  _npcGhost.add(body);

  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 3), arrowMat);
  arrow.name = 'EditorNpcGhostFacingArrow';
  arrow.position.set(0, 0.08, -0.72);
  arrow.rotation.x = -Math.PI / 2;
  arrow.renderOrder = 22;
  _npcGhost.add(arrow);

  const circleMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: target === 'ally' ? 0.16 : 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const circle = new THREE.Mesh(new THREE.CircleGeometry(1, 96), circleMat);
  circle.name = 'EditorNpcGhostAwarenessFill';
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.032;
  circle.renderOrder = 18;
  _npcGhost.add(circle);

  const outlineColor = target === 'ally'
    ? (state.params.allyAwarenessOutlineColor || '#ffffff')
    : (state.params.enemyAwarenessOutlineColor || '#000000');
  const outlineMat = new THREE.MeshBasicMaterial({
    color: outlineColor,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const outline = new THREE.Mesh(new THREE.RingGeometry(0.998, 1.002, 96), outlineMat);
  outline.name = 'EditorNpcGhostAwarenessOutline';
  outline.rotation.x = -Math.PI / 2;
  outline.position.y = 0.038;
  outline.renderOrder = 19;
  _npcGhost.add(outline);

  sceneAdd(_npcGhost);
  _npcGhostKey = key;
  return _npcGhost;
}

function sceneAdd(object) {
  scene.add(object);
}

function raycastFloor() {
  camera.updateMatrixWorld(true);
  _raycaster.setFromCamera(_ndc, camera);
  return _raycaster.ray.intersectPlane(_floorPlane, _hitPoint);
}

function removeNpcByAim() {
  camera.updateMatrixWorld(true);
  _raycaster.setFromCamera(_ndc, camera);
  const meshes = getAllNpcMeshes();
  if (!meshes.length) return false;
  const hits = _raycaster.intersectObjects(meshes, false);
  if (!hits.length) return false;
  return removeEditorNpcByMesh(hits[0].object);
}

function currentNpcPlacementData(target, x, z) {
  const enemy = target === 'enemy';
  return {
    team: target,
    type: enemy ? state.params.enemyType : state.params.allyType,
    x,
    z,
    ry: state.params.editorYaw,
    health: enemy ? state.params.enemyHealth : state.params.allyHealth,
    behavior: enemy ? state.params.enemyBehavior : state.params.allyBehavior,
    moveSpeed: enemy ? state.params.enemyMoveSpeed : state.params.allyMoveSpeed,
    damage: enemy ? state.params.enemyDamage : state.params.allyDamage,
    weaponType: enemy ? state.params.enemyWeaponType : state.params.allyWeaponType,
    awarenessRange: enemy ? state.params.enemyAwarenessRange : state.params.allyAwarenessRange,
    accuracy: enemy ? state.params.enemyAccuracy : state.params.allyAccuracy,
  };
}

export function updateEditorPlacement() {
  if (!isEditorModeEnabled() || state.paused) {
    hideNpcGhost();
    _primaryPrev = !!state.primaryFire;
    _secondaryPrev = !!state.secondaryFire;
    return;
  }

  const target = validTarget(state.params.editorPlacementTarget);
  if (target === 'asset') {
    hideNpcGhost();
    _primaryPrev = !!state.primaryFire;
    _secondaryPrev = !!state.secondaryFire;
    return;
  }

  const removePressed = !!state.secondaryFire && !_secondaryPrev;
  if (removePressed && removeNpcByAim()) {
    _primaryPrev = !!state.primaryFire;
    _secondaryPrev = !!state.secondaryFire;
    return;
  }

  const hit = raycastFloor();
  if (!hit) {
    hideNpcGhost();
    _primaryPrev = !!state.primaryFire;
    _secondaryPrev = !!state.secondaryFire;
    return;
  }

  const sx = snapNpcAxis(_hitPoint.x);
  const sz = snapNpcAxis(_hitPoint.z);
  const ghost = ensureNpcGhost(target);
  const range = getNpcPreviewRange(target);
  ghost.visible = true;
  ghost.position.set(sx, 0, sz);
  ghost.rotation.y = state.params.editorYaw;
  const fill = ghost.getObjectByName('EditorNpcGhostAwarenessFill');
  const outline = ghost.getObjectByName('EditorNpcGhostAwarenessOutline');
  if (fill) fill.scale.set(range, range, 1);
  if (outline) outline.scale.set(range, range, 1);

  if (state.primaryFire && !_primaryPrev) {
    spawnEditorNpcAt(currentNpcPlacementData(target, sx, sz));
  }

  _primaryPrev = !!state.primaryFire;
  _secondaryPrev = !!state.secondaryFire;
}
