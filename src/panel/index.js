// ─── panel/index.js ───────────────────────────────────────────────────────────
import * as THREE from 'three';
import { state, defaultParams } from '../state.js';
import {
  scene, renderer, applyIsoCamD, setActiveCamera, onResize,
} from '../renderer.js';
import {
  ambientLight, sunLight, fillLight, rimLight,
} from '../lighting.js';
import {
  playerMat, playerBaseColor, rebuildPlayerGeo, applyPlayerMaterial,
} from '../player.js';
import {
  setFloorVisible, setGridVisible, setFloorColor,
} from '../terrain.js';

const sidebar = document.getElementById('sidebar');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function get(key) {
  // Supports dot notation for future nesting, but currently flat
  return state.params[key];
}
function set(key, val) {
  state.params[key] = val;
}

function section(id, title, icon, buildFn) {
  const wrap = document.createElement('div');
  wrap.className = 'ps-section';

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
  buildFn(body);
  return { el: wrap, body, hdr };
}

function row(label, control) {
  const d = document.createElement('div');
  d.className = 'ps-row';
  if (label) {
    const l = document.createElement('label');
    l.className = 'ps-label';
    l.textContent = label;
    d.appendChild(l);
  }
  if (control) d.appendChild(control);
  return d;
}

function slider({ key, min, max, step = 0.01, dec = 2, label, onChange }) {
  const wrap  = document.createElement('div');
  wrap.className = 'ps-slider-wrap';
  const inp   = document.createElement('input');
  inp.type    = 'range';
  inp.className = 'ps-slider';
  inp.min = min; inp.max = max; inp.step = step;
  inp.value = get(key);
  const val   = document.createElement('span');
  val.className = 'ps-val';
  val.textContent = Number(get(key)).toFixed(dec);

  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    set(key, v);
    val.textContent = v.toFixed(dec);
    onChange?.(v);
  });

  wrap.appendChild(inp);
  wrap.appendChild(val);

  const r = row(label ?? '', wrap);
  return r;
}

function colorPicker(label, key, onChange) {
  const inp = document.createElement('input');
  inp.type  = 'color';
  inp.className = 'ps-color';
  inp.value = get(key);
  inp.addEventListener('input', () => { set(key, inp.value); onChange?.(inp.value); });
  return row(label, inp);
}

function toggle(label, key, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'ps-toggle';
  const inp  = document.createElement('input');
  inp.type   = 'checkbox';
  inp.checked = !!get(key);
  inp.addEventListener('change', () => { set(key, inp.checked); onChange?.(inp.checked); });
  wrap.appendChild(inp);
  const knob = document.createElement('span');
  knob.className = 'ps-toggle-knob';
  wrap.appendChild(knob);
  const lbl = document.createElement('span');
  lbl.className = 'ps-toggle-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);
  return wrap;
}

function select(label, key, options, onChange) {
  const sel = document.createElement('select');
  sel.className = 'ps-select';
  for (const [v, l] of options) {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = l;
    if (get(key) === v) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => { set(key, sel.value); onChange?.(sel.value); });
  return row(label, sel);
}

function btn(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = 'ps-btn ' + (cls || '');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function subhdr(text) {
  const d = document.createElement('div');
  d.className = 'ps-sub-hdr';
  d.textContent = text;
  return d;
}

// ─── Camera section ────────────────────────────────────────────────────────────
function buildCamera(body) {
  body.appendChild(select('Type', 'cameraMode', [
    ['iso',   'Isometric'],
    ['third', '3rd Person'],
  ], v => {
    setActiveCamera(v);
    onResize();
    isoGroup.style.display   = v === 'iso'   ? '' : 'none';
    thirdGroup.style.display = v === 'third' ? '' : 'none';
  }));

  const isoGroup = document.createElement('div');
  isoGroup.style.display = get('cameraMode') === 'iso' ? '' : 'none';
  isoGroup.appendChild(slider({ key: 'isoCamD', label: 'Zoom', min: 4, max: 40, step: 0.5, dec: 1,
    onChange: v => applyIsoCamD(v) }));
  body.appendChild(isoGroup);

  const thirdGroup = document.createElement('div');
  thirdGroup.style.display = get('cameraMode') === 'third' ? '' : 'none';
  thirdGroup.appendChild(slider({ key: 'thirdDist',      label: 'Distance',   min: 4,  max: 40,           step: 0.5, dec: 1 }));
  thirdGroup.appendChild(slider({ key: 'thirdHeight',    label: 'Height',     min: 2,  max: 20,           step: 0.5, dec: 1 }));
  thirdGroup.appendChild(slider({ key: 'thirdFov',       label: 'FOV',        min: 30, max: 120,          step: 1,   dec: 0 }));
  thirdGroup.appendChild(slider({ key: 'thirdAzimuth',   label: 'Azimuth',    min: 0,  max: Math.PI * 2,  step: 0.05, dec: 2 }));
  thirdGroup.appendChild(slider({ key: 'thirdLookAhead', label: 'Look Ahead', min: 0,  max: 8,            step: 0.1, dec: 1 }));
  thirdGroup.appendChild(slider({ key: 'thirdSmoothPos', label: 'Smoothing',  min: 1,  max: 30,           step: 0.5, dec: 1 }));
  body.appendChild(thirdGroup);
}

// ─── Player section ────────────────────────────────────────────────────────────
function buildPlayer(body) {
  body.appendChild(slider({ key: 'playerSpeed', label: 'Move Speed', min: 1, max: 25, step: 0.5, dec: 1 }));
  body.appendChild(colorPicker('Color', 'playerColor', v => {
    playerMat.color.set(v);
    playerBaseColor.copy(playerMat.color);
    playerMat.needsUpdate = true;
  }));
  body.appendChild(slider({ key: 'playerMetalness', label: 'Metalness', min: 0, max: 1, step: 0.01, dec: 2,
    onChange: v => { playerMat.metalness = v; playerMat.needsUpdate = true; } }));
  body.appendChild(slider({ key: 'playerRoughness', label: 'Roughness', min: 0, max: 1, step: 0.01, dec: 2,
    onChange: v => { playerMat.roughness = v; playerMat.needsUpdate = true; } }));

  body.appendChild(subhdr('Geometry'));
  body.appendChild(slider({ key: 'playerRadius', label: 'Radius', min: 0.1, max: 2, step: 0.05, dec: 2,
    onChange: () => rebuildPlayerGeo() }));
  body.appendChild(slider({ key: 'playerLength', label: 'Length', min: 0.1, max: 4, step: 0.1, dec: 1,
    onChange: () => rebuildPlayerGeo() }));

  body.appendChild(subhdr('Dash'));
  body.appendChild(toggle('Dash Enabled', 'dashEnabled'));
  body.appendChild(slider({ key: 'dashSpeed',    label: 'Speed',    min: 5,   max: 60,  step: 1, dec: 0 }));
  body.appendChild(slider({ key: 'dashDuration', label: 'Duration', min: 0.05, max: 0.5, step: 0.01, dec: 2 }));
  body.appendChild(slider({ key: 'dashCooldown', label: 'Cooldown', min: 0.1, max: 5,   step: 0.1, dec: 1 }));
}

// ─── Lighting section ──────────────────────────────────────────────────────────
function buildLighting(body) {
  body.appendChild(slider({ key: 'ambientIntensity', label: 'Ambient', min: 0, max: 3, step: 0.01, dec: 2,
    onChange: v => { ambientLight.intensity = v; } }));
  body.appendChild(slider({ key: 'sunIntensity',     label: 'Sun',     min: 0, max: 20, step: 0.1, dec: 1,
    onChange: v => { sunLight.intensity = v; } }));
  body.appendChild(slider({ key: 'fillIntensity',    label: 'Fill',    min: 0, max: 10, step: 0.05, dec: 2,
    onChange: v => { fillLight.intensity = v; } }));
  body.appendChild(slider({ key: 'rimIntensity',     label: 'Rim',     min: 0, max: 10, step: 0.05, dec: 2,
    onChange: v => { rimLight.intensity = v; } }));

  body.appendChild(subhdr('Sun Position'));
  body.appendChild(slider({ key: 'sunAngleX', label: 'X offset', min: -40, max: 40, step: 1, dec: 0 }));
  body.appendChild(slider({ key: 'sunAngleZ', label: 'Z offset', min: -40, max: 40, step: 1, dec: 0 }));

  body.appendChild(subhdr('Shadows'));
  body.appendChild(toggle('Cast Shadows', 'shadows', v => {
    sunLight.castShadow = v;
    renderer?.shadowMap && (renderer.shadowMap.needsUpdate = true);
  }));
}

// ─── Scene section ─────────────────────────────────────────────────────────────
function buildScene(body) {
  body.appendChild(colorPicker('Background', 'bgColor', v => {
    scene.background = new THREE.Color(v);
    if (scene.fog) scene.fog.color.set(v);
  }));
  body.appendChild(slider({ key: 'fogNear', label: 'Fog Near', min: 0,  max: 100, step: 1, dec: 0,
    onChange: v => { if (scene.fog) scene.fog.near = v; } }));
  body.appendChild(slider({ key: 'fogFar',  label: 'Fog Far',  min: 10, max: 500, step: 5, dec: 0,
    onChange: v => { if (scene.fog) scene.fog.far  = v; } }));
  body.appendChild(colorPicker('Floor Color', 'floorColor', v => setFloorColor(v)));
  body.appendChild(toggle('Show Floor', 'showFloor', v => setFloorVisible(v)));
  body.appendChild(toggle('Show Grid',  'showGrid',  v => setGridVisible(v)));
}

// ─── Export / Import / Reset ───────────────────────────────────────────────────
function buildExportImport(container) {
  const wrap = document.createElement('div');
  wrap.className = 'ps-export-row';

  const _defaults = defaultParams();

  wrap.appendChild(btn('⬇ Export JSON', 'ps-btn-accent', () => {
    const blob = new Blob([JSON.stringify(state.params, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'testbed.json' });
    a.click();
    URL.revokeObjectURL(url);
  }));

  wrap.appendChild(btn('⬆ Import JSON', '', () => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
    inp.addEventListener('change', () => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          Object.assign(state.params, JSON.parse(e.target.result));
          applyAllParams();
          rebuildPanel();
          notify('Imported ✓');
        } catch { notify('⚠ Invalid JSON'); }
      };
      reader.readAsText(inp.files[0]);
    });
    inp.click();
  }));

  wrap.appendChild(btn('↩ Reset Defaults', 'ps-btn-secondary', () => {
    Object.assign(state.params, _defaults);
    applyAllParams();
    rebuildPanel();
    notify('Reset ✓');
  }));

  container.appendChild(wrap);
}

function notify(msg) {
  let n = document.getElementById('ps-notif');
  if (!n) {
    n = Object.assign(document.createElement('div'), { id: 'ps-notif' });
    document.body.appendChild(n);
  }
  n.textContent = msg;
  n.style.opacity = '1';
  clearTimeout(n._t);
  n._t = setTimeout(() => { n.style.opacity = '0'; }, 2000);
}

// ─── Apply all params to Three.js objects ─────────────────────────────────────
function applyAllParams() {
  const p = state.params;
  applyIsoCamD(p.isoCamD);
  setActiveCamera(p.cameraMode);
  applyPlayerMaterial();
  rebuildPlayerGeo();
  ambientLight.intensity = p.ambientIntensity;
  sunLight.intensity     = p.sunIntensity;
  fillLight.intensity    = p.fillIntensity;
  rimLight.intensity     = p.rimIntensity;
  sunLight.castShadow    = p.shadows;
  scene.background       = new THREE.Color(p.bgColor);
  if (scene.fog) { scene.fog.near = p.fogNear; scene.fog.far = p.fogFar; scene.fog.color.set(p.bgColor); }
  setFloorVisible(p.showFloor);
  setGridVisible(p.showGrid);
  setFloorColor(p.floorColor);
}

// ─── Build / rebuild panel DOM ─────────────────────────────────────────────────
function rebuildPanel() {
  const psBody = document.getElementById('ps-body');
  if (!psBody) return;
  psBody.innerHTML = '';

  const sections = [
    section('cam',     'Camera',  '📷', buildCamera),
    section('player',  'Player',  '🎮', buildPlayer),
    section('light',   'Lighting','💡', buildLighting),
    section('scene',   'Scene',   '🌍', buildScene),
  ];

  // Open camera + player by default
  sections.forEach(({ el, body, hdr }, i) => {
    psBody.appendChild(el);
    if (i < 2) {
      body.classList.add('open');
      hdr.querySelector('.ps-section-arrow').textContent = '▴';
    }
  });

  buildExportImport(psBody);
}

// ─── Init & toggle ─────────────────────────────────────────────────────────────
export function initPanel() {
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="ps-header">
      <span class="ps-title">🧪 TESTBED</span>
      <button class="ps-close" id="ps-close-btn" title="Tab">✕</button>
    </div>
    <div id="ps-body" class="ps-body"></div>
  `;
  document.getElementById('ps-close-btn')?.addEventListener('click', togglePanel);
  rebuildPanel();
}

export function togglePanel() {
  state.panelOpen = !state.panelOpen;
  if (sidebar) sidebar.style.display = state.panelOpen ? '' : 'none';
}

initPanel();
