// src/zones.js
// Grid-floor objective zones: editor placement, marker rendering, capture state,
// and lightweight reward accounting. Zone data lives in state.params so full
// JSON export/import and scene save/load preserve all settings.
import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';

const ZONE_MARKER_Y = 0.045;
const ZONE_OUTLINE_Y = 0.052;
const ZONE_CENTER_Y = 0.075;
const ZONE_CAPTURE_ALLY = '#35ff00';
const ZONE_CAPTURE_ENEMY = '#ff3030';
const ZONE_PREVIEW_BLOCKED = '#ff3030';

const _zoneMarkers = new Map();
let _zonePreview = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numberOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeHex(value, fallback = '#0075ff') {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
}

function normalizeNpcGroupId(value) {
  const text = String(value ?? '1');
  return ['1', '2', '3'].includes(text) ? text : '1';
}

function defaultRewards() {
  return {
    reinforcements: state.params.zoneRewardReinforcements === true,
    health: state.params.zoneRewardHealth === true,
    points: state.params.zoneRewardPoints === true,
  };
}

function normalizeZone(zone = {}, fallbackId = 1) {
  const rewards = zone.rewards && typeof zone.rewards === 'object' ? zone.rewards : defaultRewards();
  const capturedTeam = zone.capturedTeam === 'ally' || zone.capturedTeam === 'enemy' ? zone.capturedTeam : '';
  return {
    id: Math.max(1, Math.round(numberOr(zone.id, fallbackId))),
    x: numberOr(zone.x, 0),
    y: Math.max(0, numberOr(zone.y, 0)),
    z: numberOr(zone.z, 0),
    radius: clamp(numberOr(zone.radius, state.params.zoneRadius || 4), 0.5, 40),
    color: normalizeHex(zone.color, state.params.zoneColor || '#0075ff'),
    capturable: zone.capturable !== false,
    capturedBy: typeof zone.capturedBy === 'string' ? zone.capturedBy : '',
    capturedTeam,
    capturedGroup: normalizeNpcGroupId(zone.capturedGroup),
    rewardClaimedBy: Array.isArray(zone.rewardClaimedBy) ? zone.rewardClaimedBy.filter(Boolean).map(String) : [],
    rewards: {
      reinforcements: rewards.reinforcements === true,
      health: rewards.health === true,
      points: rewards.points === true,
    },
  };
}

export function normalizeZones() {
  const raw = Array.isArray(state.params.zones) ? state.params.zones : [];
  const byId = new Map();
  raw.forEach((zone, index) => {
    const clean = normalizeZone(zone, index + 1);
    byId.set(clean.id, clean);
  });
  state.params.zones = [...byId.values()].sort((a, b) => a.id - b.id);
  return state.params.zones;
}

export function getZones() {
  return normalizeZones();
}

function zoneOwnerKey(team, group) {
  return `${team}:${normalizeNpcGroupId(group)}`;
}

export function getNpcZoneOwnerKey(npc) {
  const team = npc?.isAlly ? 'ally' : 'enemy';
  return zoneOwnerKey(team, npc?.npcGroup || npc?.groupId || '1');
}

function nextZoneId() {
  const ids = new Set(getZones().map(zone => zone.id));
  let id = 1;
  while (ids.has(id)) id += 1;
  return id;
}

export function isZonePlaceable(x, z, radius = state.params.zoneRadius || 4, ignoreId = null) {
  const r = clamp(numberOr(radius, 4), 0.5, 40);
  for (const zone of getZones()) {
    if (ignoreId != null && zone.id === ignoreId) continue;
    const min = r + zone.radius;
    if (Math.hypot(zone.x - x, zone.z - z) < min) return false;
  }
  return true;
}

function createNumberSprite(number, color = '#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.beginPath();
  ctx.arc(64, 64, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 62px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 64, 67);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.name = 'ZoneMarkerNumber';
  sprite.position.y = 1.1;
  sprite.scale.set(0.8, 0.8, 1);
  sprite.renderOrder = 40;
  return sprite;
}

function disposeMarker(marker) {
  if (!marker) return;
  marker.parent?.remove?.(marker);
  marker.traverse?.(child => {
    child.geometry?.dispose?.();
    if (child.material?.map) child.material.map.dispose?.();
    child.material?.dispose?.();
  });
}

function createZoneMarker(name = 'ZoneMarker') {
  const group = new THREE.Group();
  group.name = name;
  group.renderOrder = 20;

  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  );
  fill.name = 'ZoneMarkerFill';
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = ZONE_MARKER_Y;
  fill.renderOrder = 20;
  group.add(fill);

  const outline = new THREE.Mesh(
    new THREE.RingGeometry(0.99, 1.01, 96),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  );
  outline.name = 'ZoneMarkerOutline';
  outline.rotation.x = -Math.PI / 2;
  outline.position.y = ZONE_OUTLINE_Y;
  outline.renderOrder = 21;
  group.add(outline);

  const point = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.035, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, toneMapped: false })
  );
  point.name = 'ZoneMarkerPoint';
  point.position.y = ZONE_CENTER_Y;
  point.renderOrder = 23;
  group.add(point);

  scene.add(group);
  return group;
}

function markerColor(zone) {
  if (zone.capturedTeam === 'ally') return ZONE_CAPTURE_ALLY;
  if (zone.capturedTeam === 'enemy') return ZONE_CAPTURE_ENEMY;
  return zone.color;
}

function applyMarkerZone(marker, zone, { preview = false, blocked = false } = {}) {
  const color = blocked ? ZONE_PREVIEW_BLOCKED : markerColor(zone);
  marker.position.set(zone.x, zone.y || 0, zone.z);
  marker.visible = true;
  const radius = clamp(numberOr(zone.radius, 4), 0.5, 40);
  const fill = marker.getObjectByName('ZoneMarkerFill');
  const outline = marker.getObjectByName('ZoneMarkerOutline');
  const point = marker.getObjectByName('ZoneMarkerPoint');
  if (fill) {
    fill.scale.set(radius, radius, 1);
    fill.material.color.set(color);
    fill.material.opacity = preview ? (blocked ? 0.22 : 0.14) : 0.18;
  }
  if (outline) {
    outline.scale.set(radius, radius, 1);
    outline.material.color.set(color);
    outline.material.opacity = preview ? 0.72 : 0.95;
  }
  if (point) {
    point.material.color.set(color);
    point.material.opacity = preview ? 0.72 : 1;
  }
  let number = marker.getObjectByName('ZoneMarkerNumber');
  if (!preview && !number) {
    number = createNumberSprite(zone.id, color);
    marker.add(number);
  } else if (preview && number) {
    marker.remove(number);
    number.material?.map?.dispose?.();
    number.material?.dispose?.();
  } else if (number) {
    marker.remove(number);
    number.material?.map?.dispose?.();
    number.material?.dispose?.();
    marker.add(createNumberSprite(zone.id, color));
  }
}

export function refreshZoneMarkers() {
  const zones = getZones();
  const activeIds = new Set(zones.map(zone => zone.id));
  for (const [id, marker] of _zoneMarkers.entries()) {
    if (!activeIds.has(id)) {
      disposeMarker(marker);
      _zoneMarkers.delete(id);
    }
  }
  for (const zone of zones) {
    let marker = _zoneMarkers.get(zone.id);
    if (!marker) {
      marker = createZoneMarker(`ZoneMarker_${zone.id}`);
      _zoneMarkers.set(zone.id, marker);
    }
    applyMarkerZone(marker, zone);
  }
}

export function hideZonePreview() {
  if (_zonePreview) _zonePreview.visible = false;
}

export function updateZonePreview(position, radius = state.params.zoneRadius, color = state.params.zoneColor) {
  if (!_zonePreview) _zonePreview = createZoneMarker('ZonePlacementPreview');
  const x = numberOr(position?.x, 0);
  const z = numberOr(position?.z, 0);
  const r = clamp(numberOr(radius, 4), 0.5, 40);
  const blocked = !isZonePlaceable(x, z, r);
  applyMarkerZone(_zonePreview, {
    id: nextZoneId(),
    x,
    y: Math.max(0, numberOr(position?.y, 0)),
    z,
    radius: r,
    color: normalizeHex(color, '#0075ff'),
    capturable: state.params.zoneCapturable !== false,
    rewards: defaultRewards(),
  }, { preview: true, blocked });
  return !blocked;
}

export function placeZoneAt(x, z) {
  const radius = clamp(numberOr(state.params.zoneRadius, 4), 0.5, 40);
  const sx = numberOr(x, 0);
  const sz = numberOr(z, 0);
  if (!isZonePlaceable(sx, sz, radius)) return null;
  const zone = normalizeZone({
    id: nextZoneId(),
    x: sx,
    y: 0,
    z: sz,
    radius,
    color: normalizeHex(state.params.zoneColor, '#0075ff'),
    capturable: state.params.zoneCapturable !== false,
    rewards: defaultRewards(),
  }, nextZoneId());
  state.params.zones = getZones().concat(zone).sort((a, b) => a.id - b.id);
  refreshZoneMarkers();
  return zone;
}

export function removeZoneNear(x, z) {
  const zones = getZones();
  let best = null;
  let bestDist = Infinity;
  for (const zone of zones) {
    const dist = Math.hypot(zone.x - x, zone.z - z);
    if (dist <= Math.max(zone.radius, 1) && dist < bestDist) {
      best = zone;
      bestDist = dist;
    }
  }
  if (!best) return false;
  state.params.zones = zones.filter(zone => zone.id !== best.id);
  const marker = _zoneMarkers.get(best.id);
  if (marker) disposeMarker(marker);
  _zoneMarkers.delete(best.id);
  refreshZoneMarkers();
  return true;
}

export function clearZones() {
  state.params.zones = [];
  state.params.zoneScore = 0;
  for (const marker of _zoneMarkers.values()) disposeMarker(marker);
  _zoneMarkers.clear();
  hideZonePreview();
}

export function findNearestZone(position, predicate = null) {
  const zones = getZones();
  let best = null;
  let bestD2 = Infinity;
  const px = numberOr(position?.x, 0);
  const pz = numberOr(position?.z, 0);
  for (const zone of zones) {
    if (predicate && !predicate(zone)) continue;
    const dx = zone.x - px;
    const dz = zone.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      best = zone;
      bestD2 = d2;
    }
  }
  return best;
}

export function findBehaviorZoneForNpc(npc, mode = 'patrol') {
  if (!npc?.group?.position) return null;
  const owner = getNpcZoneOwnerKey(npc);
  if (mode === 'attack') {
    return findNearestZone(npc.group.position, zone => zone.capturedBy !== owner);
  }
  return findNearestZone(npc.group.position);
}

function getOccupant(npcs, zone) {
  let best = null;
  let bestD = Infinity;
  for (const npc of npcs || []) {
    if (!npc?.group?.position || !(Number(npc.hp) > 0)) continue;
    const dx = npc.group.position.x - zone.x;
    const dz = npc.group.position.z - zone.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= zone.radius + Math.max(0, Number(npc.radius) || 0)) {
      if (dist < bestD) {
        best = npc;
        bestD = dist;
      }
    }
  }
  return best;
}

function rewardFlags(zone) {
  return {
    reinforcements: zone.rewards?.reinforcements === true || state.params.zoneRewardReinforcements === true,
    health: zone.rewards?.health === true || state.params.zoneRewardHealth === true,
    points: zone.rewards?.points === true || state.params.zoneRewardPoints === true,
  };
}

function healCaptureGroup(npcs, ownerKey, playerGroup = null) {
  for (const npc of npcs || []) {
    if (!npc || getNpcZoneOwnerKey(npc) !== ownerKey) continue;
    const maxHp = Math.max(1, Number(npc.maxHp) || 100);
    npc.hp = Math.min(maxHp, (Number(npc.hp) || 0) + maxHp * 0.25);
  }
  if (ownerKey.startsWith('ally:')) {
    const maxHealth = Math.max(1, Number(state.params.playerMaxHealth) || 100);
    state.params.playerHealth = Math.min(maxHealth, (Number(state.params.playerHealth) || 0) + maxHealth * 0.25);
    if (playerGroup) playerGroup.userData.zoneHealedAt = performance.now?.() || Date.now();
  }
}

function applyRewards(zone, occupant, npcs, callbacks = {}) {
  const owner = getNpcZoneOwnerKey(occupant);
  if (zone.rewardClaimedBy.includes(owner)) return;
  const rewards = rewardFlags(zone);
  if (!rewards.reinforcements && !rewards.health && !rewards.points) return;
  zone.rewardClaimedBy.push(owner);
  if (rewards.points) state.params.zoneScore = Math.max(0, Number(state.params.zoneScore) || 0) + 100;
  if (rewards.health) healCaptureGroup(npcs, owner, callbacks.playerGroup || null);
  if (rewards.reinforcements && typeof callbacks.spawnReinforcements === 'function') {
    callbacks.spawnReinforcements(occupant.isAlly ? 'ally' : 'enemy', occupant.npcGroup || '1', zone, 2);
  }
}

export function updateZones(npcs = [], callbacks = {}) {
  const zones = getZones();
  if (!zones.length) return;
  let changed = false;
  for (const zone of zones) {
    if (zone.capturable === false || state.params.zoneCapturable === false) continue;
    const occupant = getOccupant(npcs, zone);
    if (!occupant) continue;
    const team = occupant.isAlly ? 'ally' : 'enemy';
    const group = normalizeNpcGroupId(occupant.npcGroup || '1');
    const owner = zoneOwnerKey(team, group);
    if (zone.capturedBy !== owner) {
      zone.capturedBy = owner;
      zone.capturedTeam = team;
      zone.capturedGroup = group;
      changed = true;
    }
    applyRewards(zone, occupant, npcs, callbacks);
  }
  state.params.zones = zones;
  if (changed) refreshZoneMarkers();
}
