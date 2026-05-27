// ─── terrain.js ───────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';

const CHUNK_SIZE  = 20;
const CHUNK_RANGE = 3; // chunks visible in each direction

const floorMat = new THREE.MeshStandardMaterial({
  color: 0x0c1020, roughness: 0.88, metalness: 0.08, envMapIntensity: 0.2,
});

const chunks = new Map();
let _lastCX = null;
let _lastCZ = null;

function chunkKey(cx, cz) { return `${cx},${cz}`; }

function buildChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  if (chunks.has(key)) return;

  const grp = new THREE.Group();
  grp.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);

  // Floor plane
  const geo    = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
  const ground = new THREE.Mesh(geo, floorMat);
  ground.rotation.x  = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.isFloor = true;
  grp.add(ground);

  // Grid
  const grid = new THREE.GridHelper(CHUNK_SIZE, CHUNK_SIZE, 0x1a2a4a, 0x1a2a4a);
  grid.material.transparent = true;
  grid.material.opacity     = 0.2;
  grid.material.depthWrite  = false;
  grid.position.y           = 0.004;
  grid.userData.isGrid      = true;
  grp.add(grid);

  scene.add(grp);
  chunks.set(key, grp);
}

function removeChunk(key) {
  const grp = chunks.get(key);
  if (!grp) return;
  scene.remove(grp);
  grp.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  chunks.delete(key);
}

export function updateChunks(playerPos) {
  const cx = Math.round(playerPos.x / CHUNK_SIZE);
  const cz = Math.round(playerPos.z / CHUNK_SIZE);
  if (cx === _lastCX && cz === _lastCZ) return;
  _lastCX = cx; _lastCZ = cz;

  const needed = new Set();
  for (let dx = -CHUNK_RANGE; dx <= CHUNK_RANGE; dx++) {
    for (let dz = -CHUNK_RANGE; dz <= CHUNK_RANGE; dz++) {
      const key = chunkKey(cx + dx, cz + dz);
      needed.add(key);
      buildChunk(cx + dx, cz + dz);
    }
  }
  for (const key of [...chunks.keys()]) {
    if (!needed.has(key)) removeChunk(key);
  }
}

export function setFloorVisible(v) {
  chunks.forEach(grp => {
    grp.traverse(o => { if (o.userData.isFloor) o.visible = v; });
  });
}

export function setGridVisible(v) {
  chunks.forEach(grp => {
    grp.traverse(o => { if (o.userData.isGrid) o.visible = v; });
  });
}

export function setFloorColor(hex) {
  floorMat.color.set(hex);
}

export function setGridOpacity(v) {
  chunks.forEach(grp => {
    grp.traverse(o => {
      if (o.userData.isGrid && o.material) o.material.opacity = v;
    });
  });
}
