// src/placer.js
// Object placer system: ghost preview, footprint-aware grid-snapping, placement,
// placed-object clipping, flat-top/ramp walkability, per-object colour, and targeted removal.
// Slot 0 = laser, Slot 1 = placer. Scroll wheel switches slots.
// R key opens the shape transform modal. Right-click removes the targeted placed object.
// Placed objects store rotation/colour/scale in serialised state.

import * as THREE from 'three';
import { scene, camera, triggerCameraShake } from './renderer.js';
import { state } from './state.js';
import { ASSET_CATALOGUE } from './assets-catalogue.js';
import { getSfxVolume } from './audio.js';

// ── Geometry factories (Three.js — kept here, not in catalogue) ───────────────
const _geoFactories = {
  box:      () => new THREE.BoxGeometry(1, 1, 1),
  tall_box: () => new THREE.BoxGeometry(1, 2, 1),
  cylinder: () => new THREE.CylinderGeometry(0.4, 0.4, 1.0, 12),
  destructible_crate:  () => new THREE.BoxGeometry(1, 1, 1),
  destructible_barrel: () => new THREE.CylinderGeometry(0.4, 0.4, 1.0, 12),
  sphere:   () => new THREE.SphereGeometry(0.5, 16, 12),
  wall:     () => new THREE.BoxGeometry(4, 2, 0.25),
  ramp: () => {
    // Non-indexed triangular-prism ramp with duplicated vertices per face. This
    // keeps the ramp visually flat/sharp while EdgesGeometry still omits the
    // coplanar internal diagonals in the placement preview.
    const g = new THREE.BufferGeometry();
    const pts = [
      [-2, 0, -1], [ 2, 0, -1], [-2, 0,  1],
      [ 2, 0,  1], [-2, 2,  1], [ 2, 2,  1],
    ];
    const faces = [
      [0, 1, 3], [0, 3, 2],     // bottom, normal down
      [0, 5, 1], [0, 4, 5],     // sloped walkable face, normal up/front
      [0, 2, 4],                // left side
      [1, 5, 3],                // right side
      [2, 3, 5], [2, 5, 4],     // high rear face
    ];
    const positions = [];
    for (const tri of faces) {
      for (const i of tri) positions.push(...pts[i]);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    g.computeVertexNormals();
    return g;
  },
};

function makeGeo(assetId) {
  return (_geoFactories[assetId] || _geoFactories.box)();
}

const _dangerTexture = new THREE.TextureLoader().load('./assets/danger.png');
if ('colorSpace' in _dangerTexture && THREE.SRGBColorSpace) _dangerTexture.colorSpace = THREE.SRGBColorSpace;
const _dangerDecalMaterial = new THREE.MeshBasicMaterial({
  map: _dangerTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
});
const DESTRUCTIBLE_PARTICLE_GRAVITY = 9;
const _destructibleParticles = [];
const _destructibleParticlePool = [];
const _destructibleParticleGeo = new THREE.BoxGeometry(1, 1, 1);
const _destructibleShockwaves = [];
const _destructibleShockwaveGeo = new THREE.SphereGeometry(1, 32, 16);
let _destructibleShockwaveId = 1;

let _objectExplosionEl = null;
function playObjectExplosionSound(sourcePosition = null) {
  const fallback = Number(state.params.soundSfx_explode ?? 1);
  const volume = getSfxVolume('soundSfx_object_explode', fallback, sourcePosition);
  if (volume <= 0) return;
  if (!_objectExplosionEl) _objectExplosionEl = new Audio('./assets/xpl1.wav');
  const sound = _objectExplosionEl.cloneNode();
  sound.volume = volume;
  sound.currentTime = 0;
  sound.play().catch(() => {});
}


function getAsset(id) {
  return ASSET_CATALOGUE.find(a => a.id === id) || ASSET_CATALOGUE[0];
}

function isPrefabAsset(asset) {
  return asset?.prefab === true && Array.isArray(asset.prefabItems);
}

let _placedObjectIdSeq = 1;
let _prefabGroupIdSeq = 1;
function nextPlacedObjectId(prefix = 'placed') {
  return `${prefix}_${Date.now().toString(36)}_${(_placedObjectIdSeq++).toString(36)}`;
}
function nextPrefabGroupId() {
  return `prefab_${Date.now().toString(36)}_${(_prefabGroupIdSeq++).toString(36)}`;
}

function ensurePlacedObjectMetadata() {
  const list = state.params.placedObjects || [];
  const seen = new Set();
  for (const obj of list) {
    if (!obj.objectId || seen.has(obj.objectId)) obj.objectId = nextPlacedObjectId();
    seen.add(obj.objectId);
  }
  const valid = new Set(list.map(obj => obj.objectId).filter(Boolean));
  state.selectedPlacedObjectIds = (state.selectedPlacedObjectIds || []).filter(id => valid.has(id));
}

function isObjectSelected(obj) {
  return !!obj?.objectId && (state.selectedPlacedObjectIds || []).includes(obj.objectId);
}

function notifySelectionChanged() {
  window.dispatchEvent?.(new CustomEvent('placed-selection-changed', {
    detail: { count: getSelectedPlacedObjectCount() },
  }));
}

function rotatePrefabOffset(x, z, ry) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return { x: c * x - s * z, z: s * x + c * z };
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
  // Object transforms snap to half-grid increments only: 0.5, 1.0, 1.5, etc.
  return Math.min(6, Math.max(0.5, Math.round(n * 2) / 2));
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
//   • Odd whole-cell footprints centre inside grid cells: floor(v)+0.5
//   • Even whole-cell footprints centre on grid lines: round(v)
//   • Half-cell/scaled footprints snap to half-grid increments.
//
// This keeps object base edges aligned to the grid while still allowing large
// objects such as 4×2 ramps to move in one-grid-unit increments.

function snapAxis(v, footprintDim) {
  const dim = Math.max(0.25, Number(footprintDim) || 1);
  const rounded = Math.round(dim);

  if (Math.abs(dim - rounded) > 0.001) {
    // Half-cell/scaled shapes keep their centre on half-cell increments.
    return Math.round(v * 2) / 2;
  }

  if (rounded % 2 === 1) {
    // Odd-width: centre inside the middle cell.
    return Math.floor(v) + 0.5;
  }

  // Even-width: centre on any grid line, not only multiples of the footprint.
  return Math.round(v);
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

function verticalBoundsOverlap(a, b, padding = 0.001) {
  return a.minY < b.maxY - padding && a.maxY > b.minY + padding;
}

function getObjectYForBase(asset, scale, baseY) {
  return Number(baseY || 0) + Number(asset?.yOffset ?? 0.5) * scale.y;
}

function getStackBaseHeight(sx, sz, assetId, ry, scaleSource = null) {
  const asset = getAsset(assetId);
  const scale = getPlacedScale(scaleSource);
  const list = state.params.placedObjects || [];
  let baseY = 0;

  // Find the lowest open vertical slot for this footprint instead of always
  // stacking above the highest overlapping object. This allows a new object to
  // be placed beneath a floating upper object after its lower support is deleted.
  for (let guard = 0; guard <= list.length; guard++) {
    const candidateY = getObjectYForBase(asset, scale, baseY);
    const candidate = makeBounds(assetId, sx, sz, ry, scale, candidateY);
    let nextBaseY = baseY;

    for (const obj of list) {
      const bounds = placedObjectBounds(obj);
      if (bounds.asset.clip === false) continue;
      if (!boundsOverlap(candidate, bounds)) continue;
      if (!verticalBoundsOverlap(candidate, bounds)) continue;
      nextBaseY = Math.max(nextBaseY, bounds.maxY);
    }

    if (nextBaseY === baseY) return baseY;
    baseY = nextBaseY;
  }

  return baseY;
}

function getPlacementY(sx, sz, assetId, ry, scaleSource = null) {
  const asset = getAsset(assetId);
  const scale = getPlacedScale(scaleSource);
  const baseY = getStackBaseHeight(sx, sz, assetId, ry, scale);
  return baseY + Number(asset?.yOffset ?? 0.5) * scale.y;
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

function rampSurfaceHeightAt(obj, asset, worldX, worldZ, padding = 0, options = {}) {
  if (obj.assetId !== 'ramp' && asset.walkable !== true) return null;
  const local = localPointForObject(obj, worldX, worldZ);
  const { fw, fh } = getLocalFootprint(asset, obj);

  const p = Math.max(0, Number(padding) || 0);
  const sidePadding = Math.min(
    p,
    Math.max(0, Number(options.sidePadding ?? 0.12) || 0)
  );
  const lowEndPadding = Math.min(
    Math.max(0, Number(options.lowEndPadding ?? p) || 0),
    Math.max(0, Number(options.maxLowEndPadding ?? 0.5) || 0)
  );
  const highEndPadding = Math.min(
    Math.max(0, Number(options.highEndPadding ?? 0.02) || 0),
    Math.max(0, Number(options.maxHighEndPadding ?? 0.08) || 0)
  );

  // The ramp needs enough tolerance on the low/front edge for the capsule centre
  // to enter before the AABB blocker rejects it. Keep the high/back edge and the
  // left/right sides tight so touching a vertical non-ramp face cannot pop the
  // player onto the sloped surface.
  if (local.x < -fw / 2 - sidePadding || local.x > fw / 2 + sidePadding) return null;
  if (local.z < -fh / 2 - lowEndPadding || local.z > fh / 2 + highEndPadding) return null;

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

    const rampY = rampSurfaceHeightAt(obj, asset, position.x, position.z, Math.max(r, 0.12), {
      lowEndPadding: r + 0.03,
      sidePadding: 0.12,
      // Allow a full capsule-radius overlap at the high edge while the
      // step-height gate below decides whether the player is actually high
      // enough to stand on/descend the slope. This keeps ground-level rear
      // contact blocked, but lets the player move down from the top edge.
      highEndPadding: r + 0.03,
      maxHighEndPadding: r + 0.03,
    });
    if (rampY !== null
      && rampY > height
      && canStandOnObjectTop(currentY, rampY, stepUp, stepDown)) {
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
      if (options.walkableRamps === true && bounds.asset.walkable === true) {
        const footY = Number(options.footY);
        if (Number.isFinite(footY)) {
          const rampY = rampSurfaceHeightAt(obj, bounds.asset, position.x, position.z, r, {
            lowEndPadding: r + 0.03,
            sidePadding: 0.12,
            // Match the walkable-height query: allow high-edge overlap for
            // descending from the ramp top, but keep the canStandOnObjectTop
            // check so low/rear contact still behaves as a blocker.
            highEndPadding: r + 0.03,
            maxHighEndPadding: r + 0.03,
          });
          if (rampY !== null && canStandOnObjectTop(footY, rampY, options.stepUp, options.stepDown)) {
            continue;
          }
        }
      }
      if (Number.isFinite(Number(options.footY)) && bounds.asset.walkable !== true) {
        const footY = Number(options.footY);
        const local = localPointForObject(obj, position.x, position.z);
        if (isInsideLocalFootprint(local, bounds.asset, r, obj)) {
          // Once the capsule feet are on or above a top face, stop treating that
          // object as a side blocker. This prevents jumping/landing on placed
          // objects from pushing the capsule sideways or jittering at the edge.
          if (footY >= bounds.maxY - 0.06) continue;
          if (options.grounded === true && canStandOnObjectTop(footY, bounds.maxY, options.stepUp, options.stepDown)) {
            continue;
          }
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
  for (const obj of [...list]) {
    const bounds = placedObjectBounds(obj);
    if (bounds.asset.clip === false) continue;
    if (bounds.asset.walkable === true) {
      const surfaceY = rampSurfaceHeightAt(obj, bounds.asset, position.x, position.z, r);
      if (surfaceY !== null && y - r <= surfaceY && y + r >= bounds.minY) return true;
      continue;
    }
    if (y + r < bounds.minY || y - r > bounds.maxY) continue;
    if (circleOverlapsBounds(position.x, position.z, r, bounds)) {
      if (bounds.asset.destructible === true) destroyPlacedObject(obj);
      return true;
    }
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
const _ghostWireMat = new THREE.LineBasicMaterial({
  color: 0x88ddff, transparent: true, opacity: 0.8,
  depthWrite: false,
});

let _ghostMesh      = null;
let _ghostWire      = null;
let _currentAssetId = null;
const _floorPlane   = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _raycaster    = new THREE.Raycaster();
const _ndc          = new THREE.Vector2(0, 0);
const _hitPoint     = new THREE.Vector3();

function disposeGhostRoot(root) {
  if (!root) return;
  scene.remove(root);
  root.traverse?.(child => {
    if (child.geometry) child.geometry.dispose?.();
  });
}

function addGhostPart(meshGroup, wireGroup, assetId, { x = 0, y = 0, z = 0, ry = 0, scaleX = 1, scaleY = 1, scaleZ = 1 } = {}) {
  const geo = makeGeo(assetId);
  const mesh = new THREE.Mesh(geo, _ghostMat);
  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), _ghostWireMat);
  mesh.position.set(x, y, z);
  wire.position.set(x, y, z);
  mesh.rotation.y = ry;
  wire.rotation.y = ry;
  mesh.scale.set(scaleX, scaleY, scaleZ);
  wire.scale.set(scaleX, scaleY, scaleZ);
  mesh.frustumCulled = false;
  wire.frustumCulled = false;
  mesh.renderOrder = 10;
  wire.renderOrder = 11;
  meshGroup.add(mesh);
  wireGroup.add(wire);
}

function rebuildGhost(assetId) {
  disposeGhostRoot(_ghostMesh);
  disposeGhostRoot(_ghostWire);
  _ghostMesh = new THREE.Group();
  _ghostWire = new THREE.Group();
  _ghostMesh.frustumCulled = false;
  _ghostWire.frustumCulled = false;

  const asset = getAsset(assetId);
  if (isPrefabAsset(asset)) {
    for (const item of asset.prefabItems) {
      const subAsset = getAsset(item.assetId);
      const itemScale = getPlacedScale({
        assetId: item.assetId,
        scaleX: item.scaleX ?? 1,
        scaleY: item.scaleY ?? 1,
        scaleZ: item.scaleZ ?? 1,
      });
      addGhostPart(_ghostMesh, _ghostWire, item.assetId, {
        x: Number(item.x) || 0,
        y: Number.isFinite(Number(item.y)) ? Number(item.y) : Number(subAsset?.yOffset ?? 0.5) * itemScale.y,
        z: Number(item.z) || 0,
        ry: Number(item.ry) || 0,
        scaleX: itemScale.x,
        scaleY: itemScale.y,
        scaleZ: itemScale.z,
      });
    }
  } else {
    addGhostPart(_ghostMesh, _ghostWire, assetId);
  }

  scene.add(_ghostMesh);
  scene.add(_ghostWire);
  _currentAssetId = assetId;
}

function setGhostMaterial(blocked = false) {
  const mat = blocked ? _ghostBlockedMat : _ghostMat;
  _ghostMesh?.traverse?.(child => { if (child.isMesh) child.material = mat; });
}

// ── Placed-object registry ─────────────────────────────────────────────────────
const _placedMeshes = [];
const _selectionHelpers = [];
const _selectionHelperMatColor = 0x58a6ff;

function clearSelectionHelpers() {
  for (const helper of _selectionHelpers) {
    scene.remove(helper);
    helper.geometry?.dispose?.();
    helper.material?.dispose?.();
  }
  _selectionHelpers.length = 0;
}

function rebuildSelectionHelpers() {
  clearSelectionHelpers();
  for (const mesh of _placedMeshes) {
    if (!isObjectSelected(mesh.userData?.placedObject)) continue;
    const helper = new THREE.BoxHelper(mesh, _selectionHelperMatColor);
    helper.renderOrder = 18;
    scene.add(helper);
    _selectionHelpers.push(helper);
  }
}

function refreshSelection() {
  ensurePlacedObjectMetadata();
  rebuildSelectionHelpers();
  notifySelectionChanged();
}

function materialForAsset(asset, obj = null) {
  return new THREE.MeshStandardMaterial({
    color: resolvePlacedColor(obj, asset),
    roughness: 0.7,
    metalness: 0.1,
    flatShading: asset?.id === 'ramp',
  });
}

function syncGhostColor(asset) {
  const previewColor = resolvePlacedColor(null, asset);
  _ghostMat.color.set(previewColor);
  _ghostWireMat.color.set(previewColor);
}

function disposePlacedMesh(mesh) {
  scene.remove(mesh);
  mesh.traverse?.(child => {
    if (child !== mesh) {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
  });
  mesh.geometry?.dispose?.();
  mesh.material?.dispose?.();
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
  rebuildPlacedObjects();
  notifySelectionChanged();
  return true;
}

function removePlacedObjectByAim() {
  const hits = _raycaster.intersectObjects(_placedMeshes, false);
  if (!hits.length) return false;
  return removePlacedMesh(hits[0].object);
}

function selectPlacedObjectByAim({ toggle = true, additive = true } = {}) {
  const hits = _raycaster.intersectObjects(_placedMeshes, false);
  if (!hits.length) {
    if (!additive) clearPlacedObjectSelection();
    return false;
  }

  ensurePlacedObjectMetadata();
  const obj = hits[0].object.userData?.placedObject;
  if (!obj?.objectId) return false;

  const selected = new Set(state.selectedPlacedObjectIds || []);
  if (!additive) selected.clear();
  if (toggle && selected.has(obj.objectId)) selected.delete(obj.objectId);
  else selected.add(obj.objectId);
  state.selectedPlacedObjectIds = Array.from(selected);
  rebuildSelectionHelpers();
  notifySelectionChanged();
  return true;
}

export function getSelectedPlacedObjectCount() {
  ensurePlacedObjectMetadata();
  return (state.selectedPlacedObjectIds || []).length;
}

export function clearPlacedObjectSelection() {
  state.selectedPlacedObjectIds = [];
  rebuildSelectionHelpers();
  notifySelectionChanged();
}

export function selectAllPlacedObjects() {
  ensurePlacedObjectMetadata();
  state.selectedPlacedObjectIds = (state.params.placedObjects || [])
    .map(obj => obj.objectId)
    .filter(Boolean);
  rebuildSelectionHelpers();
  notifySelectionChanged();
}

export function deleteSelectedPlacedObjects() {
  ensurePlacedObjectMetadata();
  const selected = new Set(state.selectedPlacedObjectIds || []);
  if (!selected.size) return 0;
  const before = (state.params.placedObjects || []).length;
  state.params.placedObjects = (state.params.placedObjects || [])
    .filter(obj => !selected.has(obj.objectId));
  state.selectedPlacedObjectIds = [];
  rebuildPlacedObjects();
  notifySelectionChanged();
  return before - state.params.placedObjects.length;
}

window.__deleteSelectedPlacedObjects = deleteSelectedPlacedObjects;
window.__clearPlacedObjectSelection = clearPlacedObjectSelection;
window.__selectAllPlacedObjects = selectAllPlacedObjects;

function removePlacedObjectAtFootprint(sx, sz, assetId, ry, scaleSource = null) {
  const asset = getAsset(assetId);
  const scale = getPlacedScale(scaleSource);
  const y = getPlacementY(sx, sz, assetId, ry, scale);
  const targetBounds = makeBounds(assetId, sx, sz, ry, scale, y);
  const list = state.params.placedObjects || [];
  let bestIndex = -1;
  let bestTop = -Infinity;

  for (let i = 0; i < list.length; i++) {
    const obj = list[i];
    const bounds = placedObjectBounds(obj);
    if (!boundsOverlap(targetBounds, bounds)) continue;
    if (bounds.maxY >= bestTop) {
      bestTop = bounds.maxY;
      bestIndex = i;
    }
  }

  return bestIndex >= 0 && _placedMeshes[bestIndex] ? removePlacedMesh(_placedMeshes[bestIndex]) : false;
}


function hexToNumber(value, fallback = 0xffcc00) {
  const normalized = normalizeHexColor(value);
  return normalized ? Number.parseInt(normalized.slice(1), 16) : fallback;
}

function destructionParam(prefix, suffix, fallback) {
  const value = state.params[`${prefix}${suffix}`];
  return value === undefined || value === null ? fallback : value;
}

function getOverallBloomFactor() {
  const raw = Number(state.params.overallBloomIntensity);
  return clamp(Number.isFinite(raw) ? raw : 1, 0, 4);
}

function getDestructibleExplosionConfig() {
  const p = state.params;
  return {
    count: Math.max(0, Math.round(Number(destructionParam('destructionDestructible', 'ParticleCount', p.enemyDestructionParticleCount ?? 40)) || 0)),
    size: Math.max(0.01, Number(destructionParam('destructionDestructible', 'ParticleSize', p.enemyDestructionParticleSize ?? 0.32)) || 0.32),
    speed: Math.max(0.01, Number(destructionParam('destructionDestructible', 'ParticleSpeed', p.enemyDestructionParticleSpeed ?? 1.25)) || 1.25),
    glow: Math.max(0, Number(destructionParam('destructionDestructible', 'ParticleGlow', p.enemyDestructionParticleGlow ?? 8)) || 0),
    particleDespawnTime: Math.max(0.1, Number(destructionParam('destructionDestructible', 'ParticleDespawnTime', 1.0)) || 1.0),
    color: hexToNumber(destructionParam('destructionDestructible', 'Color', '#ffd400'), 0xffd400),
    physics: destructionParam('destructionDestructible', 'Physics', p.enemyDestructionPhysics === false ? 'ethereal' : 'gravity'),
    shockwaveSpeed: clamp(Number(destructionParam('destructionDestructible', 'ShockwaveSpeed', 10)) || 0, 0, 40),
    shockwaveColor: hexToNumber(destructionParam('destructionDestructible', 'ShockwaveColor', destructionParam('destructionDestructible', 'Color', '#ffd400')), 0xffd400),
    shockwaveTransparency: clamp(Number(destructionParam('destructionDestructible', 'ShockwaveTransparency', 0.34)) || 0, 0, 1),
    shockwaveFadeTime: clamp(Number(destructionParam('destructionDestructible', 'ShockwaveFadeTime', 0.45)) || 0.45, 0.05, 3),
    shockwaveDelay: clamp(Number(destructionParam('destructionDestructible', 'ShockwaveDelay', 0)) || 0, 0, 3),
    splashDamage: clamp(Number(destructionParam('destructionDestructible', 'SplashDamage', 45)) || 0, 0, 500),
    splashRadius: clamp(Number(destructionParam('destructionDestructible', 'SplashRadius', 8)) || 0, 0, 80),
    splashFalloff: clamp(Number(destructionParam('destructionDestructible', 'SplashFalloff', 1)) || 1, 0.1, 4),
    splashMinFactor: clamp(Number(destructionParam('destructionDestructible', 'SplashMinFactor', 0.15)) || 0, 0, 1),
  };
}

function acquireDestructibleParticle(color) {
  const mesh = _destructibleParticlePool.pop() || new THREE.Mesh(
    _destructibleParticleGeo,
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0, transparent: true,
      opacity: 1, roughness: 0.52, metalness: 0.05, depthWrite: false, toneMapped: false,
    }),
  );
  mesh.material.color.set(color);
  mesh.material.emissive.set(color);
  mesh.material.opacity = 1;
  mesh.material.emissiveIntensity = 0;
  mesh.visible = true;
  scene.add(mesh);
  return mesh;
}

function releaseDestructibleParticle(particle) {
  scene.remove(particle.mesh);
  particle.mesh.visible = false;
  _destructibleParticlePool.push(particle.mesh);
}

function spawnDestructibleShockwave(cx, cy, cz, cfg) {
  const speed = Math.max(0, Number(cfg.shockwaveSpeed) || 0);
  const fadeTime = clamp(Number(cfg.shockwaveFadeTime) || 0.45, 0.05, 3);
  const visualMaxRadius = Math.max(0, speed * fadeTime);
  const damage = Math.max(0, Number(cfg.splashDamage) || 0);
  const splashRadius = clamp(Number(cfg.splashRadius) || 0, 0, 80);
  const damageMaxRadius = splashRadius > 0 ? splashRadius : visualMaxRadius;
  if (visualMaxRadius <= 0 && (damage <= 0 || damageMaxRadius <= 0)) return;

  const event = {
    id: `destructible_splash_${_destructibleShockwaveId++}`,
    x: cx, y: cy, z: cz,
    currentRadius: 0,
    maxRadius: damageMaxRadius,
    damage,
    damageFalloff: clamp(Number(cfg.splashFalloff) || 1, 0.1, 4),
    minDamageFactor: clamp(Number(cfg.splashMinFactor) || 0, 0, 1),
    active: false,
    hitEnemyIds: [],
    hitObjectIds: [],
    hitPlayer: false,
  };
  state.explosionSplashEvents = state.explosionSplashEvents || [];
  state.explosionSplashEvents.push(event);

  const material = new THREE.MeshBasicMaterial({
    color: cfg.shockwaveColor,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(_destructibleShockwaveGeo, material);
  mesh.name = 'DestructibleShockwaveSphere';
  mesh.position.set(cx, cy, cz);
  mesh.scale.setScalar(0.001);
  mesh.visible = false;
  scene.add(mesh);

  _destructibleShockwaves.push({
    mesh, event,
    age: -clamp(Number(cfg.shockwaveDelay) || 0, 0, 3),
    fadeTime, speed,
    visualMaxRadius,
    damageMaxRadius,
    opacity: clamp(Number(cfg.shockwaveTransparency) || 0, 0, 1),
  });
}

function releaseDestructibleShockwave(shockwave) {
  scene.remove(shockwave.mesh);
  shockwave.mesh.geometry = _destructibleShockwaveGeo;
  shockwave.mesh.material.dispose?.();
  state.explosionSplashEvents = (state.explosionSplashEvents || []).filter(event => event !== shockwave.event);
}

function getExplosionDistanceToPlacedBounds(event, bounds) {
  const ex = Number(event.x) || 0;
  const ez = Number(event.z) || 0;
  const closestX = clamp(ex, bounds.minX, bounds.maxX);
  const closestZ = clamp(ez, bounds.minZ, bounds.maxZ);
  return Math.hypot(ex - closestX, ez - closestZ);
}

function applyExplosionSplashToDestructibleObjects(event) {
  if (!event?.active) return;
  const damage = Math.max(0, Number(event.damage) || 0);
  const radius = Math.max(0, Number(event.currentRadius) || 0);
  if (damage <= 0 || radius <= 0) return;

  const hitObjectIds = Array.isArray(event.hitObjectIds) ? event.hitObjectIds : [];
  event.hitObjectIds = hitObjectIds;
  const hitSet = new Set(hitObjectIds);
  const list = state.params.placedObjects || [];

  for (let i = list.length - 1; i >= 0; i--) {
    const obj = list[i];
    if (!obj) continue;
    const asset = getAsset(obj.assetId);
    if (asset?.destructible !== true) continue;
    const id = obj.objectId || `${obj.assetId}:${obj.x}:${obj.y}:${obj.z}:${i}`;
    if (hitSet.has(id)) continue;

    const distance = getExplosionDistanceToPlacedBounds(event, placedObjectBounds(obj));
    if (distance <= radius) {
      hitSet.add(id);
      hitObjectIds.push(id);
      destroyPlacedObject(obj);
    }
  }
}

function updateDestructibleShockwaves(delta = 1 / 60) {
  for (let i = _destructibleShockwaves.length - 1; i >= 0; i--) {
    const shockwave = _destructibleShockwaves[i];
    shockwave.age += delta;

    if (shockwave.age < 0) {
      shockwave.mesh.visible = false;
      shockwave.event.active = false;
      shockwave.event.currentRadius = 0;
      continue;
    }

    const t = clamp(shockwave.age / shockwave.fadeTime, 0, 1);
    const visualRadius = Math.max(0.001, Math.min(shockwave.visualMaxRadius, shockwave.speed * shockwave.age));
    const damageRadius = Math.max(0, Math.min(shockwave.damageMaxRadius, shockwave.damageMaxRadius * t));
    shockwave.mesh.visible = shockwave.visualMaxRadius > 0 && shockwave.opacity > 0;
    shockwave.mesh.scale.setScalar(visualRadius);
    shockwave.mesh.material.opacity = shockwave.opacity * (1 - t);
    shockwave.event.active = true;
    shockwave.event.currentRadius = damageRadius;
    applyExplosionSplashToDestructibleObjects(shockwave.event);

    if (shockwave.age >= shockwave.fadeTime) {
      if (shockwave.expired) {
        _destructibleShockwaves.splice(i, 1);
        releaseDestructibleShockwave(shockwave);
      } else {
        shockwave.expired = true;
      }
    }
  }
}

function spawnPlacedObjectExplosion(obj, asset) {
  if (state.params.enemyDestructionEnabled === false) return;
  const cfg = getDestructibleExplosionConfig();
  const bounds = placedObjectBounds(obj);
  const cx = Number(obj.x) || 0;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const cz = Number(obj.z) || 0;
  if (cfg.count > 0) {
    for (let i = 0; i < cfg.count; i++) {
      const mesh = acquireDestructibleParticle(cfg.color);
      const baseRadius = (0.08 + Math.random() * 0.14) * cfg.size;
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() - 0.2) * Math.PI * 0.75;
      const speed = (3.5 + Math.random() * 8.5) * cfg.speed;
      const maxLife = cfg.particleDespawnTime;
      mesh.position.set(cx, cy, cz);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      mesh.scale.setScalar(baseRadius);
      _destructibleParticles.push({
        mesh, baseRadius,
        vx: Math.cos(yaw) * Math.cos(pitch) * speed,
        vy: Math.sin(pitch) * speed + (cfg.physics === 'gravity' ? 2.25 * cfg.speed : 0.65 * cfg.speed),
        vz: Math.sin(yaw) * Math.cos(pitch) * speed,
        rx: (Math.random() - 0.5) * 8,
        ry: (Math.random() - 0.5) * 8,
        rz: (Math.random() - 0.5) * 8,
        life: maxLife, maxLife, glowCap: cfg.glow, physics: cfg.physics,
      });
    }
  }
  spawnDestructibleShockwave(cx, cy, cz, cfg);
}

function updateDestructibleParticles(delta = 1 / 60) {
  for (let i = _destructibleParticles.length - 1; i >= 0; i--) {
    const particle = _destructibleParticles[i];
    particle.life -= delta;
    if (particle.life <= 0) {
      _destructibleParticles.splice(i, 1);
      releaseDestructibleParticle(particle);
      continue;
    }
    particle.mesh.position.x += particle.vx * delta;
    particle.mesh.position.y += particle.vy * delta;
    particle.mesh.position.z += particle.vz * delta;
    particle.mesh.rotation.x += particle.rx * delta;
    particle.mesh.rotation.y += particle.ry * delta;
    particle.mesh.rotation.z += particle.rz * delta;
    if (particle.physics === 'gravity') {
      particle.vy -= DESTRUCTIBLE_PARTICLE_GRAVITY * delta;
      if (particle.mesh.position.y < 0.03) {
        particle.mesh.position.y = 0.03;
        particle.vy = Math.abs(particle.vy) * 0.24;
        particle.vx *= 0.82;
        particle.vz *= 0.82;
      }
    } else {
      particle.vy += 0.18 * delta;
    }
    const t = clamp(particle.life / particle.maxLife, 0, 1);
    particle.mesh.scale.setScalar(Math.max(0.001, t * 1.15 * particle.baseRadius));
    particle.mesh.material.opacity = t;
    particle.mesh.material.emissiveIntensity = Math.max(0, t * particle.glowCap * getOverallBloomFactor());
  }
  updateDestructibleShockwaves(delta);
}

function destroyPlacedObject(obj) {
  const list = state.params.placedObjects || [];
  const dataIndex = list.indexOf(obj);
  if (dataIndex === -1) return false;
  const asset = getAsset(obj.assetId);
  if (asset.destructible !== true) return false;
  const explosionOrigin = new THREE.Vector3(
    Number(obj.x) || 0,
    ((placedObjectBounds(obj).minY + placedObjectBounds(obj).maxY) * 0.5) || Number(obj.y) || 0.5,
    Number(obj.z) || 0
  );
  playObjectExplosionSound(explosionOrigin);
  triggerCameraShake(explosionOrigin, 1);
  spawnPlacedObjectExplosion(obj, asset);
  list.splice(dataIndex, 1);
  state.params.placedObjects = list;
  rebuildPlacedObjects();
  return true;
}

function rangesOverlap(minA, maxA, minB, maxB, pad = 0.001) {
  return minA < maxB - pad && maxA > minB + pad;
}

function isDangerFaceShared(obj, bounds, face) {
  const eps = 0.025;
  if (face === 'bottom' && bounds.minY <= eps) return true;
  const list = state.params.placedObjects || [];
  for (const other of list) {
    if (!other || other === obj) continue;
    const ob = placedObjectBounds(other);
    if (ob.asset.clip === false) continue;
    if (face === 'top') {
      if (Math.abs(ob.minY - bounds.maxY) <= eps && boundsOverlap(bounds, ob)) return true;
    } else if (face === 'bottom') {
      if (Math.abs(ob.maxY - bounds.minY) <= eps && boundsOverlap(bounds, ob)) return true;
    } else if (rangesOverlap(bounds.minY, bounds.maxY, ob.minY, ob.maxY)) {
      if (face === 'posX' && Math.abs(ob.minX - bounds.maxX) <= eps && rangesOverlap(bounds.minZ, bounds.maxZ, ob.minZ, ob.maxZ)) return true;
      if (face === 'negX' && Math.abs(ob.maxX - bounds.minX) <= eps && rangesOverlap(bounds.minZ, bounds.maxZ, ob.minZ, ob.maxZ)) return true;
      if (face === 'posZ' && Math.abs(ob.minZ - bounds.maxZ) <= eps && rangesOverlap(bounds.minX, bounds.maxX, ob.minX, ob.maxX)) return true;
      if (face === 'negZ' && Math.abs(ob.maxZ - bounds.minZ) <= eps && rangesOverlap(bounds.minX, bounds.maxX, ob.minX, ob.maxX)) return true;
    }
  }
  return false;
}

function addDangerPlane(parent, width, height, position, rotation) {
  const mat = _dangerDecalMaterial.clone();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  plane.name = 'DangerFaceDecal';
  plane.position.set(position.x, position.y, position.z);
  plane.rotation.set(rotation.x, rotation.y, rotation.z);
  plane.renderOrder = 4;
  plane.castShadow = false;
  plane.receiveShadow = false;
  parent.add(plane);
}

function addDangerCurvedPanel(parent, radius, height, thetaStart, thetaLength) {
  const mat = _dangerDecalMaterial.clone();
  mat.side = THREE.DoubleSide;
  const panel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 8, 1, true, thetaStart, thetaLength),
    mat,
  );
  panel.name = 'DangerCurvedFaceDecal';
  panel.renderOrder = 4;
  panel.castShadow = false;
  panel.receiveShadow = false;
  parent.add(panel);
}

function addDangerDecals(mesh, obj, asset) {
  if (asset.destructible !== true) return;
  const bounds = placedObjectBounds(obj);
  const decalSize = asset.id === 'destructible_barrel' ? 0.58 : 0.68;
  if (asset.id === 'destructible_barrel') {
    const r = 0.407;
    const sideH = 0.46;
    const quadrant = Math.PI / 2;
    // Use curved quarter-cylinder decal panels so danger.png wraps around the
    // barrel instead of floating as flat cards. Shared side quadrants are
    // skipped, preserving the existing hidden-face rule for stacked/adjacent assets.
    if (!isDangerFaceShared(obj, bounds, 'posZ')) addDangerCurvedPanel(mesh, r, sideH, -Math.PI / 4, quadrant);
    if (!isDangerFaceShared(obj, bounds, 'posX')) addDangerCurvedPanel(mesh, r, sideH, Math.PI / 4, quadrant);
    if (!isDangerFaceShared(obj, bounds, 'negZ')) addDangerCurvedPanel(mesh, r, sideH, Math.PI * 3 / 4, quadrant);
    if (!isDangerFaceShared(obj, bounds, 'negX')) addDangerCurvedPanel(mesh, r, sideH, Math.PI * 5 / 4, quadrant);
    if (!isDangerFaceShared(obj, bounds, 'top')) addDangerPlane(mesh, decalSize, decalSize, { x: 0, y: 0.505, z: 0 }, { x: -Math.PI / 2, y: 0, z: 0 });
    if (!isDangerFaceShared(obj, bounds, 'bottom')) addDangerPlane(mesh, decalSize, decalSize, { x: 0, y: -0.505, z: 0 }, { x: Math.PI / 2, y: 0, z: 0 });
    return;
  }

  const h = 0.501;
  if (!isDangerFaceShared(obj, bounds, 'posZ')) addDangerPlane(mesh, decalSize, decalSize, { x: 0, y: 0, z: h }, { x: 0, y: 0, z: 0 });
  if (!isDangerFaceShared(obj, bounds, 'negZ')) addDangerPlane(mesh, decalSize, decalSize, { x: 0, y: 0, z: -h }, { x: 0, y: Math.PI, z: 0 });
  if (!isDangerFaceShared(obj, bounds, 'posX')) addDangerPlane(mesh, decalSize, decalSize, { x: h, y: 0, z: 0 }, { x: 0, y: Math.PI / 2, z: 0 });
  if (!isDangerFaceShared(obj, bounds, 'negX')) addDangerPlane(mesh, decalSize, decalSize, { x: -h, y: 0, z: 0 }, { x: 0, y: -Math.PI / 2, z: 0 });
  if (!isDangerFaceShared(obj, bounds, 'top')) addDangerPlane(mesh, decalSize, decalSize, { x: 0, y: h, z: 0 }, { x: -Math.PI / 2, y: 0, z: 0 });
  if (!isDangerFaceShared(obj, bounds, 'bottom')) addDangerPlane(mesh, decalSize, decalSize, { x: 0, y: -h, z: 0 }, { x: Math.PI / 2, y: 0, z: 0 });
}

function createPlacedMesh(obj, asset) {
  if (!obj.objectId) obj.objectId = nextPlacedObjectId();
  const mesh = new THREE.Mesh(makeGeo(asset.id), materialForAsset(asset, obj));
  mesh.userData.placedObject = obj;
  const scale = getPlacedScale(obj);
  obj.scaleX = scale.x;
  obj.scaleY = scale.y;
  obj.scaleZ = scale.z;
  if (!Number.isFinite(Number(obj.y))) obj.y = Number(asset?.yOffset ?? 0.5) * scale.y;
  mesh.position.set(obj.x, obj.y, obj.z);
  mesh.rotation.y = obj.ry ?? 0;
  mesh.scale.set(scale.x, scale.y, scale.z);
  mesh.castShadow = asset.id !== 'ramp';
  mesh.receiveShadow = true;
  addDangerDecals(mesh, obj, asset);
  return mesh;
}

export function rebuildPlacedObjects() {
  clearSelectionHelpers();
  for (const m of _placedMeshes) {
    disposePlacedMesh(m);
  }
  _placedMeshes.length = 0;

  const list = state.params.placedObjects || [];
  ensurePlacedObjectMetadata();
  for (const obj of list) {
    const asset = getAsset(obj.assetId);
    if (isPrefabAsset(asset)) continue;
    const mesh = createPlacedMesh(obj, asset);
    scene.add(mesh);
    _placedMeshes.push(mesh);
  }
  rebuildSelectionHelpers();
}

function makePlacedObject(assetId, x, z, ry, scaleSource = null, placementY = null, metadata = {}) {
  const asset = getAsset(assetId);
  const scale = scaleSource ? getPlacedScale(scaleSource) : getCurrentPlacerScale();
  const y = Number.isFinite(Number(placementY))
    ? Number(placementY)
    : getPlacementY(x, z, assetId, ry, scale);
  const color = normalizeHexColor(metadata.color) || resolvePlacedColor(null, asset);
  const cleanMetadata = { ...metadata };
  delete cleanMetadata.color;
  return {
    objectId: cleanMetadata.objectId || nextPlacedObjectId(),
    assetId, x, y, z, ry,
    scaleX: scale.x, scaleY: scale.y, scaleZ: scale.z,
    ...cleanMetadata,
    color,
  };
}

function placeObject(sx, sz, placementY = null) {
  const assetId = state.params.placerSelectedAsset || 'box';
  const scale   = getCurrentPlacerScale();
  const ry      = getCurrentPlacerRotation();
  const placed = makePlacedObject(assetId, sx, sz, ry, scale, placementY);
  const list = state.params.placedObjects || [];
  list.push(placed);
  state.params.placedObjects = list;
  rebuildPlacedObjects();
}

function placePrefab(asset, sx, sz, ry) {
  if (!isPrefabAsset(asset)) return false;
  const list = state.params.placedObjects || [];
  const groupId = nextPrefabGroupId();

  for (const item of asset.prefabItems) {
    const itemAssetId = item.assetId || 'box';
    const itemAsset = getAsset(itemAssetId);
    if (isPrefabAsset(itemAsset)) continue;
    const off = rotatePrefabOffset(Number(item.x) || 0, Number(item.z) || 0, ry);
    const itemRy = (ry + (Number(item.ry) || 0)) % (Math.PI * 2);
    const itemScale = getPlacedScale({
      assetId: itemAssetId,
      scaleX: item.scaleX ?? 1,
      scaleY: item.scaleY ?? 1,
      scaleZ: item.scaleZ ?? 1,
    });
    const x = sx + off.x;
    const z = sz + off.z;
    const y = Number.isFinite(Number(item.y))
      ? Number(item.y)
      : getPlacementY(x, z, itemAssetId, itemRy, itemScale);
    list.push(makePlacedObject(itemAssetId, x, z, itemRy, itemScale, y, {
      groupId,
      prefabId: asset.id,
      color: item.color,
    }));
  }

  state.params.placedObjects = list;
  rebuildPlacedObjects();
  return true;
}

export function clearPlacedObjects() {
  for (const m of _placedMeshes) {
    disposePlacedMesh(m);
  }
  _placedMeshes.length = 0;
  clearSelectionHelpers();
  state.selectedPlacedObjectIds = [];
  state.params.placedObjects = [];
  notifySelectionChanged();
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

const RETICLE_MARKUP = {
  "dot": "<span class=\"reticle-part reticle-dot\"></span>",
  "cross": "<span class=\"reticle-part reticle-line reticle-line-h\"></span><span class=\"reticle-part reticle-line reticle-line-v\"></span>",
  "ring": "<span class=\"reticle-part reticle-ring\"></span>",
  "crossDot": "<span class=\"reticle-part reticle-line reticle-line-h\"></span><span class=\"reticle-part reticle-line reticle-line-v\"></span><span class=\"reticle-part reticle-dot\"></span>",
  "triSpoke": "<span class=\"reticle-part reticle-spoke\" style=\"--angle: 0deg\"></span><span class=\"reticle-part reticle-spoke\" style=\"--angle: 120deg\"></span><span class=\"reticle-part reticle-spoke\" style=\"--angle: 240deg\"></span><span class=\"reticle-part reticle-dot reticle-center-dot\"></span>",
  "rl2": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-rl2\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-122h28v94h94v28H172Zm494 0v-28h94v-94h28v122H666ZM318.5-318.5Q252-385 252-480t66.5-161.5Q385-708 480-708t161.5 66.5Q708-575 708-480t-66.5 161.5Q575-252 480-252t-161.5-66.5ZM480-280q83 0 141.5-58.5T680-480q0-83-58.5-141.5T480-680q-83 0-141.5 58.5T280-480q0 83 58.5 141.5T480-280ZM172-666v-122h122v28h-94v94h-28Zm588 0v-94h-94v-28h122v122h-28ZM480-480Z\"/></svg>",
  "rocket_launcher": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-rocket-launcher\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M431.5-431.5Q412-451 412-480t19.5-48.5Q451-548 480-548t48.5 19.5Q548-509 548-480t-19.5 48.5Q509-412 480-412t-48.5-19.5Zm77-20Q520-463 520-480t-11.5-28.5Q497-520 480-520t-28.5 11.5Q440-497 440-480t11.5 28.5Q463-440 480-440t28.5-11.5ZM232-172q-26 0-43-17t-17-43v-128h28v128q0 12 10 22t22 10h128v28H232Zm368 0v-28h128q12 0 22-10t10-22v-128h28v128q0 26-17 43t-43 17H600ZM172-600v-128q0-26 17-43t43-17h128v28H232q-12 0-22 10t-10 22v128h-28Zm588 0v-128q0-12-10-22t-22-10H600v-28h128q26 0 43 17t17 43v128h-28Z\"/></svg>",
  "shotgun": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-shotgun\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M480.17-132q-72.17 0-135.73-27.39-63.56-27.39-110.57-74.35-47.02-46.96-74.44-110.43Q132-407.65 132-479.83q0-72.17 27.39-135.73 27.39-63.56 74.35-110.57 46.96-47.02 110.43-74.44Q407.65-828 479.83-828q72.17 0 135.73 27.39 63.56 27.39 110.57 74.35 47.02 46.96 74.44 110.43Q828-552.35 828-480.17q0 72.17-27.39 135.73-27.39 63.56-74.35 110.57-46.96 47.02-110.43 74.44Q552.35-132 480.17-132Zm-.17-28q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z\"/></svg>",
  "tr1": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr1\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M800-600v-120H680v-28h148v148h-28Zm-668 0v-148h148v28H160v120h-28Zm548 388v-28h120v-120h28v148H680Zm-548 0v-148h28v120h120v28H132Zm152-152v-232h392v232H284Zm28-28h336v-176H312v176Zm0 0v-176 176Z\"/></svg>",
  "tr2": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr2\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M800-560v-120H680v-28h148v148h-28Zm-668 0v-148h148v28H160v120h-28Zm548 308v-28h120v-120h28v148H680Zm-548 0v-148h28v120h120v28H132Z\"/></svg>",
  "tr3": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr3\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M800-132v-696h28v696h-28Zm-668 0v-696h28v696h-28Zm494-174v-348h68v348h-68Zm-360 0v-348h68v348h-68Z\"/></svg>",
  "tr4": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr4\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M200-200h560v-560H200v560Zm-28 28v-616h616v616H172Zm144-288v-40h40v40h-40Zm144 144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm144 144v-40h40v40h-40Z\"/></svg>",
  "tr5": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr5\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-188h28v160h160v28H172Zm428 0v-28h160v-160h28v188H600ZM172-600v-188h188v28H200v160h-28Zm588 0v-160H600v-28h188v188h-28Z\"/></svg>",
  "tr6": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr6\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M236-786v-28h488v28H236Zm71 558.97q-71-71.03-71-173T307.03-573q71.03-71 173-71T653-572.97q71 71.03 71 173T652.97-227q-71.03 71-173 71T307-227.03ZM633-247q63-63 63-153t-63-153q-63-63-153-63t-153 63q-63 63-63 153t63 153q63 63 153 63t153-63Z\"/></svg>",
  "tr7": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr7\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-28h616v28H172Zm160-147v-28h296v28H332ZM172-466v-28h616v28H172Zm160-147v-28h296v28H332ZM172-760v-28h616v28H172Z\"/></svg>",
  "tr8": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr8\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M132-132v-40h696v40H132Zm174-314v-68h348v68H306ZM132-788v-40h696v40H132Z\"/></svg>",
  "tr9": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr9\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-28h616v28H172Zm0-128v-488h616v488H172Zm28-28h560v-432H200v432Zm0 0v-432 432Z\"/></svg>",
  "tr10": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr10\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M132-132v-696h40v696h-40Zm314-174v-348h68v348h-68Zm342 174v-696h40v696h-40Z\"/></svg>",
  "tr11": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr11\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M212-386v-28h536v28H212Zm0-160v-28h536v28H212Z\"/></svg>",
  "tr12": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr12\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-680v-28h616v28H172Zm0 428v-28h616v28H172Zm0-214v-28h616v28H172Z\"/></svg>",
  "tr13": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr13\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm144 576v-40h40v40h-40Zm0-288v-40h40v40h-40Zm0-288v-40h40v40h-40Zm150 576v-616h28v616h-28Zm138 0v-40h40v40h-40Zm0-288v-40h40v40h-40Zm0-288v-40h40v40h-40Zm144 576v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Z\"/></svg>",
  "tr14": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr14\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M132-800v-28h696v28H132Zm174 214v-68h348v68H306Zm0 240v-68h348v68H306Z\"/></svg>",
  "tr15": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr15\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M306-732v-68H132v-28h696v28H654v68H306ZM132-132v-28h174v-68h348v68h174v28H132Z\"/></svg>",
  "tr16": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr16\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M132-800v-28h696v28H132Zm0 668v-28h696v28H132Zm314-180v-356h68v356h-68Z\"/></svg>",
  "tr17": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr17\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M800-132v-696h28v696h-28Zm-668 0v-696h28v696h-28Zm494-174v-348h68v348h-68Zm-360 0v-348h68v348h-68Z\"/></svg>",
  "tr18": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr18\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M528.5-431.5Q548-451 548-480t-19.5-48.5Q509-548 480-548t-48.5 19.5Q412-509 412-480t19.5 48.5Q451-412 480-412t48.5-19.5ZM480.17-132q-72.17 0-135.73-27.39-63.56-27.39-110.57-74.35-47.02-46.96-74.44-110.43Q132-407.65 132-479.83q0-72.17 27.39-135.73 27.39-63.56 74.35-110.57 46.96-47.02 110.43-74.44Q407.65-828 479.83-828q72.17 0 135.73 27.39 63.56 27.39 110.57 74.35 47.02 46.96 74.44 110.43Q828-552.35 828-480.17q0 72.17-27.39 135.73-27.39 63.56-74.35 110.57-46.96 47.02-110.43 74.44Q552.35-132 480.17-132Zm-.17-28q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z\"/></svg>",
  "tr19": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr19\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M480-116 276-320l20-20 184 182 184-182 20 20-204 204ZM296-620l-20-20 204-204 204 204-20 20-184-182-184 182Z\"/></svg>",
  "tr20": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr20\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"m174-212 306-490 306 490H174Zm50-28h512L480-650 224-240Zm256-205Z\"/></svg>",
  "tr21": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr21\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M260-234v-24h440v24H260Zm4-144 216-322 216 322H264Zm216-24Zm-166 0h332L480-650 314-402Z\"/></svg>",
  "tr22": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr22\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M480-564 296-380l-20-20 204-204 204 204-20 20-184-184Z\"/></svg>",
  "tr23": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr23\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M304-455.88q10-9.88 10-24T304.12-504q-9.88-10-24-10T256-504.12q-10 9.88-10 24t9.88 24.12q9.88 10 24 10t24.12-9.88Zm200 0q10-9.88 10-24T504.12-504q-9.88-10-24-10T456-504.12q-10 9.88-10 24t9.88 24.12q9.88 10 24 10t24.12-9.88Zm200 0q10-9.88 10-24T704.12-504q-9.88-10-24-10T656-504.12q-10 9.88-10 24t9.88 24.12q9.88 10 24 10t24.12-9.88ZM480.17-132q-72.17 0-135.73-27.39-63.56-27.39-110.57-74.35-47.02-46.96-74.44-110.43Q132-407.65 132-479.83q0-72.17 27.39-135.73 27.39-63.56 74.35-110.57 46.96-47.02 110.43-74.44Q407.65-828 479.83-828q72.17 0 135.73 27.39 63.56 27.39 110.57 74.35 47.02 46.96 74.44 110.43Q828-552.35 828-480.17q0 72.17-27.39 135.73-27.39 63.56-74.35 110.57-46.96 47.02-110.43 74.44Q552.35-132 480.17-132Zm-.17-28q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z\"/></svg>",
  "tr24": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr24\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"m480-172 82-81 19 20-101 101-101-101 20-20 81 81ZM172-480l81 81-20 20-101-101 101-101 20 19-81 82Zm617 0-81-82 19-19 101 101-101 101-19-20 81-81ZM480-789l-81 81-20-19 101-101 101 101-19 19-82-81Z\"/></svg>",
  "tr25": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr25\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M383.5-582.5Q338-599 300-628l26-16q24 17 59 30t81 21v-228l14-9 14 9v228q44-8 79-21t61-30l26 16q-38 29-83.5 45.5T480-566q-51 0-96.5-16.5ZM412-204l-27-15q1-5 1-10.5V-240q0-26-7.5-58T357-366L160-248l-14-8v-16l196-118q-28-32-57.5-55.5T226-483v-31q82 32 135 106t53 168q0 9-.5 18t-1.5 18Zm136 0q-1-9-1.5-18t-.5-18q0-94 53-168t135-106v30q-28 12-57.5 36.5T618-390l196 118v16l-14 8-197-118q-14 36-21.5 68t-7.5 58v10.5q0 5.5 1 10.5l-27 15Z\"/></svg>",
  "tr26": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr26\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M287-146 94-480l193-334h386l193 334-193 334H287Zm16-28h354l176-306-176-306H303L126-480l177 306Zm177-306Z\"/></svg>",
  "tr27": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr27\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M480-827q66-1 101.5 49.5T644-664q24 57 48 129t50 145q26 70 55 131.5T864-155q4 5 4 10.5t-4 8.5q-5 4-10.5 4t-9.5-4q-67-66-113.5-137T642-390q-34-38-73-60.5T480-472q-50-1-89 21.5T318-390q-42 46-88.5 117T116-136q-4 4-9.5 4T96-136q-4-3-4-8.5t4-10.5q38-41 67-103t55-132q26-73 50-145t48-129q27-63 62.5-113.5T480-827Zm-84.5 73.5Q365-708 343-656q-36 86-64.5 178.5T213-297q21-29 42-59t45-57q38-40 81.5-63.5T480-500q55 0 98.5 23.5T660-413q24 27 45 57t42 59q-37-88-65.5-180.5T617-656q-22-52-52.5-97.5T480-799q-54 0-84.5 45.5ZM480-500Z\"/></svg>",
  "tr28": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr28\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M266-652v-28h428v28H266Zm30 396-20-20 204-204 204 204-20 20-184-184-184 184Z\"/></svg>",
  "tr29": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr29\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M363-351.5Q315-397 305-466H132v-28h173q10-69 58-114.5T480-654q69 0 117.5 45.5T655-494h173v28H655q-9 69-57.5 114.5T480-306q-69 0-117-45.5ZM480-334q60 0 103-43t43-103q0-60-43-103t-103-43q-60 0-103 43t-43 103q0 60 43 103t103 43Z\"/></svg>",
  "tr30": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr30\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M363-351.5Q315-397 305-466H132v-28h173q10-69 58-114.5T480-654q69 0 117.5 45.5T655-494h173v28H655q-9 69-57.5 114.5T480-306q-69 0-117-45.5ZM480-334q60 0 103-43t43-103q0-60-43-103t-103-43q-60 0-103 43t-43 103q0 60 43 103t103 43Z\"/></svg>",
  "tr31": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr31\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M441.5-441.5Q426-457 426-480t15.5-38.5Q457-534 480-534t38.5 15.5Q534-503 534-480t-15.5 38.5Q503-426 480-426t-38.5-15.5ZM466-640v-148h28v148h-28Zm0 468v-148h28v148h-28Zm174-294v-28h148v28H640Zm-468 0v-28h148v28H172Z\"/></svg>",
  "tr32": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr32\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M212-412v-188h28v160h480v-160h28v188H212Z\"/></svg>",
  "tr33": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr33\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M481-74 334-220l20-20 127 126 126-126 20 20L481-74Zm0-200L334-420l20-20 127 126 126-126 20 20-146 146ZM354-520l-20-21 146-146 147 147-20 20-127-126-126 126Zm0-200-20-21 146-146 147 147-20 20-127-126-126 126Z\"/></svg>",
  "tr34": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr34\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M466-132v-696h28v696h-28Zm120-174v-348h68v348h-68Zm-280 0v-348h68v348h-68Z\"/></svg>",
  "tr35": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr35\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M332-212v-536h296v536H332Zm-128-80v-376h28v376h-28Zm524 0v-376h28v376h-28Zm-368 52h240v-480H360v480Zm0 0v-480 480Z\"/></svg>",
  "tr36": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr36\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-28h616v28H172Zm0-588v-28h616v28H172Z\"/></svg>",
  "tr37": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr37\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-148h128l166-166v-112q-34-8-57-33.5T386-692q0-39 27.5-66.5T480-786q39 0 66.5 27.5T574-692q0 35-23 60.5T494-598v112l166 166h128v148H640v-128L480-460 320-300v128H172Z\"/></svg>",
  "tr38": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr38\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M429-292v-28h101v28H429ZM282-466v-28h395v28H282ZM172-640v-28h616v28H172Z\"/></svg>",
  "tr39": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr39\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M255-160h450q-23-78-34.47-158.5Q659.06-399 659.06-480t11.47-161.5Q682-722 705-800H255q23 78 33.5 158.5T299-480q0 81-10.5 161.5T255-160Zm-36 28q23-81 38.5-161.5T273-480q0-106-15.5-186.5T219-828h522q-23 81-37.5 161.5T689-480q0 106 14.5 186.5T741-132H219Zm261-348Z\"/></svg>",
  "tr40": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr40\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M479.81-374Q436-374 405-405.19q-31-31.2-31-75Q374-524 405.19-555q31.2-31 75-31Q524-586 555-554.81q31 31.2 31 75Q586-436 554.81-405q-31.2 31-75 31ZM575-385q39-39 39-95t-39-95q-39-39-95-39t-95 39q-39 39-39 95t39 95q39 39 95 39t95-39ZM132-212v-536h696v536H132Zm28-28h640v-480H160v480Zm0 0v-480 480Z\"/></svg>",
  "tr41": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr41\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M466-118v-52q-125-11-204-90t-90-204h-52v-28h52q11-125 90-204t204-90v-52h28v52q125 11 204 90t90 204h52v28h-52q-11 125-90 204t-204 90v52h-28Zm212-162q82-82 82-198t-82-198q-82-82-198-82t-198 82q-82 82-82 198t82 198q82 82 198 82t198-82Z\"/></svg>",
  "tr42": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr42\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M466-120v-52q-125-11-204-90t-90-204h-52v-28h52q11-125 90-204t204-90v-52h28v52q125 11 204 90t90 204h52v28h-52q-11 125-90 204t-204 90v52h-28Zm212-162q82-82 82-198t-82-198q-82-82-198-82t-198 82q-82 82-82 198t82 198q82 82 198 82t198-82ZM403.5-403.5Q372-435 372-480t31.5-76.5Q435-588 480-588t76.5 31.5Q588-525 588-480t-31.5 76.5Q525-372 480-372t-76.5-31.5Zm133-20Q560-447 560-480t-23.5-56.5Q513-560 480-560t-56.5 23.5Q400-513 400-480t23.5 56.5Q447-400 480-400t56.5-23.5ZM480-480Z\"/></svg>",
  "tr43": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr43\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M480-132 292-481l188-347 188 347-188 349Zm0-59 156-290-156-288-156 288 156 290Zm0-289Z\"/></svg>",
  "tr44": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr44\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"m250-198-12-10 242-544 242 544-12 10-230-98-230 98Zm34-46 196-84 196 84-196-440-196 440Zm196-84Z\"/></svg>",
  "tr45": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr45\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M480-132q-95.27 0-161.64-66.46Q252-264.93 252-360.34q0-76.66 47.85-138.33Q347.7-560.33 426-582v-242q0-12 8.63-21 8.62-9 21.37-9h48q12 0 21 9t9 21v242q77 22 125.5 83.5T708-360.34q0 95.41-66.77 161.88Q574.46-132 480-132Zm0-28q83 0 141.5-58T680-360q0-83-58.5-141.5T480-560q-84 0-142 58.5T280-360q0 84 58 142t142 58Z\"/></svg>",
  "tr46": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr46\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M344.5-159.5Q281-187 234-234t-74.5-110.5Q132-408 132-480t27.5-135.5Q187-679 234-726t110.5-74.5Q408-828 480-828t135.5 27.5Q679-773 726-726t74.5 110.5Q828-552 828-480t-27.5 135.5Q773-281 726-234t-110.5 74.5Q552-132 480-132t-135.5-27.5Zm335-121Q762-363 762-480t-82.5-199.5Q597-762 480-762t-199.5 82.5Q198-597 198-480t82.5 199.5Q363-198 480-198t199.5-82.5Z\"/></svg>",
  "tr47": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr47\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-616h40v616h-40Zm576 0v-616h40v616h-40ZM316-460v-40h40v40h-40Zm144 288v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm144 288v-40h40v40h-40Z\"/></svg>",
  "tr48": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr48\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-616h40v616h-40Zm576 0v-616h40v616h-40ZM316-460v-40h40v40h-40Zm144 0v-40h40v40h-40Zm144 0v-40h40v40h-40Z\"/></svg>",
  "tr49": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr49\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M332-212v-536h296v536H332Zm-128-80v-376h28v376h-28Zm524 0v-376h28v376h-28Zm-368 52h240v-480H360v480Zm0 0v-480 480Z\"/></svg>",
};

function setReticleMarkup(reticle, type) {
  const normalizedType = RETICLE_MARKUP[type] ? type : 'dot';
  if (reticle.dataset.reticleType !== normalizedType) {
    reticle.innerHTML = RETICLE_MARKUP[normalizedType];
    reticle.dataset.reticleType = normalizedType;
  }
}

function syncReticleForActiveSlot(placerOn) {
  const reticle = document.getElementById('target-reticle');
  if (!reticle) return;

  const shouldShow = !!state.params.hudVisible && !!state.params.reticleVisible;
  reticle.style.display = shouldShow ? '' : 'none';
  reticle.classList.remove('reticle-enemy-hover', 'is-targeting-enemy');

  if (placerOn) {
    // Object placement uses a clean dot reticle even when the weapon reticle is
    // configured as a crosshair/ring/spoke. Leaving placer mode restores the
    // normal reticle type from state.params below.
    setReticleMarkup(reticle, 'dot');
  } else {
    setReticleMarkup(reticle, state.params.reticleType || 'dot');
  }
}

export function updatePlacer(delta = 1 / 60) {
  updateDestructibleParticles(delta);
  const slot     = state.activeSlot ?? 0;
  const placerOn = slot === 1;
  const assetId  = state.params.placerSelectedAsset || 'box';
  const asset    = getAsset(assetId);
  const prefabOn = isPrefabAsset(asset);

  // ADS is disabled while placer is active; the reticle switches to placement-dot mode.
  if (placerOn) state.isAiming = false;
  syncReticleForActiveSlot(placerOn);

  // Slot HUD
  const slotEl = getSlotEl();
  slotEl.style.display = state.paused ? 'none' : '';
  if (!state.paused) {
    const selectedCount = getSelectedPlacedObjectCount();
    slotEl.textContent = slot === 0
      ? '[ LASER ]  placer'
      : `laser  [ PLACER ]  ·  R transform  ·  F pick  ·  Ctrl-click select  ·  Del remove selected${selectedCount ? ` (${selectedCount})` : ''}`;
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
  syncGhostColor(asset);

  // Apply current transform to ghost. Prefabs rotate as a group but keep their
  // authored component scale, so a prefab does not unintentionally distort every part.
  const ry = getCurrentPlacerRotation();
  const scale = prefabOn ? { x: 1, y: 1, z: 1 } : getCurrentPlacerScale();
  _ghostMesh.rotation.y = ry;
  _ghostWire.rotation.y = ry;
  _ghostMesh.scale.set(scale.x, scale.y, scale.z);
  _ghostWire.scale.set(scale.x, scale.y, scale.z);

  // Raycast camera centre → placed objects first, then floor plane.
  camera.updateMatrixWorld(true);
  _raycaster.setFromCamera(_ndc, camera);

  if (state.placerSelectionRequest) {
    const request = state.placerSelectionRequest;
    state.placerSelectionRequest = null;
    selectPlacedObjectByAim({
      toggle: request.toggle !== false,
      additive: request.additive !== false,
    });
    _firePrev = state.primaryFire;
    _secondaryPrev = state.secondaryFire;
    return;
  }

  const removePressed = !!state.secondaryFire && !_secondaryPrev;
  if (removePressed && removePlacedObjectByAim()) {
    _firePrev = state.primaryFire;
    _secondaryPrev = state.secondaryFire;
    return;
  }

  const hit = _raycaster.ray.intersectPlane(_floorPlane, _hitPoint);

  if (hit) {
    // Footprint-aware snap: aligns base edges to grid lines. Prefab footprint
    // comes from the prefab asset, but individual components are serialized as
    // normal placed objects on placement.
    const { sx, sz } = snapToFootprint(_hitPoint.x, _hitPoint.z, assetId, ry, scale);
    const placementY = prefabOn ? 0 : getPlacementY(sx, sz, assetId, ry, scale);

    _ghostMesh.position.set(sx, placementY, sz);
    _ghostWire.position.copy(_ghostMesh.position);

    setGhostMaterial(false);
    _ghostMesh.visible  = true;
    _ghostWire.visible  = true;

    if (removePressed) {
      removePlacedObjectAtFootprint(sx, sz, assetId, ry, scale);
    } else if (state.primaryFire && !_firePrev) {
      if (prefabOn) placePrefab(asset, sx, sz, ry);
      else placeObject(sx, sz, placementY);
    }
  } else {
    _ghostMesh.visible = false;
    _ghostWire.visible = false;
  }

  _firePrev = state.primaryFire;
  _secondaryPrev = state.secondaryFire;
}
