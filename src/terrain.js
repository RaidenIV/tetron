// src/terrain.js
import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { ASSET_CATALOGUE } from './assets-catalogue.js';

const CHUNK_SIZE  = 20;
const CHUNK_RANGE = 3; // chunks visible in each direction — 7×7 grid total
const GRID_CELL_SIZE = 1;

const floorMat = new THREE.MeshStandardMaterial({
  color: 0x0c1020, roughness: 0.88, metalness: 0.08,
});

const chunks = new Map();
let _lastCX = null;
let _lastCZ = null;
let _lastSignature = '';
let _gridColor = '#1a2a4a';
let _boundaryGroup = null;
let _boundarySignature = '';

const assetById = new Map(ASSET_CATALOGUE.map(asset => [asset.id, asset]));

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function numberParam(key, fallback) {
  const value = Number(state.params[key]);
  return Number.isFinite(value) ? value : fallback;
}

function snapGrid(value) {
  return Math.round(Number(value) || 0);
}

function getFloorMode() {
  const mode = state.params.floorMode;
  return mode === 'fixed' || mode === 'hybrid' || mode === 'dynamic' ? mode : 'hybrid';
}

function buildChunk(cx, cz) {
  const key = `${cx},${cz}`;
  if (chunks.has(key)) return;

  const grp = new THREE.Group();
  grp.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);

  // Floor plane — PlaneGeometry faces up (XY plane), rotate to XZ
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE),
    floorMat
  );
  ground.rotation.x    = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.visible       = state.params.showFloor !== false;
  ground.userData.isFloor = true;
  grp.add(ground);

  // Grid — sits just above floor to avoid z-fighting
  const grid = new THREE.GridHelper(CHUNK_SIZE, CHUNK_SIZE, _gridColor, _gridColor);
  grid.material.transparent = true;
  grid.material.opacity     = 0.2;
  grid.material.depthWrite  = false;
  grid.position.y           = 0.004;
  grid.visible              = state.params.showGrid !== false;
  grid.userData.isGrid      = true;
  grp.add(grid);

  scene.add(grp);
  chunks.set(key, grp);
}

function removeChunk(key) {
  const grp = chunks.get(key);
  if (!grp) return;
  scene.remove(grp);
  // dispose geometry to free GPU memory
  grp.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.userData.isBoundary) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => m.dispose?.());
    }
  });
  chunks.delete(key);
}

function addChunkRangeForFocus(needed, focus) {
  const cx = Math.round(focus.x / CHUNK_SIZE);
  const cz = Math.round(focus.z / CHUNK_SIZE);
  for (let dx = -CHUNK_RANGE; dx <= CHUNK_RANGE; dx++) {
    for (let dz = -CHUNK_RANGE; dz <= CHUNK_RANGE; dz++) {
      needed.add(`${cx + dx},${cz + dz}`);
    }
  }
}

function addChunkRangeForBounds(needed, bounds) {
  if (!bounds) return;
  const minCX = Math.ceil((bounds.minX - CHUNK_SIZE * 0.5) / CHUNK_SIZE);
  const maxCX = Math.floor((bounds.maxX + CHUNK_SIZE * 0.5) / CHUNK_SIZE);
  const minCZ = Math.ceil((bounds.minZ - CHUNK_SIZE * 0.5) / CHUNK_SIZE);
  const maxCZ = Math.floor((bounds.maxZ + CHUNK_SIZE * 0.5) / CHUNK_SIZE);
  for (let cx = minCX; cx <= maxCX; cx++) {
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      needed.add(`${cx},${cz}`);
    }
  }
}

function getPlacedObjectBounds() {
  const objects = Array.isArray(state.params.placedObjects) ? state.params.placedObjects : [];
  if (!objects.length) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  objects.forEach(obj => {
    const x = Number(obj.x);
    const z = Number(obj.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;

    const asset = assetById.get(obj.assetId) || assetById.get(obj.baseAssetId) || null;
    const sx = Math.max(0.1, Math.abs(Number(obj.scaleX) || 1));
    const sz = Math.max(0.1, Math.abs(Number(obj.scaleZ) || 1));
    let w = Math.max(GRID_CELL_SIZE, Number(asset?.footprintW) || 1) * sx;
    let d = Math.max(GRID_CELL_SIZE, Number(asset?.footprintH) || 1) * sz;

    const quarterTurns = Math.round(((Number(obj.ry) || 0) / (Math.PI / 2))) % 2;
    if (Math.abs(quarterTurns) === 1) [w, d] = [d, w];

    minX = Math.min(minX, x - w * 0.5);
    maxX = Math.max(maxX, x + w * 0.5);
    minZ = Math.min(minZ, z - d * 0.5);
    maxZ = Math.max(maxZ, z + d * 0.5);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return null;
  return { minX, maxX, minZ, maxZ };
}

function getConfiguredBuildBounds() {
  if (state.params.buildAreaEnabled === false || getFloorMode() === 'dynamic') return null;
  const width = Math.max(1, numberParam('buildAreaWidth', 200));
  const depth = Math.max(1, numberParam('buildAreaDepth', 200));
  const cx = numberParam('buildAreaCenterX', 0);
  const cz = numberParam('buildAreaCenterZ', 0);
  return {
    minX: cx - width * 0.5,
    maxX: cx + width * 0.5,
    minZ: cz - depth * 0.5,
    maxZ: cz + depth * 0.5,
    width,
    depth,
    centerX: cx,
    centerZ: cz,
  };
}

function applyBuildBounds(bounds) {
  if (!bounds) return false;
  const margin = Math.max(0, Math.round(numberParam('buildAreaAutoExpandMargin', 4)));
  const minX = Math.floor(bounds.minX - margin);
  const maxX = Math.ceil(bounds.maxX + margin);
  const minZ = Math.floor(bounds.minZ - margin);
  const maxZ = Math.ceil(bounds.maxZ + margin);
  const width = Math.max(1, maxX - minX);
  const depth = Math.max(1, maxZ - minZ);
  const centerX = snapGrid((minX + maxX) * 0.5);
  const centerZ = snapGrid((minZ + maxZ) * 0.5);

  const changed =
    Math.abs(numberParam('buildAreaWidth', 200) - width) > 0.001 ||
    Math.abs(numberParam('buildAreaDepth', 200) - depth) > 0.001 ||
    Math.abs(numberParam('buildAreaCenterX', 0) - centerX) > 0.001 ||
    Math.abs(numberParam('buildAreaCenterZ', 0) - centerZ) > 0.001;

  state.params.buildAreaWidth = width;
  state.params.buildAreaDepth = depth;
  state.params.buildAreaCenterX = centerX;
  state.params.buildAreaCenterZ = centerZ;
  return changed;
}

function expandBuildAreaToPlacedObjects() {
  if (state.params.buildAreaAutoExpand !== true) return false;
  const configured = getConfiguredBuildBounds();
  const objectBounds = getPlacedObjectBounds();
  if (!configured || !objectBounds) return false;

  const next = {
    minX: Math.min(configured.minX, objectBounds.minX),
    maxX: Math.max(configured.maxX, objectBounds.maxX),
    minZ: Math.min(configured.minZ, objectBounds.minZ),
    maxZ: Math.max(configured.maxZ, objectBounds.maxZ),
  };

  if (
    next.minX === configured.minX && next.maxX === configured.maxX &&
    next.minZ === configured.minZ && next.maxZ === configured.maxZ
  ) {
    return false;
  }
  return applyBuildBounds(next);
}

export function fitBuildAreaToPlacedObjects() {
  const objectBounds = getPlacedObjectBounds();
  if (!objectBounds) return false;
  state.params.buildAreaEnabled = true;
  if (getFloorMode() === 'dynamic') state.params.floorMode = 'hybrid';
  const changed = applyBuildBounds(objectBounds);
  applyFloorSettings({ force: true });
  _lastCX = null;
  _lastCZ = null;
  _lastSignature = '';
  return changed;
}

export function getBuildAreaBounds() {
  return getConfiguredBuildBounds();
}

function disposeBoundaryGroup() {
  if (!_boundaryGroup) return;
  scene.remove(_boundaryGroup);
  _boundaryGroup.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => m.dispose?.());
    }
  });
  _boundaryGroup = null;
  _boundarySignature = '';
}

function updateBoundaryVisual(bounds, force = false) {
  const p = state.params;
  const visible = p.buildAreaBoundaryVisible !== false && p.buildAreaEnabled !== false && getFloorMode() !== 'dynamic' && bounds;
  const signature = visible ? JSON.stringify({
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    color: p.buildAreaBoundaryColor || '#35ff00',
    walls: p.buildAreaBoundaryWalls === true,
    height: numberParam('buildAreaBoundaryHeight', 2),
    opacity: numberParam('buildAreaBoundaryOpacity', 0.28),
  }) : 'hidden';

  if (!force && signature === _boundarySignature) return;
  disposeBoundaryGroup();
  _boundarySignature = signature;
  if (!visible) return;

  const group = new THREE.Group();
  group.name = 'BuildAreaBoundary';
  const color = new THREE.Color(p.buildAreaBoundaryColor || '#35ff00');
  const y = 0.035;
  const pts = [
    bounds.minX, y, bounds.minZ, bounds.maxX, y, bounds.minZ,
    bounds.maxX, y, bounds.minZ, bounds.maxX, y, bounds.maxZ,
    bounds.maxX, y, bounds.maxZ, bounds.minX, y, bounds.maxZ,
    bounds.minX, y, bounds.maxZ, bounds.minX, y, bounds.minZ,
  ];
  const outlineGeo = new THREE.BufferGeometry();
  outlineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const outlineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
  const outline = new THREE.LineSegments(outlineGeo, outlineMat);
  outline.userData.isBoundary = true;
  outline.renderOrder = 3;
  group.add(outline);

  if (p.buildAreaBoundaryWalls === true) {
    const h = Math.max(0.1, numberParam('buildAreaBoundaryHeight', 2));
    const opacity = clamp(numberParam('buildAreaBoundaryOpacity', 0.28), 0.02, 1);
    const wallMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const thickness = 0.08;
    const addWall = (x, z, w, d) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat.clone());
      mesh.position.set(x, h * 0.5, z);
      mesh.userData.isBoundary = true;
      group.add(mesh);
    };
    addWall((bounds.minX + bounds.maxX) * 0.5, bounds.minZ, bounds.maxX - bounds.minX, thickness);
    addWall((bounds.minX + bounds.maxX) * 0.5, bounds.maxZ, bounds.maxX - bounds.minX, thickness);
    addWall(bounds.minX, (bounds.minZ + bounds.maxZ) * 0.5, thickness, bounds.maxZ - bounds.minZ);
    addWall(bounds.maxX, (bounds.minZ + bounds.maxZ) * 0.5, thickness, bounds.maxZ - bounds.minZ);
  }

  scene.add(group);
  _boundaryGroup = group;
}

function getChunkSignature(cx, cz) {
  const p = state.params;
  return JSON.stringify({
    cx,
    cz,
    mode: getFloorMode(),
    build: p.buildAreaEnabled !== false,
    bx: numberParam('buildAreaCenterX', 0),
    bz: numberParam('buildAreaCenterZ', 0),
    bw: numberParam('buildAreaWidth', 200),
    bd: numberParam('buildAreaDepth', 200),
    auto: p.buildAreaAutoExpand === true,
    placedCount: Array.isArray(p.placedObjects) ? p.placedObjects.length : 0,
  });
}

// Called every frame. Rebuild only when player/editor crosses a chunk boundary
// or when floor/build-area settings change.
export function updateChunks(playerPos) {
  expandBuildAreaToPlacedObjects();

  const mode = getFloorMode();
  const cx = Math.round(playerPos.x / CHUNK_SIZE);
  const cz = Math.round(playerPos.z / CHUNK_SIZE);
  const signature = getChunkSignature(cx, cz);
  const bounds = getConfiguredBuildBounds();
  updateBoundaryVisual(bounds);

  if (cx === _lastCX && cz === _lastCZ && signature === _lastSignature) return;

  const needed = new Set();
  if (mode === 'dynamic' || mode === 'hybrid' || !bounds) addChunkRangeForFocus(needed, playerPos);
  if ((mode === 'fixed' || mode === 'hybrid') && bounds) addChunkRangeForBounds(needed, bounds);

  for (const key of needed) {
    const [chunkX, chunkZ] = key.split(',').map(Number);
    if (Number.isFinite(chunkX) && Number.isFinite(chunkZ)) buildChunk(chunkX, chunkZ);
  }
  for (const key of [...chunks.keys()]) {
    if (!needed.has(key)) removeChunk(key); // dispose geometry, remove from scene
  }

  _lastCX = cx;
  _lastCZ = cz;
  _lastSignature = signature;
}

export function setFloorVisible(v) {
  chunks.forEach(grp =>
    grp.traverse(o => { if (o.userData.isFloor) o.visible = v; })
  );
}

export function setGridVisible(v) {
  chunks.forEach(grp =>
    grp.traverse(o => { if (o.userData.isGrid) o.visible = v; })
  );
}

export function setFloorColor(hex) {
  floorMat.color.set(hex);
}

export function setGridColor(hex) {
  _gridColor = hex;
  const c = new THREE.Color(hex);
  chunks.forEach(grp =>
    grp.traverse(o => {
      if (o.userData.isGrid && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { if (m.color) m.color.set(c); });
      }
    })
  );
}

export function applyFloorSettings({ force = false } = {}) {
  state.params.floorMode = ['dynamic', 'fixed', 'hybrid'].includes(state.params.floorMode)
    ? state.params.floorMode
    : 'hybrid';
  state.params.buildAreaEnabled = state.params.buildAreaEnabled !== false;
  state.params.buildAreaAutoExpand = state.params.buildAreaAutoExpand === true;
  state.params.buildAreaBoundaryVisible = state.params.buildAreaBoundaryVisible !== false;
  state.params.buildAreaBoundaryWalls = state.params.buildAreaBoundaryWalls === true;
  state.params.buildAreaBoundaryCollision = state.params.buildAreaBoundaryCollision === true;
  state.params.buildAreaCenterX = snapGrid(numberParam('buildAreaCenterX', 0));
  state.params.buildAreaCenterZ = snapGrid(numberParam('buildAreaCenterZ', 0));
  state.params.buildAreaWidth = Math.max(20, snapGrid(numberParam('buildAreaWidth', 200)));
  state.params.buildAreaDepth = Math.max(20, snapGrid(numberParam('buildAreaDepth', 200)));
  state.params.buildAreaBoundaryHeight = clamp(numberParam('buildAreaBoundaryHeight', 2), 0.25, 12);
  state.params.buildAreaBoundaryOpacity = clamp(numberParam('buildAreaBoundaryOpacity', 0.28), 0, 1);
  state.params.buildAreaAutoExpandMargin = clamp(snapGrid(numberParam('buildAreaAutoExpandMargin', 4)), 0, 50);
  if (!/^#[0-9a-fA-F]{6}$/.test(String(state.params.buildAreaBoundaryColor || ''))) {
    state.params.buildAreaBoundaryColor = '#35ff00';
  }

  setFloorColor(state.params.floorColor || '#0C1620');
  setGridColor(state.params.gridColor || '#000000');
  setFloorVisible(state.params.showFloor !== false);
  setGridVisible(state.params.showGrid !== false);
  updateBoundaryVisual(getConfiguredBuildBounds(), force);
  if (force) {
    _lastCX = null;
    _lastCZ = null;
    _lastSignature = '';
  }
}

export function clampPositionToBuildArea(position, radius = 0) {
  if (state.params.buildAreaBoundaryCollision !== true) return false;
  const bounds = getConfiguredBuildBounds();
  if (!bounds || !position) return false;
  const r = Math.max(0, Number(radius) || 0);
  const nextX = clamp(position.x, bounds.minX + r, bounds.maxX - r);
  const nextZ = clamp(position.z, bounds.minZ + r, bounds.maxZ - r);
  const changed = nextX !== position.x || nextZ !== position.z;
  position.x = nextX;
  position.z = nextZ;
  return changed;
}
