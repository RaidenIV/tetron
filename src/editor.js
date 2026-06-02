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
let _playerSpawnMarker = null;
const SPAWN_ARROW_TEXTURE_URL = new URL('../assets/spawn_arrow.svg', import.meta.url).href;
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

function snapYawToGridEdge(yaw) {
  const quarterTurn = Math.PI / 2;
  return normalizeYaw(Math.round(numberOr(yaw, 0) / quarterTurn) * quarterTurn);
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function validTarget(value) {
  return value === 'enemy' || value === 'ally' || value === 'asset' || value === 'playerSpawn' ? value : 'asset';
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
  if (target === 'playerSpawn') return 'Player Spawn';
  return `Asset · ${state.params.placerSelectedAsset || 'box'}`;
}

function updateHudText() {
  const hud = ensureEditorHud();
  const fly = state.params.editorFlyMode === true ? 'Fly' : 'Grounded';
  hud.textContent = `EDITOR MODE · ${editorPlacementLabel()} · ${fly} · WASD move · Mouse look · Left place · Right delete/clear · F asset picker · R transform · Q/E rotate · Wheel cycles assets`;
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
  p.editorPlayerSpawnYaw = snapYawToGridEdge(numberOr(p.editorPlayerSpawnYaw, p.playerSpawnYaw ?? p.editorYaw));
  p.playerSpawnEnabled = p.playerSpawnEnabled === true;
  p.playerSpawnX = numberOr(p.playerSpawnX, playerGroup.position.x);
  p.playerSpawnY = Math.max(0, numberOr(p.playerSpawnY, 0));
  p.playerSpawnZ = numberOr(p.playerSpawnZ, playerGroup.position.z);
  p.playerSpawnYaw = snapYawToGridEdge(numberOr(p.playerSpawnYaw, p.editorPlayerSpawnYaw));
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
    teleportPlayerToSpawn();
    refreshPlayerSpawnMarker();
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


function createPlayerSpawnMarker() {
  const group = new THREE.Group();
  group.name = 'EditorPlayerSpawnMarker';
  group.renderOrder = 24;

  const cyan = new THREE.Color('#00d9ff');
  const bodyMat = new THREE.MeshBasicMaterial({
    color: cyan,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    toneMapped: false,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.2, 8, 16), bodyMat);
  body.name = 'PlayerSpawnMarkerBody';
  body.position.y = 1.0;
  body.renderOrder = 26;
  group.add(body);

  const indicatorMat = new THREE.MeshBasicMaterial({
    color: cyan,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    toneMapped: false,
  });
  const indicator = new THREE.Group();
  indicator.name = 'PlayerSpawnPlacedIndicator';
  indicator.renderOrder = 29;

  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.35, 8, 1, true), indicatorMat.clone());
  beacon.name = 'PlayerSpawnPlacedIndicatorBeacon';
  beacon.position.y = 2.55;
  beacon.renderOrder = 29;
  indicator.add(beacon);

  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), indicatorMat.clone());
  diamond.name = 'PlayerSpawnPlacedIndicatorDiamond';
  diamond.position.y = 3.85;
  diamond.renderOrder = 30;
  indicator.add(diamond);

  group.add(indicator);

  const footprintMat = new THREE.LineBasicMaterial({
    color: '#35ff00',
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false,
  });
  const footprintHalf = 0.5;
  const footprintY = 0.055;
  const footprintPoints = [
    new THREE.Vector3(-footprintHalf, footprintY, -footprintHalf),
    new THREE.Vector3(footprintHalf, footprintY, -footprintHalf),
    new THREE.Vector3(footprintHalf, footprintY, footprintHalf),
    new THREE.Vector3(-footprintHalf, footprintY, footprintHalf),
    new THREE.Vector3(-footprintHalf, footprintY, -footprintHalf),
  ];
  const footprint = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(footprintPoints),
    footprintMat,
  );
  footprint.name = 'PlayerSpawnMarkerFootprint';
  footprint.renderOrder = 24;
  group.add(footprint);

  const arrowTexture = new THREE.TextureLoader().load(SPAWN_ARROW_TEXTURE_URL);
  if ('colorSpace' in arrowTexture && THREE.SRGBColorSpace) arrowTexture.colorSpace = THREE.SRGBColorSpace;
  const arrowMat = new THREE.MeshBasicMaterial({
    map: arrowTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const arrowPivot = new THREE.Group();
  arrowPivot.name = 'PlayerSpawnMarkerFacingArrowPivot';
  arrowPivot.renderOrder = 27;
  const arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), arrowMat);
  arrow.name = 'PlayerSpawnMarkerFacingArrow';
  // The texture points along the plane's local +Y axis, which maps to world -Z after
  // the flat ground rotation. Keeping the pivot yaw snapped to 90-degree increments
  // makes the arrow perpendicular to a spawn-square edge instead of diagonal.
  arrow.position.set(0, 0.07, -0.84);
  arrow.rotation.x = -Math.PI / 2;
  arrow.renderOrder = 27;
  arrowPivot.add(arrow);
  group.add(arrowPivot);

  scene.add(group);
  return group;
}

function ensurePlayerSpawnMarker() {
  if (!_playerSpawnMarker) _playerSpawnMarker = createPlayerSpawnMarker();
  return _playerSpawnMarker;
}

function setPlayerSpawnMarkerVisible(visible) {
  if (_playerSpawnMarker) _playerSpawnMarker.visible = visible;
}

function setMarkerOpacity(object, opacity) {
  object?.traverse?.(child => {
    if (child.material && typeof child.material.opacity === 'number') {
      child.material.transparent = true;
      child.material.opacity = opacity;
    }
  });
  if (object?.material && typeof object.material.opacity === 'number') {
    object.material.transparent = true;
    object.material.opacity = opacity;
  }
}

function updatePlayerSpawnMarker(position = null, yaw = null, { preview = false } = {}) {
  const p = state.params;
  const marker = ensurePlayerSpawnMarker();
  const x = position ? position.x : p.playerSpawnX;
  const y = position ? position.y : p.playerSpawnY;
  const z = position ? position.z : p.playerSpawnZ;
  marker.position.set(numberOr(x, 0), numberOr(y, 0), numberOr(z, 0));
  marker.rotation.y = 0;
  marker.visible = true;

  const body = marker.getObjectByName('PlayerSpawnMarkerBody');
  const footprint = marker.getObjectByName('PlayerSpawnMarkerFootprint');
  const indicator = marker.getObjectByName('PlayerSpawnPlacedIndicator');
  const arrowPivot = marker.getObjectByName('PlayerSpawnMarkerFacingArrowPivot');
  const arrow = marker.getObjectByName('PlayerSpawnMarkerFacingArrow');
  const markerOpacity = preview ? 0.45 : 0.9;
  if (body?.material) body.material.opacity = preview ? 0.3 : 0.42;
  if (footprint) {
    footprint.rotation.y = 0;
    setMarkerOpacity(footprint, markerOpacity);
  }
  if (indicator) {
    indicator.visible = !preview && p.playerSpawnEnabled === true;
    setMarkerOpacity(indicator, indicator.visible ? 0.88 : 0);
  }
  if (arrowPivot) arrowPivot.rotation.y = snapYawToGridEdge(numberOr(yaw, p.playerSpawnYaw));
  if (arrow?.material) arrow.material.opacity = preview ? 0.7 : 0.95;
}

export function clearPlayerSpawn() {
  sanitizeEditorParams();
  state.params.playerSpawnEnabled = false;
  setPlayerSpawnMarkerVisible(false);
  return true;
}

export function teleportPlayerToSpawn() {
  sanitizeEditorParams();
  const p = state.params;
  if (p.playerSpawnEnabled !== true) return false;
  const x = numberOr(p.playerSpawnX, playerGroup.position.x);
  const y = Math.max(0, numberOr(p.playerSpawnY, 0));
  const z = numberOr(p.playerSpawnZ, playerGroup.position.z);
  const yaw = snapYawToGridEdge(numberOr(p.playerSpawnYaw, p.thirdAzimuth || 0));

  playerGroup.position.set(x, y, z);
  p.thirdAzimuth = yaw;
  p.editorYaw = yaw;
  p.editorPlayerSpawnYaw = yaw;
  state.jumpVelocity = 0;
  state.jumpQueued = false;
  state.jumpGrounded = true;
  state.jumpAirJumpsUsed = 0;
  state.dashTimer = 0;
  state.dashCooldown = 0;
  state.dashVX = 0;
  state.dashVZ = 0;
  state.lastMoveX = -Math.sin(yaw);
  state.lastMoveZ = -Math.cos(yaw);
  return true;
}

export function refreshPlayerSpawnMarker() {
  sanitizeEditorParams();
  if (state.params.playerSpawnEnabled === true) {
    updatePlayerSpawnMarker(null, state.params.playerSpawnYaw, { preview: false });
  } else {
    setPlayerSpawnMarkerVisible(false);
  }
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
  const editorOn = isEditorModeEnabled();
  if (!editorOn) {
    hideNpcGhost();
    refreshPlayerSpawnMarker();
    _primaryPrev = !!state.primaryFire;
    _secondaryPrev = !!state.secondaryFire;
    return;
  }

  sanitizeEditorParams();
  const target = validTarget(state.params.editorPlacementTarget);

  if (state.paused) {
    hideNpcGhost();
    if (state.params.playerSpawnEnabled === true) {
      updatePlayerSpawnMarker(null, state.params.playerSpawnYaw, { preview: false });
    } else if (target !== 'playerSpawn') {
      setPlayerSpawnMarkerVisible(false);
    }
    _primaryPrev = !!state.primaryFire;
    _secondaryPrev = !!state.secondaryFire;
    return;
  }

  if (target === 'asset') {
    hideNpcGhost();
    refreshPlayerSpawnMarker();
    _primaryPrev = !!state.primaryFire;
    _secondaryPrev = !!state.secondaryFire;
    return;
  }

  const hit = raycastFloor();
  const removePressed = !!state.secondaryFire && !_secondaryPrev;

  if (target === 'playerSpawn') {
    hideNpcGhost();

    if (removePressed) {
      clearPlayerSpawn();
      _primaryPrev = !!state.primaryFire;
      _secondaryPrev = !!state.secondaryFire;
      return;
    }

    if (!hit) {
      if (state.params.playerSpawnEnabled === true) {
        updatePlayerSpawnMarker(null, state.params.playerSpawnYaw, { preview: false });
      } else {
        setPlayerSpawnMarkerVisible(false);
      }
      _primaryPrev = !!state.primaryFire;
      _secondaryPrev = !!state.secondaryFire;
      return;
    }

    const sx = snapNpcAxis(_hitPoint.x);
    const sz = snapNpcAxis(_hitPoint.z);
    const yaw = snapYawToGridEdge(numberOr(state.params.editorPlayerSpawnYaw, state.params.editorYaw));
    updatePlayerSpawnMarker({ x: sx, y: 0, z: sz }, yaw, { preview: state.params.playerSpawnEnabled !== true });

    if (state.primaryFire && !_primaryPrev) {
      state.params.playerSpawnEnabled = true;
      state.params.playerSpawnX = sx;
      state.params.playerSpawnY = 0;
      state.params.playerSpawnZ = sz;
      state.params.playerSpawnYaw = yaw;
      state.params.editorPlayerSpawnYaw = yaw;
      updatePlayerSpawnMarker(null, yaw, { preview: false });
    }

    _primaryPrev = !!state.primaryFire;
    _secondaryPrev = !!state.secondaryFire;
    return;
  }

  refreshPlayerSpawnMarker();

  if (removePressed && removeNpcByAim()) {
    _primaryPrev = !!state.primaryFire;
    _secondaryPrev = !!state.secondaryFire;
    return;
  }

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
