// ─── panel/index.js ───────────────────────────────────────────────────────────
// Comprehensive sidebar control panel. Builds all UI dynamically,
// wires live bindings to state.params, and handles JSON export/import.

import * as THREE from 'three';
import { state }                 from '../state.js';
import { scene, renderer, applyIsoCamD, setActiveCamera, onRendererResize } from '../renderer.js';
import {
  ambientLight, sunLight, fillLight, rimLight, orbitLights,
} from '../lighting.js';
import {
  threshMat, compositeMat, globalBloom, bulletBloom,
} from '../bloom.js';
import {
  playerMat, enemyMat, playerBaseColor,
  playerGeoParams, enemyGeoParams, bulletGeoParams,
  playerGeo, enemyGeo, bulletGeo,
  setPlayerGeo, setEnemyGeo, setBulletGeo, floorY, syncEnemyMats, applyPlayerMaterial,
} from '../materials.js';
import { playerMesh, hbObj, dashBarObj, updateHealthBar } from '../player.js';
import { setFloorVisible, setGridVisible } from '../terrain.js';
import { destroyOrbitBullets, syncOrbitBullets } from '../weapons.js';
import { setMuted, getMuted, setSfxVolume, getSfxVolume } from '../audio.js';
import { setEnvironmentReflectionsEnabled } from '../renderer.js';
import { ENEMY_TYPE } from '../constants.js';

// ── Sidebar element ───────────────────────────────────────────────────────────
const sidebar = document.getElementById('sidebar');

// ─────────────────────────────────────────────────────────────────────────────
// Section builder helpers
// ─────────────────────────────────────────────────────────────────────────────

function section(id, title, icon, content) {
  const wrap = document.createElement('div');
  wrap.className = 'ps-section';
  wrap.id = 'sec-' + id;

  const hdr = document.createElement('div');
  hdr.className = 'ps-section-hdr';
  hdr.innerHTML = `<span class="ps-section-icon">${icon}</span>
    <span class="ps-section-title">${title}</span>
    <span class="ps-section-arrow">▾</span>`;

  const body = document.createElement('div');
  body.className = 'ps-section-body';

  hdr.addEventListener('click', () => {
    const open = body.classList.toggle('open');
    hdr.querySelector('.ps-section-arrow').textContent = open ? '▴' : '▾';
  });

  wrap.appendChild(hdr);
  wrap.appendChild(body);
  content(body);
  return wrap;
}

function row(label, control) {
  const d = document.createElement('div');
  d.className = 'ps-row';
  const l = document.createElement('label');
  l.className = 'ps-label';
  l.textContent = label;
  d.appendChild(l);
  d.appendChild(control);
  return d;
}

function slider(opts) {
  const { key, min, max, step = 0.01, dec = 2, onChange } = opts;
  const wrap = document.createElement('div');
  wrap.className = 'ps-slider-wrap';
  const input = document.createElement('input');
  input.type  = 'range';
  input.className = 'ps-slider';
  input.min   = min; input.max = max; input.step = step;
  input.value = get(key);
  const val = document.createElement('span');
  val.className = 'ps-val';
  val.textContent = Number(get(key)).toFixed(dec);
  function update() {
    const v = parseFloat(input.value);
    set(key, v);
    val.textContent = v.toFixed(dec);
    onChange && onChange(v);
  }
  input.addEventListener('input', update);
  wrap.appendChild(input);
  wrap.appendChild(val);
  return { el: wrap, input, val, refresh() { input.value = get(key); val.textContent = Number(get(key)).toFixed(dec); } };
}

function numInput(opts) {
  const { key, min, max, step = 1, dec = 0, onChange } = opts;
  const inp = document.createElement('input');
  inp.type  = 'number';
  inp.className = 'ps-num';
  inp.min   = min; inp.max = max; inp.step = step;
  inp.value = get(key);
  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    if (isNaN(v)) return;
    set(key, v);
    onChange && onChange(v);
  });
  return inp;
}

function colorInput(key, onChange) {
  const inp = document.createElement('input');
  inp.type  = 'color';
  inp.className = 'ps-color';
  inp.value = get(key);
  inp.addEventListener('input', () => { set(key, inp.value); onChange && onChange(inp.value); });
  return inp;
}

function toggle(key, label, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'ps-toggle';
  const inp = document.createElement('input');
  inp.type = 'checkbox';
  inp.checked = !!get(key);
  inp.addEventListener('change', () => { set(key, inp.checked); onChange && onChange(inp.checked); });
  wrap.appendChild(inp);
  const knob = document.createElement('span');
  knob.className = 'ps-toggle-knob';
  wrap.appendChild(knob);
  if (label) {
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.className = 'ps-toggle-label';
    wrap.appendChild(lbl);
  }
  return { el: wrap, inp };
}

function select(key, options, onChange) {
  const sel = document.createElement('select');
  sel.className = 'ps-select';
  for (const [v, l] of options) {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = l;
    if (get(key) === v) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => { set(key, sel.value); onChange && onChange(sel.value); });
  return sel;
}

function btn(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = 'ps-btn ' + (cls || '');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// State access helpers
function get(key) {
  const p = state.params;
  return key.includes('.') ? key.split('.').reduce((o, k) => o?.[k], p) : p[key];
}
function set(key, val) {
  const p = state.params;
  if (key.includes('.')) {
    const parts = key.split('.');
    let obj = p;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = val;
  } else {
    p[key] = val;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Camera
// ─────────────────────────────────────────────────────────────────────────────
function buildCameraSection(body) {
  // Camera type
  const camSel = select('cameraMode', [['iso', 'Isometric (Standard)'], ['third', '3rd Person (Over-shoulder)']], v => {
    setActiveCamera(v);
    onRendererResize();
    thirdGroup.style.display = v === 'third' ? '' : 'none';
    isoGroup.style.display   = v === 'iso'   ? '' : 'none';
  });
  body.appendChild(row('Camera Type', camSel));

  // Iso: zoom
  const isoGroup = document.createElement('div');
  isoGroup.style.display = state.params.cameraMode === 'iso' ? '' : 'none';
  const zoomS = slider({ key: 'isoCamD', min: 4, max: 40, step: 0.5, dec: 1,
    onChange: v => applyIsoCamD(v) });
  isoGroup.appendChild(row('Zoom (Ortho Size)', zoomS.el));
  body.appendChild(isoGroup);

  // 3rd person settings
  const thirdGroup = document.createElement('div');
  thirdGroup.style.display = state.params.cameraMode === 'third' ? '' : 'none';

  [
    { label: 'Distance',    key: 'thirdDist',      min: 4,   max: 40,  step: 0.5, dec: 1 },
    { label: 'Height',      key: 'thirdHeight',    min: 2,   max: 20,  step: 0.5, dec: 1 },
    { label: 'FOV',         key: 'thirdFov',       min: 30,  max: 120, step: 1,   dec: 0,
      onChange: v => { const { thirdCamera } = state._camRefs || {}; if (thirdCamera) { thirdCamera.fov = v; thirdCamera.updateProjectionMatrix(); } } },
    { label: 'Azimuth (rad)', key: 'thirdAzimuth', min: 0, max: Math.PI * 2, step: 0.05, dec: 2 },
    { label: 'Look Ahead',  key: 'thirdLookAhead', min: 0,   max: 8,   step: 0.1, dec: 1 },
    { label: 'Pos Smooth',  key: 'thirdSmoothPos', min: 1,   max: 30,  step: 0.5, dec: 1 },
  ].forEach(o => {
    const s = slider(o);
    thirdGroup.appendChild(row(o.label, s.el));
  });

  body.appendChild(thirdGroup);
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Player
// ─────────────────────────────────────────────────────────────────────────────
function buildPlayerSection(body) {
  // HP
  const hpS = slider({ key: 'playerMaxHP', min: 10, max: 1000, step: 10, dec: 0,
    onChange: v => { state.playerHP = Math.min(state.playerHP, v); updateHealthBar(); } });
  body.appendChild(row('Max HP', hpS.el));

  // HP fill button
  const fillHpBtn = btn('Fill HP', 'ps-btn-secondary', () => {
    state.playerHP = state.params.playerMaxHP;
    updateHealthBar();
  });
  body.appendChild(row('', fillHpBtn));

  // Speed
  const spS = slider({ key: 'playerSpeed', min: 1, max: 20, step: 0.5, dec: 1 });
  body.appendChild(row('Move Speed', spS.el));

  // Color
  const colorInp = colorInput('playerColor', v => {
    playerMat.color.set(v);
    playerBaseColor.copy(playerMat.color);
    playerMat.needsUpdate = true;
  });
  body.appendChild(row('Color', colorInp));

  // Metalness / roughness
  const metS = slider({ key: 'playerMetalness', min: 0, max: 1, step: 0.01, dec: 2,
    onChange: v => { playerMat.metalness = v; playerMat.needsUpdate = true; } });
  body.appendChild(row('Metalness', metS.el));
  const rghS = slider({ key: 'playerRoughness', min: 0, max: 1, step: 0.01, dec: 2,
    onChange: v => { playerMat.roughness = v; playerMat.needsUpdate = true; } });
  body.appendChild(row('Roughness', rghS.el));

  // God Mode
  const godTog = toggle('playerGodMode', 'God Mode');
  body.appendChild(row('', godTog.el));

  // Auto-shoot
  const autoTog = toggle('playerAutoShoot', 'Auto-Shoot');
  body.appendChild(row('', autoTog.el));

  // Dash
  const dashTog = toggle('playerDashEnabled', 'Dash Enabled');
  body.appendChild(row('', dashTog.el));
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Enemies
// ─────────────────────────────────────────────────────────────────────────────
function buildEnemiesSection(body) {
  // Spawn toggle
  const spawnTog = toggle('spawnPaused', 'Pause Spawning');
  body.appendChild(row('', spawnTog.el));

  // Kill all
  body.appendChild(btn('Kill All Enemies', 'ps-btn-danger', () => {
    const { killEnemy } = window._testbedEnemies || {};
    // Direct access via module
    import('../enemies.js').then(m => {
      [...state.enemies].forEach(e => { if (!e.dead) m.killEnemy(e, { silent: true }); });
    });
  }));

  [
    { label: 'Max Enemies',   key: 'maxEnemies',    min: 1, max: 200, step: 1, dec: 0 },
    { label: 'Enemy Speed',   key: 'enemySpeed',    min: 0, max: 20,  step: 0.1, dec: 1 },
    { label: 'HP Scale',      key: 'enemyHPScale',  min: 0.1, max: 10, step: 0.1, dec: 2 },
    { label: 'DMG Scale',     key: 'enemyDMGScale', min: 0, max: 5, step: 0.1, dec: 2 },
    { label: 'Size Scale',    key: 'enemySizeScale',min: 0.2, max: 4, step: 0.05, dec: 2 },
    { label: 'Spawn Rate',    key: 'enemySpawnRate',min: 0.1, max: 5, step: 0.1, dec: 2 },
  ].forEach(o => {
    const s = slider(o);
    body.appendChild(row(o.label, s.el));
  });

  // Enemy color
  const colorInp = colorInput('enemyColor', v => {
    enemyMat.color.set(v);
    syncEnemyMats(state.enemies);
  });
  body.appendChild(row('Base Color', colorInp));

  // Enemy type toggles
  const typesHdr = document.createElement('div');
  typesHdr.className = 'ps-sub-hdr';
  typesHdr.textContent = 'Active Types';
  body.appendChild(typesHdr);

  const LABELS = {
    rusher: '👾 Rusher',     orbiter:    '🔄 Orbiter',
    tanker: '🛡 Tanker',     sniper:     '🎯 Sniper',
    teleporter: '⚡ Teleporter', shielded: '🔰 Shielded',
    splitter: '✂ Splitter',  boss:       '👑 Boss',
  };
  for (const [type, label] of Object.entries(LABELS)) {
    const tg = toggle(`enemyTypes.${type}`, label);
    body.appendChild(tg.el);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Weapons / Lasers
// ─────────────────────────────────────────────────────────────────────────────
function buildWeaponsSection(body) {
  [
    { label: 'Fire Interval (s)', key: 'weaponFireInterval', min: 0.05, max: 3, step: 0.01, dec: 2 },
    { label: 'Bullet Speed',      key: 'weaponBulletSpeed',  min: 1,    max: 40, step: 0.5, dec: 1 },
    { label: 'Damage',            key: 'weaponDamage',       min: 1,    max: 500, step: 1, dec: 0 },
    { label: 'Bullet Scale',      key: 'weaponBulletScale',  min: 0.1,  max: 4, step: 0.05, dec: 2 },
    { label: 'Multishot',         key: 'weaponMultishot',    min: 1,    max: 12, step: 1, dec: 0 },
  ].forEach(o => {
    const s = slider(o);
    body.appendChild(row(o.label, s.el));
  });

  const pierceTog = toggle('weaponPiercing', 'Piercing Bullets');
  body.appendChild(row('', pierceTog.el));

  const orbitHdr = document.createElement('div');
  orbitHdr.className = 'ps-sub-hdr';
  orbitHdr.textContent = 'Orbit Bullets';
  body.appendChild(orbitHdr);

  [
    { label: 'Orbit Count',    key: 'orbitCount',   min: 0, max: 12, step: 1, dec: 0,
      onChange: () => syncOrbitBullets() },
    { label: 'Orbit Radius',   key: 'orbitRadius',  min: 0.5, max: 8, step: 0.1, dec: 1 },
    { label: 'Orbit Speed',    key: 'orbitSpeed',   min: 0.1, max: 12, step: 0.1, dec: 1 },
    { label: 'Orbit Damage',   key: 'orbitDamage',  min: 1, max: 200, step: 1, dec: 0 },
  ].forEach(o => {
    const s = slider(o);
    body.appendChild(row(o.label, s.el));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Lighting
// ─────────────────────────────────────────────────────────────────────────────
function buildLightingSection(body) {
  const lightRows = [
    { label: 'Ambient',          key: 'lightAmbient',       min: 0, max: 3, step: 0.01, dec: 2,
      onChange: v => { ambientLight.intensity = v; } },
    { label: 'Sun',              key: 'lightSun',           min: 0, max: 20, step: 0.1, dec: 1,
      onChange: v => { sunLight.intensity = v; } },
    { label: 'Fill',             key: 'lightFill',          min: 0, max: 10, step: 0.05, dec: 2,
      onChange: v => { fillLight.intensity = v; } },
    { label: 'Rim',              key: 'lightRim',           min: 0, max: 10, step: 0.05, dec: 2,
      onChange: v => { rimLight.intensity = v; } },
    { label: 'Orbit Speed',      key: 'lightOrbitSpeed',    min: 0, max: 10, step: 0.1, dec: 1,
      onChange: v => { orbitLights.forEach(ol => ol.speed = v); } },
    { label: 'Orbit Intensity',  key: 'lightOrbitIntensity',min: 0, max: 30, step: 0.5, dec: 1,
      onChange: v => { orbitLights.forEach(ol => { ol.light.intensity = v; }); } },
  ];

  lightRows.forEach(o => {
    const s = slider(o);
    body.appendChild(row(o.label, s.el));
  });

  const accTog = toggle('accentLights', 'Accent Lights', v => {
    orbitLights.forEach(ol => { ol.light.visible = v; });
  });
  body.appendChild(row('', accTog.el));
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Bloom / Post FX
// ─────────────────────────────────────────────────────────────────────────────
function buildBloomSection(body) {
  const enableTog = toggle('bloomEnabled', 'Bloom Enabled');
  body.appendChild(row('', enableTog.el));

  [
    { label: 'Threshold', key: 'bloomThreshold', min: 0, max: 2, step: 0.01, dec: 2,
      onChange: v => { threshMat.uniforms.threshold.value = v; globalBloom.threshold = v; } },
    { label: 'Strength',  key: 'bloomStrength',  min: 0, max: 4, step: 0.01, dec: 2,
      onChange: v => { compositeMat.uniforms.strength.value = v; globalBloom.strength = v; } },
    { label: 'Exposure',  key: 'bloomExposure',  min: 0.1, max: 2, step: 0.01, dec: 2,
      onChange: v => { renderer.toneMappingExposure = v; } },
  ].forEach(o => {
    const s = slider(o);
    body.appendChild(row(o.label, s.el));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Scene
// ─────────────────────────────────────────────────────────────────────────────
function buildSceneSection(body) {
  [
    { label: 'Fog Near', key: 'fogNear', min: 0, max: 50,  step: 1, dec: 0,
      onChange: v => { scene.fog.near = v; } },
    { label: 'Fog Far',  key: 'fogFar',  min: 10, max: 500, step: 5, dec: 0,
      onChange: v => { scene.fog.far = v; } },
  ].forEach(o => {
    const s = slider(o);
    body.appendChild(row(o.label, s.el));
  });

  const bgCol = colorInput('bgColor', v => {
    scene.background = new THREE.Color(v);
    scene.fog.color  = new THREE.Color(v);
  });
  body.appendChild(row('Background', bgCol));

  const floorTog = toggle('showFloor', 'Show Floor', v => setFloorVisible(v));
  body.appendChild(row('', floorTog.el));

  const gridTog = toggle('showGrid', 'Show Grid', v => setGridVisible(v));
  body.appendChild(row('', gridTog.el));

  const shadowSel = select('shadows', [
    ['off', 'Off'], ['low', 'Low (512)'], ['medium', 'Medium (1024)'], ['high', 'High (2048)'],
  ], v => applyShadowQuality(v));
  body.appendChild(row('Shadows', shadowSel));

  const reflTog = toggle('reflections', 'Reflections', v => setEnvironmentReflectionsEnabled(v));
  body.appendChild(row('', reflTog.el));
}

function applyShadowQuality(quality) {
  const sizes = { off: 0, low: 512, medium: 1024, high: 2048 };
  const size  = sizes[quality] ?? 2048;
  const on    = quality !== 'off';
  renderer.shadowMap.enabled = on;
  sunLight.castShadow = on;
  if (on) sunLight.shadow.mapSize.set(size, size);
  if (sunLight.shadow.map) { try { sunLight.shadow.map.dispose(); } catch {} sunLight.shadow.map = null; }
  sunLight.shadow.needsUpdate    = true;
  renderer.shadowMap.needsUpdate = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Geometry
// ─────────────────────────────────────────────────────────────────────────────
function buildGeoSection(body) {
  function makeGeoRow(label, key, min, max, step, dec, onRebuild) {
    const s = slider({ key, min, max, step, dec, onChange: () => onRebuild() });
    body.appendChild(row(label, s.el));
  }

  function rebuildPlayerGeo() {
    const p = state.params;
    setPlayerGeo(new THREE.CapsuleGeometry(p.playerRadius, p.playerLength, playerGeoParams.capSegs, playerGeoParams.radial));
    playerMesh.geometry = playerGeo;
    playerMesh.position.y = floorY({ radius: p.playerRadius, length: p.playerLength });
    Object.assign(playerGeoParams, { radius: p.playerRadius, length: p.playerLength });
  }
  function rebuildEnemyGeo() {
    const p = state.params;
    setEnemyGeo(new THREE.CapsuleGeometry(p.enemyRadius, p.enemyLength, enemyGeoParams.capSegs, enemyGeoParams.radial));
    state.enemies.forEach(e => {
      e.mesh.geometry = enemyGeo;
      e.mesh.position.y = floorY({ radius: p.enemyRadius, length: p.enemyLength });
    });
    Object.assign(enemyGeoParams, { radius: p.enemyRadius, length: p.enemyLength });
  }

  const playerHdr = document.createElement('div');
  playerHdr.className = 'ps-sub-hdr'; playerHdr.textContent = 'Player Capsule';
  body.appendChild(playerHdr);
  makeGeoRow('Radius', 'playerRadius', 0.1, 2,   0.05, 2, rebuildPlayerGeo);
  makeGeoRow('Length', 'playerLength', 0.2, 4,   0.1,  1, rebuildPlayerGeo);

  const enemyHdr = document.createElement('div');
  enemyHdr.className = 'ps-sub-hdr'; enemyHdr.textContent = 'Enemy Capsule';
  body.appendChild(enemyHdr);
  makeGeoRow('Radius', 'enemyRadius', 0.1, 2,   0.05, 2, rebuildEnemyGeo);
  makeGeoRow('Length', 'enemyLength', 0.2, 4,   0.1,  1, rebuildEnemyGeo);

  const bulletHdr = document.createElement('div');
  bulletHdr.className = 'ps-sub-hdr'; bulletHdr.textContent = 'Bullet';
  body.appendChild(bulletHdr);

  function rebuildBulletGeo() {
    const p = state.params;
    setBulletGeo(new THREE.CapsuleGeometry(p.bulletRadius, p.bulletLength, bulletGeoParams.capSegs, bulletGeoParams.radial));
    Object.assign(bulletGeoParams, { radius: p.bulletRadius, length: p.bulletLength });
  }
  makeGeoRow('Radius', 'bulletRadius', 0.01, 0.5,  0.005, 3, rebuildBulletGeo);
  makeGeoRow('Length', 'bulletLength', 0.05, 2,    0.05,  2, rebuildBulletGeo);
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Audio
// ─────────────────────────────────────────────────────────────────────────────
function buildAudioSection(body) {
  const muteTog = toggle('_muted', 'Mute All', v => setMuted(v));
  // sync from audio state
  muteTog.inp.checked = getMuted();
  body.appendChild(row('', muteTog.el));

  const sfxS = slider({ key: '_sfxVol', min: 0, max: 1, step: 0.01, dec: 2,
    onChange: v => setSfxVolume(v) });
  sfxS.input.value = getSfxVolume();
  sfxS.val.textContent = getSfxVolume().toFixed(2);
  body.appendChild(row('SFX Volume', sfxS.el));
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Debug
// ─────────────────────────────────────────────────────────────────────────────
function buildDebugSection(body) {
  const fpsTog = toggle('_showFps', 'Show FPS', v => {
    const el = document.getElementById('fpsOverlay');
    if (el) el.style.display = v ? '' : 'none';
  });
  body.appendChild(row('', fpsTog.el));

  body.appendChild(btn('Reset Player Position', 'ps-btn-secondary', () => {
    import('../player.js').then(m => {
      m.playerGroup.position.set(0, 0, 0);
    });
  }));

  body.appendChild(btn('Kill All Enemies', 'ps-btn-danger', () => {
    import('../enemies.js').then(m => {
      [...state.enemies].forEach(e => { if (!e.dead) m.killEnemy(e, { silent: true }); });
    });
  }));

  body.appendChild(btn('Restart Game', 'ps-btn-danger', () => window.location.reload()));
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Export / Import
// ─────────────────────────────────────────────────────────────────────────────

function buildExportImport(container) {
  const wrap = document.createElement('div');
  wrap.className = 'ps-export-row';

  const exportBtn = btn('⬇ Export JSON', 'ps-btn-export', () => {
    const json = JSON.stringify(state.params, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'testbed-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  const importBtn = btn('⬆ Import JSON', 'ps-btn-export', () => {
    const inp = document.createElement('input');
    inp.type  = 'file';
    inp.accept= '.json';
    inp.addEventListener('change', () => {
      const file = inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const parsed = JSON.parse(e.target.result);
          Object.assign(state.params, parsed);
          applyAllParams();
          rebuildPanel();
          showNotif('Settings imported ✓');
        } catch { showNotif('⚠ Invalid JSON'); }
      };
      reader.readAsText(file);
    });
    inp.click();
  });

  const resetBtn = btn('↩ Reset Defaults', 'ps-btn-secondary', () => {
    Object.assign(state.params, getDefaultParams());
    applyAllParams();
    rebuildPanel();
    showNotif('Reset to defaults ✓');
  });

  wrap.appendChild(exportBtn);
  wrap.appendChild(importBtn);
  wrap.appendChild(resetBtn);
  container.appendChild(wrap);
}

function showNotif(msg) {
  let n = document.getElementById('ps-notif');
  if (!n) {
    n = document.createElement('div');
    n.id = 'ps-notif';
    n.style.cssText = 'position:fixed;bottom:24px;right:320px;background:#1e3a5f;color:#7dd3fc;padding:8px 14px;border-radius:6px;font-size:12px;z-index:1000;pointer-events:none;transition:opacity 0.4s;';
    document.body.appendChild(n);
  }
  n.textContent = msg;
  n.style.opacity = '1';
  clearTimeout(n._t);
  n._t = setTimeout(() => { n.style.opacity = '0'; }, 2200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply params to Three.js objects (used by import / reset)
// ─────────────────────────────────────────────────────────────────────────────
function applyAllParams() {
  const p = state.params;
  applyIsoCamD(p.isoCamD);
  setActiveCamera(p.cameraMode);

  playerMat.color.set(p.playerColor);
  playerBaseColor.copy(playerMat.color);
  playerMat.metalness = p.playerMetalness;
  playerMat.roughness = p.playerRoughness;
  playerMat.needsUpdate = true;

  enemyMat.color.set(p.enemyColor);
  syncEnemyMats(state.enemies);

  ambientLight.intensity = p.lightAmbient;
  sunLight.intensity     = p.lightSun;
  fillLight.intensity    = p.lightFill;
  rimLight.intensity     = p.lightRim;
  orbitLights.forEach(ol => { ol.speed = p.lightOrbitSpeed; ol.light.intensity = p.lightOrbitIntensity; });
  orbitLights.forEach(ol => { ol.light.visible = p.accentLights; });

  threshMat.uniforms.threshold.value  = p.bloomThreshold;
  compositeMat.uniforms.strength.value = p.bloomStrength;
  renderer.toneMappingExposure         = p.bloomExposure;
  globalBloom.threshold = p.bloomThreshold;
  globalBloom.strength  = p.bloomStrength;

  scene.fog.near = p.fogNear;
  scene.fog.far  = p.fogFar;
  scene.background = new THREE.Color(p.bgColor);
  scene.fog.color  = new THREE.Color(p.bgColor);

  setFloorVisible(p.showFloor);
  setGridVisible(p.showGrid);
  applyShadowQuality(p.shadows);
  setEnvironmentReflectionsEnabled(p.reflections);

  syncOrbitBullets();
  updateHealthBar();
}

// ─────────────────────────────────────────────────────────────────────────────
// Build panel DOM
// ─────────────────────────────────────────────────────────────────────────────

let _panelBuilt = false;

function rebuildPanel() {
  // Clear body sections only (not header)
  const body = document.getElementById('ps-body');
  if (!body) return;
  body.innerHTML = '';

  const sections = [
    section('camera',    'Camera',         '📷', buildCameraSection),
    section('player',    'Player',         '🎮', buildPlayerSection),
    section('enemies',   'Enemies',        '👾', buildEnemiesSection),
    section('weapons',   'Weapons / Lasers','⚡', buildWeaponsSection),
    section('lighting',  'Lighting',       '💡', buildLightingSection),
    section('bloom',     'Bloom & Post FX','✨', buildBloomSection),
    section('scene',     'Scene',          '🌍', buildSceneSection),
    section('geo',       'Geometry',       '🧊', buildGeoSection),
    section('audio',     'Audio',          '🔊', buildAudioSection),
    section('debug',     'Debug',          '🛠', buildDebugSection),
  ];

  sections.forEach(s => body.appendChild(s));

  // Open camera and player by default
  ['camera', 'player', 'weapons'].forEach(id => {
    const hdr = body.querySelector(`#sec-${id} .ps-section-hdr`);
    const bod = body.querySelector(`#sec-${id} .ps-section-body`);
    if (hdr && bod) {
      bod.classList.add('open');
      hdr.querySelector('.ps-section-arrow').textContent = '▴';
    }
  });

  buildExportImport(body);
  _panelBuilt = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialize
// ─────────────────────────────────────────────────────────────────────────────

export function initPanel() {
  if (!sidebar) return;

  // Build panel header
  sidebar.innerHTML = `
    <div class="ps-header">
      <span class="ps-title">🧪 TESTBED</span>
      <button class="ps-close" id="ps-close-btn" title="Toggle panel (Tab)">✕</button>
    </div>
    <div id="ps-body" class="ps-body"></div>
  `;

  document.getElementById('ps-close-btn')?.addEventListener('click', togglePanel);
  rebuildPanel();
  sidebar.style.display = state.panelOpen ? '' : 'none';
}

export function togglePanel() {
  state.panelOpen = !state.panelOpen;
  if (sidebar) sidebar.style.display = state.panelOpen ? '' : 'none';
  onRendererResize(); // adjust canvas width
  // Build on first open
  if (state.panelOpen && !_panelBuilt) rebuildPanel();
}

// Default params for reset
function getDefaultParams() {
  return {
    cameraMode: 'iso', isoCamD: 12, thirdDist: 14, thirdHeight: 7,
    thirdAzimuth: 2.36, thirdFov: 65, thirdLookAhead: 2.0,
    thirdSmoothPos: 8.0, thirdSmoothLook: 12.0,
    playerSpeed: 7, playerMaxHP: 100, playerColor: '#0044cc',
    playerMetalness: 0.67, playerRoughness: 0.0,
    playerGodMode: false, playerAutoShoot: true, playerDashEnabled: true,
    enemySpeed: 3.08, enemyHPScale: 1.0, enemyDMGScale: 1.0, enemySizeScale: 1.0,
    enemySpawnRate: 1.0, maxEnemies: 40, enemyColor: '#888888', spawnPaused: false,
    enemyTypes: { rusher: true, orbiter: true, tanker: true, sniper: true,
      teleporter: false, shielded: true, splitter: false, boss: true },
    weaponFireInterval: 0.22, weaponBulletSpeed: 14, weaponDamage: 10,
    weaponBulletScale: 1.0, weaponMultishot: 1, weaponPiercing: false,
    orbitCount: 0, orbitRadius: 2.2, orbitSpeed: 3.5, orbitDamage: 5,
    lightAmbient: 0.42, lightSun: 5.8, lightFill: 1.35, lightRim: 0.82,
    lightOrbitSpeed: 1.9, lightOrbitIntensity: 8.2,
    bloomThreshold: 1.0, bloomStrength: 0.0, bloomExposure: 0.42, bloomEnabled: true,
    fogNear: 1, fogFar: 200, bgColor: '#06080d',
    showGrid: true, showFloor: true, shadows: 'high', reflections: true, accentLights: true,
    playerRadius: 0.4, playerLength: 1.2, enemyRadius: 0.4, enemyLength: 1.2,
    bulletRadius: 0.045, bulletLength: 0.55,
  };
}

// Auto-init when imported
initPanel();
