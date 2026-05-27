// ─── terrain.js ───────────────────────────────────────────────────────────────
// Infinite tiling floor + optional grid. No props — clean test arena.
import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';

const CHUNK_SIZE  = 20;
const CHUNK_RANGE = 4; // visible chunks in each direction

// ── Shared ground geometry ────────────────────────────────────────────────────
const chunkPlaneGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);

const floorMat = new THREE.MeshStandardMaterial({
  color:     0x0c1020,
  roughness: 0.85,
  metalness: 0.10,
  envMapIntensity: 0.25,
});
const gridMat = new THREE.MeshBasicMaterial({
  color:       0x1a2a4a,
  transparent: true,
  opacity:     0.22,
  depthWrite:  false,
});

const chunks = new Map();
let _lastChunkX = null;
let _lastChunkZ = null;

// ── Exported references for panel toggles ─────────────────────────────────────
export const groundObjects = []; // all active ground meshes
export const gridObjects   = []; // all active grid helpers

function chunkKey(cx, cz) { return `${cx},${cz}`; }

function buildChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  if (chunks.has(key)) return;

  const grp = new THREE.Group();
  grp.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);

  // Ground plane
  const ground = new THREE.Mesh(chunkPlaneGeo, floorMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  grp.add(ground);
  groundObjects.push(ground);

  // Grid overlay (a simple line helper baked onto a grid geometry)
  const gridSize  = CHUNK_SIZE;
  const divisions = Math.round(CHUNK_SIZE);
  const gridHelper = new THREE.GridHelper(gridSize, divisions, 0x1a2a4a, 0x1a2a4a);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity     = 0.18;
  gridHelper.material.depthWrite  = false;
  gridHelper.position.y = 0.005;
  grp.add(gridHelper);
  gridObjects.push(gridHelper);

  scene.add(grp);
  chunks.set(key, { grp, ground, gridHelper, cx, cz });
}

function removeChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  const ch  = chunks.get(key);
  if (!ch) return;
  scene.remove(ch.grp);
  const gi = groundObjects.indexOf(ch.ground);
  if (gi >= 0) groundObjects.splice(gi, 1);
  const ggi = gridObjects.indexOf(ch.gridHelper);
  if (ggi >= 0) gridObjects.splice(ggi, 1);
  chunks.delete(key);
}

// ── Per-frame chunk streaming ─────────────────────────────────────────────────
export function updateChunks(playerPosition) {
  const cx = Math.round(playerPosition.x / CHUNK_SIZE);
  const cz = Math.round(playerPosition.z / CHUNK_SIZE);
  if (cx === _lastChunkX && cz === _lastChunkZ) return;
  _lastChunkX = cx; _lastChunkZ = cz;

  const needed = new Set();
  for (let dx = -CHUNK_RANGE; dx <= CHUNK_RANGE; dx++) {
    for (let dz = -CHUNK_RANGE; dz <= CHUNK_RANGE; dz++) {
      const key = chunkKey(cx + dx, cz + dz);
      needed.add(key);
      if (!chunks.has(key)) buildChunk(cx + dx, cz + dz);
    }
  }
  for (const key of [...chunks.keys()]) {
    if (!needed.has(key)) {
      const ch = chunks.get(key);
      removeChunk(ch.cx, ch.cz);
    }
  }

  // Apply current panel visibility
  const showFloor = state.params.showFloor;
  const showGrid  = state.params.showGrid;
  groundObjects.forEach(g => { g.visible = showFloor; });
  gridObjects.forEach(g   => { g.visible = showGrid;  });
}

// ── Visibility toggles (called by panel) ──────────────────────────────────────
export function setFloorVisible(v) {
  groundObjects.forEach(g => { g.visible = v; });
}
export function setGridVisible(v) {
  gridObjects.forEach(g => { g.visible = v; });
}

// ── Terrain queries (stubbed — no props in testbed) ───────────────────────────
export const propColliders = [];

export function steerAroundProps(pos, dir, _radius) { return dir; }
export function pushOutOfProps(pos, _radius) {}
export function hasLineOfSight(_from, _to) { return true; }
export function queryNearbyPropColliders(_x, _z, _radius, out = []) {
  out.length = 0;
  return out;
}
