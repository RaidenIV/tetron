// ─── panel/index.js ───────────────────────────────────────────────────────────
// Full control panel: open/close, tabs, all sliders, export/import.
// Separated into logical sections but kept in one file to avoid excessive
// cross-file bindings for what is purely UI code.

import * as THREE from 'three';
import { scene, renderer, cameraSettings, getCameraType, setCameraType } from '../renderer.js';
import { state } from '../state.js';
import {
  ambientLight, sunLight, fillLight, rimLight, orbitLights,
} from '../lighting.js';
import {
  threshMat, compositeMat, globalBloom, bulletBloom, explBloom,
} from '../bloom.js';
import {
  playerMat, enemyMat, bulletMat, playerBaseColor,
  playerGeoParams, enemyGeoParams, bulletGeoParams,
  playerGeo, enemyGeo, bulletGeo,
  setPlayerGeo, setEnemyGeo, setBulletGeo,
  floorY, syncEnemyMats,
} from '../materials.js';
import { playerMesh, hbObj, dashBarObj } from '../player.js';
import { explConfig } from '../particles.js';
import { ground, grid } from '../terrain.js';
import { updateXP } from '../xp.js';
import { XP_THRESHOLDS } from '../constants.js';
import { syncOrbitBullets } from '../weapons.js';
import { restartGame } from '../gameFlow.js';
import { openUpgradeShop } from '../ui/upgrades.js';
import { pauseMusic, resumeMusic } from '../gameFlow.js';
import { setSfxVolume, setMusicVolume, setMuted, getMuted, getSfxVolume, getMusicVolume,
         setSoundVolume, getSoundVolume, getAllSoundVolumes } from '../audio.js';
import { applySavedVisualSettings, applyVisualSettings, getVisualSettings } from '../visuals.js';
import { clock } from '../loop.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const cpEl    = document.getElementById('cp');
const uiEl    = document.getElementById('ui');
const hintEl  = document.getElementById('tab-hint');
const notifEl = document.getElementById('notif');
const xpHudEl = document.getElementById('xp-hud');

function g(id)         { return document.getElementById(id); }
function setR(id, val, dec = 2) {
  const el = g(id); if (el) el.value = val;
  const v  = g(id + '-v'); if (v) v.value = Number(val).toFixed(dec);
}
function setC(id, hex) { const el = g(id); if (el) el.value = hex; }

applySavedVisualSettings();

// ── Default values for Reset buttons ─────────────────────────────────────────
const DEFS = {
  player:    { color:'#0044cc', metal:0.67, rough:0.0, cc:1.0, ccr:0.0, env:0.0, ec:'#000000', ei:1.0 },
  enemy:     { color:'#888888', metal:0.67, rough:0.0, cc:1.0, ccr:0.0, env:0.0, ec:'#000000', ei:1.0 },
  bullet:    { color:'#ffff00', metal:0.0,  rough:0.0, cc:1.0, ccr:0.0, env:3.0, ec:'#ffffff', ei:0.0 },
  bbullet:   { enabled:true, thresh:0.3, str:0.9 },
  geoPlayer: { radius:0.4,   length:1.2,  capSegs:8, radial:16 },
  geoEnemy:  { radius:0.4,   length:1.2,  capSegs:8, radial:16 },
  geoBullet: { radius:0.045, length:0.55, capSegs:4, radial:6  },
  scene:     { fnear:1, ffar:200 },
  light:     { amb:0, sun:15, fill:0, rim:0, ospd:0, oint:80 },
  bloom:     { thresh:1.0, str:0.0, exp:0.3 },
  destrStd:  { count:40,  size:0.25, speed:1.0,  glow:12.0, bthresh:0.0, bstr:0.2 },
  destrElite:{ count:100, size:0.5,  speed:1.75, glow:12.0, bthresh:0.0, bstr:0.2 },
  camera:    { type:'isometric', isoDistance:28, isoHeight:28, thirdPersonDistance:7, thirdPersonHeight:4, lookAhead:4, fov:60 },
  visuals:   { shadows:'high', bloom:true, reflections:true, accentLights:true },
};

const UPGRADE_GROUPS = {
  weapons: [
    ['laserFire', 'Laser Fire', 5], ['orbit', 'Orbit', 5], ['dmg', 'Damage', 5],
    ['fireRate', 'Fire Rate', 5], ['projSpeed', 'Projectile Speed', 4],
    ['piercing', 'Piercing', 3], ['multishot', 'Multishot', 3],
  ],
  abilities: [
    ['moveSpeed', 'Move Speed', 5], ['dash', 'Dash', 5], ['magnet', 'Magnet', 4],
    ['shield', 'Shield', 5], ['burst', 'Area Burst', 5], ['timeSlow', 'Time Slow', 5],
    ['targetedFire', 'Targeted Fire', 5], ['targetedCooldown', 'Targeted Cooldown', 5],
    ['targetedRange', 'Targeted Range', 5], ['targetedDamage', 'Targeted Damage', 5],
    ['lightning', 'Lightning', 5], ['lightningCooldown', 'Lightning Cooldown', 5],
    ['lightningDamage', 'Lightning Damage', 5],
  ],
  powerups: [
    ['maxHealth', 'Max Health', 5], ['regen', 'Regen', 4], ['xpGrowth', 'XP Growth', 4],
    ['coinBonus', 'Coin Bonus', 3], ['curse', 'Curse', 3], ['luck', 'Luck', 3],
  ],
};

const matRefs = { player: playerMat, enemy: enemyMat, bullet: bulletMat };

function geoParamsFor(type) {
  if (type === 'player') return playerGeoParams;
  if (type === 'enemy')  return enemyGeoParams;
  return bulletGeoParams;
}

// ── Section visibility ─────────────────────────────────────────────────────────
function updateSectionVisibility() {
  const t = state.activeTab;
  const directScopes = ['game', 'camera', 'scene', 'destr', 'audio', 'upgrades', 'enemy-behavior'];
  directScopes.forEach(scope => {
    document.querySelectorAll(`.sec[data-scope="${scope}"]`).forEach(el => {
      el.style.display = t === scope ? '' : 'none';
    });
  });
  document.querySelectorAll('.sec[data-scope="capsule"]').forEach(el => {
    el.style.display = (t === 'player' || t === 'enemy' || t === 'bullet') ? '' : 'none';
  });
  const bb = g('bullet-bloom-sec'); if (bb) bb.style.display = t === 'bullet' ? '' : 'none';
}

// ── Load panel state from Three.js objects → DOM inputs ───────────────────────
function loadPanel() {
  updateSectionVisibility();
  const t = state.activeTab;
  if (t === 'game') {
    const character = g('game-character'); if (character) character.value = state.selectedCharacter || 'blue';
    setR('game-speed', state.worldScale || 1, 2);
    setR('game-hp', state.playerHP || 1, 0);
    setR('game-maxhp', state.playerMaxHP || 100, 0);
    setR('game-coins', state.coins || 0, 0);
    setR('game-level', Math.max(1, state.playerLevel || 1), 0);
    setR('game-weapon-tier', state.weaponTier || 0, 0);
    return;
  }
  if (t === 'camera') {
    const type = g('cam-type'); if (type) type.value = getCameraType();
    setR('cam-iso-dist', cameraSettings.isoDistance, 0);
    setR('cam-iso-height', cameraSettings.isoHeight, 0);
    setR('cam-3p-dist', cameraSettings.thirdPersonDistance, 2);
    setR('cam-3p-height', cameraSettings.thirdPersonHeight, 2);
    setR('cam-lookahead', cameraSettings.lookAhead, 2);
    setR('cam-fov', cameraSettings.fov, 0);
    return;
  }
  if (t === 'upgrades') {
    syncUpgradeControls();
    return;
  }
  if (t === 'scene') {
    setR('s-fnear', scene.fog.near, 0); setR('s-ffar', scene.fog.far, 0);
    g('s-grid').checked = grid.visible; g('s-floor').checked = ground.visible;
    setR('l-amb', ambientLight.intensity); setR('l-sun', sunLight.intensity);
    setR('l-fill', fillLight.intensity);  setR('l-rim', rimLight.intensity);
    setR('l-ospd', orbitLights[0].speed); setR('l-oint', orbitLights[0].light.intensity, 0);
    setR('b-thresh', threshMat.uniforms.threshold.value);
    setR('b-str',    compositeMat.uniforms.strength.value);
    setR('b-exp',    renderer.toneMappingExposure);
    syncVisualQualityUI();
    return;
  }
  if (t === 'destr') {
    setR('dx-count',  explConfig.std.count,  0); setR('dx-size',  explConfig.std.size);
    setR('dx-speed',  explConfig.std.speed);     setR('dx-glow',  explConfig.std.glow);
    setR('dx-bthresh',explBloom.stdThreshold);   setR('dx-bstr',  explBloom.stdStrength);
    setR('ex-count',  explConfig.elite.count, 0);setR('ex-size',  explConfig.elite.size);
    setR('ex-speed',  explConfig.elite.speed);   setR('ex-glow',  explConfig.elite.glow);
    setR('ex-bthresh',explBloom.eliteThreshold); setR('ex-bstr',  explBloom.eliteStrength);
    return;
  }
  if (t === 'audio') {
    g('aud-mute').checked = getMuted();
    setR('aud-sfx',   getSfxVolume(),   2);
    setR('aud-music', getMusicVolume(), 2);
    return;
  }
  const mat = matRefs[t], gp = geoParamsFor(t);
  setR('g-radius', gp.radius); setR('g-length', gp.length);
  setR('g-capSegs', gp.capSegs, 0); setR('g-radial', gp.radial, 0);
  setC('m-color',  '#' + mat.color.getHexString());
  setR('m-metal',  mat.metalness); setR('m-rough',  mat.roughness);
  setR('m-cc',     mat.clearcoat ?? 0); setR('m-ccr', mat.clearcoatRoughness ?? 0);
  setR('m-env',    mat.envMapIntensity ?? 0);
  setC('e-color',  mat.emissive ? '#' + mat.emissive.getHexString() : '#000000');
  setR('e-int',    mat.emissiveIntensity ?? 0);
}

// ── Rebuild geometry after slider change ──────────────────────────────────────
function rebuildGeo() {
  const gp = geoParamsFor(state.activeTab);
  if (state.activeTab === 'player') {
    setPlayerGeo(new THREE.CapsuleGeometry(gp.radius, gp.length, gp.capSegs, gp.radial));
    playerMesh.geometry = playerGeo;
    playerMesh.position.y = floorY(gp);
  } else if (state.activeTab === 'enemy') {
    setEnemyGeo(new THREE.CapsuleGeometry(gp.radius, gp.length, gp.capSegs, gp.radial));
    state.enemies.forEach(e => { e.mesh.geometry = enemyGeo; e.mesh.position.y = floorY(gp); });
  } else {
    setBulletGeo(new THREE.CapsuleGeometry(gp.radius, gp.length, gp.capSegs, gp.radial));
    // Player bullets are a Group (white core + glow). Update both child meshes.
    state.bullets.forEach(b => {
      const obj = b.obj ?? b.mesh;
      if (!obj) return;
      if (obj.isGroup) {
        obj.children.forEach(ch => { if (ch.isMesh) ch.geometry = bulletGeo; });
        obj.position.y = floorY(gp);
      } else if (obj.isMesh) {
        obj.geometry = bulletGeo;
        obj.position.y = floorY(gp);
      }
    });
  }
}

function applyMat() {
  const mat = matRefs[state.activeTab];
  mat.color.set(g('m-color').value);
  mat.metalness = parseFloat(g('m-metal').value);
  mat.roughness = parseFloat(g('m-rough').value);
  if (mat.clearcoat          !== undefined) mat.clearcoat          = parseFloat(g('m-cc').value);
  if (mat.clearcoatRoughness !== undefined) mat.clearcoatRoughness = parseFloat(g('m-ccr').value);
  if (mat.envMapIntensity    !== undefined) mat.envMapIntensity    = parseFloat(g('m-env').value);
  mat.needsUpdate = true;
  if (state.activeTab === 'player') playerBaseColor.copy(playerMat.color);
  if (state.activeTab === 'enemy')  syncEnemyMats(state.enemies);
}

function applyEmissive() {
  const mat = matRefs[state.activeTab];
  if (!mat.emissive) return;
  mat.emissive.set(g('e-color').value);
  mat.emissiveIntensity = parseFloat(g('e-int').value);
  mat.needsUpdate = true;
  if (state.activeTab === 'enemy') syncEnemyMats(state.enemies);
}

// ── Open / close ──────────────────────────────────────────────────────────────
export function togglePanel() {
  state.panelOpen = !state.panelOpen;
  cpEl.classList.toggle('open', state.panelOpen);
  uiEl.classList.toggle('po',   state.panelOpen);
  hintEl.classList.toggle('po', state.panelOpen);
  xpHudEl?.classList.toggle('po', state.panelOpen);
  if (state.panelOpen) {
  // Opening the control panel should NOT pause the game and should NOT show the pause overlay.
  clock.getDelta();
  loadPanel();
}
updatePauseBtn();
  state.keys.w = state.keys.a = state.keys.s = state.keys.d = false;
}
g('cp-close').addEventListener('click', togglePanel);

// ── Pause button ──────────────────────────────────────────────────────────────
export function updatePauseBtn() {
  const btn = g('pause-btn'); if (!btn) return;
  if (state.paused) { btn.textContent = '▶ Resume'; btn.classList.add('paused'); }
  else              { btn.textContent = '⏸ Pause';  btn.classList.remove('paused'); }
}
export function togglePause() {
  state.paused = !state.paused;
  try { document.body.classList.toggle('is-paused', state.paused); } catch {}
  if (!state.paused) { clock.getDelta(); resumeMusic(); }
  else { pauseMusic(); }
  updatePauseBtn();
  state.keys.w = state.keys.a = state.keys.s = state.keys.d = false;
}
g('pause-btn').addEventListener('click', togglePause);

// ── Sidebar utility helpers ─────────────────────────────────────────────────
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ── Toast notification ────────────────────────────────────────────────────────
let _notifTimer = null;
export function showNotif(msg) {
  if (!notifEl) return;
  notifEl.textContent = msg;
  notifEl.classList.add('show');
  clearTimeout(_notifTimer);
  _notifTimer = setTimeout(() => notifEl.classList.remove('show'), 2200);
}

function syncVisualQualityUI() {
  const visuals = getVisualSettings();
  const shadows = g('vis-shadows'); if (shadows) shadows.value = visuals.shadows;
  const bloom = g('vis-bloom'); if (bloom) bloom.checked = !!visuals.bloom;
  const reflections = g('vis-reflections'); if (reflections) reflections.checked = !!visuals.reflections;
  const accent = g('vis-accent'); if (accent) accent.checked = !!visuals.accentLights;
}

function applyCurrentVisualQualityUI() {
  applyVisualSettings({
    shadows: g('vis-shadows')?.value || 'high',
    bloom: !!g('vis-bloom')?.checked,
    reflections: !!g('vis-reflections')?.checked,
    accentLights: !!g('vis-accent')?.checked,
  });
}

function updateCoinHudText() {
  const coinEl = document.getElementById('coin-count');
  if (coinEl) coinEl.textContent = String(Math.max(0, Math.round(state.coins || 0)));
}

function setCharacter(character) {
  state.selectedCharacter = character === 'red' ? 'red' : 'blue';
  state.characterBaseHpMult = state.selectedCharacter === 'blue' ? 1.10 : 1.0;
  state.characterBaseDamageMult = state.selectedCharacter === 'red' ? 1.10 : 1.0;
  state.characterPrimaryWeapon = state.selectedCharacter === 'blue' ? 'laser' : 'slash';
}

function syncUpgradeControls() {
  document.querySelectorAll('[data-upgrade-key]').forEach(el => {
    const key = el.dataset.upgradeKey;
    const val = Math.max(0, Number(state.upg?.[key] || 0));
    el.value = String(val);
    const out = g(`${el.id}-v`); if (out) out.value = String(val);
  });
}

function applyUpgradeTier(key, value) {
  if (!state.upg) state.upg = {};
  state.upg[key] = Math.max(0, Math.round(Number(value) || 0));
  if (key === 'dash') state.hasDash = state.upg[key] > 0;
  if (key === 'maxHealth') {
    state.playerMaxHP = Math.max(1, 100 + state.upg[key] * 25);
    state.playerHP = Math.min(state.playerHP, state.playerMaxHP);
    updateHealthBar();
  }
  if (key === 'orbit') syncOrbitBullets();
  if (key === 'laserFire') state.weaponTier = Math.max(state.weaponTier || 0, state.upg[key]);
  showNotif(`${key} tier ${state.upg[key]}`);
}

function createUpgradeControls() {
  Object.entries(UPGRADE_GROUPS).forEach(([group, rows]) => {
    const target = document.querySelector(`[data-upgrade-group="${group}"]`);
    if (!target || target.dataset.ready === 'true') return;
    target.dataset.ready = 'true';
    rows.forEach(([key, label, max]) => {
      const row = document.createElement('div');
      row.className = 'cr';
      row.innerHTML = `<span class="cl">${label}</span><input type="range" id="upg-${key}" data-upgrade-key="${key}" min="0" max="${max}" step="1" value="0"><input type="number" class="nv" id="upg-${key}-v" min="0" max="${max}" step="1" value="0">`;
      target.appendChild(row);
      const range = row.querySelector('input[type="range"]');
      range.addEventListener('input', () => {
        const out = g(`${range.id}-v`); if (out) out.value = range.value;
        applyUpgradeTier(key, range.value);
      });
    });
  });
  syncUpgradeControls();
}

function createSfxControls() {
  const target = g('sfx-mixer');
  if (!target || target.dataset.ready === 'true') return;
  target.dataset.ready = 'true';
  const labelize = key => key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, ch => ch.toUpperCase());
  Object.entries(getAllSoundVolumes()).forEach(([key, value]) => {
    const row = document.createElement('div');
    row.className = 'cr';
    row.innerHTML = `<span class="cl">${labelize(key)}</span><input type="range" id="sfx-${key}" data-sfx-key="${key}" min="0" max="1" step="0.01" value="${value}"><input type="number" class="nv" id="sfx-${key}-v" min="0" max="1" step="0.01" value="${Number(value).toFixed(2)}">`;
    target.appendChild(row);
    const range = row.querySelector('input[type="range"]');
    range.addEventListener('input', () => {
      const v = clamp01(parseFloat(range.value || '0'));
      setSoundVolume(key, v);
      const out = g(`${range.id}-v`); if (out) out.value = v.toFixed(2);
    });
  });
}

createUpgradeControls();
createSfxControls();

// ── Invincibility toggle ──────────────────────────────────────────────────────
const invCb  = g('invincible');
const invRow = g('inv-row');
invCb?.addEventListener('change', () => {
  state.invincible = invCb.checked;
  invRow?.classList.toggle('on', state.invincible);
});

// ── Level skip ────────────────────────────────────────────────────────────────
function jumpToLevel(targetLevel) {
  restartGame({ startCountdown: false, skipInitialSpawn: true });
  if (targetLevel > 0) {
    state.playerXP    = XP_THRESHOLDS[Math.min(targetLevel, XP_THRESHOLDS.length - 1)];
    state.playerLevel = Math.min(targetLevel, XP_THRESHOLDS.length - 1);
    updateXP(0);
    syncOrbitBullets();
  }
  state.paused = false; updatePauseBtn();
  document.querySelectorAll('.lvl-cb').forEach(lb =>
    lb.classList.toggle('active', parseInt(lb.dataset.lv) === targetLevel)
  );
}
document.querySelectorAll('.lvl-cb').forEach(lb =>
  lb.addEventListener('click', () => { jumpToLevel(parseInt(lb.dataset.lv)); showNotif('Jumped to Level ' + lb.dataset.lv + '!'); })
);

// ── Game category controls ───────────────────────────────────────────────────
g('game-character')?.addEventListener('change', () => {
  setCharacter(g('game-character').value);
  showNotif(`${state.selectedCharacter.toUpperCase()} capsule selected`);
});

g('game-restart-btn')?.addEventListener('click', () => {
  restartGame({ startCountdown: false, skipInitialSpawn: true });
  state.paused = false;
  clock.getDelta();
  resumeMusic();
  updatePauseBtn();
  loadPanel();
  showNotif('Run restarted');
});

g('game-shop-btn')?.addEventListener('click', () => {
  openUpgradeShop(Math.max(1, state.playerLevel || 1));
});

[
  ['game-speed', v => { state.worldScale = v; }, 2],
  ['game-hp', v => { state.playerHP = Math.min(Math.round(v), state.playerMaxHP || v); updateHealthBar(); }, 0],
  ['game-maxhp', v => { state.playerMaxHP = Math.max(1, Math.round(v)); state.playerHP = Math.min(state.playerHP, state.playerMaxHP); updateHealthBar(); }, 0],
  ['game-coins', v => { state.coins = Math.max(0, Math.round(v)); updateCoinHudText(); }, 0],
  ['game-level', v => { state.playerLevel = Math.max(1, Math.round(v)); state.playerXP = XP_THRESHOLDS[Math.min(state.playerLevel, XP_THRESHOLDS.length - 1)] || 0; updateXP(0); }, 0],
  ['game-weapon-tier', v => { state.weaponTier = Math.max(0, Math.round(v)); }, 0],
].forEach(([id, setter, dec]) => {
  g(id)?.addEventListener('input', () => {
    const v = parseFloat(g(id).value);
    const out = g(`${id}-v`); if (out) out.value = dec === 0 ? String(Math.round(v)) : v.toFixed(dec);
    setter(v);
  });
});

// ── Camera category controls ─────────────────────────────────────────────────
g('cam-type')?.addEventListener('change', () => {
  setCameraType(g('cam-type').value);
  showNotif(g('cam-type').value === 'third-person' ? '3rd Person Camera' : 'Isometric Camera');
});
[
  ['cam-iso-dist', 'isoDistance', 0],
  ['cam-iso-height', 'isoHeight', 0],
  ['cam-3p-dist', 'thirdPersonDistance', 2],
  ['cam-3p-height', 'thirdPersonHeight', 2],
  ['cam-lookahead', 'lookAhead', 2],
  ['cam-fov', 'fov', 0],
].forEach(([id, key, dec]) => {
  g(id)?.addEventListener('input', () => {
    const v = parseFloat(g(id).value);
    cameraSettings[key] = dec === 0 ? Math.round(v) : v;
    const out = g(`${id}-v`); if (out) out.value = dec === 0 ? String(Math.round(v)) : v.toFixed(dec);
    if (key === 'fov') setCameraType(getCameraType());
  });
});

// ── Visual quality controls ──────────────────────────────────────────────────
['vis-shadows','vis-bloom','vis-reflections','vis-accent'].forEach(id => {
  g(id)?.addEventListener('change', () => {
    applyCurrentVisualQualityUI();
    syncVisualQualityUI();
    showNotif('Visual settings updated');
  });
});

// ── Section collapse ──────────────────────────────────────────────────────────
document.querySelectorAll('.sec-hdr').forEach(h =>
  h.addEventListener('click', e => { if (!e.target.closest('.sec-rst')) h.parentElement.classList.toggle('collapsed'); })
);

// ── Capsule tabs ──────────────────────────────────────────────────────────────
document.querySelectorAll('.cap-tab').forEach(t =>
  t.addEventListener('click', () => {
    document.querySelectorAll('.cap-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    state.activeTab = t.dataset.t;
    loadPanel();
  })
);

// ── Geometry sliders ──────────────────────────────────────────────────────────
[['g-radius','radius',2],['g-length','length',2],['g-capSegs','capSegs',0],['g-radial','radial',0]]
  .forEach(([id, key, dec]) => {
    g(id)?.addEventListener('input', () => {
      const v = parseFloat(g(id).value);
      const ve = g(id+'-v'); if (ve) ve.value = v.toFixed(dec);
      geoParamsFor(state.activeTab)[key] = dec === 0 ? Math.round(v) : v;
      rebuildGeo();
    });
  });

// ── Material sliders ──────────────────────────────────────────────────────────
['m-metal','m-rough','m-cc','m-ccr','m-env'].forEach(id =>
  g(id)?.addEventListener('input', () => { g(id+'-v').value = parseFloat(g(id).value).toFixed(2); applyMat(); })
);
g('m-color')?.addEventListener('input', applyMat);
g('e-color')?.addEventListener('input', applyEmissive);
g('e-int')?.addEventListener('input',   () => { g('e-int-v').value = parseFloat(g('e-int').value).toFixed(2); applyEmissive(); });

// ── Scene sliders ─────────────────────────────────────────────────────────────
g('s-fnear')?.addEventListener('input', () => { const v=parseFloat(g('s-fnear').value); g('s-fnear-v').value=Math.round(v); scene.fog.near=v; });
g('s-ffar')?.addEventListener('input',  () => { const v=parseFloat(g('s-ffar').value);  g('s-ffar-v').value=Math.round(v);  scene.fog.far=v; });
g('s-grid')?.addEventListener('change',  () => { grid.visible=g('s-grid').checked; });
g('s-floor')?.addEventListener('change', () => { ground.visible=g('s-floor').checked; });
g('s-fps')?.addEventListener('change', () => {
  const ov = document.getElementById('fpsOverlay'); if (ov) ov.style.display = g('s-fps').checked ? '' : 'none';
});

// ── Lighting sliders ──────────────────────────────────────────────────────────
g('l-amb')?.addEventListener('input',  () => { const v=parseFloat(g('l-amb').value);  g('l-amb-v').value=v.toFixed(2);  ambientLight.intensity=v; });
g('l-sun')?.addEventListener('input',  () => { const v=parseFloat(g('l-sun').value);  g('l-sun-v').value=v.toFixed(2);  sunLight.intensity=v; });
g('l-fill')?.addEventListener('input', () => { const v=parseFloat(g('l-fill').value); g('l-fill-v').value=v.toFixed(2); fillLight.intensity=v; });
g('l-rim')?.addEventListener('input',  () => { const v=parseFloat(g('l-rim').value);  g('l-rim-v').value=v.toFixed(2);  rimLight.intensity=v; });
g('l-ospd')?.addEventListener('input', () => {
  const v=parseFloat(g('l-ospd').value); g('l-ospd-v').value=v.toFixed(2);
  orbitLights[0].speed=v; orbitLights[1].speed=v; orbitLights[2].speed=-v*1.45; orbitLights[3].speed=v*2.55;
});
g('l-oint')?.addEventListener('input', () => {
  const v=parseFloat(g('l-oint').value); g('l-oint-v').value=Math.round(v);
  orbitLights[0].light.intensity=v; orbitLights[1].light.intensity=v;
  orbitLights[2].light.intensity=v*0.625; orbitLights[3].light.intensity=v*1.5;
});

// ── Bloom sliders ─────────────────────────────────────────────────────────────
g('b-thresh')?.addEventListener('input', () => { const v=parseFloat(g('b-thresh').value); g('b-thresh-v').value=v.toFixed(2); threshMat.uniforms.threshold.value=v; globalBloom.threshold=v; });
g('b-str')?.addEventListener('input',    () => { const v=parseFloat(g('b-str').value);    g('b-str-v').value=v.toFixed(2);    compositeMat.uniforms.strength.value=v; globalBloom.strength=v; });
g('b-exp')?.addEventListener('input',    () => { const v=parseFloat(g('b-exp').value);    g('b-exp-v').value=v.toFixed(2);    renderer.toneMappingExposure=v; });

// Bullet bloom
function syncBulletBloomUI() {
  g('bb-en').checked = bulletBloom.enabled;
  setR('bb-thresh', bulletBloom.threshold); g('bb-thresh-v').value = bulletBloom.threshold.toFixed(2);
  setR('bb-str',    bulletBloom.strength);  g('bb-str-v').value    = bulletBloom.strength.toFixed(2);
}
syncBulletBloomUI();
g('bb-en')?.addEventListener('change', () => { bulletBloom.enabled = g('bb-en').checked; });
g('bb-thresh')?.addEventListener('input', () => { const v=parseFloat(g('bb-thresh').value); bulletBloom.threshold=v; g('bb-thresh-v').value=v.toFixed(2); });
g('bb-str')?.addEventListener('input',    () => { const v=parseFloat(g('bb-str').value);    bulletBloom.strength=v;  g('bb-str-v').value=v.toFixed(2); });

// ── Destruction sliders ───────────────────────────────────────────────────────
function bindR(id, step, setter) {
  g(id)?.addEventListener('input', () => {
    const v = parseFloat(g(id).value);
    const ve = g(id+'-v'); if (ve) ve.value = v.toFixed(step === 1 ? 0 : 2);
    setter(v);
  });
}
bindR('dx-count',   1,    v => { explConfig.std.count      = Math.round(v); });
bindR('dx-size',    0.01, v => { explConfig.std.size        = v; });
bindR('dx-speed',   0.05, v => { explConfig.std.speed       = v; });
bindR('dx-glow',    0.1,  v => { explConfig.std.glow        = v; });
bindR('dx-bthresh', 0.01, v => { explBloom.stdThreshold     = v; });
bindR('dx-bstr',    0.01, v => { explBloom.stdStrength      = v; });
bindR('ex-count',   1,    v => { explConfig.elite.count     = Math.round(v); });
bindR('ex-size',    0.01, v => { explConfig.elite.size       = v; });
bindR('ex-speed',   0.05, v => { explConfig.elite.speed      = v; });
bindR('ex-glow',    0.1,  v => { explConfig.elite.glow       = v; });
bindR('ex-bthresh', 0.01, v => { explBloom.eliteThreshold    = v; });
bindR('ex-bstr',    0.01, v => { explBloom.eliteStrength     = v; });

// ── Enemy max count ───────────────────────────────────────────────────────────
g('e-maxcount')?.addEventListener('input', () => {
  const v = parseInt(g('e-maxcount').value);
  state.maxEnemies = v; g('e-maxcount-v').value = v;
  while (state.enemies.length > state.maxEnemies) {
    const e = state.enemies.pop(); scene.remove(e.grp);
  }
});

// ── Number input → range bidirectional sync ───────────────────────────────────
document.querySelectorAll('input.nv[id$="-v"]').forEach(numEl => {
  const rangeEl = document.getElementById(numEl.id.slice(0, -2));
  if (!rangeEl || rangeEl.type !== 'range') return;
  const sync = () => {
    let v = parseFloat(numEl.value); if (isNaN(v)) return;
    v = Math.max(parseFloat(rangeEl.min), Math.min(parseFloat(rangeEl.max), v));
    rangeEl.value = v; rangeEl.dispatchEvent(new Event('input'));
  };
  numEl.addEventListener('input', sync);
  numEl.addEventListener('change', () => { sync(); numEl.value = parseFloat(rangeEl.value); });
});

// ── Per-section reset ─────────────────────────────────────────────────────────
document.querySelectorAll('.sec-rst').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const s = btn.dataset.s;
    const t = state.activeTab;

    if (s === 'camera') {
      Object.assign(cameraSettings, DEFS.camera);
      setCameraType(DEFS.camera.type);
      loadPanel();
      return;
    }

    if (s === 'visuals') {
      applyVisualSettings({ ...DEFS.visuals });
      syncVisualQualityUI();
      return;
    }

    if (s?.startsWith('upgrades-')) {
      const group = s.replace('upgrades-', '');
      (UPGRADE_GROUPS[group] || []).forEach(([key]) => applyUpgradeTier(key, 0));
      syncUpgradeControls();
      return;
    }

    if (s === 'sfx-all') {
      Object.keys(getAllSoundVolumes()).forEach(key => setSoundVolume(key, 1));
      createSfxControls();
      document.querySelectorAll('[data-sfx-key]').forEach(el => {
        el.value = getSoundVolume(el.dataset.sfxKey);
        const out = g(`${el.id}-v`); if (out) out.value = Number(el.value).toFixed(2);
      });
      return;
    }

    if (t === 'scene') {
      if (s === 'scene')  { setR('s-fnear',DEFS.scene.fnear,0); scene.fog.near=DEFS.scene.fnear; setR('s-ffar',DEFS.scene.ffar,0); scene.fog.far=DEFS.scene.ffar; g('s-grid').checked=true; grid.visible=true; g('s-floor').checked=true; ground.visible=true; }
      if (s === 'light')  { const dl=DEFS.light; setR('l-amb',dl.amb); ambientLight.intensity=dl.amb; setR('l-sun',dl.sun); sunLight.intensity=dl.sun; setR('l-fill',dl.fill); fillLight.intensity=dl.fill; setR('l-rim',dl.rim); rimLight.intensity=dl.rim; setR('l-ospd',dl.ospd); orbitLights[0].speed=orbitLights[1].speed=dl.ospd; orbitLights[2].speed=-dl.ospd*1.45; orbitLights[3].speed=dl.ospd*2.55; setR('l-oint',dl.oint,0); orbitLights[0].light.intensity=orbitLights[1].light.intensity=dl.oint; }
      if (s === 'bloom')  { setR('b-thresh',DEFS.bloom.thresh); threshMat.uniforms.threshold.value=DEFS.bloom.thresh; globalBloom.threshold=DEFS.bloom.thresh; setR('b-str',DEFS.bloom.str); compositeMat.uniforms.strength.value=DEFS.bloom.str; globalBloom.strength=DEFS.bloom.str; setR('b-exp',DEFS.bloom.exp); renderer.toneMappingExposure=DEFS.bloom.exp; }
      if (s === 'bbloom') { Object.assign(bulletBloom, { enabled:DEFS.bbullet.enabled, threshold:DEFS.bbullet.thresh, strength:DEFS.bbullet.str }); syncBulletBloomUI(); }
      return;
    }

    if (t === 'destr') {
      if (s === 'destr-std')   { Object.assign(explConfig.std,  DEFS.destrStd);   explBloom.stdThreshold=DEFS.destrStd.bthresh;   explBloom.stdStrength=DEFS.destrStd.bstr;   loadPanel(); }
      if (s === 'destr-elite') { Object.assign(explConfig.elite,DEFS.destrElite); explBloom.eliteThreshold=DEFS.destrElite.bthresh; explBloom.eliteStrength=DEFS.destrElite.bstr; loadPanel(); }
      return;
    }

    if (t === 'audio' && s === 'audio') {
      setMuted(false); setSfxVolume(1.0); setMusicVolume(0.4); loadPanel();
      return;
    }

    if (!(t === 'player' || t === 'enemy' || t === 'bullet')) return;
    const mat = matRefs[t], d = DEFS[t];
    if (s === 'geo') { const defKey='geo'+t.charAt(0).toUpperCase()+t.slice(1); Object.assign(geoParamsFor(t),DEFS[defKey]); rebuildGeo(); loadPanel(); }
    if (s === 'mat') { mat.color.set(d.color); mat.metalness=d.metal; mat.roughness=d.rough; if(mat.clearcoat!==undefined)mat.clearcoat=d.cc; if(mat.clearcoatRoughness!==undefined)mat.clearcoatRoughness=d.ccr; if(mat.envMapIntensity!==undefined)mat.envMapIntensity=d.env; mat.needsUpdate=true; if(t==='enemy')syncEnemyMats(state.enemies); loadPanel(); }
    if (s === 'em')  { if(mat.emissive){mat.emissive.set(d.ec);mat.emissiveIntensity=d.ei;mat.needsUpdate=true;} if(t==='enemy')syncEnemyMats(state.enemies); loadPanel(); }
  });
});

// ── Reset All ─────────────────────────────────────────────────────────────────
g('reset-all-btn')?.addEventListener('click', () => {
  ['player','enemy','bullet'].forEach(type => {
    const mat=matRefs[type], d=DEFS[type];
    mat.color.set(d.color); mat.metalness=d.metal; mat.roughness=d.rough;
    if(mat.clearcoat!==undefined)mat.clearcoat=d.cc;
    if(mat.clearcoatRoughness!==undefined)mat.clearcoatRoughness=d.ccr;
    if(mat.envMapIntensity!==undefined)mat.envMapIntensity=d.env;
    if(mat.emissive){mat.emissive.set(d.ec);mat.emissiveIntensity=d.ei;}
    mat.needsUpdate=true;
  });
  syncEnemyMats(state.enemies);
  ['player','enemy','bullet'].forEach(type => {
    const key='geo'+type.charAt(0).toUpperCase()+type.slice(1);
    const gp=geoParamsFor(type); Object.assign(gp,DEFS[key]);
    const newGeo=new THREE.CapsuleGeometry(gp.radius,gp.length,gp.capSegs,gp.radial);
    if(type==='player'){setPlayerGeo(newGeo);playerMesh.geometry=newGeo;playerMesh.position.y=floorY(gp);}
    else if(type==='enemy'){setEnemyGeo(newGeo);state.enemies.forEach(e=>{e.mesh.geometry=newGeo;e.mesh.position.y=floorY(gp);});}
    else{setBulletGeo(newGeo);}
  });
  const dl=DEFS.light;
  ambientLight.intensity=dl.amb; sunLight.intensity=dl.sun; fillLight.intensity=dl.fill; rimLight.intensity=dl.rim;
  orbitLights[0].speed=orbitLights[1].speed=dl.ospd; orbitLights[2].speed=-dl.ospd*1.45; orbitLights[3].speed=dl.ospd*2.55;
  orbitLights[0].light.intensity=orbitLights[1].light.intensity=dl.oint; orbitLights[2].light.intensity=dl.oint*0.625; orbitLights[3].light.intensity=dl.oint*1.5;
  scene.fog.near=DEFS.scene.fnear; scene.fog.far=DEFS.scene.ffar; grid.visible=true; ground.visible=true;
  threshMat.uniforms.threshold.value=DEFS.bloom.thresh; compositeMat.uniforms.strength.value=DEFS.bloom.str; renderer.toneMappingExposure=DEFS.bloom.exp;
  Object.assign(explConfig.std,DEFS.destrStd); Object.assign(explConfig.elite,DEFS.destrElite);
  explBloom.stdThreshold=DEFS.destrStd.bthresh; explBloom.stdStrength=DEFS.destrStd.bstr;
  explBloom.eliteThreshold=DEFS.destrElite.bthresh; explBloom.eliteStrength=DEFS.destrElite.bstr;
  Object.assign(cameraSettings, DEFS.camera); setCameraType(DEFS.camera.type);
  applyVisualSettings({ ...DEFS.visuals });
  Object.keys(state.upg || {}).forEach(key => { state.upg[key] = 0; });
  state.hasDash = false;
  Object.keys(getAllSoundVolumes()).forEach(key => setSoundVolume(key, 1));
  setMuted(false); setSfxVolume(1.0); setMusicVolume(0.4);
  syncUpgradeControls(); syncVisualQualityUI();
  loadPanel();
});

// ── Audio controls ────────────────────────────────────────────────────────────
g('aud-mute')?.addEventListener('change', () => { setMuted(g('aud-mute').checked); });
g('aud-sfx')?.addEventListener('input',   () => { const v=parseFloat(g('aud-sfx').value);   g('aud-sfx-v').value=v.toFixed(2);   setSfxVolume(v); });
g('aud-sfx-v')?.addEventListener('change',() => { const v=parseFloat(g('aud-sfx-v').value); g('aud-sfx').value=v;                setSfxVolume(v); });
g('aud-music')?.addEventListener('input', () => { const v=parseFloat(g('aud-music').value); g('aud-music-v').value=v.toFixed(2); setMusicVolume(v); });
g('aud-music-v')?.addEventListener('change',()=>{ const v=parseFloat(g('aud-music-v').value); g('aud-music').value=v;           setMusicVolume(v); });

// ── Export JSON ───────────────────────────────────────────────────────────────
function snapMat(mat) {
  return { color:'#'+mat.color.getHexString(), metalness:mat.metalness, roughness:mat.roughness,
           clearcoat:mat.clearcoat??0, clearcoatRoughness:mat.clearcoatRoughness??0,
           envMapIntensity:mat.envMapIntensity??0,
           emissive:mat.emissive?'#'+mat.emissive.getHexString():'#000000',
           emissiveIntensity:mat.emissiveIntensity??0 };
}
g('export-btn')?.addEventListener('click', () => {
  const snap = {
    meta: { app: 'Capsule Havoc Mechanics Lab', schema: 2, exportedAt: new Date().toISOString() },
    game: {
      selectedCharacter: state.selectedCharacter,
      characterPrimaryWeapon: state.characterPrimaryWeapon,
      playerHP: state.playerHP,
      playerMaxHP: state.playerMaxHP,
      playerLevel: state.playerLevel,
      weaponTier: state.weaponTier,
      coins: state.coins,
      maxEnemies: state.maxEnemies,
      worldScale: state.worldScale,
      invincible: state.invincible,
    },
    camera: { ...cameraSettings },
    upgrades: { ...state.upg },
    capsules: {
      player: { geo:{...playerGeoParams}, mat:snapMat(playerMat) },
      enemy:  { geo:{...enemyGeoParams},  mat:snapMat(enemyMat)  },
      bullet: { geo:{...bulletGeoParams}, mat:snapMat(bulletMat) },
    },
    scene:   { fogNear:scene.fog.near, fogFar:scene.fog.far, grid: grid.visible, floor: ground.visible },
    lighting:{ ambient:ambientLight.intensity, sun:sunLight.intensity, fill:fillLight.intensity, rim:rimLight.intensity, orbitSpeed: orbitLights[0].speed, orbitIntensity: orbitLights[0].light.intensity },
    visuals: getVisualSettings(),
    bloom:   { threshold:threshMat.uniforms.threshold.value, strength:compositeMat.uniforms.strength.value, exposure:renderer.toneMappingExposure },
    bulletBloom: { ...bulletBloom },
    destruction: {
      standard: { count:explConfig.std.count,   size:explConfig.std.size,   speed:explConfig.std.speed,   glow:explConfig.std.glow,   bloomThreshold:explBloom.stdThreshold,   bloomStrength:explBloom.stdStrength   },
      elite:    { count:explConfig.elite.count, size:explConfig.elite.size, speed:explConfig.elite.speed, glow:explConfig.elite.glow, bloomThreshold:explBloom.eliteThreshold, bloomStrength:explBloom.eliteStrength },
    },
    ui: { showFps: g('s-fps')?.checked, panelOpen: state.panelOpen, activeTab: state.activeTab },
    audio: { muted: getMuted(), sfxVolume: getSfxVolume(), musicVolume: getMusicVolume(), soundVolumes: getAllSoundVolumes() },
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(snap,null,2)],{type:'application/json'}));
  a.download = 'capsule-havoc-settings.json'; a.click(); URL.revokeObjectURL(a.href);
  showNotif('Settings Exported!');
});

// ── Import JSON ───────────────────────────────────────────────────────────────
g('import-btn')?.addEventListener('click', () => g('import-file').click());
g('import-file')?.addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try { applyImport(JSON.parse(ev.target.result)); showNotif('Settings Imported!'); }
    catch(err) { alert('Invalid JSON: ' + err.message); }
    e.target.value = '';
  };
  reader.readAsText(file);
});

function applyImport(data) {
  const applyM = (mat, d) => {
    if (!d) return;
    if (d.color) mat.color.set(d.color);
    if (d.metalness !== undefined) mat.metalness = d.metalness;
    if (d.roughness !== undefined) mat.roughness = d.roughness;
    if (d.clearcoat !== undefined && mat.clearcoat !== undefined) mat.clearcoat = d.clearcoat;
    if (d.clearcoatRoughness !== undefined && mat.clearcoatRoughness !== undefined) mat.clearcoatRoughness = d.clearcoatRoughness;
    if (d.envMapIntensity !== undefined && mat.envMapIntensity !== undefined) mat.envMapIntensity = d.envMapIntensity;
    if (d.emissive && mat.emissive) mat.emissive.set(d.emissive);
    if (d.emissiveIntensity !== undefined) mat.emissiveIntensity = d.emissiveIntensity;
    mat.needsUpdate = true;
  };

  const applyGeo = (type, geo) => {
    if (!geo) return;
    const gp = geoParamsFor(type);
    ['radius', 'length', 'capSegs', 'radial'].forEach(key => {
      if (geo[key] !== undefined) gp[key] = key === 'capSegs' || key === 'radial' ? Math.round(geo[key]) : Number(geo[key]);
    });
    const newGeo = new THREE.CapsuleGeometry(gp.radius, gp.length, gp.capSegs, gp.radial);
    if (type === 'player') { setPlayerGeo(newGeo); playerMesh.geometry = newGeo; playerMesh.position.y = floorY(gp); }
    if (type === 'enemy')  { setEnemyGeo(newGeo); state.enemies.forEach(e => { e.mesh.geometry = newGeo; e.mesh.position.y = floorY(gp); }); }
    if (type === 'bullet') { setBulletGeo(newGeo); }
  };

  if (data.game) {
    if (data.game.selectedCharacter) setCharacter(data.game.selectedCharacter);
    if (data.game.playerMaxHP !== undefined) state.playerMaxHP = Math.max(1, Math.round(data.game.playerMaxHP));
    if (data.game.playerHP !== undefined) state.playerHP = Math.max(1, Math.min(Math.round(data.game.playerHP), state.playerMaxHP));
    if (data.game.playerLevel !== undefined) state.playerLevel = Math.max(1, Math.round(data.game.playerLevel));
    if (data.game.weaponTier !== undefined) state.weaponTier = Math.max(0, Math.round(data.game.weaponTier));
    if (data.game.coins !== undefined) state.coins = Math.max(0, Math.round(data.game.coins));
    if (data.game.maxEnemies !== undefined) state.maxEnemies = Math.max(1, Math.round(data.game.maxEnemies));
    if (data.game.worldScale !== undefined) state.worldScale = Math.max(0.1, Number(data.game.worldScale));
    if (data.game.invincible !== undefined) state.invincible = !!data.game.invincible;
  }

  if (data.camera) {
    Object.entries(data.camera).forEach(([key, value]) => {
      if (key in cameraSettings) cameraSettings[key] = value;
    });
    setCameraType(data.camera.type || cameraSettings.type);
  }

  if (data.upgrades) {
    Object.entries(data.upgrades).forEach(([key, value]) => applyUpgradeTier(key, value));
  }

  applyGeo('player', data.capsules?.player?.geo);
  applyGeo('enemy',  data.capsules?.enemy?.geo);
  applyGeo('bullet', data.capsules?.bullet?.geo);
  applyM(playerMat, data.capsules?.player?.mat);
  applyM(enemyMat,  data.capsules?.enemy?.mat);
  applyM(bulletMat, data.capsules?.bullet?.mat);

  if (data.scene?.fogNear !== undefined) scene.fog.near = data.scene.fogNear;
  if (data.scene?.fogFar  !== undefined) scene.fog.far  = data.scene.fogFar;
  if (data.scene?.grid !== undefined) grid.visible = !!data.scene.grid;
  if (data.scene?.floor !== undefined) ground.visible = !!data.scene.floor;

  if (data.lighting?.ambient !== undefined) ambientLight.intensity = data.lighting.ambient;
  if (data.lighting?.sun     !== undefined) sunLight.intensity     = data.lighting.sun;
  if (data.lighting?.fill    !== undefined) fillLight.intensity    = data.lighting.fill;
  if (data.lighting?.rim     !== undefined) rimLight.intensity     = data.lighting.rim;
  if (data.lighting?.orbitSpeed !== undefined) {
    const v = Number(data.lighting.orbitSpeed);
    orbitLights[0].speed=v; orbitLights[1].speed=v; orbitLights[2].speed=-v*1.45; orbitLights[3].speed=v*2.55;
  }
  if (data.lighting?.orbitIntensity !== undefined) {
    const v = Number(data.lighting.orbitIntensity);
    orbitLights[0].light.intensity=v; orbitLights[1].light.intensity=v;
    orbitLights[2].light.intensity=v*0.625; orbitLights[3].light.intensity=v*1.5;
  }

  if (data.visuals) applyVisualSettings(data.visuals);
  if (data.bloom?.threshold  !== undefined) { threshMat.uniforms.threshold.value=data.bloom.threshold; globalBloom.threshold=data.bloom.threshold; }
  if (data.bloom?.strength   !== undefined) { compositeMat.uniforms.strength.value=data.bloom.strength; globalBloom.strength=data.bloom.strength; }
  if (data.bloom?.exposure   !== undefined) renderer.toneMappingExposure = data.bloom.exposure;
  if (data.bulletBloom) Object.assign(bulletBloom, data.bulletBloom);

  if (data.destruction?.standard) {
    const st = data.destruction.standard;
    if (st.count !== undefined) explConfig.std.count = st.count;
    if (st.size  !== undefined) explConfig.std.size  = st.size;
    if (st.speed !== undefined) explConfig.std.speed = st.speed;
    if (st.glow  !== undefined) explConfig.std.glow  = st.glow;
    if (st.bloomThreshold !== undefined) explBloom.stdThreshold = st.bloomThreshold;
    if (st.bloomStrength  !== undefined) explBloom.stdStrength  = st.bloomStrength;
  }
  if (data.destruction?.elite) {
    const el = data.destruction.elite;
    if (el.count !== undefined) explConfig.elite.count = el.count;
    if (el.size  !== undefined) explConfig.elite.size  = el.size;
    if (el.speed !== undefined) explConfig.elite.speed = el.speed;
    if (el.glow  !== undefined) explConfig.elite.glow  = el.glow;
    if (el.bloomThreshold !== undefined) explBloom.eliteThreshold = el.bloomThreshold;
    if (el.bloomStrength  !== undefined) explBloom.eliteStrength  = el.bloomStrength;
  }

  syncEnemyMats(state.enemies);
  if (data.audio) {
    if (data.audio.muted       !== undefined) setMuted(data.audio.muted);
    if (data.audio.sfxVolume   !== undefined) setSfxVolume(data.audio.sfxVolume);
    if (data.audio.musicVolume !== undefined) setMusicVolume(data.audio.musicVolume);
    if (data.audio.soundVolumes) Object.entries(data.audio.soundVolumes).forEach(([key, value]) => setSoundVolume(key, value));
  }

  updateHealthBar();
  updateXP(0);
  updateCoinHudText();
  syncUpgradeControls();
  syncVisualQualityUI();
  syncBulletBloomUI();
  loadPanel();
}
