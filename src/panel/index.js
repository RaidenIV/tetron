// src/panel/index.js
// The panel is built entirely from JavaScript — no HTML template.
// Pattern: write to state.params first, then call onChange to push into Three.js.
// This ensures JSON export always reflects reality.
import * as THREE from 'three';
import { state, defaultParams } from '../state.js';
import { scene, renderer, applyIsoCamD, setActiveCamera, onResize, isThirdPersonCameraMode } from '../renderer.js';
import { ambientLight, sunLight, fillLight, rimLight } from '../lighting.js';
import {
  playerMat, playerBaseColor, rebuildPlayerGeo, applyPlayerMaterial, applyShieldSettings,
} from '../player.js';
import { setFloorVisible, setGridVisible, setFloorColor, setGridColor } from '../terrain.js';
import { spawnEnemiesFromSettings, clearEnemies } from '../enemies.js';
import { clearGameplayInput } from '../input.js';

const sidebar = document.getElementById('sidebar');

// ── SVG icons (from uploaded assets) ──────────────────────────────────────────
const ICON_CAMERA = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M481-590.77h299.62q-26.24-70.54-83.66-124.65Q639.54-769.54 566-788l-99.69 171.85q-5.23 8.46-.04 16.92 5.2 8.46 14.73 8.46Zm-127.08 54.62q5.18 8.46 14.67 8.46t14.72-8.46l151.46-259.74q-11-2.11-27.39-3.11-16.38-1-27.38-1-66 0-123 25t-101 67l97.92 171.85ZM170-400h197.62q9.23 0 14.69-8.46 5.46-8.46.23-16.92L234.15-683.69q-35.07 43.31-54.61 94.53Q160-537.95 160-480q0 21 2.5 40.5T170-400Zm225.54 228L495-343.85q5.23-8.46-.23-16.92-5.46-8.46-14.69-8.46h-300.7q26.24 70.54 84.43 124.65Q322-190.46 395.54-172ZM480-160q66 0 123-25t101-67l-97.92-171.85q-5.18-8.46-14.67-8.46t-14.72 8.46L426.77-165.54q11 2.77 26.11 4.16Q468-160 480-160Zm245.85-116.31q32-41 53.07-94.34Q800-424 800-480q0-21-2.5-40.5T790-560H592.38q-9.23 0-14.69 8.46-5.46 8.46-.23 16.92l148.39 258.31ZM480-480Zm-.24 360q-74.07 0-139.65-28.3-65.58-28.3-114.55-77.26-48.96-48.97-77.26-114.55Q120-405.69 120-479.76q0-74.96 28.42-140.45 28.43-65.48 77.16-114.21 48.73-48.73 114.51-77.16Q405.86-840 479.75-840q74.79 0 140.37 28.42 65.57 28.43 114.3 77.16 48.73 48.73 77.16 114.21Q840-554.72 840-479.76q0 74.07-28.42 139.76-28.43 65.69-77.16 114.42-48.73 48.73-114.21 77.16Q554.72-120 479.76-120Z"/></svg>`;
const ICON_PLAYER = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M247.85-260.62q51-36.69 108.23-58.03Q413.31-340 480-340t123.92 21.35q57.23 21.34 108.23 58.03 39.62-41 63.73-96.84Q800-413.31 800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 66.69 24.12 122.54 24.11 55.84 63.73 96.84Zm146.88-234.11Q360-529.46 360-580t34.73-85.27Q429.46-700 480-700t85.27 34.73Q600-630.54 600-580t-34.73 85.27Q530.54-460 480-460t-85.27-34.73ZM480-120q-75.31 0-141-28.04t-114.31-76.65Q176.08-273.31 148.04-339 120-404.69 120-480t28.04-141q28.04-65.69 76.65-114.31 48.62-48.61 114.31-76.65Q404.69-840 480-840t141 28.04q65.69 28.04 114.31 76.65 48.61 48.62 76.65 114.31Q840-555.31 840-480t-28.04 141q-28.04 65.69-76.65 114.31-48.62 48.61-114.31 76.65Q555.31-120 480-120Zm108.85-59.35q53.53-19.34 92.53-52.96-39-31.31-90.23-49.5Q539.92-300 480-300q-59.92 0-111.54 17.81-51.61 17.81-89.84 49.88 39 33.62 92.53 52.96Q424.69-160 480-160q55.31 0 108.85-19.35Zm-52-343.8Q560-546.31 560-580t-23.15-56.85Q513.69-660 480-660t-56.85 23.15Q400-613.69 400-580t23.15 56.85Q446.31-500 480-500t56.85-23.15ZM480-580Zm0 350Z"/></svg>`;
const ICON_SHIELD = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M469-140q-6-1-11.02-3Q345-188 278.5-291.5 212-395 212-516v-166q0-19.26 10.88-34.66Q233.75-732.07 251-739l208-77q11-4 21-4t21 4l208 77q17.25 6.93 28.13 22.34Q748-701.26 748-682v166q0 121-66.5 224.5T502.02-143q-5.02 2-11.02 3t-11 1q-5 0-11-1Zm11-24q104-33 172-132t68-220v-167q0-10-5.5-18T699-713l-208-77q-5-2-11-2t-11 2l-208 77q-10 4-15.5 12t-5.5 18v167q0 121 68 220t172 132Zm0-314Z"/></svg>`;
const ICON_LIGHT  = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M565-395q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Zm-198.42 28.42Q320-413.15 320-480t46.58-113.42Q413.15-640 480-640t113.42 46.58Q640-546.85 640-480t-46.58 113.42Q546.85-320 480-320t-113.42-46.58ZM80-460q-8.54 0-14.27-5.73T60-480q0-8.54 5.73-14.27T80-500h100q8.54 0 14.27 5.73T200-480q0 8.54-5.73 14.27T180-460H80Zm700 0q-8.54 0-14.27-5.73T760-480q0-8.54 5.73-14.27T780-500h100q8.54 0 14.27 5.73T900-480q0 8.54-5.73 14.27T880-460H780ZM465.73-765.73Q460-771.46 460-780v-100q0-8.54 5.73-14.27T480-900q8.54 0 14.27 5.73T500-880v100q0 8.54-5.73 14.27T480-760q-8.54 0-14.27-5.73Zm0 700Q460-71.46 460-80v-100q0-8.54 5.73-14.27T480-200q8.54 0 14.27 5.73T500-180v100q0 8.54-5.73 14.27T480-60q-8.54 0-14.27-5.73ZM254.46-678.77l-57.61-55.85q-5.85-5.61-5.73-13.76.11-8.16 5.73-14.77 6.61-6.62 14.38-6.62 7.77 0 14.15 6.62L282-706.31q6.38 6.62 6.38 14.16 0 7.53-6.38 14.15-5.62 6.62-13.27 6.12-7.65-.5-14.27-6.89Zm480.16 481.92L678-253.69q-6.38-6.62-6.38-14.27 0-7.66 6.38-14.04 5.62-6.62 13.27-6.12 7.65.5 14.27 6.89l57.61 55.85q5.85 5.61 5.73 13.76-.11 8.16-5.73 14.77-6.61 6.62-14.38 6.62-7.77 0-14.15-6.62ZM678-678q-6.62-5.62-6.12-13.27.5-7.65 6.89-14.27l55.85-57.61q5.61-5.85 13.76-5.73 8.16.11 14.77 5.73 6.62 6.61 6.62 14.38 0 7.77-6.62 14.15L706.31-678q-6.62 6.38-14.16 6.38-7.53 0-14.15-6.38ZM196.85-196.85q-6.62-6.61-6.62-14.38 0-7.77 6.62-14.15L253.69-282q6.62-6.38 14.27-6.38 7.66 0 14.04 6.38 5.85 5.62 5.35 13.27-.5 7.65-6.12 14.27l-55.85 57.61q-6.38 6.62-14.15 6.5-7.77-.11-14.38-6.5ZM480-480Z"/></svg>`;
const ICON_SCENE  = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M340-148.42q-65.69-28.43-114.42-77.16-48.73-48.73-77.16-114.42Q120-405.69 120-480.12q0-74.42 28.42-140 28.43-65.57 77.16-114.3 48.73-48.73 114.42-77.16Q405.69-840 480.12-840q74.42 0 140 28.42 65.57 28.43 114.3 77.16 48.73 48.73 77.16 114.3 28.42 65.58 28.42 140 0 74.43-28.42 140.12-28.43 65.69-77.16 114.42-48.73 48.73-114.3 77.16-65.58 28.42-140 28.42-74.43 0-140.12-28.42Zm140-11.27q35.23-45.23 58.08-88.85 22.84-43.61 37.15-97.61H384.77q15.85 57.07 37.92 100.69 22.08 43.61 57.31 85.77Zm-50.92-6q-28-33-51.12-81.58-23.11-48.58-34.42-98.88H190.15q34.39 74.61 97.5 122.38 63.12 47.77 141.43 58.08Zm101.84 0q78.31-10.31 141.43-58.08 63.11-47.77 97.5-122.38H616.46q-15.15 51.07-38.27 99.65-23.11 48.58-47.27 80.81ZM173.85-386.15h161.38q-4.54-24.62-6.42-47.97-1.89-23.34-1.89-45.88 0-22.54 1.89-45.88 1.88-23.35 6.42-47.97H173.85q-6.54 20.77-10.2 45.27Q160-504.08 160-480t3.65 48.58q3.66 24.5 10.2 45.27Zm201.38 0h209.54q4.54-24.62 6.42-47.2 1.89-22.57 1.89-46.65t-1.89-46.65q-1.88-22.58-6.42-47.2H375.23q-4.54 24.62-6.42 47.2-1.89 22.57-1.89 46.65t1.89 46.65q1.88 22.58 6.42 47.2Zm249.54 0h161.38q6.54-20.77 10.2-45.27Q800-455.92 800-480t-3.65-48.58q-3.66-24.5-10.2-45.27H624.77q4.54 24.62 6.42 47.97 1.89 23.34 1.89 45.88 0 22.54-1.89 45.88-1.88 23.35-6.42 47.97Zm-8.31-227.7h153.39Q734.69-690 673.5-736.23q-61.19-46.23-142.58-58.85 28 36.85 50.35 84.27 22.35 47.43 35.19 96.96Zm-231.69 0h190.46q-15.85-56.3-39.08-101.84-23.23-45.54-56.15-84.62-32.92 39.08-56.15 84.62-23.23 45.54-39.08 101.84Zm-194.62 0h153.39q12.84-49.53 35.19-96.96 22.35-47.42 50.35-84.27-82.16 12.62-142.96 59.23-60.81 46.62-95.97 122Z"/></svg>`;

const ICON_WEAPONS = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor" aria-hidden="true"><path d="M753.54-132.15 631.15-254.31l-76.92 76.93q-4.08 4.07-11.08 4.07t-11.07-4.07q-18.39-18.39-18.39-45.47 0-27.07 18.39-45.46l163.61-163.61q18.39-18.39 45.46-18.39 27.08 0 45.47 18.39 4.07 4.07 4.07 11.07t-4.07 11.08l-76.93 76.92 122.16 122.39q9.69 9.69 9.69 22.61 0 12.93-9.69 22.62l-33.08 33.08q-9.69 9.69-22.62 9.69-12.92 0-22.61-9.69Zm76.77-599.08-432 432.77 29.61 29.38q18.39 18.39 18.39 45.46 0 27.08-18.39 45.47-4.07 4.07-11.07 4.07t-11.08-4.07l-76.92-76.93-122.39 122.16q-9.69 9.69-22.61 9.69-12.93 0-22.62-9.69L128.15-166q-9.69-9.69-9.69-22.62 0-12.92 9.69-22.61l122.16-122.39-76.93-76.92q-4.07-4.08-4.07-11.08t4.07-11.07q18.39-18.39 45.47-18.39 27.07 0 45.46 18.39l30.15 30.38 423.31-422.54q8.69-8.69 20.88-13.92 12.2-5.23 25.12-5.23h43.92q13.93 0 23.12 9.19 9.19 9.19 9.19 23.12v57.61q0 6.46-2.23 12.04-2.23 5.58-7.46 10.81ZM334-583l23.23-23.77 23-24-23 24L334-583Zm-42.69 14.15L138.38-721.77q-8.69-8.69-13.53-20.88-4.85-12.2-4.85-25.12v-43.92q0-13.93 9.19-23.12 9.19-9.19 23.12-9.19h43.92q12.92 0 25.12 5.23 12.19 5.23 20.88 13.92l152.39 153.16q5.84 5.84 5.73 13.38-.12 7.54-5.97 13.39-5.84 5.61-13.76 5.73-7.93.11-13.77-5.73L207-804h-47v47l159.85 159.85q5.61 5.61 6 13.65.38 8.04-6 14.65-6.62 6.62-14.27 6.62-7.66 0-14.27-6.62ZM370-327l430-430v-47h-47L323-374l47 47Zm0 0-23.23-23.77L323-374l23.77 23.23L370-327Z"/></svg>`;
const ICON_HUD = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M326-442v26q0 6.07 3.95 10.03 3.96 3.97 10 3.97 6.05 0 10.05-3.97 4-3.96 4-10.03v-80q0-6.07-3.95-10.03-3.96-3.97-10-3.97-6.05 0-10.05 3.97-4 3.96-4 10.03v26h-46q-6.07 0-10.03 3.95-3.97 3.96-3.97 10 0 6.05 3.97 10.05 3.96 4 10.03 4h46Zm82 0h272q6.07 0 10.03-3.95 3.97-3.96 3.97-10 0-6.05-3.97-10.05-3.96-4-10.03-4H408q-6.07 0-10.03 3.95-3.97 3.96-3.97 10 0 6.05 3.97 10.05 3.96 4 10.03 4Zm226-128h46q6.07 0 10.03-3.95 3.97-3.96 3.97-10 0-6.05-3.97-10.05-3.96-4-10.03-4h-46v-26q0-6.07-3.95-10.03-3.96-3.97-10-3.97-6.05 0-10.05 3.97-4 3.96-4 10.03v80q0 6.07 3.95 10.03 3.96 3.97 10 3.97 6.05 0 10.05-3.97 4-3.96 4-10.03v-26Zm-354 0h272q6.07 0 10.03-3.95 3.97-3.96 3.97-10 0-6.05-3.97-10.05-3.96-4-10.03-4H280q-6.07 0-10.03 3.95-3.97 3.96-3.97 10 0 6.05 3.97 10.05 3.96 4 10.03 4Zm-88 318q-26 0-43-17t-17-43v-416q0-26 17-43t43-17h576q26 0 43 17t17 43v416q0 26-17 43t-43 17H588v50q0 12.75-8.62 21.37Q570.75-172 558-172H402q-12.75 0-21.37-8.63Q372-189.25 372-202v-50H192Zm0-28h576q12 0 22-10t10-22v-416q0-12-10-22t-22-10H192q-12 0-22 10t-10 22v416q0 12 10 22t22 10Zm-32 0v-480 480Z"/></svg>`;

const PRESET_SETTINGS = [
  { key: 'g3', label: 'G3', path: './presets/G3.json', data: {
  "cameraMode": "third2",
  "isoCamD": 12,
  "thirdDist": 5,
  "thirdHeight": 3,
  "thirdFov": 62,
  "thirdMinDist": 3,
  "thirdPitchDistanceCompression": 0.75,
  "third2PitchMin": -0.9,
  "third2PitchMax": 0.85,
  "third2BodyFrameStrength": 1,
  "third2BodyFrameHeight": 1.35,
  "third2BodyScreenY": 0.45,
  "third2MinEyeHeight": 0.15,
  "thirdAzimuth": 5.028000000000173,
  "thirdLookAhead": 3.8,
  "thirdSmoothPos": 10,
  "thirdSmoothLook": 12,
  "thirdMouseLook": true,
  "thirdMouseSensitivityX": 0.003,
  "thirdMouseSensitivityY": 0.0024,
  "thirdPitch": -0.11679999999999974,
  "thirdOffsetMode": "parallel",
  "thirdOffsetX": 1.25,
  "thirdOffsetY": -0.25,
  "thirdOffsetZ": -0.25,
  "playerSpeed": 7,
  "playerColor": "#0044cc",
  "playerMetalness": 0.67,
  "playerRoughness": 0,
  "playerRadius": 0.4,
  "playerLength": 1.2,
  "playerMaxHealth": 100,
  "playerHealth": 100,
  "playerMaxArmor": 100,
  "playerArmor": 100,
  "playerInvincible": false,
  "jumpEnabled": true,
  "jumpForce": 9.5,
  "jumpGravity": 26,
  "shieldVisible": false,
  "shieldColor": "#1e7bff",
  "shieldOpacity": 0.22,
  "shieldRadius": 1.45,
  "shieldHexSize": 0.22,
  "shieldLineThickness": 0.012,
  "shieldGlow": true,
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
  "shadowQuality": "high",
  "fogNear": 1,
  "fogFar": 200,
  "bgColor": "#142130",
  "floorColor": "#0C1620",
  "gridColor": "#000000",
  "showFloor": true,
  "showGrid": true,
  "showFps": true,
  "hudVisible": true,
  "hudFont": "square721TlBoldExtended",
  "reticleVisible": true,
  "reticleType": "triSpoke",
  "reticleColor": "#ffffff",
  "reticleSize": 24,
  "reticleThickness": 2,
  "reticleOpacity": 1,
  "reticleGlow": false,
  "laserEnabled": true,
  "laserBloom": true,
  "laserBloomColor": "#ff1100",
  "laserBloomIntensity": 0.55,
  "laserProjectileSpeed": 80,
  "laserRange": 42,
  "laserFireRate": 5,
  "enemyType": "rusher",
  "enemyCount": 6,
  "enemyHealth": 100,
  "enemyInvincible": false,
  "enemyBehavior": "rush",
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "bulletTimeEnabled": true,
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
  "enemyMoveSpeed": 2.2,
  "enemyDestructionEnabled": true,
  "enemyDestructionParticleCount": 40,
  "enemyDestructionParticleSize": 0.32,
  "enemyDestructionParticleSpeed": 1.25,
  "enemyDestructionParticleGlow": 8,
  "enemyDestructionPhysics": true
} },
  { key: 'default', label: 'Default', path: './presets/default.json', data: {
  "cameraMode": "iso",
  "isoCamD": 12,
  "thirdDist": 14,
  "thirdHeight": 7,
  "thirdFov": 65,
  "thirdMinDist": 6,
  "thirdPitchDistanceCompression": 0.75,
  "third2PitchMin": -0.9,
  "third2PitchMax": 0.85,
  "third2BodyFrameStrength": 1,
  "third2BodyFrameHeight": 1.35,
  "third2BodyScreenY": 0.45,
  "third2MinEyeHeight": 0.15,
  "thirdAzimuth": 2.36,
  "thirdLookAhead": 2,
  "thirdSmoothPos": 8,
  "thirdSmoothLook": 12,
  "thirdMouseLook": true,
  "thirdMouseSensitivityX": 0.003,
  "thirdMouseSensitivityY": 0.0024,
  "thirdPitch": -0.28,
  "thirdOffsetMode": "parallel",
  "thirdOffsetX": 1.2,
  "thirdOffsetY": 0,
  "thirdOffsetZ": 0,
  "playerSpeed": 7,
  "playerColor": "#0044cc",
  "playerMetalness": 0.67,
  "playerRoughness": 0,
  "playerRadius": 0.4,
  "playerLength": 1.2,
  "jumpEnabled": true,
  "jumpForce": 9.5,
  "jumpGravity": 26,
  "shieldVisible": false,
  "shieldColor": "#1e7bff",
  "shieldOpacity": 0.22,
  "shieldRadius": 1.45,
  "shieldHexSize": 0.22,
  "shieldLineThickness": 0.012,
  "shieldGlow": true,
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
  "shadowQuality": "high",
  "fogNear": 1,
  "fogFar": 200,
  "bgColor": "#06080d",
  "floorColor": "#0c1020",
  "gridColor": "#1a2a4a",
  "showFloor": true,
  "showGrid": true,
  "showFps": false,
  "hudVisible": true,
  "hudFont": "system",
  "reticleVisible": true,
  "reticleType": "dot",
  "reticleColor": "#ffffff",
  "reticleSize": 24,
  "reticleThickness": 2,
  "reticleOpacity": 1,
  "reticleGlow": false,
  "laserEnabled": true,
  "laserBloom": true,
  "laserBloomColor": "#ff1100",
  "laserBloomIntensity": 0.55,
  "laserProjectileSpeed": 22,
  "laserRange": 42,
  "laserFireRate": 5
} },
  { key: 'g1', label: 'G1', path: './presets/testbed.json', data: {
  "cameraMode": "third2",
  "isoCamD": 12,
  "thirdDist": 5,
  "thirdHeight": 3,
  "thirdFov": 62,
  "thirdMinDist": 3,
  "thirdPitchDistanceCompression": 0.75,
  "third2PitchMin": -0.9,
  "third2PitchMax": 0.85,
  "third2BodyFrameStrength": 1,
  "third2BodyFrameHeight": 1.35,
  "third2BodyScreenY": 0.45,
  "third2MinEyeHeight": 0.15,
  "thirdAzimuth": 0,
  "thirdLookAhead": 3.8,
  "thirdSmoothPos": 10,
  "thirdSmoothLook": 12,
  "thirdOffsetMode": "parallel",
  "thirdOffsetX": 1.25,
  "thirdOffsetY": -0.25,
  "thirdOffsetZ": -0.25,
  "playerSpeed": 7,
  "playerColor": "#0044cc",
  "playerMetalness": 0.67,
  "playerRoughness": 0,
  "playerRadius": 0.4,
  "playerLength": 1.2,
  "jumpEnabled": true,
  "jumpForce": 9.5,
  "jumpGravity": 26,
  "shieldVisible": false,
  "shieldColor": "#1e7bff",
  "shieldOpacity": 0.22,
  "shieldRadius": 1.45,
  "shieldHexSize": 0.22,
  "shieldLineThickness": 0.012,
  "shieldGlow": true,
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
  "shadowQuality": "high",
  "fogNear": 1,
  "fogFar": 200,
  "bgColor": "#142130",
  "floorColor": "#0C1620",
  "gridColor": "#000000",
  "showFloor": true,
  "showGrid": true,
  "showFps": true,
  "hudVisible": true,
  "reticleVisible": true,
  "reticleType": "dot",
  "reticleColor": "#ffffff",
  "reticleSize": 24,
  "reticleThickness": 2,
  "reticleOpacity": 1,
  "reticleGlow": false,
  "laserEnabled": true,
  "laserBloom": true,
  "laserBloomColor": "#ff1100",
  "laserBloomIntensity": 0.55,
  "laserProjectileSpeed": 22,
  "laserRange": 42,
  "laserFireRate": 5,
  "thirdMouseLook": true,
  "thirdMouseSensitivityX": 0.003,
  "thirdMouseSensitivityY": 0.0024,
  "thirdPitch": -0.22,
  "hudFont": "system"
} },
];



const ICON_ENEMIES = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor" aria-hidden="true"><path d="M292-132v-152q-36-15-65.5-39T176-378q-21-31-32.5-67T132-520q0-136 97.42-222 97.41-86 250.5-86Q633-828 730.5-742T828-520q0 39-11.5 75T784-378q-21 31-50.5 55T668-283.82V-132H292Zm28-28h62v-56h56v56h84v-56h56v56h62v-142q36-12 65.5-33.5t50.65-50.05q21.15-28.54 32.5-63Q800-483 800-520q0-125-88.5-202.5T480-800q-143 0-231.5 77.5T160-520q0 37 11.35 71.45 11.35 34.46 32.5 63Q225-357 254.5-335.5 284-314 320-302v142Zm110-200h100l-50-100-50 100Zm-89.82-100q24.82 0 42.32-17.68 17.5-17.67 17.5-42.5 0-24.82-17.68-42.32-17.67-17.5-42.5-17.5-24.82 0-42.32 17.68-17.5 17.67-17.5 42.5 0 24.82 17.68 42.32 17.67 17.5 42.5 17.5Zm280 0q24.82 0 42.32-17.68 17.5-17.67 17.5-42.5 0-24.82-17.68-42.32-17.67-17.5-42.5-17.5-24.82 0-42.32 17.68-17.5 17.67-17.5 42.5 0 24.82 17.68 42.32 17.67 17.5 42.5 17.5ZM480-160Z"/></svg>`;


const ICON_DESTRUCTION = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M361.24-112Q258-112 185-184.68 112-257.35 112-360q0-105 75.5-176.5T369-608q8 0 16.5.5T402-606l23-41q9-17 27-21.5t35 4.5l25 14 5-8q20-34 57-44t71 10l12 7-14 24-12-7q-24-14-51-7t-40 31l-4 8 25 14q17 9 21.5 27t-4.5 35l-24 42q23 38 39 78.5t16 85.5q0 102-72.26 172-72.27 70-175.5 70Zm-.24-27q92 0 156-64.5T581-359q0-31-8.5-61T547-477l-26-41 29-51q5-8 2.5-18T542-602l-63-36q-8-5-18-2t-15 11l-29 50h-48q-94 0-161.5 63T140-361q0 92 64.5 157T361-139Zm387-475v-28h68v28h-68ZM586-788v-68h28v68h-28Zm162 40-19-19 48-49 19 20-48 48ZM361-359Z"/></svg>`;
const ICON_CONTROLLER = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M189-186q-51 0-86-35t-35-86q0-8 .5-15t2.5-15l84-336q12-45 48-73t82-28h390q46 0 82 28t48 73l84 336q2 8 3 15.5t1 15.5q0 51-35.5 85.5T771-186q-35 0-64-18.5T662-254l-29-59q-8-17-24-25t-34-8H385q-18 0-34 8t-24 25l-29 59q-15 32-44.5 50T189-186Zm3-28q26 0 48-14t33-37l28-58q12-24 35-37.5t49-13.5h190q27 0 49.5 14.5T660-322l28 57q11 23 33 37t48 14q39 0 67-26.5t28-64.5q0-3-3-25l-84-335q-9-35-37.5-58T675-746H285q-37 0-65.5 23T183-665L99-330q-1 4-3 24 0 39 28.5 65.5T192-214Zm367.5-326.5Q568-549 568-560t-8.5-19.5Q551-588 540-588t-19.5 8.5Q512-571 512-560t8.5 19.5Q529-532 540-532t19.5-8.5Zm80-80Q648-629 648-640t-8.5-19.5Q631-668 620-668t-19.5 8.5Q592-651 592-640t8.5 19.5Q609-612 620-612t19.5-8.5Zm0 160Q648-469 648-480t-8.5-19.5Q631-508 620-508t-19.5 8.5Q592-491 592-480t8.5 19.5Q609-452 620-452t19.5-8.5Zm80-80Q728-549 728-560t-8.5-19.5Q711-588 700-588t-19.5 8.5Q672-571 672-560t8.5 19.5Q689-532 700-532t19.5-8.5ZM350-480q4-4 4-10v-56h56q6 0 10-4t4-10q0-6-4-10t-10-4h-56v-56q0-6-4-10t-10-4q-6 0-10 4t-4 10v56h-56q-6 0-10 4t-4 10q0 6 4 10t10 4h56v56q0 6 4 10t10 4q6 0 10-4Zm130 0Z"/></svg>`;
const ICON_ABILITIES = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="m642-477-79 128q-5 8-15.5 7T535-353l-32-131-301 302q-4 4-9.5 4.5T182-182q-5-5-5-10t5-10l302-302-130-32q-10-2-11.5-12t6.5-15l128-79-11-150q-1-10 7.5-15t16.5 2l115 97 139-57q9-4 16.5 3.5T764-745l-56 139 97 115q7 8 2.5 17t-14.5 8l-151-11ZM183-734q-5-5-5-11t5-11l21-21q5-5 11-5t11 5l21 21q5 5 5 11t-5 11l-21 21q-5 5-11 5t-11-5l-21-21Zm372 344 72-116 136 10-88-105 51-126-126 51-105-88 10 136-115 72 132 33 33 133Zm179 207-21-21q-5-5-5-11t5-11l21-21q5-5 11-5t11 5l21 21q5 5 5 11t-5 11l-21 21q-5 5-11 5t-11-5ZM577-577Z"/></svg>`;

const HUD_FONT_OPTIONS = [
  ['system', 'System Default'],
  ['juraBold', 'Jura Bold'],
  ['juraMedium', 'Jura Medium'],
  ['juraLight', 'Jura Light'],
  ['michroma', 'Michroma'],
  ['eurostile', 'Eurostile'],
  ['rodinDb', 'FOT-Rodin Pro DB'],
  ['microgrammaExtendedBold', 'Microgramma D Extended Bold'],
  ['square721TlBoldExtended', 'Square 721 TL Bold Extended'],
  ['square721ExtendedBold', 'Square 721 Extended Bold'],
];

const HUD_FONT_STYLES = {
  system: {
    family: "'Segoe UI', system-ui, sans-serif",
    weight: 800,
    stretch: 'normal',
    letterSpacing: '0.24em',
    valueLetterSpacing: '0.12em',
  },
  juraBold: {
    family: "'Jura', 'Segoe UI', system-ui, sans-serif",
    weight: 700,
    stretch: 'normal',
    letterSpacing: '0.2em',
    valueLetterSpacing: '0.1em',
  },
  juraMedium: {
    family: "'Jura', 'Segoe UI', system-ui, sans-serif",
    weight: 500,
    stretch: 'normal',
    letterSpacing: '0.2em',
    valueLetterSpacing: '0.1em',
  },
  juraLight: {
    family: "'Jura', 'Segoe UI', system-ui, sans-serif",
    weight: 300,
    stretch: 'normal',
    letterSpacing: '0.2em',
    valueLetterSpacing: '0.1em',
  },
  michroma: {
    family: "'Michroma', 'Segoe UI', system-ui, sans-serif",
    weight: 400,
    stretch: 'normal',
    letterSpacing: '0.12em',
    valueLetterSpacing: '0.06em',
  },
  eurostile: {
    family: "'Eurostile Local', 'Eurostile', 'Jura', system-ui, sans-serif",
    weight: 700,
    stretch: 'normal',
    letterSpacing: '0.18em',
    valueLetterSpacing: '0.08em',
  },
  rodinDb: {
    family: "'FOT-Rodin Pro DB Local', 'FOT-Rodin Pro DB', 'FOT Rodin Pro DB', 'Jura', system-ui, sans-serif",
    weight: 700,
    stretch: 'normal',
    letterSpacing: '0.16em',
    valueLetterSpacing: '0.08em',
  },
  microgrammaExtendedBold: {
    family: "'Microgramma D Extended Bold Local', 'Microgramma D Extended Bold', 'Michroma', system-ui, sans-serif",
    weight: 700,
    stretch: 'expanded',
    letterSpacing: '0.12em',
    valueLetterSpacing: '0.06em',
  },
  square721TlBoldExtended: {
    family: "'Square 721 TL Bold Extended Local', 'Square 721 TL Bold Extended', 'Michroma', system-ui, sans-serif",
    weight: 700,
    stretch: 'expanded',
    letterSpacing: '0.12em',
    valueLetterSpacing: '0.06em',
  },
  square721ExtendedBold: {
    family: "'Square 721 Extended Bold Local', 'Square 721 Extended Bold', 'Michroma', system-ui, sans-serif",
    weight: 700,
    stretch: 'expanded',
    letterSpacing: '0.12em',
    valueLetterSpacing: '0.06em',
  },
};

const ENEMY_TYPE_OPTIONS = [
  ['rusher', 'Rusher'],
  ['orbiter', 'Orbiter'],
  ['tanker', 'Tanker'],
  ['sniper', 'Sniper'],
  ['teleporter', 'Teleporter'],
  ['shielded', 'Shielded'],
  ['splitter', 'Splitter'],
  ['boss', 'Boss'],
];

const ENEMY_BEHAVIOR_OPTIONS = [
  ['rush', 'Rush'],
  ['orbit', 'Orbit'],
  ['keepDistance', 'Keep Distance'],
  ['teleport', 'Teleport'],
  ['guard', 'Guard'],
  ['split', 'Split'],
  ['bossPhase', 'Boss Phase'],
];

const ENEMY_PLACEMENT_OPTIONS = [
  ['random', 'Random'],
  ['grouped', 'Grouped'],
];

const ENEMY_WEAPON_OPTIONS = [
  ['contact', 'Contact'],
  ['none', 'None'],
  ['projectile', 'Projectile'],
  ['laser', 'Laser'],
  ['sniper', 'Sniper'],
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

function sectionKey(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

// Each section is a header + hidden body. Clicking the header toggles a CSS class.
function section(icon, title, buildFn) {
  const wrap = document.createElement('div');
  wrap.className = 'sb-section';
  wrap.dataset.sectionKey = sectionKey(title);
  wrap.dataset.sectionTitle = title;

  const hdr = document.createElement('div');
  hdr.className = 'sb-section-hdr';
  hdr.title = title;

  const iconWrap = document.createElement('span');
  iconWrap.className = 'sb-icon';
  iconWrap.innerHTML = icon; // SVG string
  hdr.appendChild(iconWrap);

  const titleSpan = document.createElement('span');
  titleSpan.className = 'sb-section-title';
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

  try {
    buildFn(body);
  } catch (err) {
    console.error(`Failed to build sidebar section: ${title}`, err);
    const fallback = document.createElement('div');
    fallback.className = 'sb-section-error';
    fallback.textContent = `${title} controls could not be built.`;
    body.appendChild(fallback);
  }

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

function readout(label, id, value = 'None') {
  const out = document.createElement('span');
  out.className = 'sb-readout';
  out.id = id;
  out.textContent = value;
  out.title = value;
  return row(label, out);
}

// ── Section builders ───────────────────────────────────────────────────────────

function buildCamera(body) {
  const syncCameraGroups = mode => {
    const isThird = isThirdPersonCameraMode(mode);
    isoGroup.style.display    = mode === 'iso' ? '' : 'none';
    thirdGroup.style.display  = isThird ? '' : 'none';
    third2Group.style.display = mode === 'third2' ? '' : 'none';
  };

  // Camera type — shows/hides the relevant sub-group
  body.appendChild(select('Type', 'cameraMode', [
    ['iso',    'Isometric'],
    ['third',  '3rd Person'],
    ['third2', '3rd Person 2'],
  ], v => {
    setActiveCamera(v);
    onResize();
    syncCameraGroups(v);
  }));

  const isoGroup = document.createElement('div');
  isoGroup.appendChild(slider({
    key: 'isoCamD', label: 'Zoom', min: 4, max: 40, step: 0.5, dec: 1,
    onChange: v => applyIsoCamD(v),
  }));
  body.appendChild(isoGroup);

  const thirdGroup = document.createElement('div');
  [
    { key: 'thirdDist',       label: 'Distance',       min: 4,  max: 40,          step: 0.5,  dec: 1 },
    { key: 'thirdHeight',     label: 'Height',         min: 2,  max: 20,          step: 0.5,  dec: 1 },
    { key: 'thirdFov',        label: 'FOV',            min: 30, max: 120,         step: 1,    dec: 0 },
    { key: 'thirdAzimuth',    label: 'Azimuth',        min: 0,  max: Math.PI * 2, step: 0.05, dec: 2 },
    { key: 'thirdLookAhead',  label: 'Look Ahead',     min: 0,  max: 8,           step: 0.1,  dec: 1 },
    { key: 'thirdSmoothPos',  label: 'Pos Smoothing',  min: 1,  max: 30,          step: 0.5,  dec: 1 },
    { key: 'thirdSmoothLook', label: 'Look Smoothing', min: 1,  max: 30,          step: 0.5,  dec: 1 },
  ].forEach(o => thirdGroup.appendChild(slider(o)));

  thirdGroup.appendChild(subhdr('Mouse Aim'));
  thirdGroup.appendChild(toggle('Mouse Look', 'thirdMouseLook'));
  thirdGroup.appendChild(slider({
    key: 'thirdMouseSensitivityX', label: 'Yaw Sens.', min: 0.0005, max: 0.01, step: 0.0001, dec: 4,
  }));
  thirdGroup.appendChild(slider({
    key: 'thirdMouseSensitivityY', label: 'Pitch Sens.', min: 0.0005, max: 0.01, step: 0.0001, dec: 4,
  }));
  thirdGroup.appendChild(slider({
    key: 'thirdPitch', label: 'Pitch', min: -1.1, max: 1.1, step: 0.01, dec: 2,
  }));

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

  const third2Group = document.createElement('div');
  third2Group.appendChild(subhdr('Pitch Distance'));
  [
    { key: 'thirdPitchDistanceCompression', label: 'Compression',  min: 0, max: 1,  step: 0.05, dec: 2 },
    { key: 'thirdMinDist',                  label: 'Min Distance', min: 1, max: 40, step: 0.5,  dec: 1 },
  ].forEach(o => third2Group.appendChild(slider(o)));

  third2Group.appendChild(subhdr('Range Limits'));
  [
    { key: 'third2PitchMin', label: 'Look Down Limit', min: -1.4, max: 0,   step: 0.01, dec: 2 },
    { key: 'third2PitchMax', label: 'Look Up Limit',   min: 0,    max: 1.4, step: 0.01, dec: 2 },
  ].forEach(o => third2Group.appendChild(slider(o)));

  third2Group.appendChild(subhdr('Body Framing'));
  [
    { key: 'third2BodyFrameStrength', label: 'Body Visibility', min: 0,    max: 1,   step: 0.05, dec: 2 },
    { key: 'third2BodyFrameHeight',   label: 'Body Anchor',     min: 0.25, max: 3.5, step: 0.05, dec: 2 },
    { key: 'third2BodyScreenY',       label: 'Screen Position', min: -0.75, max: 0.75, step: 0.05, dec: 2 },
    { key: 'third2MinEyeHeight',      label: 'Eye Floor',       min: 0.05, max: 3.5, step: 0.05, dec: 2 },
  ].forEach(o => third2Group.appendChild(slider(o)));
  thirdGroup.appendChild(third2Group);

  syncCameraGroups(state.params.cameraMode);
  body.appendChild(thirdGroup);
}

function buildPlayer(body) {
  body.appendChild(toggle('Invincible', 'playerInvincible'));
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

  body.appendChild(subhdr('Jump'));
  body.appendChild(toggle('Jump Enabled', 'jumpEnabled'));
  body.appendChild(slider({ key: 'jumpForce', label: 'Jump Force', min: 2, max: 24, step: 0.5, dec: 1 }));
  body.appendChild(slider({ key: 'jumpGravity', label: 'Gravity', min: 5, max: 80, step: 1, dec: 0 }));

  body.appendChild(subhdr('Dash'));
  body.appendChild(toggle('Dash Enabled', 'dashEnabled'));
  body.appendChild(slider({ key: 'dashSpeed',    label: 'Speed',    min: 5,    max: 60,  step: 1,    dec: 0 }));
  body.appendChild(slider({ key: 'dashDuration', label: 'Duration', min: 0.05, max: 0.5, step: 0.01, dec: 2 }));
  body.appendChild(slider({ key: 'dashCooldown', label: 'Cooldown', min: 0.1,  max: 5,   step: 0.1,  dec: 1 }));
}


function buildShield(body) {
  body.appendChild(toggle('Shield Enabled', 'shieldVisible', () => applyShieldSettings()));
  body.appendChild(colorPicker('Color', 'shieldColor', () => applyShieldSettings()));
  body.appendChild(slider({
    key: 'shieldRadius', label: 'Radius', min: 0.8, max: 4, step: 0.05, dec: 2,
    onChange: () => applyShieldSettings(),
  }));
  body.appendChild(slider({
    key: 'shieldHexSize', label: 'Hex Size', min: 0.05, max: 0.6, step: 0.01, dec: 2,
    onChange: () => applyShieldSettings(),
  }));
  body.appendChild(slider({
    key: 'shieldLineThickness', label: 'Line Thickness', min: 0.002, max: 0.06, step: 0.001, dec: 3,
    onChange: () => applyShieldSettings(),
  }));
  body.appendChild(slider({
    key: 'shieldOpacity', label: 'Opacity', min: 0.05, max: 0.75, step: 0.01, dec: 2,
    onChange: () => applyShieldSettings(),
  }));
  body.appendChild(toggle('Glow', 'shieldGlow', () => applyShieldSettings()));
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
  body.appendChild(toggle('Show FPS', 'showFps', () => applyHudSettings()));
}


function buildHUD(body) {
  body.appendChild(toggle('HUD Enabled', 'hudVisible', () => applyHudSettings()));
  body.appendChild(select('Font', 'hudFont', HUD_FONT_OPTIONS, () => applyHudSettings()));
}

function buildEnemies(body) {
  body.appendChild(select('Enemy Type', 'enemyType', ENEMY_TYPE_OPTIONS));
  body.appendChild(slider({ key: 'enemyCount', label: 'Number of Enemies', min: 0, max: 50, step: 1, dec: 0 }));
  body.appendChild(slider({ key: 'enemyHealth', label: 'Health Amount', min: 1, max: 1000, step: 1, dec: 0 }));
  body.appendChild(toggle('Enemy Invincible', 'enemyInvincible'));
  body.appendChild(select('Behavior', 'enemyBehavior', ENEMY_BEHAVIOR_OPTIONS));
  body.appendChild(slider({ key: 'enemyMoveSpeed', label: 'Movement Speed', min: 0, max: 12, step: 0.1, dec: 1 }));
  body.appendChild(slider({ key: 'enemyDamage', label: 'Damage Amount', min: 0, max: 250, step: 1, dec: 0 }));
  body.appendChild(select('Placement', 'enemyPlacement', ENEMY_PLACEMENT_OPTIONS));
  body.appendChild(select('Weapon Type', 'enemyWeaponType', ENEMY_WEAPON_OPTIONS));

  body.appendChild(btn('Spawn / Apply Enemies', 'sb-btn-accent', () => {
    const count = spawnEnemiesFromSettings();
    notify(`${count} enemies spawned ✓`);
  }));
  body.appendChild(btn('Clear Enemies', 'sb-btn-muted', () => {
    clearEnemies();
    notify('Enemies cleared ✓');
  }));
}

function buildDestruction(body) {
  body.appendChild(toggle('Destruction FX', 'enemyDestructionEnabled'));
  body.appendChild(slider({ key: 'enemyDestructionParticleCount', label: 'Particle Count', min: 0, max: 200, step: 1, dec: 0 }));
  body.appendChild(slider({ key: 'enemyDestructionParticleSize', label: 'Particle Size', min: 0.05, max: 2, step: 0.05, dec: 2 }));
  body.appendChild(slider({ key: 'enemyDestructionParticleSpeed', label: 'Particle Speed', min: 0.1, max: 6, step: 0.05, dec: 2 }));
  body.appendChild(slider({ key: 'enemyDestructionParticleGlow', label: 'Particle Glow', min: 0, max: 24, step: 0.5, dec: 1 }));
  body.appendChild(toggle('Physics', 'enemyDestructionPhysics'));
}

function buildController(body) {
  body.appendChild(toggle('Controller Enabled', 'controllerEnabled'));
  body.appendChild(readout('Connected', 'controller-status', state.controllerConnected ? state.controllerName : 'None'));
  body.appendChild(slider({ key: 'controllerMoveDeadzone', label: 'Move Deadzone', min: 0, max: 0.6, step: 0.01, dec: 2 }));
  body.appendChild(slider({ key: 'controllerLookDeadzone', label: 'Look Deadzone', min: 0, max: 0.6, step: 0.01, dec: 2 }));
  body.appendChild(slider({ key: 'controllerLookSensitivityX', label: 'Look Sens. X', min: 0.1, max: 10, step: 0.1, dec: 1 }));
  body.appendChild(slider({ key: 'controllerLookSensitivityY', label: 'Look Sens. Y', min: 0.1, max: 10, step: 0.1, dec: 1 }));
  body.appendChild(toggle('Invert Y', 'controllerInvertY'));
  body.appendChild(slider({ key: 'controllerFireThreshold', label: 'Fire Threshold', min: 0.05, max: 1, step: 0.05, dec: 2 }));
  body.appendChild(toggle('Vibration', 'controllerVibration'));
  body.appendChild(subhdr('DualSense Layout'));
  const map = document.createElement('div');
  map.className = 'sb-help';
  map.textContent = 'Left Stick move · Right Stick camera · R2 fire · Cross jump · Circle dash · L1/L2 bullet time · Options sidebar';
  body.appendChild(map);
}

function buildAbilities(body) {
  body.appendChild(subhdr('Bullet Time'));
  body.appendChild(toggle('Bullet Time Enabled', 'bulletTimeEnabled'));
  body.appendChild(slider({ key: 'bulletTimeDuration', label: 'Duration', min: 0.1, max: 30, step: 0.1, dec: 1 }));
  body.appendChild(slider({ key: 'bulletTimeCooldown', label: 'Cooldown', min: 0, max: 120, step: 0.5, dec: 1 }));
  body.appendChild(slider({ key: 'bulletTimeScale', label: 'World Scale', min: 0.05, max: 1, step: 0.05, dec: 2 }));
}

function buildWeapons(body) {
  body.appendChild(subhdr('Reticle'));
  body.appendChild(toggle('Show Reticle', 'reticleVisible', () => applyReticleSettings()));
  body.appendChild(select('Type', 'reticleType', [
    ['dot', 'Dot'],
    ['cross', 'Crosshair'],
    ['ring', 'Ring'],
    ['crossDot', 'Cross + Dot'],
    ['triSpoke', 'Tri-Spoke'],
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

  body.appendChild(subhdr('Laser Gun'));
  body.appendChild(toggle('Laser Enabled', 'laserEnabled'));
  body.appendChild(toggle('Bloom', 'laserBloom'));
  body.appendChild(colorPicker('Bloom Color', 'laserBloomColor'));
  body.appendChild(slider({
    key: 'laserBloomIntensity', label: 'Bloom Intensity', min: 0, max: 1, step: 0.05, dec: 2,
  }));
  body.appendChild(slider({
    key: 'laserProjectileSpeed', label: 'Projectile Speed', min: 1, max: 80, step: 1, dec: 0,
  }));
  body.appendChild(slider({
    key: 'laserRange', label: 'Range', min: 2, max: 160, step: 1, dec: 0,
  }));
  body.appendChild(slider({
    key: 'laserFireRate', label: 'Fire Rate', min: 0.5, max: 20, step: 0.5, dec: 1,
  }));
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
    state.activePreset = 'g3';
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

const RETICLE_MARKUP = {
  dot: `
    <span class="reticle-part reticle-dot"></span>
  `,
  cross: `
    <span class="reticle-part reticle-line reticle-line-h"></span>
    <span class="reticle-part reticle-line reticle-line-v"></span>
  `,
  ring: `
    <span class="reticle-part reticle-ring"></span>
  `,
  crossDot: `
    <span class="reticle-part reticle-line reticle-line-h"></span>
    <span class="reticle-part reticle-line reticle-line-v"></span>
    <span class="reticle-part reticle-dot"></span>
  `,
  triSpoke: `
    <span class="reticle-part reticle-spoke" style="--angle: 0deg"></span>
    <span class="reticle-part reticle-spoke" style="--angle: 120deg"></span>
    <span class="reticle-part reticle-spoke" style="--angle: 240deg"></span>
    <span class="reticle-part reticle-dot reticle-center-dot"></span>
  `,
};

function setReticleType(el, type) {
  const normalizedType = RETICLE_MARKUP[type] ? type : 'dot';
  if (el.dataset.reticleType !== normalizedType) {
    el.innerHTML = RETICLE_MARKUP[normalizedType];
    el.dataset.reticleType = normalizedType;
  }
  el.classList.toggle('reticle-glow', !!state.params.reticleGlow);
}

function applyReticleSettings() {
  const el = document.getElementById('target-reticle');
  if (!el) return;

  const p = state.params;
  setReticleType(el, p.reticleType || 'dot');
  el.style.display = p.hudVisible && p.reticleVisible ? '' : 'none';
  el.style.setProperty('--reticle-color', p.reticleColor);
  el.style.setProperty('--reticle-size', `${p.reticleSize}px`);
  el.style.setProperty('--reticle-thickness', `${p.reticleThickness}px`);
  el.style.setProperty('--reticle-dot-size', `${Math.max(p.reticleThickness * 2, 3)}px`);
  el.style.setProperty('--reticle-opacity', p.reticleOpacity);
}

function clampPercent(value, maxValue) {
  const max = Math.max(1, Number(maxValue) || 1);
  const current = Math.min(max, Math.max(0, Number(value) || 0));
  return (current / max) * 100;
}

function syncHudStatus() {
  const p = state.params;
  const armorValue = document.querySelector('[data-hud-value="armor"]');
  const healthValue = document.querySelector('[data-hud-value="health"]');
  const armorFill = document.querySelector('[data-hud-fill="armor"]');
  const healthFill = document.querySelector('[data-hud-fill="health"]');

  const armor = Math.round(Number(p.playerArmor) || 0);
  const health = Math.round(Number(p.playerHealth) || 0);

  if (armorValue) armorValue.textContent = String(armor);
  if (healthValue) healthValue.textContent = String(health);
  if (armorFill) armorFill.style.width = `${clampPercent(p.playerArmor, p.playerMaxArmor)}%`;
  if (healthFill) healthFill.style.width = `${clampPercent(p.playerHealth, p.playerMaxHealth)}%`;
}

function applyHudSettings() {
  const p = state.params;
  syncHudStatus();
  const gameHudEl = document.getElementById('game-hud');
  if (gameHudEl) {
    gameHudEl.style.display = p.hudVisible ? '' : 'none';
    const hudFont = HUD_FONT_STYLES[p.hudFont] || HUD_FONT_STYLES.system;
    gameHudEl.style.setProperty('--hud-font-family', hudFont.family);
    gameHudEl.style.setProperty('--hud-font-weight', hudFont.weight);
    gameHudEl.style.setProperty('--hud-font-stretch', hudFont.stretch || 'normal');
    gameHudEl.style.setProperty('--hud-letter-spacing', hudFont.letterSpacing || '0.24em');
    gameHudEl.style.setProperty('--hud-value-letter-spacing', hudFont.valueLetterSpacing || '0.12em');
  }

  const instructionsEl = document.getElementById('instructions');
  if (instructionsEl) instructionsEl.style.display = p.hudVisible ? '' : 'none';

  const fpsEl = document.getElementById('fps-overlay');
  if (fpsEl) fpsEl.style.display = p.hudVisible && p.showFps ? '' : 'none';

  applyReticleSettings();
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
  applyShieldSettings();
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
  applyHudSettings();
}

// ── Build / rebuild panel DOM ──────────────────────────────────────────────────

function rebuildPanel() {
  const body = document.getElementById('sb-body');
  if (!body) return;
  body.innerHTML = '';

  const sectionDefs = [
    [ICON_CAMERA, 'Camera', buildCamera],
    [ICON_PLAYER, 'Player', buildPlayer],
    [ICON_ABILITIES, 'Abilities', buildAbilities],
    [ICON_CONTROLLER, 'Controller', buildController],
    [ICON_SHIELD, 'Shield', buildShield],
    [ICON_LIGHT, 'Lighting', buildLighting],
    [ICON_SCENE, 'Scene', buildScene],
    [ICON_HUD, 'HUD', buildHUD],
    [ICON_ENEMIES, 'Enemies', buildEnemies],
    [ICON_DESTRUCTION, 'Destruction', buildDestruction],
    [ICON_WEAPONS, 'Weapons', buildWeapons],
  ];

  sectionDefs.forEach(([icon, title, buildFn]) => {
    body.appendChild(section(icon, title, buildFn).el);
  });

  // Required gameplay-test sections. This failsafe keeps these controls visible
  // even if a future edit accidentally removes them from the main section list.
  const requiredSections = [
    [ICON_ABILITIES, 'Abilities', buildAbilities, 'Controller'],
    [ICON_CONTROLLER, 'Controller', buildController, 'Shield'],
    [ICON_DESTRUCTION, 'Destruction', buildDestruction, 'Weapons'],
  ];

  requiredSections.forEach(([icon, title, buildFn, beforeTitle]) => {
    if (body.querySelector(`[data-section-key="${sectionKey(title)}"]`)) return;
    const fallbackSection = section(icon, title, buildFn).el;
    const beforeEl = body.querySelector(`[data-section-key="${sectionKey(beforeTitle)}"]`);
    body.insertBefore(fallbackSection, beforeEl || null);
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

function syncPauseToSidebar() {
  state.paused = !state.panelMinimized;
  document.body.classList.toggle('is-paused', state.paused);
  clearGameplayInput();
}

function setPanelMinimized(minimized) {
  state.panelMinimized = minimized;
  state.panelOpen = true;
  if (sidebar) sidebar.style.display = '';
  updatePanelChrome();
  syncPauseToSidebar();
}

export function initPanel() {
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="sb-resizer" id="sb-resizer" title="Resize sidebar" aria-hidden="true"></div>
    <div class="sb-header">
      <span class="sb-title"><span class="sb-title-icon" aria-hidden="true"></span><span class="sb-title-text">TETRON</span></span>
      <button class="sb-close" id="sb-close-btn" title="Minimize sidebar" aria-label="Minimize sidebar">◀</button>
    </div>
    <div id="sb-body" class="sb-body"></div>
    <div class="sb-footer-logo" aria-hidden="true"><img class="sb-logo" src="./assets/white.png" alt=""></div>
  `;
  document.getElementById('sb-close-btn')?.addEventListener('click', togglePanel);
  initSidebarResize();
  applyAllParams();
  rebuildPanel();
  updatePanelChrome();
  syncPauseToSidebar();
}

export function togglePanel() {
  setPanelMinimized(!state.panelMinimized);
}

