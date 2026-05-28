// src/panel/index.js
// The panel is built entirely from JavaScript — no HTML template.
// Pattern: write to state.params first, then call onChange to push into Three.js.
// This ensures JSON export always reflects reality.
import * as THREE from 'three';
import { state, defaultParams } from '../state.js';
import { scene, renderer, applyIsoCamD, setActiveCamera, onResize } from '../renderer.js';
import { ambientLight, sunLight, fillLight, rimLight } from '../lighting.js';
import {
  playerMat, playerBaseColor, rebuildPlayerGeo, applyPlayerMaterial,
} from '../player.js';
import { setFloorVisible, setGridVisible, setFloorColor, setGridColor } from '../terrain.js';

const sidebar = document.getElementById('sidebar');

// ── SVG icons (from uploaded assets) ──────────────────────────────────────────
const ICON_CAMERA = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M481-590.77h299.62q-26.24-70.54-83.66-124.65Q639.54-769.54 566-788l-99.69 171.85q-5.23 8.46-.04 16.92 5.2 8.46 14.73 8.46Zm-127.08 54.62q5.18 8.46 14.67 8.46t14.72-8.46l151.46-259.74q-11-2.11-27.39-3.11-16.38-1-27.38-1-66 0-123 25t-101 67l97.92 171.85ZM170-400h197.62q9.23 0 14.69-8.46 5.46-8.46.23-16.92L234.15-683.69q-35.07 43.31-54.61 94.53Q160-537.95 160-480q0 21 2.5 40.5T170-400Zm225.54 228L495-343.85q5.23-8.46-.23-16.92-5.46-8.46-14.69-8.46h-300.7q26.24 70.54 84.43 124.65Q322-190.46 395.54-172ZM480-160q66 0 123-25t101-67l-97.92-171.85q-5.18-8.46-14.67-8.46t-14.72 8.46L426.77-165.54q11 2.77 26.11 4.16Q468-160 480-160Zm245.85-116.31q32-41 53.07-94.34Q800-424 800-480q0-21-2.5-40.5T790-560H592.38q-9.23 0-14.69 8.46-5.46 8.46-.23 16.92l148.39 258.31ZM480-480Zm-.24 360q-74.07 0-139.65-28.3-65.58-28.3-114.55-77.26-48.96-48.97-77.26-114.55Q120-405.69 120-479.76q0-74.96 28.42-140.45 28.43-65.48 77.16-114.21 48.73-48.73 114.51-77.16Q405.86-840 479.75-840q74.79 0 140.37 28.42 65.57 28.43 114.3 77.16 48.73 48.73 77.16 114.21Q840-554.72 840-479.76q0 74.07-28.42 139.76-28.43 65.69-77.16 114.42-48.73 48.73-114.21 77.16Q554.72-120 479.76-120Z"/></svg>`;
const ICON_PLAYER = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M247.85-260.62q51-36.69 108.23-58.03Q413.31-340 480-340t123.92 21.35q57.23 21.34 108.23 58.03 39.62-41 63.73-96.84Q800-413.31 800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 66.69 24.12 122.54 24.11 55.84 63.73 96.84Zm146.88-234.11Q360-529.46 360-580t34.73-85.27Q429.46-700 480-700t85.27 34.73Q600-630.54 600-580t-34.73 85.27Q530.54-460 480-460t-85.27-34.73ZM480-120q-75.31 0-141-28.04t-114.31-76.65Q176.08-273.31 148.04-339 120-404.69 120-480t28.04-141q28.04-65.69 76.65-114.31 48.62-48.61 114.31-76.65Q404.69-840 480-840t141 28.04q65.69 28.04 114.31 76.65 48.61 48.62 76.65 114.31Q840-555.31 840-480t-28.04 141q-28.04 65.69-76.65 114.31-48.62 48.61-114.31 76.65Q555.31-120 480-120Zm108.85-59.35q53.53-19.34 92.53-52.96-39-31.31-90.23-49.5Q539.92-300 480-300q-59.92 0-111.54 17.81-51.61 17.81-89.84 49.88 39 33.62 92.53 52.96Q424.69-160 480-160q55.31 0 108.85-19.35Zm-52-343.8Q560-546.31 560-580t-23.15-56.85Q513.69-660 480-660t-56.85 23.15Q400-613.69 400-580t23.15 56.85Q446.31-500 480-500t56.85-23.15ZM480-580Zm0 350Z"/></svg>`;
const ICON_LIGHT  = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M565-395q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Zm-198.42 28.42Q320-413.15 320-480t46.58-113.42Q413.15-640 480-640t113.42 46.58Q640-546.85 640-480t-46.58 113.42Q546.85-320 480-320t-113.42-46.58ZM80-460q-8.54 0-14.27-5.73T60-480q0-8.54 5.73-14.27T80-500h100q8.54 0 14.27 5.73T200-480q0 8.54-5.73 14.27T180-460H80Zm700 0q-8.54 0-14.27-5.73T760-480q0-8.54 5.73-14.27T780-500h100q8.54 0 14.27 5.73T900-480q0 8.54-5.73 14.27T880-460H780ZM465.73-765.73Q460-771.46 460-780v-100q0-8.54 5.73-14.27T480-900q8.54 0 14.27 5.73T500-880v100q0 8.54-5.73 14.27T480-760q-8.54 0-14.27-5.73Zm0 700Q460-71.46 460-80v-100q0-8.54 5.73-14.27T480-200q8.54 0 14.27 5.73T500-180v100q0 8.54-5.73 14.27T480-60q-8.54 0-14.27-5.73ZM254.46-678.77l-57.61-55.85q-5.85-5.61-5.73-13.76.11-8.16 5.73-14.77 6.61-6.62 14.38-6.62 7.77 0 14.15 6.62L282-706.31q6.38 6.62 6.38 14.16 0 7.53-6.38 14.15-5.62 6.62-13.27 6.12-7.65-.5-14.27-6.89Zm480.16 481.92L678-253.69q-6.38-6.62-6.38-14.27 0-7.66 6.38-14.04 5.62-6.62 13.27-6.12 7.65.5 14.27 6.89l57.61 55.85q5.85 5.61 5.73 13.76-.11 8.16-5.73 14.77-6.61 6.62-14.38 6.62-7.77 0-14.15-6.62ZM678-678q-6.62-5.62-6.12-13.27.5-7.65 6.89-14.27l55.85-57.61q5.61-5.85 13.76-5.73 8.16.11 14.77 5.73 6.62 6.61 6.62 14.38 0 7.77-6.62 14.15L706.31-678q-6.62 6.38-14.16 6.38-7.53 0-14.15-6.38ZM196.85-196.85q-6.62-6.61-6.62-14.38 0-7.77 6.62-14.15L253.69-282q6.62-6.38 14.27-6.38 7.66 0 14.04 6.38 5.85 5.62 5.35 13.27-.5 7.65-6.12 14.27l-55.85 57.61q-6.38 6.62-14.15 6.5-7.77-.11-14.38-6.5ZM480-480Z"/></svg>`;
const ICON_SCENE  = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M340-148.42q-65.69-28.43-114.42-77.16-48.73-48.73-77.16-114.42Q120-405.69 120-480.12q0-74.42 28.42-140 28.43-65.57 77.16-114.3 48.73-48.73 114.42-77.16Q405.69-840 480.12-840q74.42 0 140 28.42 65.57 28.43 114.3 77.16 48.73 48.73 77.16 114.3 28.42 65.58 28.42 140 0 74.43-28.42 140.12-28.43 65.69-77.16 114.42-48.73 48.73-114.3 77.16-65.58 28.42-140 28.42-74.43 0-140.12-28.42Zm140-11.27q35.23-45.23 58.08-88.85 22.84-43.61 37.15-97.61H384.77q15.85 57.07 37.92 100.69 22.08 43.61 57.31 85.77Zm-50.92-6q-28-33-51.12-81.58-23.11-48.58-34.42-98.88H190.15q34.39 74.61 97.5 122.38 63.12 47.77 141.43 58.08Zm101.84 0q78.31-10.31 141.43-58.08 63.11-47.77 97.5-122.38H616.46q-15.15 51.07-38.27 99.65-23.11 48.58-47.27 80.81ZM173.85-386.15h161.38q-4.54-24.62-6.42-47.97-1.89-23.34-1.89-45.88 0-22.54 1.89-45.88 1.88-23.35 6.42-47.97H173.85q-6.54 20.77-10.2 45.27Q160-504.08 160-480t3.65 48.58q3.66 24.5 10.2 45.27Zm201.38 0h209.54q4.54-24.62 6.42-47.2 1.89-22.57 1.89-46.65t-1.89-46.65q-1.88-22.58-6.42-47.2H375.23q-4.54 24.62-6.42 47.2-1.89 22.57-1.89 46.65t1.89 46.65q1.88 22.58 6.42 47.2Zm249.54 0h161.38q6.54-20.77 10.2-45.27Q800-455.92 800-480t-3.65-48.58q-3.66-24.5-10.2-45.27H624.77q4.54 24.62 6.42 47.97 1.89 23.34 1.89 45.88 0 22.54-1.89 45.88-1.88 23.35-6.42 47.97Zm-8.31-227.7h153.39Q734.69-690 673.5-736.23q-61.19-46.23-142.58-58.85 28 36.85 50.35 84.27 22.35 47.43 35.19 96.96Zm-231.69 0h190.46q-15.85-56.3-39.08-101.84-23.23-45.54-56.15-84.62-32.92 39.08-56.15 84.62-23.23 45.54-39.08 101.84Zm-194.62 0h153.39q12.84-49.53 35.19-96.96 22.35-47.42 50.35-84.27-82.16 12.62-142.96 59.23-60.81 46.62-95.97 122Z"/></svg>`;

const ICON_WEAPONS = `<img src="./assets/weapons.svg" alt="" class="sb-icon-img">`;

const PRESET_SETTINGS = [
  { key: 'default', label: 'Default', path: './presets/default.json', data: {
  "cameraMode": "iso",
  "isoCamD": 12,
  "thirdDist": 14,
  "thirdHeight": 7,
  "thirdFov": 65,
  "thirdAzimuth": 2.36,
  "thirdLookAhead": 2,
  "thirdSmoothPos": 8,
  "thirdSmoothLook": 12,
  "playerSpeed": 7,
  "playerColor": "#0044cc",
  "playerMetalness": 0.67,
  "playerRoughness": 0,
  "playerRadius": 0.4,
  "playerLength": 1.2,
  "dashEnabled": true,
  "dashSpeed": 28,
  "dashDuration": 0.18,
  "dashCooldown": 1.4,
  "ambientIntensity": 0.42,
  "sunIntensity": 5.8,
  "fillIntensity": 1.35,
  "rimIntensity": 0.82,
  "sunAngleX": 16,
  "sunAngleZ": 14,
  "shadows": true,
  "fogNear": 1,
  "fogFar": 200,
  "bgColor": "#06080d",
  "floorColor": "#0c1020",
  "gridColor": "#1a2a4a",
  "showFloor": true,
  "showGrid": true,
  "showFps": false
} },
  { key: 'g1', label: 'G1', path: './presets/testbed.json', data: {
  "cameraMode": "third",
  "isoCamD": 12,
  "thirdDist": 4,
  "thirdHeight": 3.5,
  "thirdFov": 62,
  "thirdAzimuth": 0,
  "thirdLookAhead": 3.8,
  "thirdSmoothPos": 10,
  "thirdSmoothLook": 12,
  "playerSpeed": 7,
  "playerColor": "#0044cc",
  "playerMetalness": 0.67,
  "playerRoughness": 0,
  "playerRadius": 0.4,
  "playerLength": 1.2,
  "dashEnabled": true,
  "dashSpeed": 28,
  "dashDuration": 0.18,
  "dashCooldown": 1.4,
  "ambientIntensity": 0.42,
  "sunIntensity": 5.8,
  "fillIntensity": 1.35,
  "rimIntensity": 0.82,
  "sunAngleX": 16,
  "sunAngleZ": 14,
  "shadows": true,
  "fogNear": 1,
  "fogFar": 200,
  "bgColor": "#142130",
  "floorColor": "#0C1620",
  "gridColor": "#000000",
  "showFloor": true,
  "showGrid": true,
  "showFps": true
} },
];

// ── DOM helpers ────────────────────────────────────────────────────────────────

function row(label, control) {
  const d = document.createElement('div');
  d.className = 'sb-row';
  if (label) {
    const l = document.createElement('label');
    l.className = 'sb-label';
    l.textContent = label;
    d.appendChild(l);
  }
  if (control) d.appendChild(control);
  return d;
}

function subhdr(text) {
  const d = document.createElement('div');
  d.className = 'sb-subhdr';
  d.textContent = text;
  return d;
}

// Each section is a header + hidden body. Clicking the header toggles a CSS class.
function section(icon, title, buildFn) {
  const wrap = document.createElement('div');
  wrap.className = 'sb-section';

  const hdr = document.createElement('div');
  hdr.className = 'sb-section-hdr';
  hdr.title = title;

  const iconWrap = document.createElement('span');
  iconWrap.className = 'sb-icon';
  iconWrap.innerHTML = icon; // SVG string
  hdr.appendChild(iconWrap);

  const titleSpan = document.createElement('span');
  titleSpan.textContent = title;
  hdr.appendChild(titleSpan);

  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'arrow';
  arrowSpan.textContent = '▾';
  hdr.appendChild(arrowSpan);

  const body = document.createElement('div');
  body.className = 'sb-section-body'; // display: none by default

  hdr.addEventListener('click', () => {
    if (state.panelMinimized) {
      setPanelMinimized(false);
      body.classList.add('open');
      hdr.querySelector('.arrow').textContent = '▴';
      return;
    }

    const open = body.classList.toggle('open'); // display: block when open
    hdr.querySelector('.arrow').textContent = open ? '▴' : '▾';
  });

  wrap.appendChild(hdr);
  wrap.appendChild(body);
  buildFn(body);
  return { el: wrap, body, hdr };
}

// Slider: write to state.params, keep the range + number input in sync, then call onChange.
function slider({ key, label, min, max, step = 0.01, dec = 2, onChange }) {
  const inp = document.createElement('input');
  inp.type = 'range';
  inp.className = 'sb-slider';
  inp.min = min; inp.max = max; inp.step = step;
  inp.value = state.params[key];

  const num = document.createElement('input');
  num.type = 'number';
  num.className = 'sb-number';
  num.min = min; num.max = max; num.step = step;
  num.value = Number(state.params[key]).toFixed(dec);
  num.inputMode = 'decimal';

  function format(v) { return Number(v).toFixed(dec); }
  function clamp(v) { return Math.min(max, Math.max(min, v)); }
  function commit(v, { clampValue = false } = {}) {
    if (!Number.isFinite(v)) return;
    const next = clampValue ? clamp(v) : v;
    state.params[key] = next;
    inp.value = next;
    num.value = format(next);
    onChange?.(next); // optional immediate side-effect (e.g. light.intensity = v)
  }

  inp.addEventListener('input', () => commit(parseFloat(inp.value)));
  num.addEventListener('input', () => commit(parseFloat(num.value)));
  num.addEventListener('change', () => commit(parseFloat(num.value), { clampValue: true }));

  const wrap = document.createElement('div');
  wrap.className = 'sb-slider-wrap';
  wrap.appendChild(inp);
  wrap.appendChild(num);

  const r = row(label, wrap);
  r.classList.add('sb-row-slider');
  return r;
}

function colorPicker(label, key, onChange) {
  // Swatch + hex text input that stay in sync with each other
  const wrap = document.createElement('div');
  wrap.className = 'sb-color-wrap';

  const swatch = document.createElement('input');
  swatch.type = 'color';
  swatch.className = 'sb-color';
  swatch.value = state.params[key];

  const hexInp = document.createElement('input');
  hexInp.type = 'text';
  hexInp.className = 'sb-hex';
  hexInp.value = state.params[key].toUpperCase();
  hexInp.maxLength = 7;
  hexInp.spellcheck = false;

  function apply(hex) {
    state.params[key] = hex;
    onChange?.(hex);
  }

  swatch.addEventListener('input', () => {
    hexInp.value = swatch.value.toUpperCase();
    hexInp.classList.remove('invalid');
    apply(swatch.value);
  });

  hexInp.addEventListener('input', () => {
    const v = hexInp.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      hexInp.classList.remove('invalid');
      swatch.value = v;
      apply(v);
    } else {
      hexInp.classList.add('invalid');
    }
  });

  wrap.appendChild(swatch);
  wrap.appendChild(hexInp);
  const r = row(label, wrap);
  r.classList.add('sb-row-color');
  return r;
}

function toggle(label, key, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'sb-toggle';
  const inp = document.createElement('input');
  inp.type = 'checkbox';
  inp.checked = !!state.params[key];
  inp.addEventListener('change', () => {
    state.params[key] = inp.checked;
    onChange?.(inp.checked);
  });
  wrap.appendChild(inp);
  const knob = document.createElement('span');
  knob.className = 'sb-toggle-knob';
  wrap.appendChild(knob);
  const lbl = document.createElement('span');
  lbl.className = 'sb-toggle-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);
  return wrap;
}

function select(label, key, options, onChange) {
  const sel = document.createElement('select');
  sel.className = 'sb-select';
  for (const [v, l] of options) {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = l;
    if (state.params[key] === v) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    state.params[key] = sel.value;
    onChange?.(sel.value);
  });
  return row(label, sel);
}

function btn(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = 'sb-btn ' + (cls || '');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// ── Section builders ───────────────────────────────────────────────────────────

function buildCamera(body) {
  // Camera type — shows/hides the relevant sub-group
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
  isoGroup.style.display = state.params.cameraMode === 'iso' ? '' : 'none';
  isoGroup.appendChild(slider({
    key: 'isoCamD', label: 'Zoom', min: 4, max: 40, step: 0.5, dec: 1,
    onChange: v => applyIsoCamD(v),
  }));
  body.appendChild(isoGroup);

  const thirdGroup = document.createElement('div');
  thirdGroup.style.display = state.params.cameraMode === 'third' ? '' : 'none';
  [
    { key: 'thirdDist',       label: 'Distance',       min: 4,  max: 40,          step: 0.5,  dec: 1 },
    { key: 'thirdHeight',     label: 'Height',         min: 2,  max: 20,          step: 0.5,  dec: 1 },
    { key: 'thirdFov',        label: 'FOV',            min: 30, max: 120,         step: 1,    dec: 0 },
    { key: 'thirdAzimuth',    label: 'Azimuth',        min: 0,  max: Math.PI * 2, step: 0.05, dec: 2 },
    { key: 'thirdLookAhead',  label: 'Look Ahead',     min: 0,  max: 8,           step: 0.1,  dec: 1 },
    { key: 'thirdSmoothPos',  label: 'Pos Smoothing',  min: 1,  max: 30,          step: 0.5,  dec: 1 },
    { key: 'thirdSmoothLook', label: 'Look Smoothing', min: 1,  max: 30,          step: 0.5,  dec: 1 },
  ].forEach(o => thirdGroup.appendChild(slider(o)));

  thirdGroup.appendChild(subhdr('Offset'));
  thirdGroup.appendChild(select('Offset Mode', 'thirdOffsetMode', [
    ['parallel', 'Parallel OTS'],
    ['pivot', 'Canted Pivot'],
  ]));
  [
    { key: 'thirdOffsetX', label: 'Lateral Offset', min: -10, max: 10, step: 0.25, dec: 2 },
    { key: 'thirdOffsetY', label: 'Vertical Offset', min: -5,  max: 10, step: 0.25, dec: 2 },
    { key: 'thirdOffsetZ', label: 'Forward Offset',  min: -10, max: 10, step: 0.25, dec: 2 },
  ].forEach(o => thirdGroup.appendChild(slider(o)));
  body.appendChild(thirdGroup);
}

function buildPlayer(body) {
  body.appendChild(slider({
    key: 'playerSpeed', label: 'Speed', min: 1, max: 25, step: 0.5, dec: 1,
  }));
  body.appendChild(colorPicker('Color', 'playerColor', v => {
    playerMat.color.set(v);
    playerBaseColor.copy(playerMat.color);
    playerMat.needsUpdate = true;
  }));
  body.appendChild(slider({
    key: 'playerMetalness', label: 'Metalness', min: 0, max: 1, step: 0.01, dec: 2,
    onChange: v => { playerMat.metalness = v; playerMat.needsUpdate = true; },
  }));
  body.appendChild(slider({
    key: 'playerRoughness', label: 'Roughness', min: 0, max: 1, step: 0.01, dec: 2,
    onChange: v => { playerMat.roughness = v; playerMat.needsUpdate = true; },
  }));

  body.appendChild(subhdr('Geometry'));
  body.appendChild(slider({
    key: 'playerRadius', label: 'Radius', min: 0.1, max: 2, step: 0.05, dec: 2,
    onChange: () => rebuildPlayerGeo(),
  }));
  body.appendChild(slider({
    key: 'playerLength', label: 'Length', min: 0.1, max: 4, step: 0.1, dec: 1,
    onChange: () => rebuildPlayerGeo(),
  }));

  body.appendChild(subhdr('Dash'));
  body.appendChild(toggle('Dash Enabled', 'dashEnabled'));
  body.appendChild(slider({ key: 'dashSpeed',    label: 'Speed',    min: 5,    max: 60,  step: 1,    dec: 0 }));
  body.appendChild(slider({ key: 'dashDuration', label: 'Duration', min: 0.05, max: 0.5, step: 0.01, dec: 2 }));
  body.appendChild(slider({ key: 'dashCooldown', label: 'Cooldown', min: 0.1,  max: 5,   step: 0.1,  dec: 1 }));
}

function buildLighting(body) {
  body.appendChild(slider({
    key: 'ambientIntensity', label: 'Ambient', min: 0, max: 3, step: 0.01, dec: 2,
    onChange: v => { ambientLight.intensity = v; },
  }));
  body.appendChild(slider({
    key: 'sunIntensity', label: 'Sun', min: 0, max: 20, step: 0.1, dec: 1,
    onChange: v => { sunLight.intensity = v; },
  }));
  body.appendChild(slider({
    key: 'fillIntensity', label: 'Fill', min: 0, max: 10, step: 0.05, dec: 2,
    onChange: v => { fillLight.intensity = v; },
  }));
  body.appendChild(slider({
    key: 'rimIntensity', label: 'Rim', min: 0, max: 10, step: 0.05, dec: 2,
    onChange: v => { rimLight.intensity = v; },
  }));

  body.appendChild(subhdr('Sun Position'));
  body.appendChild(slider({ key: 'sunAngleX', label: 'X offset', min: -40, max: 40, step: 1, dec: 0 }));
  body.appendChild(slider({ key: 'sunAngleZ', label: 'Z offset', min: -40, max: 40, step: 1, dec: 0 }));

  body.appendChild(subhdr('Shadows'));
  body.appendChild(toggle('Cast Shadows', 'shadows', () => applyShadowSettings()));
  body.appendChild(select('Quality', 'shadowQuality', [
    ['low', 'Low'],
    ['medium', 'Medium'],
    ['high', 'High'],
    ['ultra', 'Ultra'],
  ], () => applyShadowSettings()));
}

function buildScene(body) {
  body.appendChild(colorPicker('Background', 'bgColor', v => {
    scene.background = new THREE.Color(v);
    if (scene.fog) scene.fog.color.set(v);
  }));
  body.appendChild(slider({
    key: 'fogNear', label: 'Fog Near', min: 0, max: 100, step: 1, dec: 0,
    onChange: v => { if (scene.fog) scene.fog.near = v; },
  }));
  body.appendChild(slider({
    key: 'fogFar', label: 'Fog Far', min: 10, max: 500, step: 5, dec: 0,
    onChange: v => { if (scene.fog) scene.fog.far = v; },
  }));
  body.appendChild(colorPicker('Floor Color', 'floorColor', v => setFloorColor(v)));
  body.appendChild(colorPicker('Grid Color',  'gridColor',  v => setGridColor(v)));
  body.appendChild(toggle('Show Floor', 'showFloor', v => setFloorVisible(v)));
  body.appendChild(toggle('Show Grid',  'showGrid',  v => setGridVisible(v)));

  body.appendChild(subhdr('Debug'));
  body.appendChild(toggle('Show FPS', 'showFps', v => {
    const el = document.getElementById('fps-overlay');
    if (el) el.style.display = v ? '' : 'none';
  }));
}


function buildWeapons(body) {
  body.appendChild(subhdr('Reticle'));
  body.appendChild(toggle('Show Reticle', 'reticleVisible', () => applyReticleSettings()));
  body.appendChild(select('Type', 'reticleType', [
    ['dot', 'Dot'],
    ['cross', 'Crosshair'],
    ['ring', 'Ring'],
    ['crossDot', 'Cross + Dot'],
  ], () => applyReticleSettings()));
  body.appendChild(colorPicker('Color', 'reticleColor', () => applyReticleSettings()));
  body.appendChild(slider({
    key: 'reticleSize', label: 'Size', min: 2, max: 48, step: 1, dec: 0,
    onChange: () => applyReticleSettings(),
  }));
  body.appendChild(slider({
    key: 'reticleThickness', label: 'Thickness', min: 1, max: 8, step: 1, dec: 0,
    onChange: () => applyReticleSettings(),
  }));
  body.appendChild(slider({
    key: 'reticleOpacity', label: 'Opacity', min: 0.1, max: 1, step: 0.05, dec: 2,
    onChange: () => applyReticleSettings(),
  }));
  body.appendChild(toggle('Glow', 'reticleGlow', () => applyReticleSettings()));
}

// ── JSON export / import / reset ───────────────────────────────────────────────

// Export serialises state.params and triggers a file download.
// Import reads the file, merges into state.params, pushes into Three.js, rebuilds panel DOM.
// Reset restores defaultParams (snapshot taken at startup).
function buildExportImport(container) {
  const wrap = document.createElement('div');
  wrap.className = 'sb-export-row';

  const presetSelect = document.createElement('select');
  presetSelect.className = 'sb-select sb-preset-select';
  PRESET_SETTINGS.forEach(({ key, label }) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    opt.selected = state.activePreset === key;
    presetSelect.appendChild(opt);
  });
  if (!PRESET_SETTINGS.some(({ key }) => state.activePreset === key)) {
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = 'Custom';
    customOpt.selected = true;
    presetSelect.appendChild(customOpt);
  }
  presetSelect.addEventListener('change', () => applyPreset(presetSelect.value));
  wrap.appendChild(row('Preset', presetSelect));

  wrap.appendChild(btn('⬇ Export JSON', 'sb-btn-accent', () => {
    const blob = new Blob([JSON.stringify(state.params, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'testbed.json' }).click();
    URL.revokeObjectURL(url);
  }));

  wrap.appendChild(btn('⬆ Import JSON', '', () => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
    inp.addEventListener('change', () => {
      if (!inp.files?.[0]) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          applyParamObject(JSON.parse(e.target.result));
          state.activePreset = 'custom';
          applyAllParams();
          rebuildPanel();
          notify('Imported ✓');
        } catch { notify('⚠ Invalid JSON'); }
      };
      reader.readAsText(inp.files[0]);
    });
    inp.click();
  }));

  wrap.appendChild(btn('↩ Reset Defaults', 'sb-btn-muted', () => {
    applyParamObject(defaultParams);
    state.activePreset = 'default';
    applyAllParams();
    rebuildPanel();
    notify('Reset ✓');
  }));

  container.appendChild(wrap);
}

function applyParamObject(params) {
  Object.assign(
    state.params,
    JSON.parse(JSON.stringify(defaultParams)),
    params || {}
  );
}

async function applyPreset(key) {
  const preset = PRESET_SETTINGS.find(item => item.key === key);
  if (!preset) return;

  try {
    let presetData = preset.data;
    try {
      const response = await fetch(preset.path, { cache: 'no-store' });
      if (response.ok) presetData = await response.json();
    } catch {
      // Fall back to the embedded preset so local file previews still work.
    }

    applyParamObject(presetData);
    state.activePreset = preset.key;
    applyAllParams();
    rebuildPanel();
    notify(`${preset.label} loaded ✓`);
  } catch {
    notify(`⚠ Could not load ${preset.label}`);
  }
}

function notify(msg) {
  let n = document.getElementById('sb-notif');
  if (!n) {
    n = Object.assign(document.createElement('div'), { id: 'sb-notif' });
    document.body.appendChild(n);
  }
  n.textContent = msg;
  n.style.opacity = '1';
  clearTimeout(n._t);
  n._t = setTimeout(() => { n.style.opacity = '0'; }, 2000);
}

function ensureReticleParts(el) {
  if (el.querySelector('.reticle-part')) return;
  el.innerHTML = `
    <span class="reticle-part reticle-line reticle-line-h"></span>
    <span class="reticle-part reticle-line reticle-line-v"></span>
    <span class="reticle-part reticle-dot"></span>
  `;
}

function applyReticleSettings() {
  const el = document.getElementById('target-reticle');
  if (!el) return;
  ensureReticleParts(el);

  const p = state.params;
  el.style.display = p.reticleVisible ? '' : 'none';
  el.style.setProperty('--reticle-color', p.reticleColor);
  el.style.setProperty('--reticle-size', `${p.reticleSize}px`);
  el.style.setProperty('--reticle-thickness', `${p.reticleThickness}px`);
  el.style.setProperty('--reticle-dot-size', `${Math.max(p.reticleThickness * 2, 3)}px`);
  el.style.setProperty('--reticle-opacity', p.reticleOpacity);
  el.dataset.reticleType = p.reticleType || 'dot';

  ['type-dot', 'type-cross', 'type-ring', 'type-cross-dot'].forEach(cls => el.classList.remove(cls));
  const typeClass = {
    dot: 'type-dot',
    cross: 'type-cross',
    ring: 'type-ring',
    crossDot: 'type-cross-dot',
  }[p.reticleType] || 'type-dot';
  el.classList.add(typeClass);
  el.classList.toggle('reticle-glow', !!p.reticleGlow);
}

const SHADOW_QUALITY = {
  low:    { size: 512,  type: THREE.BasicShadowMap },
  medium: { size: 1024, type: THREE.PCFShadowMap },
  high:   { size: 2048, type: THREE.PCFSoftShadowMap },
  ultra:  { size: 4096, type: THREE.PCFSoftShadowMap },
};

function applyShadowSettings() {
  const p = state.params;
  const q = SHADOW_QUALITY[p.shadowQuality] || SHADOW_QUALITY.high;

  renderer.shadowMap.enabled = !!p.shadows;
  renderer.shadowMap.type = q.type;
  renderer.shadowMap.needsUpdate = true;

  sunLight.castShadow = !!p.shadows;
  if (sunLight.shadow) {
    if (sunLight.shadow.map) {
      sunLight.shadow.map.dispose();
      sunLight.shadow.map = null;
    }
    sunLight.shadow.mapSize.set(q.size, q.size);
    sunLight.shadow.needsUpdate = true;
    sunLight.shadow.camera?.updateProjectionMatrix?.();
  }
}

// Push every param back into Three.js objects — used after import and reset.
function applyAllParams() {
  const p = state.params;
  applyIsoCamD(p.isoCamD);
  setActiveCamera(p.cameraMode);
  onResize();
  applyPlayerMaterial();
  rebuildPlayerGeo();
  ambientLight.intensity = p.ambientIntensity;
  sunLight.intensity     = p.sunIntensity;
  fillLight.intensity    = p.fillIntensity;
  rimLight.intensity     = p.rimIntensity;
  applyShadowSettings();
  scene.background = new THREE.Color(p.bgColor);
  if (scene.fog) { scene.fog.near = p.fogNear; scene.fog.far = p.fogFar; scene.fog.color.set(p.bgColor); }
  setFloorColor(p.floorColor);
  setGridColor(p.gridColor);
  setFloorVisible(p.showFloor);
  setGridVisible(p.showGrid);
  const fpsEl = document.getElementById('fps-overlay');
  if (fpsEl) fpsEl.style.display = p.showFps ? '' : 'none';
  applyReticleSettings();
}

// ── Build / rebuild panel DOM ──────────────────────────────────────────────────

function rebuildPanel() {
  const body = document.getElementById('sb-body');
  if (!body) return;
  body.innerHTML = '';

  const sections = [
    section(ICON_CAMERA,  'Camera',   buildCamera),
    section(ICON_PLAYER,  'Player',   buildPlayer),
    section(ICON_LIGHT,   'Lighting', buildLighting),
    section(ICON_SCENE,   'Scene',    buildScene),
    section(ICON_WEAPONS, 'Weapons',  buildWeapons),
  ];

  sections.forEach(({ el, body: b, hdr }, i) => {
    body.appendChild(el);
    // Open Camera and Player by default
    if (i < 2) {
      b.classList.add('open');
      hdr.querySelector('.arrow').textContent = '▴';
    }
  });

  buildExportImport(body);
}

// ── Init & toggle ──────────────────────────────────────────────────────────────

const SIDEBAR_MIN_WIDTH = 286;
const SIDEBAR_MAX_WIDTH = 560;
const SIDEBAR_DEFAULT_WIDTH = 320;

function clampSidebarWidth(width) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function applySidebarWidth() {
  if (!sidebar) return;
  const width = clampSidebarWidth(state.sidebarWidth || SIDEBAR_DEFAULT_WIDTH);
  state.sidebarWidth = width;
  sidebar.style.setProperty('--sb-width', `${width}px`);
  document.documentElement.style.setProperty('--sb-width', `${width}px`);
}

function initSidebarResize() {
  const handle = document.getElementById('sb-resizer');
  if (!handle) return;

  let dragging = false;

  const stopDrag = () => {
    dragging = false;
    document.body.classList.remove('sb-resizing');
  };

  handle.addEventListener('pointerdown', event => {
    if (state.panelMinimized) return;
    dragging = true;
    document.body.classList.add('sb-resizing');
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener('dblclick', () => {
    state.sidebarWidth = SIDEBAR_DEFAULT_WIDTH;
    applySidebarWidth();
  });

  window.addEventListener('pointermove', event => {
    if (!dragging) return;
    state.sidebarWidth = clampSidebarWidth(window.innerWidth - event.clientX);
    applySidebarWidth();
  });

  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointercancel', stopDrag);
}

function updatePanelChrome() {
  if (!sidebar) return;
  applySidebarWidth();
  sidebar.classList.toggle('minimized', !!state.panelMinimized);
  const btn = document.getElementById('sb-close-btn');
  if (btn) {
    btn.textContent = state.panelMinimized ? '☰' : '◀';
    btn.title = state.panelMinimized ? 'Expand sidebar' : 'Minimize sidebar';
    btn.setAttribute('aria-label', btn.title);
  }
}

function setPanelMinimized(minimized) {
  state.panelMinimized = minimized;
  state.panelOpen = true;
  if (sidebar) sidebar.style.display = '';
  updatePanelChrome();
}

export function initPanel() {
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="sb-resizer" id="sb-resizer" title="Resize sidebar" aria-hidden="true"></div>
    <div class="sb-header">
      <span class="sb-title">Game Lab</span>
      <button class="sb-close" id="sb-close-btn" title="Minimize sidebar" aria-label="Minimize sidebar">◀</button>
    </div>
    <div id="sb-body" class="sb-body"></div>
  `;
  document.getElementById('sb-close-btn')?.addEventListener('click', togglePanel);
  initSidebarResize();
  applyAllParams();
  rebuildPanel();
  updatePanelChrome();
}

export function togglePanel() {
  setPanelMinimized(!state.panelMinimized);
}

initPanel();
