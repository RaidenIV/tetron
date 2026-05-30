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

function rebuildGhost(assetId) {
  if (_ghostMesh) { scene.remove(_ghostMesh); _ghostMesh.geometry.dispose(); _ghostMesh = null; }
  if (_ghostWire) { scene.remove(_ghostWire); _ghostWire.geometry.dispose(); _ghostWire = null; }
  const geo = makeGeo(assetId);
  const edgeGeo = new THREE.EdgesGeometry(geo, 1);
  _ghostMesh = new THREE.Mesh(geo, _ghostMat);
  _ghostWire = new THREE.LineSegments(edgeGeo, _ghostWireMat);
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
    obj.scaleX = scale.x;
    obj.scaleY = scale.y;
    obj.scaleZ = scale.z;
    if (!Number.isFinite(Number(obj.y))) obj.y = Number(asset?.yOffset ?? 0.5) * scale.y;
    mesh.position.set(obj.x, obj.y, obj.z);
    mesh.rotation.y    = obj.ry ?? 0;
    mesh.scale.set(scale.x, scale.y, scale.z);
    mesh.castShadow    = asset.id !== 'ramp';
    mesh.receiveShadow = true;
    scene.add(mesh);
    _placedMeshes.push(mesh);
  }
}

function placeObject(sx, sz, placementY = null) {
  const assetId = state.params.placerSelectedAsset || 'box';
  const asset   = getAsset(assetId);
  const scale   = getCurrentPlacerScale();
  const ry      = getCurrentPlacerRotation();
  const y       = Number.isFinite(Number(placementY)) ? Number(placementY) : getPlacementY(sx, sz, assetId, ry, scale);

  const color = resolvePlacedColor(null, asset);
  const placed = {
    assetId, x: sx, y, z: sz, ry, color,
    scaleX: scale.x, scaleY: scale.y, scaleZ: scale.z,
  };
  const list = state.params.placedObjects || [];
  list.push(placed);
  state.params.placedObjects = list;

  const mesh = new THREE.Mesh(makeGeo(asset.id), materialForAsset(asset, placed));
  mesh.userData.placedObject = placed;
  mesh.position.set(sx, y, sz);
  mesh.rotation.y    = ry;
  mesh.scale.set(scale.x, scale.y, scale.z);
  mesh.castShadow    = asset.id !== 'ramp';
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

const RETICLE_MARKUP = {
  dot: '<span class="reticle-part reticle-dot"></span>',
  cross: '<span class="reticle-part reticle-line reticle-line-h"></span><span class="reticle-part reticle-line reticle-line-v"></span>',
  ring: '<span class="reticle-part reticle-ring"></span>',
  crossDot: '<span class="reticle-part reticle-line reticle-line-h"></span><span class="reticle-part reticle-line reticle-line-v"></span><span class="reticle-part reticle-dot"></span>',
  triSpoke: '<span class="reticle-part reticle-spoke" style="--angle: 0deg"></span><span class="reticle-part reticle-spoke" style="--angle: 120deg"></span><span class="reticle-part reticle-spoke" style="--angle: 240deg"></span><span class="reticle-part reticle-dot reticle-center-dot"></span>',
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

export function updatePlacer() {
  const slot     = state.activeSlot ?? 0;
  const placerOn = slot === 1;
  const assetId  = state.params.placerSelectedAsset || 'box';

  // ADS is disabled while placer is active; the reticle switches to placement-dot mode.
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
    // Footprint-aware snap: aligns base edges to grid lines
    const { sx, sz } = snapToFootprint(_hitPoint.x, _hitPoint.z, assetId, ry, scale);
    const placementY = getPlacementY(sx, sz, assetId, ry, scale);

    _ghostMesh.position.set(sx, placementY, sz);
    _ghostWire.position.copy(_ghostMesh.position);

    _ghostMesh.material = _ghostMat;
    _ghostMesh.visible  = true;
    _ghostWire.visible  = true;

    if (removePressed) {
      removePlacedObjectAtFootprint(sx, sz, assetId, ry, scale);
    } else if (state.primaryFire && !_firePrev) {
      placeObject(sx, sz, placementY);
    }
  } else {
    _ghostMesh.visible = false;
    _ghostWire.visible = false;
  }

  _firePrev = state.primaryFire;
  _secondaryPrev = state.secondaryFire;
}
