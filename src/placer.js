// src/placer.js
// Object placer system: ghost preview, footprint-aware grid-snapping, placement,
// placed-object clipping, flat-top/ramp walkability, per-object colour, and targeted removal.
// Slot 0 = laser, Slot 1 = placer. Scroll wheel switches slots.
// R key opens the shape transform modal. Right-click removes the targeted placed object.
// Placed objects store rotation/colour/scale in serialised state.

import * as THREE from 'three';
import { scene, camera } from './renderer.js';
import { state } from './state.js';
import { ASSET_CATALOGUE } from './assets-catalogue.js';

// ── Geometry factories (Three.js — kept here, not in catalogue) ───────────────
const _geoFactories = {
  box:      () => new THREE.BoxGeometry(1, 1, 1),
  tall_box: () => new THREE.BoxGeometry(1, 2, 1),
  cylinder: () => new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12),
  sphere:   () => new THREE.SphereGeometry(0.5, 16, 12),
  wall:     () => new THREE.BoxGeometry(4, 2, 0.25),
  ramp: () => {
    const g = new THREE.BufferGeometry();
    const v = new Float32Array([
      -2,0,-1,  2,0,-1,  2,0,1,
      -2,0,-1,  2,0,1,  -2,0,1,
      -2,0,-1,  -2,2,1,  2,2,1,
      -2,0,-1,   2,2,1,  2,0,-1,
      -2,0,-1,  -2,0,1, -2,2,1,
       2,0,-1,   2,2,1,  2,0,1,
      -2,0,1,   2,0,1,   2,2,1,
      -2,0,1,   2,2,1,  -2,2,1,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  },
};

function makeGeo(assetId) {
  return (_geoFactories[assetId] || _geoFactories.box)();
}

function getAsset(id) {
  return ASSET_CATALOGUE.find(a => a.id === id) || ASSET_CATALOGUE[0];
}

function normalizeHexColor(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : null;
}

function assetColorHex(asset) {
  const numeric = Number(asset?.color ?? 0xffffff) >>> 0;
  return `#${numeric.toString(16).padStart(6, '0')}`;
}

function resolvePlacedColor(obj, asset) {
  return normalizeHexColor(obj?.color)
    || (obj === null ? normalizeHexColor(state.params.placerObjectColor) : null)
    || assetColorHex(asset);
}

function getBaseClipHeight(asset) {
  const explicit = Number(asset?.height);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Math.max(0.5, Number(asset?.yOffset ?? 0.5) * 2);
}

function normalizeScaleValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(0.25, n));
}

function getCurrentPlacerScale() {
  return {
    x: normalizeScaleValue(state.params.placerScaleX),
    y: normalizeScaleValue(state.params.placerScaleY),
    z: normalizeScaleValue(state.params.placerScaleZ),
  };
}

function getPlacedScale(obj = null) {
  if (!obj) return getCurrentPlacerScale();
  if (!('assetId' in obj) && 'x' in obj && 'y' in obj && 'z' in obj) {
    return {
      x: normalizeScaleValue(obj.x),
      y: normalizeScaleValue(obj.y),
      z: normalizeScaleValue(obj.z),
    };
  }
  return {
    x: normalizeScaleValue(obj.scaleX ?? 1),
    y: normalizeScaleValue(obj.scaleY ?? 1),
    z: normalizeScaleValue(obj.scaleZ ?? 1),
  };
}

function normalizeRotationDegrees(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return ((Math.round(n / 90) * 90) % 360 + 360) % 360;
}

function getCurrentPlacerRotation() {
  const deg = normalizeRotationDegrees(state.params.placerRotationDeg ?? 0);
  state.params.placerRotationDeg = deg;
  state.placerRotation = THREE.MathUtils.degToRad(deg);
  return state.placerRotation;
}

function getClipHeight(asset, obj = null) {
  return getBaseClipHeight(asset) * getPlacedScale(obj).y;
}

function getClipBottom(obj, asset) {
  const y = Number(obj?.y) || 0;
  if (asset?.walkable === true || obj?.assetId === 'ramp') return y;
  return y - getClipHeight(asset, obj) / 2;
}

function getClipTop(obj, asset) {
  return getClipBottom(obj, asset) + getClipHeight(asset, obj);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// ── Footprint-aware grid snapping ─────────────────────────────────────────────
// Each asset has a footprintW × footprintH base measured in grid cells.
// Rotation (multiples of π/2) swaps W↔H for odd rotations.
//
// Snapping rule:
//   • Odd footprint dimension (1 cell wide) → snap origin to cell centre: floor(v)+0.5
//   • Even footprint dimension (e.g. 4 cells wide) → snap origin to grid line
//     multiple of W: round(v/W)*W  so base edges land exactly on grid lines
//
// This places the object's centre at the midpoint of its W×H cell block, with
// all base edges flush with grid lines.

function snapAxis(v, footprintDim) {
  const dim = Math.max(0.25, Number(footprintDim) || 1);
  const rounded = Math.round(dim);

  if (Math.abs(dim - rounded) > 0.001) {
    // Non-cell-sized scaled shapes keep their centre on half-cell increments.
    return Math.round(v * 2) / 2;
  }

  if (rounded % 2 === 1) {
    // Odd-width: centre inside the middle cell
    return Math.floor(v) + 0.5;
  } else {
    // Even-width: align to multiples of footprintDim
    return Math.round(v / rounded) * rounded;
  }
}

function getLocalFootprint(asset, scaleSource = null) {
  const scale = getPlacedScale(scaleSource);
  return {
    fw: Math.max(0.25, Number(asset?.footprintW ?? 1) * scale.x),
    fh: Math.max(0.25, Number(asset?.footprintH ?? 1) * scale.z),
  };
}

function getEffectiveFootprint(assetId, ry, scaleSource = null) {
  const asset = getAsset(assetId);
  const { fw, fh } = getLocalFootprint(asset, scaleSource);
  // 90° or 270° rotation swaps X and Z footprint dimensions
  const rotSteps = Math.round(((ry % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 2)) % 4;
  if (rotSteps === 1 || rotSteps === 3) return { fw: fh, fh: fw };
  return { fw, fh };
}

function snapToFootprint(worldX, worldZ, assetId, ry, scaleSource = null) {
  const { fw, fh } = getEffectiveFootprint(assetId, ry, scaleSource);
  return {
    sx: snapAxis(worldX, fw),
    sz: snapAxis(worldZ, fh),
    fw, fh,
  };
}

// ── Footprint collision cells ─────────────────────────────────────────────────
// Returns array of integer cell keys covered by an object at (cx, cz) with footprint fw×fh.
// Origin (cx, cz) is the centre of the footprint block.
function footprintCells(cx, cz, fw, fh) {
  const cells = [];
  // Number of cells on each side of origin
  const halfW = fw / 2;
  const halfH = fh / 2;
  for (let dx = 0; dx < fw; dx++) {
    for (let dz = 0; dz < fh; dz++) {
      const cellX = Math.floor(cx - halfW + dx);
      const cellZ = Math.floor(cz - halfH + dz);
      cells.push(`${cellX},${cellZ}`);
    }
  }
  return cells;
}

function boundsOverlap(a, b, padding = 0.001) {
  return a.minX < b.maxX - padding
    && a.maxX > b.minX + padding
    && a.minZ < b.maxZ - padding
    && a.maxZ > b.minZ + padding;
}

function makeBounds(assetId, x, z, ry, scaleSource = null, y = 0) {
  const asset = getAsset(assetId);
  const scale = getPlacedScale(scaleSource);
  const yOffset = Number(asset?.yOffset ?? 0.5) * scale.y;
  const obj = { assetId, x, y: Number.isFinite(Number(y)) ? Number(y) : yOffset, z, ry,
    scaleX: scale.x, scaleY: scale.y, scaleZ: scale.z };
  const { fw, fh } = getEffectiveFootprint(assetId, ry ?? 0, obj);
  return {
    asset,
    minX: x - fw / 2,
    maxX: x + fw / 2,
    minZ: z - fh / 2,
    maxZ: z + fh / 2,
    minY: getClipBottom(obj, asset),
    maxY: getClipTop(obj, asset),
  };
}

function isFootprintOccupied(sx, sz, assetId, ry, scaleSource = null) {
  const asset = getAsset(assetId);
  const scale = getPlacedScale(scaleSource);
  const y = Number(asset?.yOffset ?? 0.5) * scale.y;
  const candidate = makeBounds(assetId, sx, sz, ry, scale, y);
  const list = state.params.placedObjects || [];
  for (const obj of list) {
    const bounds = placedObjectBounds(obj);
    if (bounds.asset.clip === false) continue;
    if (boundsOverlap(candidate, bounds)) return true;
  }
  return false;
}

function placedObjectBounds(obj) {
  return makeBounds(obj.assetId, obj.x, obj.z, obj.ry ?? 0, obj, obj.y);
}

function localPointForObject(obj, worldX, worldZ) {
  const dx = worldX - obj.x;
  const dz = worldZ - obj.z;
  const ry = obj.ry ?? 0;
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return {
    x: c * dx - s * dz,
    z: s * dx + c * dz,
  };
}

function isInsideLocalFootprint(local, asset, padding = 0, scaleSource = null) {
  const { fw, fh } = getLocalFootprint(asset, scaleSource);
  return local.x >= -fw / 2 - padding
    && local.x <=  fw / 2 + padding
    && local.z >= -fh / 2 - padding
    && local.z <=  fh / 2 + padding;
}

function rampSurfaceHeightAt(obj, asset, worldX, worldZ, padding = 0) {
  if (obj.assetId !== 'ramp' && asset.walkable !== true) return null;
  const local = localPointForObject(obj, worldX, worldZ);
  if (!isInsideLocalFootprint(local, asset, padding, obj)) return null;

  const { fh } = getLocalFootprint(asset, obj);
  const t = clamp((local.z + fh / 2) / Math.max(0.001, fh), 0, 1);
  return getClipBottom(obj, asset) + t * getClipHeight(asset, obj);
}

function flatTopHeightAt(obj, asset, worldX, worldZ, padding = 0) {
  if (asset.clip === false || asset.walkable === true) return null;
  const local = localPointForObject(obj, worldX, worldZ);
  if (!isInsideLocalFootprint(local, asset, padding, obj)) return null;
  return getClipTop(obj, asset);
}

function canStandOnObjectTop(footY, topY, stepUp = 0.35, stepDown = 0.45) {
  const y = Number(footY) || 0;
  const up = Math.max(0, Number(stepUp) || 0);
  const down = Math.max(0, Number(stepDown) || 0);
  return topY >= y - down && topY <= y + up;
}

export function getWalkablePlacedObjectHeight(position, radius = 0.35, options = {}) {
  const list = state.params.placedObjects || [];
  if (!list.length || !position) return 0;

  const r = Math.max(0, Number(radius) || 0);
  const currentY = Number.isFinite(Number(options.currentY)) ? Number(options.currentY) : Number(position.y) || 0;
  const stepUp = Math.max(0, Number(options.stepUp) || 0.35);
  const stepDown = Math.max(0, Number(options.stepDown) || 0.45);
  let height = 0;

  for (const obj of list) {
    const asset = getAsset(obj.assetId);
    if (asset.clip === false) continue;

    const rampY = rampSurfaceHeightAt(obj, asset, position.x, position.z, Math.max(r, 0.12));
    if (rampY !== null && rampY > height) {
      height = rampY;
      continue;
    }

    const topY = flatTopHeightAt(obj, asset, position.x, position.z, r);
    if (topY !== null && topY > height && canStandOnObjectTop(currentY, topY, stepUp, stepDown)) {
      height = topY;
    }
  }
  return height;
}

function circleOverlapsBounds(x, z, radius, bounds) {
  const closestX = clamp(x, bounds.minX, bounds.maxX);
  const closestZ = clamp(z, bounds.minZ, bounds.maxZ);
  const dx = x - closestX;
  const dz = z - closestZ;
  return (dx * dx + dz * dz) < radius * radius;
}

function resolveCircleAgainstBounds(position, radius, bounds) {
  const closestX = clamp(position.x, bounds.minX, bounds.maxX);
  const closestZ = clamp(position.z, bounds.minZ, bounds.maxZ);
  let dx = position.x - closestX;
  let dz = position.z - closestZ;
  const radiusSq = radius * radius;
  const dSq = dx * dx + dz * dz;

  if (dSq >= radiusSq) return false;

  if (dSq > 0.000001) {
    const d = Math.sqrt(dSq);
    const push = radius - d;
    position.x += (dx / d) * push;
    position.z += (dz / d) * push;
    return true;
  }

  // Circle centre is inside the object footprint. Push to the nearest edge.
  const left = Math.abs(position.x - bounds.minX);
  const right = Math.abs(bounds.maxX - position.x);
  const bottom = Math.abs(position.z - bounds.minZ);
  const top = Math.abs(bounds.maxZ - position.z);
  const min = Math.min(left, right, bottom, top);

  if (min === left) position.x = bounds.minX - radius;
  else if (min === right) position.x = bounds.maxX + radius;
  else if (min === bottom) position.z = bounds.minZ - radius;
  else position.z = bounds.maxZ + radius;

  return true;
}

export function resolveCircleAgainstPlacedObjects(position, radius = 0.45, passes = 4, options = {}) {
  const list = state.params.placedObjects || [];
  if (!list.length || !position) return false;

  const r = Math.max(0.01, Number(radius) || 0.45);
  let clipped = false;
  const maxPasses = Math.max(1, Math.min(8, Number(passes) || 4));

  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const obj of list) {
      const bounds = placedObjectBounds(obj);
      if (bounds.asset.clip === false) continue;
      if (options.walkableRamps === true && bounds.asset.walkable === true) continue;
      if (Number.isFinite(Number(options.footY)) && bounds.asset.walkable !== true) {
        const local = localPointForObject(obj, position.x, position.z);
        if (isInsideLocalFootprint(local, bounds.asset, r, obj)
          && canStandOnObjectTop(options.footY, bounds.maxY, options.stepUp, options.stepDown)) {
          continue;
        }
      }
      if (resolveCircleAgainstBounds(position, r, bounds)) {
        changed = true;
        clipped = true;
      }
    }
    if (!changed) break;
  }

  return clipped;
}

export function isPlacedObjectHit(position, radius = 0.1) {
  const list = state.params.placedObjects || [];
  if (!list.length || !position) return false;

  const r = Math.max(0.001, Number(radius) || 0.1);
  const y = Number(position.y) || 0;
  for (const obj of list) {
    const bounds = placedObjectBounds(obj);
    if (bounds.asset.clip === false) continue;
    if (bounds.asset.walkable === true) {
      const surfaceY = rampSurfaceHeightAt(obj, bounds.asset, position.x, position.z, r);
      if (surfaceY !== null && y - r <= surfaceY && y + r >= bounds.minY) return true;
      continue;
    }
    if (y + r < bounds.minY || y - r > bounds.maxY) continue;
    if (circleOverlapsBounds(position.x, position.z, r, bounds)) return true;
  }
  return false;
}

// ── Ghost preview materials ────────────────────────────────────────────────────
const _ghostMat = new THREE.MeshBasicMaterial({
  color: 0x44aaff, transparent: true, opacity: 0.45,
  depthWrite: false,
});
const _ghostBlockedMat = new THREE.MeshBasicMaterial({
  color: 0xff4444, transparent: true, opacity: 0.45,
  depthWrite: false,
});
const _ghostWireMat = new THREE.MeshBasicMaterial({
  color: 0x88ddff, transparent: true, opacity: 0.8,
  wireframe: true, depthWrite: false,
});

let _ghostMesh      = null;
let _ghostWire      = null;
let _currentAssetId = null;
const _floorPlane   = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _raycaster    = new THREE.Raycaster();
const _ndc          = new THREE.Vector2(0, 0);
const _hitPoint     = new THREE.Vector3();

function rebuildGhost(assetId) {
  if (_ghostMesh) { scene.remove(_ghostMesh); _ghostMesh.geometry.dispose(); _ghostMesh = null; }
  if (_ghostWire) { scene.remove(_ghostWire); _ghostWire.geometry.dispose(); _ghostWire = null; }
  const geo   = makeGeo(assetId);
  _ghostMesh  = new THREE.Mesh(geo, _ghostMat);
  _ghostWire  = new THREE.Mesh(geo, _ghostWireMat);
  _ghostMesh.frustumCulled = false;
  _ghostWire.frustumCulled = false;
  _ghostMesh.renderOrder = 10;
  _ghostWire.renderOrder = 11;
  scene.add(_ghostMesh);
  scene.add(_ghostWire);
  _currentAssetId = assetId;
}

// ── Placed-object registry ─────────────────────────────────────────────────────
const _placedMeshes = [];

function materialForAsset(asset, obj = null) {
  return new THREE.MeshStandardMaterial({
    color: resolvePlacedColor(obj, asset), roughness: 0.7, metalness: 0.1,
  });
}

function syncGhostColor(asset) {
  const previewColor = resolvePlacedColor(null, asset);
  _ghostMat.color.set(previewColor);
  _ghostWireMat.color.set(previewColor);
}

function disposePlacedMesh(mesh) {
  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
}

function removePlacedMesh(mesh) {
  const meshIndex = _placedMeshes.indexOf(mesh);
  if (meshIndex === -1) return false;

  const list = state.params.placedObjects || [];
  const obj = mesh.userData?.placedObject;
  const dataIndex = obj ? list.indexOf(obj) : -1;
  if (dataIndex !== -1) list.splice(dataIndex, 1);
  else if (meshIndex < list.length) list.splice(meshIndex, 1);
  state.params.placedObjects = list;

  _placedMeshes.splice(meshIndex, 1);
  disposePlacedMesh(mesh);
  return true;
}

function removePlacedObjectByAim() {
  const hits = _raycaster.intersectObjects(_placedMeshes, false);
  if (!hits.length) return false;
  return removePlacedMesh(hits[0].object);
}

function removePlacedObjectAtFootprint(sx, sz, assetId, ry, scaleSource = null) {
  const asset = getAsset(assetId);
  const scale = getPlacedScale(scaleSource);
  const y = Number(asset?.yOffset ?? 0.5) * scale.y;
  const targetBounds = makeBounds(assetId, sx, sz, ry, scale, y);
  const list = state.params.placedObjects || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const obj = list[i];
    const bounds = placedObjectBounds(obj);
    if (boundsOverlap(targetBounds, bounds) && _placedMeshes[i]) return removePlacedMesh(_placedMeshes[i]);
  }
  return false;
}

export function rebuildPlacedObjects() {
  for (const m of _placedMeshes) {
    disposePlacedMesh(m);
  }
  _placedMeshes.length = 0;

  const list = state.params.placedObjects || [];
  for (const obj of list) {
    const asset = getAsset(obj.assetId);
    const mesh  = new THREE.Mesh(makeGeo(asset.id), materialForAsset(asset, obj));
    mesh.userData.placedObject = obj;
    const scale = getPlacedScale(obj);
    mesh.position.set(obj.x, obj.y, obj.z);
    mesh.rotation.y    = obj.ry ?? 0;
    mesh.scale.set(scale.x, scale.y, scale.z);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    _placedMeshes.push(mesh);
  }
}

function placeObject(sx, sz) {
  const assetId = state.params.placerSelectedAsset || 'box';
  const asset   = getAsset(assetId);
  const scale   = getCurrentPlacerScale();
  const yOff    = (asset.yOffset ?? 0.5) * scale.y;
  const ry      = getCurrentPlacerRotation();

  const color = resolvePlacedColor(null, asset);
  const placed = {
    assetId, x: sx, y: yOff, z: sz, ry, color,
    scaleX: scale.x, scaleY: scale.y, scaleZ: scale.z,
  };
  const list = state.params.placedObjects || [];
  list.push(placed);
  state.params.placedObjects = list;

  const mesh = new THREE.Mesh(makeGeo(asset.id), materialForAsset(asset, placed));
  mesh.userData.placedObject = placed;
  mesh.position.set(sx, yOff, sz);
  mesh.rotation.y    = ry;
  mesh.scale.set(scale.x, scale.y, scale.z);
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  _placedMeshes.push(mesh);
}

export function clearPlacedObjects() {
  for (const m of _placedMeshes) {
    disposePlacedMesh(m);
  }
  _placedMeshes.length = 0;
  state.params.placedObjects = [];
}

// ── HUD slot indicator ─────────────────────────────────────────────────────────
let _slotEl = null;
function getSlotEl() {
  if (!_slotEl) {
    _slotEl = document.createElement('div');
    _slotEl.id = 'placer-slot-hud';
    _slotEl.style.cssText = [
      'position:fixed', 'bottom:140px', 'left:22px',
      'font-size:11px', 'font-weight:700', 'letter-spacing:0.12em',
      'color:rgba(255,255,255,0.7)', 'pointer-events:none',
      'z-index:24', 'font-family:var(--hud-font-family,system-ui)',
    ].join(';');
    document.body.appendChild(_slotEl);
  }
  return _slotEl;
}

// ── Per-frame update ───────────────────────────────────────────────────────────
let _firePrev = false;
let _secondaryPrev = false;

function syncReticleForActiveSlot(placerOn) {
  const reticle = document.getElementById('target-reticle');
  if (!reticle) return;
  const shouldShow = !placerOn && !!state.params.hudVisible && !!state.params.reticleVisible;
  reticle.style.display = shouldShow ? '' : 'none';
  if (placerOn) {
    reticle.classList.remove('reticle-enemy-hover', 'is-targeting-enemy');
  }
}

export function updatePlacer() {
  const slot     = state.activeSlot ?? 0;
  const placerOn = slot === 1;
  const assetId  = state.params.placerSelectedAsset || 'box';

  // ADS and the combat reticle are disabled while placer is active.
  if (placerOn) state.isAiming = false;
  syncReticleForActiveSlot(placerOn);

  // Slot HUD
  const slotEl = getSlotEl();
  slotEl.style.display = state.paused ? 'none' : '';
  if (!state.paused) {
    slotEl.textContent = slot === 0
      ? '[ LASER ]  placer'
      : 'laser  [ PLACER ]  ·  R transform  ·  F pick  ·  Right-click remove';
  }

  // Hide ghost when not in placer mode
  if (!placerOn || state.paused) {
    if (_ghostMesh) _ghostMesh.visible = false;
    if (_ghostWire) _ghostWire.visible = false;
    _firePrev = state.primaryFire;
    _secondaryPrev = state.secondaryFire;
    return;
  }

  // Rebuild ghost if asset changed
  if (assetId !== _currentAssetId) rebuildGhost(assetId);
  if (!_ghostMesh) rebuildGhost(assetId);
  syncGhostColor(getAsset(assetId));

  // Apply current transform to ghost
  const ry = getCurrentPlacerRotation();
  const scale = getCurrentPlacerScale();
  _ghostMesh.rotation.y = ry;
  _ghostWire.rotation.y = ry;
  _ghostMesh.scale.set(scale.x, scale.y, scale.z);
  _ghostWire.scale.set(scale.x, scale.y, scale.z);

  // Raycast camera centre → placed objects first, then floor plane.
  camera.updateMatrixWorld(true);
  _raycaster.setFromCamera(_ndc, camera);
  const removePressed = !!state.secondaryFire && !_secondaryPrev;
  if (removePressed && removePlacedObjectByAim()) {
    _firePrev = state.primaryFire;
    _secondaryPrev = state.secondaryFire;
    return;
  }

  const hit = _raycaster.ray.intersectPlane(_floorPlane, _hitPoint);

  if (hit) {
    const asset = getAsset(assetId);
    const yOff  = (asset.yOffset ?? 0.5) * scale.y;

    // Footprint-aware snap: aligns base edges to grid lines
    const { sx, sz } = snapToFootprint(_hitPoint.x, _hitPoint.z, assetId, ry, scale);

    _ghostMesh.position.set(sx, yOff, sz);
    _ghostWire.position.copy(_ghostMesh.position);

    const occupied = isFootprintOccupied(sx, sz, assetId, ry, scale);
    _ghostMesh.material = occupied ? _ghostBlockedMat : _ghostMat;
    _ghostMesh.visible  = true;
    _ghostWire.visible  = true;

    if (removePressed && occupied) {
      removePlacedObjectAtFootprint(sx, sz, assetId, ry, scale);
    } else if (state.primaryFire && !_firePrev && !occupied) {
      placeObject(sx, sz);
    }
  } else {
    _ghostMesh.visible = false;
    _ghostWire.visible = false;
  }

  _firePrev = state.primaryFire;
  _secondaryPrev = state.secondaryFire;
}
