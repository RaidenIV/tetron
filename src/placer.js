// src/placer.js
// Object placer system: ghost preview, footprint-aware grid-snapping, placement.
// Slot 0 = laser, Slot 1 = placer. Scroll wheel switches slots.
// R key rotates ghost 90°. Placed objects store rotation in serialised state.

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
  if (footprintDim % 2 === 1) {
    // Odd-width: centre inside the middle cell
    return Math.floor(v) + 0.5;
  } else {
    // Even-width: align to multiples of footprintDim
    return Math.round(v / footprintDim) * footprintDim;
  }
}

function getEffectiveFootprint(assetId, ry) {
  const asset = getAsset(assetId);
  const fw = asset.footprintW ?? 1;
  const fh = asset.footprintH ?? 1;
  // 90° or 270° rotation swaps X and Z footprint dimensions
  const rotSteps = Math.round(((ry % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 2)) % 4;
  if (rotSteps === 1 || rotSteps === 3) return { fw: fh, fh: fw };
  return { fw, fh };
}

function snapToFootprint(worldX, worldZ, assetId, ry) {
  const { fw, fh } = getEffectiveFootprint(assetId, ry);
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

function isFootprintOccupied(sx, sz, fw, fh) {
  const newCells = new Set(footprintCells(sx, sz, fw, fh));
  const list = state.params.placedObjects || [];
  for (const obj of list) {
    const asset = getAsset(obj.assetId);
    const { fw: ofw, fh: ofh } = getEffectiveFootprint(obj.assetId, obj.ry ?? 0);
    for (const cell of footprintCells(obj.x, obj.z, ofw, ofh)) {
      if (newCells.has(cell)) return true;
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

function materialForAsset(asset) {
  return new THREE.MeshStandardMaterial({
    color: asset.color, roughness: 0.7, metalness: 0.1,
  });
}

export function rebuildPlacedObjects() {
  for (const m of _placedMeshes) {
    scene.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
  _placedMeshes.length = 0;

  const list = state.params.placedObjects || [];
  for (const obj of list) {
    const asset = getAsset(obj.assetId);
    const mesh  = new THREE.Mesh(makeGeo(asset.id), materialForAsset(asset));
    mesh.position.set(obj.x, obj.y, obj.z);
    mesh.rotation.y    = obj.ry ?? 0;
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    _placedMeshes.push(mesh);
  }
}

function placeObject(sx, sz) {
  const assetId = state.params.placerSelectedAsset || 'box';
  const asset   = getAsset(assetId);
  const yOff    = asset.yOffset ?? 0.5;
  const ry      = state.placerRotation ?? 0;

  const list = state.params.placedObjects || [];
  list.push({ assetId, x: sx, y: yOff, z: sz, ry });
  state.params.placedObjects = list;

  const mesh = new THREE.Mesh(makeGeo(asset.id), materialForAsset(asset));
  mesh.position.set(sx, yOff, sz);
  mesh.rotation.y    = ry;
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  _placedMeshes.push(mesh);
}

export function clearPlacedObjects() {
  for (const m of _placedMeshes) {
    scene.remove(m);
    m.geometry.dispose();
    m.material.dispose();
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

export function updatePlacer() {
  const slot     = state.activeSlot ?? 0;
  const placerOn = slot === 1;
  const assetId  = state.params.placerSelectedAsset || 'box';

  // ADS is disabled while placer is active
  if (placerOn) state.isAiming = false;

  // Slot HUD
  const slotEl = getSlotEl();
  slotEl.style.display = state.paused ? 'none' : '';
  if (!state.paused) {
    slotEl.textContent = slot === 0
      ? '[ LASER ]  placer'
      : 'laser  [ PLACER ]  ·  R rotate  ·  F pick';
  }

  // Hide ghost when not in placer mode
  if (!placerOn || state.paused) {
    if (_ghostMesh) _ghostMesh.visible = false;
    if (_ghostWire) _ghostWire.visible = false;
    _firePrev = state.primaryFire;
    return;
  }

  // Rebuild ghost if asset changed
  if (assetId !== _currentAssetId) rebuildGhost(assetId);
  if (!_ghostMesh) rebuildGhost(assetId);

  // Apply current rotation to ghost
  const ry = state.placerRotation ?? 0;
  _ghostMesh.rotation.y = ry;
  _ghostWire.rotation.y = ry;

  // Raycast camera centre → floor plane
  camera.updateMatrixWorld(true);
  _raycaster.setFromCamera(_ndc, camera);
  const hit = _raycaster.ray.intersectPlane(_floorPlane, _hitPoint);

  if (hit) {
    const asset = getAsset(assetId);
    const yOff  = asset.yOffset ?? 0.5;

    // Footprint-aware snap: aligns base edges to grid lines
    const { sx, sz, fw, fh } = snapToFootprint(_hitPoint.x, _hitPoint.z, assetId, ry);

    _ghostMesh.position.set(sx, yOff, sz);
    _ghostWire.position.copy(_ghostMesh.position);

    const occupied = isFootprintOccupied(sx, sz, fw, fh);
    _ghostMesh.material = occupied ? _ghostBlockedMat : _ghostMat;
    _ghostMesh.visible  = true;
    _ghostWire.visible  = true;

    if (state.primaryFire && !_firePrev && !occupied) {
      placeObject(sx, sz);
    }
  } else {
    _ghostMesh.visible = false;
    _ghostWire.visible = false;
  }

  _firePrev = state.primaryFire;
}
