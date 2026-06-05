// src/panel/index.js
// The panel is built entirely from JavaScript — no HTML template.
// Pattern: write to state.params first, then call onChange to push into Three.js.
// This ensures JSON export always reflects reality.
import * as THREE from 'three';
import { state, defaultParams } from '../state.js';
import { scene, renderer, applyIsoCamD, setActiveCamera, onResize, isThirdPersonCameraMode } from '../renderer.js';
import { ambientLight, sunLight, fillLight, rimLight } from '../lighting.js';
import {
  playerMat, playerBaseColor, rebuildPlayerGeo, applyPlayerMaterial, applyShieldSettings, applyPlayerWeaponSettings,
} from '../player.js';
import { setFloorVisible, setGridVisible, setFloorColor, setGridColor, applyFloorSettings, fitBuildAreaToPlacedObjects } from '../terrain.js';
import { spawnEnemiesFromSettings, clearEnemies, applyTagSettings, spawnAlliesFromSettings, clearAllies, rebuildEditorPlacedNpcs } from '../enemies.js';
import { clearGameplayInput } from '../input.js';
import { ASSET_CATALOGUE, ASSET_CATEGORY_LABELS } from '../assets-catalogue.js';
import {
  clearPlacedObjects, rebuildPlacedObjects,
  getSelectedPlacedObjectCount, deleteSelectedPlacedObjects,
  clearPlacedObjectSelection, selectAllPlacedObjects,
  getAvailablePlaceableAssets, selectConnectedPlacedStructureByAim,
  selectConnectedPlacedStructureFromSelection, duplicateSelectedPlacedObjects,
  saveSelectedPlacedObjectsAsPrefab, applySelectedPlacedObjectEdits,
} from '../placer.js';
import { registerManagedAudio, applyBulletTimeAudioPitch, pauseManagedAudio, resumeManagedAudio } from '../audio.js';
import { resetWeaponAmmo, resetAllWeaponAmmo, syncWeaponAmmoHud } from '../weapons.js';
import { setEditorModeEnabled, applyEditorSettings, teleportPlayerToSpawn, clearPlayerSpawn, refreshPlayerSpawnMarker } from '../editor.js';

const sidebar = document.getElementById('sidebar');

// ── SVG icons (from uploaded assets) ──────────────────────────────────────────
const ICON_CAMERA = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M481-590.77h299.62q-26.24-70.54-83.66-124.65Q639.54-769.54 566-788l-99.69 171.85q-5.23 8.46-.04 16.92 5.2 8.46 14.73 8.46Zm-127.08 54.62q5.18 8.46 14.67 8.46t14.72-8.46l151.46-259.74q-11-2.11-27.39-3.11-16.38-1-27.38-1-66 0-123 25t-101 67l97.92 171.85ZM170-400h197.62q9.23 0 14.69-8.46 5.46-8.46.23-16.92L234.15-683.69q-35.07 43.31-54.61 94.53Q160-537.95 160-480q0 21 2.5 40.5T170-400Zm225.54 228L495-343.85q5.23-8.46-.23-16.92-5.46-8.46-14.69-8.46h-300.7q26.24 70.54 84.43 124.65Q322-190.46 395.54-172ZM480-160q66 0 123-25t101-67l-97.92-171.85q-5.18-8.46-14.67-8.46t-14.72 8.46L426.77-165.54q11 2.77 26.11 4.16Q468-160 480-160Zm245.85-116.31q32-41 53.07-94.34Q800-424 800-480q0-21-2.5-40.5T790-560H592.38q-9.23 0-14.69 8.46-5.46 8.46-.23 16.92l148.39 258.31ZM480-480Zm-.24 360q-74.07 0-139.65-28.3-65.58-28.3-114.55-77.26-48.96-48.97-77.26-114.55Q120-405.69 120-479.76q0-74.96 28.42-140.45 28.43-65.48 77.16-114.21 48.73-48.73 114.51-77.16Q405.86-840 479.75-840q74.79 0 140.37 28.42 65.57 28.43 114.3 77.16 48.73 48.73 77.16 114.21Q840-554.72 840-479.76q0 74.07-28.42 139.76-28.43 65.69-77.16 114.42-48.73 48.73-114.21 77.16Q554.72-120 479.76-120Z"/></svg>`;
const ICON_PLAYER = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M247.85-260.62q51-36.69 108.23-58.03Q413.31-340 480-340t123.92 21.35q57.23 21.34 108.23 58.03 39.62-41 63.73-96.84Q800-413.31 800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 66.69 24.12 122.54 24.11 55.84 63.73 96.84Zm146.88-234.11Q360-529.46 360-580t34.73-85.27Q429.46-700 480-700t85.27 34.73Q600-630.54 600-580t-34.73 85.27Q530.54-460 480-460t-85.27-34.73ZM480-120q-75.31 0-141-28.04t-114.31-76.65Q176.08-273.31 148.04-339 120-404.69 120-480t28.04-141q28.04-65.69 76.65-114.31 48.62-48.61 114.31-76.65Q404.69-840 480-840t141 28.04q65.69 28.04 114.31 76.65 48.61 48.62 76.65 114.31Q840-555.31 840-480t-28.04 141q-28.04 65.69-76.65 114.31-48.62 48.61-114.31 76.65Q555.31-120 480-120Zm108.85-59.35q53.53-19.34 92.53-52.96-39-31.31-90.23-49.5Q539.92-300 480-300q-59.92 0-111.54 17.81-51.61 17.81-89.84 49.88 39 33.62 92.53 52.96Q424.69-160 480-160q55.31 0 108.85-19.35Zm-52-343.8Q560-546.31 560-580t-23.15-56.85Q513.69-660 480-660t-56.85 23.15Q400-613.69 400-580t23.15 56.85Q446.31-500 480-500t56.85-23.15ZM480-580Zm0 350Z"/></svg>`;
const ICON_SHIELD = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M469-140q-6-1-11.02-3Q345-188 278.5-291.5 212-395 212-516v-166q0-19.26 10.88-34.66Q233.75-732.07 251-739l208-77q11-4 21-4t21 4l208 77q17.25 6.93 28.13 22.34Q748-701.26 748-682v166q0 121-66.5 224.5T502.02-143q-5.02 2-11.02 3t-11 1q-5 0-11-1Zm11-24q104-33 172-132t68-220v-167q0-10-5.5-18T699-713l-208-77q-5-2-11-2t-11 2l-208 77q-10 4-15.5 12t-5.5 18v167q0 121 68 220t172 132Zm0-314Z"/></svg>`;
const ICON_LIGHT  = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M565-395q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Zm-198.42 28.42Q320-413.15 320-480t46.58-113.42Q413.15-640 480-640t113.42 46.58Q640-546.85 640-480t-46.58 113.42Q546.85-320 480-320t-113.42-46.58ZM80-460q-8.54 0-14.27-5.73T60-480q0-8.54 5.73-14.27T80-500h100q8.54 0 14.27 5.73T200-480q0 8.54-5.73 14.27T180-460H80Zm700 0q-8.54 0-14.27-5.73T760-480q0-8.54 5.73-14.27T780-500h100q8.54 0 14.27 5.73T900-480q0 8.54-5.73 14.27T880-460H780ZM465.73-765.73Q460-771.46 460-780v-100q0-8.54 5.73-14.27T480-900q8.54 0 14.27 5.73T500-880v100q0 8.54-5.73 14.27T480-760q-8.54 0-14.27-5.73Zm0 700Q460-71.46 460-80v-100q0-8.54 5.73-14.27T480-200q8.54 0 14.27 5.73T500-180v100q0 8.54-5.73 14.27T480-60q-8.54 0-14.27-5.73ZM254.46-678.77l-57.61-55.85q-5.85-5.61-5.73-13.76.11-8.16 5.73-14.77 6.61-6.62 14.38-6.62 7.77 0 14.15 6.62L282-706.31q6.38 6.62 6.38 14.16 0 7.53-6.38 14.15-5.62 6.62-13.27 6.12-7.65-.5-14.27-6.89Zm480.16 481.92L678-253.69q-6.38-6.62-6.38-14.27 0-7.66 6.38-14.04 5.62-6.62 13.27-6.12 7.65.5 14.27 6.89l57.61 55.85q5.85 5.61 5.73 13.76-.11 8.16-5.73 14.77-6.61 6.62-14.38 6.62-7.77 0-14.15-6.62ZM678-678q-6.62-5.62-6.12-13.27.5-7.65 6.89-14.27l55.85-57.61q5.61-5.85 13.76-5.73 8.16.11 14.77 5.73 6.62 6.61 6.62 14.38 0 7.77-6.62 14.15L706.31-678q-6.62 6.38-14.16 6.38-7.53 0-14.15-6.38ZM196.85-196.85q-6.62-6.61-6.62-14.38 0-7.77 6.62-14.15L253.69-282q6.62-6.38 14.27-6.38 7.66 0 14.04 6.38 5.85 5.62 5.35 13.27-.5 7.65-6.12 14.27l-55.85 57.61q-6.38 6.62-14.15 6.5-7.77-.11-14.38-6.5ZM480-480Z"/></svg>`;
const ICON_SCENE  = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M340-148.42q-65.69-28.43-114.42-77.16-48.73-48.73-77.16-114.42Q120-405.69 120-480.12q0-74.42 28.42-140 28.43-65.57 77.16-114.3 48.73-48.73 114.42-77.16Q405.69-840 480.12-840q74.42 0 140 28.42 65.57 28.43 114.3 77.16 48.73 48.73 77.16 114.3 28.42 65.58 28.42 140 0 74.43-28.42 140.12-28.43 65.69-77.16 114.42-48.73 48.73-114.3 77.16-65.58 28.42-140 28.42-74.43 0-140.12-28.42Zm140-11.27q35.23-45.23 58.08-88.85 22.84-43.61 37.15-97.61H384.77q15.85 57.07 37.92 100.69 22.08 43.61 57.31 85.77Zm-50.92-6q-28-33-51.12-81.58-23.11-48.58-34.42-98.88H190.15q34.39 74.61 97.5 122.38 63.12 47.77 141.43 58.08Zm101.84 0q78.31-10.31 141.43-58.08 63.11-47.77 97.5-122.38H616.46q-15.15 51.07-38.27 99.65-23.11 48.58-47.27 80.81ZM173.85-386.15h161.38q-4.54-24.62-6.42-47.97-1.89-23.34-1.89-45.88 0-22.54 1.89-45.88 1.88-23.35 6.42-47.97H173.85q-6.54 20.77-10.2 45.27Q160-504.08 160-480t3.65 48.58q3.66 24.5 10.2 45.27Zm201.38 0h209.54q4.54-24.62 6.42-47.2 1.89-22.57 1.89-46.65t-1.89-46.65q-1.88-22.58-6.42-47.2H375.23q-4.54 24.62-6.42 47.2-1.89 22.57-1.89 46.65t1.89 46.65q1.88 22.58 6.42 47.2Zm249.54 0h161.38q6.54-20.77 10.2-45.27Q800-455.92 800-480t-3.65-48.58q-3.66-24.5-10.2-45.27H624.77q4.54 24.62 6.42 47.97 1.89 23.34 1.89 45.88 0 22.54-1.89 45.88-1.88 23.35-6.42 47.97Zm-8.31-227.7h153.39Q734.69-690 673.5-736.23q-61.19-46.23-142.58-58.85 28 36.85 50.35 84.27 22.35 47.43 35.19 96.96Zm-231.69 0h190.46q-15.85-56.3-39.08-101.84-23.23-45.54-56.15-84.62-32.92 39.08-56.15 84.62-23.23 45.54-39.08 101.84Zm-194.62 0h153.39q12.84-49.53 35.19-96.96 22.35-47.42 50.35-84.27-82.16 12.62-142.96 59.23-60.81 46.62-95.97 122Z"/></svg>`;

const ICON_WEAPONS = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor" aria-hidden="true"><path d="M753.54-132.15 631.15-254.31l-76.92 76.93q-4.08 4.07-11.08 4.07t-11.07-4.07q-18.39-18.39-18.39-45.47 0-27.07 18.39-45.46l163.61-163.61q18.39-18.39 45.46-18.39 27.08 0 45.47 18.39 4.07 4.07 4.07 11.07t-4.07 11.08l-76.93 76.92 122.16 122.39q9.69 9.69 9.69 22.61 0 12.93-9.69 22.62l-33.08 33.08q-9.69 9.69-22.62 9.69-12.92 0-22.61-9.69Zm76.77-599.08-432 432.77 29.61 29.38q18.39 18.39 18.39 45.46 0 27.08-18.39 45.47-4.07 4.07-11.07 4.07t-11.08-4.07l-76.92-76.93-122.39 122.16q-9.69 9.69-22.61 9.69-12.93 0-22.62-9.69L128.15-166q-9.69-9.69-9.69-22.62 0-12.92 9.69-22.61l122.16-122.39-76.93-76.92q-4.07-4.08-4.07-11.08t4.07-11.07q18.39-18.39 45.47-18.39 27.07 0 45.46 18.39l30.15 30.38 423.31-422.54q8.69-8.69 20.88-13.92 12.2-5.23 25.12-5.23h43.92q13.93 0 23.12 9.19 9.19 9.19 9.19 23.12v57.61q0 6.46-2.23 12.04-2.23 5.58-7.46 10.81ZM334-583l23.23-23.77 23-24-23 24L334-583Zm-42.69 14.15L138.38-721.77q-8.69-8.69-13.53-20.88-4.85-12.2-4.85-25.12v-43.92q0-13.93 9.19-23.12 9.19-9.19 23.12-9.19h43.92q12.92 0 25.12 5.23 12.19 5.23 20.88 13.92l152.39 153.16q5.84 5.84 5.73 13.38-.12 7.54-5.97 13.39-5.84 5.61-13.76 5.73-7.93.11-13.77-5.73L207-804h-47v47l159.85 159.85q5.61 5.61 6 13.65.38 8.04-6 14.65-6.62 6.62-14.27 6.62-7.66 0-14.27-6.62ZM370-327l430-430v-47h-47L323-374l47 47Zm0 0-23.23-23.77L323-374l23.77 23.23L370-327Z"/></svg>`;
const ICON_HUD = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M326-442v26q0 6.07 3.95 10.03 3.96 3.97 10 3.97 6.05 0 10.05-3.97 4-3.96 4-10.03v-80q0-6.07-3.95-10.03-3.96-3.97-10-3.97-6.05 0-10.05 3.97-4 3.96-4 10.03v26h-46q-6.07 0-10.03 3.95-3.97 3.96-3.97 10 0 6.05 3.97 10.05 3.96 4 10.03 4h46Zm82 0h272q6.07 0 10.03-3.95 3.97-3.96 3.97-10 0-6.05-3.97-10.05-3.96-4-10.03-4H408q-6.07 0-10.03 3.95-3.97 3.96-3.97 10 0 6.05 3.97 10.05 3.96 4 10.03 4Zm226-128h46q6.07 0 10.03-3.95 3.97-3.96 3.97-10 0-6.05-3.97-10.05-3.96-4-10.03-4h-46v-26q0-6.07-3.95-10.03-3.96-3.97-10-3.97-6.05 0-10.05 3.97-4 3.96-4 10.03v80q0 6.07 3.95 10.03 3.96 3.97 10 3.97 6.05 0 10.05-3.97 4-3.96 4-10.03v-26Zm-354 0h272q6.07 0 10.03-3.95 3.97-3.96 3.97-10 0-6.05-3.97-10.05-3.96-4-10.03-4H280q-6.07 0-10.03 3.95-3.97 3.96-3.97 10 0 6.05 3.97 10.05 3.96 4 10.03 4Zm-88 318q-26 0-43-17t-17-43v-416q0-26 17-43t43-17h576q26 0 43 17t17 43v416q0 26-17 43t-43 17H588v50q0 12.75-8.62 21.37Q570.75-172 558-172H402q-12.75 0-21.37-8.63Q372-189.25 372-202v-50H192Zm0-28h576q12 0 22-10t10-22v-416q0-12-10-22t-22-10H192q-12 0-22 10t-10 22v416q0 12 10 22t22 10Zm-32 0v-480 480Z"/></svg>`;

const ICON_CONTROLLER = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M189-186q-51 0-86-35t-35-86q0-8 .5-15t2.5-15l84-336q12-45 48-73t82-28h390q46 0 82 28t48 73l84 336q2 8 3 15.5t1 15.5q0 51-35.5 85.5T771-186q-35 0-64-18.5T662-254l-29-59q-8-17-24-25t-34-8H385q-18 0-34 8t-24 25l-29 59q-15 32-44.5 50T189-186Zm3-28q26 0 48-14t33-37l28-58q12-24 35-37.5t49-13.5h190q27 0 49.5 14.5T660-322l28 57q11 23 33 37t48 14q39 0 67-26.5t28-64.5q0-3-3-25l-84-335q-9-35-37.5-58T675-746H285q-37 0-65.5 23T183-665L99-330q-1 4-3 24 0 39 28.5 65.5T192-214Zm367.5-326.5Q568-549 568-560t-8.5-19.5Q551-588 540-588t-19.5 8.5Q512-571 512-560t8.5 19.5Q529-532 540-532t19.5-8.5Zm80-80Q648-629 648-640t-8.5-19.5Q631-668 620-668t-19.5 8.5Q592-651 592-640t8.5 19.5Q609-612 620-612t19.5-8.5Zm0 160Q648-469 648-480t-8.5-19.5Q631-508 620-508t-19.5 8.5Q592-491 592-480t8.5 19.5Q609-452 620-452t19.5-8.5Zm80-80Q728-549 728-560t-8.5-19.5Q711-588 700-588t-19.5 8.5Q672-571 672-560t8.5 19.5Q689-532 700-532t19.5-8.5ZM350-480q4-4 4-10v-56h56q6 0 10-4t4-10q0-6-4-10t-10-4h-56v-56q0-6-4-10t-10-4q-6 0-10 4t-4 10v56h-56q-6 0-10 4t-4 10q0 6 4 10t10 4h56v56q0 6 4 10t10 4q6 0 10-4Zm130 0Z"/></svg>`;

const ICON_SOUND = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M564-195v-30q81-30 130.5-100T744-481q0-86-49.5-156T564-737v-30q92 33 150 111t58 175q0 97-58 175T564-195ZM188-412v-136h130l126-126v388L318-412H188Zm376 56v-250q30 22 45 55.5t15 70.5q0 37-15.5 69.5T564-356ZM416-606l-86 86H216v80h114l86 86v-252ZM316-480Z"/></svg>`;
const ICON_ALLIES = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M52-262v-26q0-35 38-58.5t97-23.5q8 0 18 1t22 3q-8 15-11.5 30.5T212-305v43H52Zm240 0v-39q0-21.84 13-39.92Q318-359 344-372t60-19.5q34-6.5 75.6-6.5 42.4 0 76.4 6.5 34 6.5 60 19.5t39 31.08q13 18.08 13 39.92v39H292Zm456 0v-42.7q0-17.08-3.5-32.19T734-366q13-2 22.5-3t17.5-1q59 0 96.5 23.5T908-288v26H748Zm-428-28h320v-11q0-31-44-50t-116-19q-72 0-116 19t-44 50v11ZM186.73-407q-20.73 0-35.23-14.69Q137-436.38 137-457q0-20 14.69-34.5T187-506q20 0 35 14.5t15 34.8q0 19.7-14.45 34.7-14.45 15-35.82 15ZM774-407q-20 0-35-15t-15-34.7q0-20.3 15-34.8 15-14.5 35.19-14.5 20.81 0 35.31 14.5Q824-477 824-457q0 20.62-14.37 35.31Q795.25-407 774-407Zm-293.65-21Q448-428 425-450.75T402-506q0-33.15 22.75-55.58Q447.5-584 480-584q33.15 0 55.58 22.32Q558-539.35 558-506.35 558-474 535.68-451q-22.33 23-55.33 23Zm.15-28q20.5 0 35-15t14.5-35.5q0-20.5-14.37-35Q501.25-556 480-556q-20 0-35 14.37-15 14.38-15 35.63 0 20 15 35t35.5 15Zm-.5 166Zm0-216Z"/></svg>`;
const ICON_LANDSCAPE = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M206-416q8-15 21.88-23.5Q241.75-448 259-448q18 0 33.1 9.37 15.1 9.38 21.9 26.63l19 44q9 19 33.06 17.43Q390.13-352.14 397-371l83-261q12-37 44-58.5t70.38-21.5Q632-712 664-691q32 21 44 57l148 404q2 7-1 12.5t-10.97 5.5q-4.55 0-8.34-2.5T830-221L681-625q-9-28-33.5-43.5T594-684q-29 0-53.5 16T507-624l-83 261q-7 19-23 30.5T364.61-321q-18.35 0-33.98-9.5Q315-340 307-357l-21-50q-8-17-27.5-17.5T230-408l-98 189q-1.69 3.18-5.08 5.09-3.39 1.91-7.12 1.91-7.8 0-11.8-6-4-6 0-13l98-185Zm58.94-148q-37.94 0-65.44-27.15-27.5-27.14-27.5-64.61Q172-694 199.5-721q27.5-27 65.44-27t64.5 26.92Q356-694.15 356-655.69 356-618 329.44-591t-64.5 27Zm-.1-28q26.84 0 45-19T328-656.5q0-26.5-18.16-45t-45-18.5Q238-720 219-701.6q-19 18.4-19 45.6 0 26 19 45t45.84 19ZM365-321ZM264-656Z"/></svg>`;
const ICON_ASSETS = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M450-199 256-312q-14.25-8.43-22.12-22.21Q226-348 226-364v-226q0-16 7.88-29.79Q241.75-633.57 256-642l194-113q14.33-8 30.16-8 15.84 0 29.84 8l194 113q14.25 8.43 22.13 22.21Q734-606 734-590v226q0 16-7.87 29.79Q718.25-320.43 704-312L510-199q-14.33 8-30.16 8-15.84 0-29.84-8Zm16-23v-248L254-590v226q0 8 4 15t12 12l196 115Zm28 0 196-115q8-5 12-12t4-15v-226L494-470v248ZM145.96-666q-5.96 0-9.96-4.03-4-4.02-4-9.97v-88q0-24.75 17.63-42.38Q167.25-828 192-828h88q5.95 0 9.98 4.04 4.02 4.03 4.02 10 0 5.96-4.02 9.96-4.03 4-9.98 4h-88q-14 0-23 9t-9 23v88q0 5.95-4.04 9.97-4.03 4.03-10 4.03ZM192-132q-24.75 0-42.37-17.63Q132-167.25 132-192v-88q0-5.95 4.04-9.98 4.03-4.02 10-4.02 5.96 0 9.96 4.02 4 4.03 4 9.98v88q0 14 9 23t23 9h88q5.95 0 9.98 4.04 4.02 4.03 4.02 10 0 5.96-4.02 9.96-4.03 4-9.98 4h-88Zm576 0h-88q-5.95 0-9.97-4.04-4.03-4.03-4.03-10 0-5.96 4.03-9.96 4.02-4 9.97-4h88q14 0 23-9t9-23v-88q0-5.95 4.04-9.98 4.03-4.02 10-4.02 5.96 0 9.96 4.02 4 4.03 4 9.98v88q0 24.75-17.62 42.37Q792.75-132 768-132Zm32-548v-88q0-14-9-23t-23-9h-88q-5.95 0-9.97-4.04-4.03-4.03-4.03-10 0-5.96 4.03-9.96 4.02-4 9.97-4h88q24.75 0 42.38 17.62Q828-792.75 828-768v88q0 5.95-4.04 9.97-4.03 4.03-10 4.03-5.96 0-9.96-4.03-4-4.02-4-9.97ZM480-494l212-122-196-113q-8-5-16-5t-16 5L268-616l212 122Zm0 14Zm0-14Zm14 24Zm-28 0Z"/></svg>`;
const ICON_SCENARIOS = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="m192-748 39 78q7 14 20 22t28 8q30 0 46-25.5t2-52.5l-15-30h80l39 78q7 14 20 22t28 8q30 0 46-25.5t2-52.5l-15-30h80l39 78q7 14 20 22t28 8q30 0 46-25.5t2-52.5l-15-30h56q26 0 43 17t17 43v416q0 26-17 43t-43 17H192q-26 0-43-17t-17-43v-416q0-26 17-43t43-17Zm-32 136v340q0 14 9 23t23 9h576q14 0 23-9t9-23v-340H160Zm0 0v372-372Z"/></svg>`;
const PRESET_SETTINGS = [
  { key: 'g40', label: 'G40', path: './presets/g40.json', data: {
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
      "thirdAzimuth": 5.286629385640168,
      "thirdLookAhead": 3.8,
      "thirdSmoothPos": 10,
      "thirdSmoothLook": 12,
      "thirdMouseLook": true,
      "aimEnabled": true,
      "aimFovDelta": -18,
      "aimDistDelta": -1.5,
      "aimSpeedMult": 0.55,
      "aimSmooth": 10,
      "thirdMouseSensitivityX": 0.003,
      "thirdMouseSensitivityY": 0.0024,
      "thirdPitch": -0.09799999999999828,
      "thirdOffsetMode": "parallel",
      "thirdOffsetX": 1.25,
      "thirdOffsetY": -0.25,
      "thirdOffsetZ": -0.25,
      "cameraShakeEnabled": true,
      "cameraShakeIntensity": 1.5,
      "cameraShakeDuration": 1,
      "cameraShakeFrequency": 40,
      "cameraShakeProximity": true,
      "cameraShakeRadius": 30,
      "cameraShakeMinFactor": 0.25,
      "playerSpeed": 7,
      "playerColor": "#0044cc",
      "playerMetalness": 0.67,
      "playerRoughness": 0,
      "playerRadius": 0.4,
      "playerLength": 1.2,
      "playerMaxHealth": 100,
      "playerHealth": 0,
      "playerMaxArmor": 100,
      "playerArmor": 0,
      "playerInvincible": true,
      "jumpEnabled": true,
      "doubleJumpEnabled": true,
      "jumpForce": 9.5,
      "jumpGravity": 26,
      "bulletTimeEnabled": true,
      "bulletTimeDuration": 7.5,
      "bulletTimeCooldown": 4,
      "bulletTimeScale": 0.25,
      "shieldVisible": false,
      "shieldColor": "#1e7bff",
      "shieldOpacity": 0.4,
      "shieldRadius": 2.2,
      "shieldHexSize": 0.05,
      "shieldLineThickness": 0.01,
      "shieldGlow": true,
      "shieldLineBloom": 1,
      "shieldBloomIntensity": 0,
      "shieldBloomRadius": 2.01,
      "shieldFresnelPower": 3,
      "dashEnabled": true,
      "dashSpeed": 28,
      "dashDuration": 0.18,
      "dashCooldown": 1.4,
      "ambientIntensity": 0,
      "sunIntensity": 5.5,
      "fillIntensity": 4,
      "rimIntensity": 6,
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
      "floorMode": "hybrid",
      "buildAreaEnabled": true,
      "buildAreaCenterX": 0,
      "buildAreaCenterZ": 0,
      "buildAreaWidth": 200,
      "buildAreaDepth": 200,
      "buildAreaAutoExpand": false,
      "buildAreaAutoExpandMargin": 4,
      "buildAreaBoundaryVisible": true,
      "buildAreaBoundaryColor": "#ffffff",
      "buildAreaBoundaryWalls": true,
      "buildAreaBoundaryHeight": 2,
      "buildAreaBoundaryOpacity": 0.28,
      "buildAreaBoundaryCollision": true,
      "showFps": true,
      "hudVisible": true,
      "hudFont": "michroma",
      "hudNpcHealthBars": true,
      "hudEnemyHealthBars": true,
      "hudAllyHealthBars": true,
      "hudNpcHealthBarRange": 60,
      "reticleVisible": true,
      "reticleType": "tr42",
      "reticleColor": "#ffffff",
      "reticleSize": 50,
      "reticleThickness": 0.5,
      "reticleWeight": 0.5,
      "reticleOpacity": 0.5,
      "reticleGlow": false,
      "laserEnabled": true,
      "laserBloom": true,
      "laserBloomColor": "#ff1100",
      "laserBloomIntensity": 0.55,
      "laserProjectileSpeed": 80,
      "laserRange": 42,
      "laserFireRate": 5,
      "enemyType": "rusher",
      "enemyCount": 10,
      "enemyHealth": 10,
      "enemyInvincible": false,
      "enemyBehavior": "rush",
      "enemyMoveSpeed": 3,
      "enemyDamage": 10,
      "enemyPlacement": "random",
      "enemyWeaponType": "rifle",
      "allyType": "orbiter",
      "allyCount": 10,
      "allyHealth": 100,
      "allyInvincible": false,
      "allyFriendlyFire": false,
      "allyBehavior": "keepDistance",
      "allyMoveSpeed": 3,
      "allyDamage": 10,
      "allyPlacement": "random",
      "allyWeaponType": "rifle",
      "enemyDestructionEnabled": true,
      "destructionEnemiesParticleCount": 50,
      "destructionEnemiesParticleSize": 0.32,
      "destructionEnemiesParticleSpeed": 0.6,
      "destructionEnemiesParticleGlow": 24,
      "destructionEnemiesColor": "#ff0000",
      "destructionEnemiesPhysics": "gravity",
      "destructionEnemiesDespawnTime": 5,
      "destructionEnemiesParticleDespawnTime": 1,
      "destructionEnemiesCorpseFadeTime": 1,
      "destructionAlliesParticleCount": 40,
      "destructionAlliesParticleSize": 0.32,
      "destructionAlliesParticleSpeed": 1.25,
      "destructionAlliesParticleGlow": 8,
      "destructionAlliesColor": "#00cc44",
      "destructionAlliesPhysics": "gravity",
      "destructionAlliesDespawnTime": 3,
      "destructionAlliesParticleDespawnTime": 1,
      "destructionAlliesCorpseFadeTime": 1,
      "enemyDestructionStandardCount": 10,
      "enemyDestructionStandardSize": 0.25,
      "enemyDestructionStandardSpeed": 1,
      "enemyDestructionEliteCount": 100,
      "enemyDestructionEliteSize": 0.5,
      "enemyDestructionEliteSpeed": 1.75,
      "enemyDestructionEliteGlow": 12,
      "controllerEnabled": true,
      "controllerMoveDeadzone": 0.12,
      "controllerLookDeadzone": 0.1,
      "controllerLookSensX": 0.045,
      "controllerLookSensY": 0.036,
      "controllerInvertY": false,
      "controllerFireThreshold": 0.5,
      "controllerVibration": true,
      "tagEnabled": true,
      "tagColor": "#ff2828",
      "tagSize": 25,
      "tagDwellTime": 0.6,
      "tagThickness": 12,
      "tagBloom": 0,
      "tagShadow": 1,
      "tagHeight": 30,
      "placedObjects": [
          {
              "objectId": "placed_mpwiloj1_1",
              "assetId": "sphere",
              "x": -180.5,
              "y": 0.5,
              "z": 514.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwyzrqd_9",
              "assetId": "tall_box",
              "x": -361.5,
              "y": 1,
              "z": 1500.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwyzrqd_3",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwyzrqd_a",
              "assetId": "tall_box",
              "x": -361.5,
              "y": 1,
              "z": 1501.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwyzrqd_3",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwyzrqd_b",
              "assetId": "tall_box",
              "x": -361.5,
              "y": 1,
              "z": 1502.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwyzrqd_3",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwyzrqd_c",
              "assetId": "tall_box",
              "x": -361.5,
              "y": 1,
              "z": 1503.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwyzrqd_3",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwz9lbp_2b",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwz9lbp_b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwz9lbp_2c",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwz9lbp_b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwz9lbp_2d",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwz9lbp_b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwz9lbp_2e",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwz9lbp_b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwz9qhh_2f",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwz9qhh_c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwz9qhh_2g",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwz9qhh_c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwz9qhh_2h",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwz9qhh_c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwz9qhh_2i",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwz9qhh_c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwz9ypk_2j",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwz9ypk_d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwz9ypk_2k",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwz9ypk_d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwz9ypk_2l",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwz9ypk_d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwz9ypk_2m",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwz9ypk_d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwza13n_2n",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwza13n_e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwza13n_2o",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwza13n_e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwza13n_2p",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwza13n_e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwza13n_2q",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwza13n_e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzadn7_2r",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzadn7_f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzadn7_2s",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzadn7_f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzadn7_2t",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzadn7_f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzadn7_2u",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzadn7_f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzaekd_2v",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzaekd_g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzaekd_2w",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzaekd_g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzaekd_2x",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzaekd_g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzaekd_2y",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzaekd_g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzafjx_2z",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzafjx_h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzafjx_30",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzafjx_h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzafjx_31",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzafjx_h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzafjx_32",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzafjx_h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzahm7_33",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzahm7_i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzahm7_34",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzahm7_i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzahm7_35",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzahm7_i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzahm7_36",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzahm7_i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzai6e_37",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzai6e_j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzai6e_38",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzai6e_j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzai6e_39",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzai6e_j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzai6e_3a",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzai6e_j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzajdd_3b",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzajdc_k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzajdd_3c",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzajdc_k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzajdd_3d",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzajdc_k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzamhd_3f",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzamhd_l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzamhd_3g",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzamhd_l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzamhd_3h",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzamhd_l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzamhd_3i",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzamhd_l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzaou3_3j",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzaou3_m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzaou3_3k",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzaou3_m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzaou3_3l",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzaou3_m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzaou3_3m",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzaou3_m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzapxu_3n",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzapxu_n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb5fo_3r",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb5fo_o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb5fo_3s",
              "assetId": "tall_box",
              "x": 2.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb5fo_o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb5fo_3t",
              "assetId": "tall_box",
              "x": 3.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb5fo_o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb5fo_3u",
              "assetId": "tall_box",
              "x": 4.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb5fo_o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb6tv_3v",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb6tv_p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb6tv_3w",
              "assetId": "tall_box",
              "x": 2.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb6tv_p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb6tv_3x",
              "assetId": "tall_box",
              "x": 3.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb6tv_p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb6tv_3y",
              "assetId": "tall_box",
              "x": 4.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb6tv_p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb73g_3z",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb73g_q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb73g_40",
              "assetId": "tall_box",
              "x": 2.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb73g_q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb73g_41",
              "assetId": "tall_box",
              "x": 3.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb73g_q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb73g_42",
              "assetId": "tall_box",
              "x": 4.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb73g_q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb9k2_43",
              "assetId": "tall_box",
              "x": 5.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb9k1_r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb9k2_44",
              "assetId": "tall_box",
              "x": 6.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb9k1_r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb9k2_45",
              "assetId": "tall_box",
              "x": 7.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb9k1_r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb9k2_46",
              "assetId": "tall_box",
              "x": 8.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb9k1_r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb9s5_47",
              "assetId": "tall_box",
              "x": 5.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb9s5_s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb9s5_48",
              "assetId": "tall_box",
              "x": 6.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb9s5_s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb9s5_49",
              "assetId": "tall_box",
              "x": 7.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb9s5_s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzb9s5_4a",
              "assetId": "tall_box",
              "x": 8.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzb9s5_s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzba18_4b",
              "assetId": "tall_box",
              "x": 5.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzba18_t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzba18_4c",
              "assetId": "tall_box",
              "x": 6.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzba18_t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzba18_4d",
              "assetId": "tall_box",
              "x": 7.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzba18_t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzba18_4e",
              "assetId": "tall_box",
              "x": 8.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzba18_t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbbtw_4f",
              "assetId": "tall_box",
              "x": 9.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbbtw_u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbbtw_4g",
              "assetId": "tall_box",
              "x": 10.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbbtw_u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbbtx_4h",
              "assetId": "tall_box",
              "x": 11.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbbtw_u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbbtx_4i",
              "assetId": "tall_box",
              "x": 12.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbbtw_u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbc0b_4j",
              "assetId": "tall_box",
              "x": 9.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbc0b_v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbc0b_4k",
              "assetId": "tall_box",
              "x": 10.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbc0b_v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbc0b_4l",
              "assetId": "tall_box",
              "x": 11.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbc0b_v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbc0b_4m",
              "assetId": "tall_box",
              "x": 12.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbc0b_v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbc77_4n",
              "assetId": "tall_box",
              "x": 9.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbc77_w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbc78_4o",
              "assetId": "tall_box",
              "x": 10.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbc77_w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbc78_4p",
              "assetId": "tall_box",
              "x": 11.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbc77_w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbc78_4q",
              "assetId": "tall_box",
              "x": 12.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbc77_w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbgy6_4r",
              "assetId": "tall_box",
              "x": 13.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbgy6_x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbgy6_4s",
              "assetId": "tall_box",
              "x": 14.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbgy6_x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbgy6_4t",
              "assetId": "tall_box",
              "x": 15.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbgy6_x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbgy6_4u",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbgy6_x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbh52_4v",
              "assetId": "tall_box",
              "x": 13.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbh52_y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbh53_4w",
              "assetId": "tall_box",
              "x": 14.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbh52_y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbh53_4x",
              "assetId": "tall_box",
              "x": 15.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbh52_y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbh53_4y",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbh52_y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbhch_4z",
              "assetId": "tall_box",
              "x": 13.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbhch_z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbhci_50",
              "assetId": "tall_box",
              "x": 14.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbhch_z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbhci_51",
              "assetId": "tall_box",
              "x": 15.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbhch_z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbhci_52",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 12.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbhch_z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbszp_53",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbszp_10",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbszp_54",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbszp_10",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbszp_55",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbszp_10",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbszp_56",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbszp_10",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbtbu_57",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbtbu_11",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbtbu_58",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbtbu_11",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbtbu_59",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbtbu_11",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbtbu_5a",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbtbu_11",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbtj9_5b",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbtj8_12",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbtj9_5c",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbtj8_12",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbtj9_5d",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbtj8_12",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbtj9_5e",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbtj8_12",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbumn_5f",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbumn_13",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbumn_5g",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbumn_13",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbumn_5h",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbumn_13",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbumn_5i",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbumn_13",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzburp_5j",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzburp_14",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzburp_5k",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzburp_14",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzburp_5l",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzburp_14",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzburq_5m",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzburp_14",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbuxf_5n",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbuxf_15",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbuxg_5o",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbuxf_15",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbuxg_5p",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbuxf_15",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbuxg_5q",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbuxf_15",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbvu4_5r",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbvu4_16",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbvu4_5s",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbvu4_16",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbvu4_5t",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbvu4_16",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbvu4_5u",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbvu4_16",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbw89_5v",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbw89_17",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbw89_5w",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbw89_17",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbw89_5x",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbw89_17",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbw89_5y",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbw89_17",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbwcz_5z",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbwcz_18",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbwcz_60",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbwcz_18",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbwcz_61",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbwcz_18",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbwcz_62",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbwcz_18",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbyul_63",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbyuk_19",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbyul_64",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbyuk_19",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbyul_65",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbyuk_19",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbyul_66",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbyuk_19",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbz0h_67",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbz0h_1a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbz0h_68",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbz0h_1a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbz0h_69",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbz0h_1a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbz0h_6a",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbz0h_1a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbz9w_6b",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbz9w_1b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbz9x_6c",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbz9w_1b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbz9x_6d",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbz9w_1b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzbz9x_6e",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzbz9w_1b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcaf9_6f",
              "assetId": "tall_box",
              "x": 13.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcaf9_1c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcafa_6g",
              "assetId": "tall_box",
              "x": 14.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcaf9_1c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcafa_6h",
              "assetId": "tall_box",
              "x": 15.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcaf9_1c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcafa_6i",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcaf9_1c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcbzd_6j",
              "assetId": "tall_box",
              "x": 9.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcbzd_1d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcbzd_6k",
              "assetId": "tall_box",
              "x": 10.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcbzd_1d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcbzd_6l",
              "assetId": "tall_box",
              "x": 11.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcbzd_1d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcbzd_6m",
              "assetId": "tall_box",
              "x": 12.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcbzd_1d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcdir_6n",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcdir_1e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcdis_6p",
              "assetId": "tall_box",
              "x": 3.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcdir_1e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcdis_6q",
              "assetId": "tall_box",
              "x": 4.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcdir_1e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcend_6r",
              "assetId": "tall_box",
              "x": 5.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcend_1f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcend_6s",
              "assetId": "tall_box",
              "x": 6.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcend_1f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcend_6t",
              "assetId": "tall_box",
              "x": 7.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcend_1f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcend_6u",
              "assetId": "tall_box",
              "x": 8.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcend_1f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcg8s_6v",
              "assetId": "tall_box",
              "x": 13.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcg8s_1g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcg8t_6w",
              "assetId": "tall_box",
              "x": 14.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcg8s_1g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcg8t_6x",
              "assetId": "tall_box",
              "x": 15.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcg8s_1g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcg8t_6y",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcg8s_1g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcggq_6z",
              "assetId": "tall_box",
              "x": 13.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcggp_1h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcggq_70",
              "assetId": "tall_box",
              "x": 14.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcggp_1h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcggq_71",
              "assetId": "tall_box",
              "x": 15.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcggp_1h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcggq_72",
              "assetId": "tall_box",
              "x": 16.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcggp_1h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzchno_73",
              "assetId": "tall_box",
              "x": 9.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzchnn_1i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzchno_74",
              "assetId": "tall_box",
              "x": 10.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzchnn_1i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzchno_75",
              "assetId": "tall_box",
              "x": 11.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzchnn_1i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzchno_76",
              "assetId": "tall_box",
              "x": 12.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzchnn_1i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzchsq_77",
              "assetId": "tall_box",
              "x": 9.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzchsp_1j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzchsq_78",
              "assetId": "tall_box",
              "x": 10.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzchsp_1j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzchsq_79",
              "assetId": "tall_box",
              "x": 11.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzchsp_1j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzchsq_7a",
              "assetId": "tall_box",
              "x": 12.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzchsp_1j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcivs_7b",
              "assetId": "tall_box",
              "x": 5.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcivs_1k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcivs_7c",
              "assetId": "tall_box",
              "x": 6.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcivs_1k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcivs_7d",
              "assetId": "tall_box",
              "x": 7.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcivs_1k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcivt_7e",
              "assetId": "tall_box",
              "x": 8.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcivs_1k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcj06_7f",
              "assetId": "tall_box",
              "x": 5.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcj06_1l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcj06_7g",
              "assetId": "tall_box",
              "x": 6.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcj06_1l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcj06_7h",
              "assetId": "tall_box",
              "x": 7.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcj06_1l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcj07_7i",
              "assetId": "tall_box",
              "x": 8.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcj06_1l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzck39_7j",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzck38_1m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzck39_7k",
              "assetId": "tall_box",
              "x": 2.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzck38_1m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzck39_7l",
              "assetId": "tall_box",
              "x": 3.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzck38_1m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzck39_7m",
              "assetId": "tall_box",
              "x": 4.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzck38_1m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzck8b_7n",
              "assetId": "tall_box",
              "x": 1.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzck8a_1n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzck8b_7o",
              "assetId": "tall_box",
              "x": 2.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzck8a_1n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzck8b_7p",
              "assetId": "tall_box",
              "x": 3.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzck8a_1n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzck8b_7q",
              "assetId": "tall_box",
              "x": 4.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzck8a_1n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzcqut_7s",
              "assetId": "tall_box",
              "x": 2.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzcqus_1o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfm5v_7v",
              "assetId": "tall_box",
              "x": -6.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfm5v_1p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfm5v_7w",
              "assetId": "tall_box",
              "x": -5.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfm5v_1p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfm5v_7x",
              "assetId": "tall_box",
              "x": -4.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfm5v_1p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfm5v_7y",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfm5v_1p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfn58_7z",
              "assetId": "tall_box",
              "x": -6.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfn58_1q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfn58_80",
              "assetId": "tall_box",
              "x": -5.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfn58_1q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfn59_81",
              "assetId": "tall_box",
              "x": -4.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfn58_1q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfn59_82",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfn58_1q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfne0_83",
              "assetId": "tall_box",
              "x": -6.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfne0_1r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfne0_84",
              "assetId": "tall_box",
              "x": -5.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfne0_1r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfne0_85",
              "assetId": "tall_box",
              "x": -4.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfne0_1r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfne1_86",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfne0_1r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfo3y_87",
              "assetId": "tall_box",
              "x": -6.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfo3x_1s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfo3y_88",
              "assetId": "tall_box",
              "x": -5.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfo3x_1s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfo3y_89",
              "assetId": "tall_box",
              "x": -4.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfo3x_1s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfo3z_8a",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfo3x_1s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfp35_8b",
              "assetId": "tall_box",
              "x": -10.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfp34_1t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfp35_8c",
              "assetId": "tall_box",
              "x": -9.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfp34_1t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfp35_8d",
              "assetId": "tall_box",
              "x": -8.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfp34_1t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfp35_8e",
              "assetId": "tall_box",
              "x": -7.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfp34_1t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfpa1_8f",
              "assetId": "tall_box",
              "x": -10.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfpa1_1u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfpa2_8g",
              "assetId": "tall_box",
              "x": -9.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfpa1_1u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfpa2_8h",
              "assetId": "tall_box",
              "x": -8.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfpa1_1u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfpa2_8i",
              "assetId": "tall_box",
              "x": -7.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfpa1_1u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfpgg_8j",
              "assetId": "tall_box",
              "x": -10.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfpgf_1v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfpgg_8k",
              "assetId": "tall_box",
              "x": -9.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfpgf_1v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfpgg_8l",
              "assetId": "tall_box",
              "x": -8.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfpgf_1v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfpgh_8m",
              "assetId": "tall_box",
              "x": -7.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfpgf_1v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfppw_8n",
              "assetId": "tall_box",
              "x": -10.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfppv_1w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfppw_8o",
              "assetId": "tall_box",
              "x": -9.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfppv_1w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfppx_8p",
              "assetId": "tall_box",
              "x": -8.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfppv_1w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfppx_8q",
              "assetId": "tall_box",
              "x": -7.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfppv_1w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfr94_8r",
              "assetId": "tall_box",
              "x": -14.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfr94_1x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfr94_8s",
              "assetId": "tall_box",
              "x": -13.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfr94_1x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfr94_8t",
              "assetId": "tall_box",
              "x": -12.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfr94_1x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfr94_8u",
              "assetId": "tall_box",
              "x": -11.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfr94_1x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfreo_8v",
              "assetId": "tall_box",
              "x": -14.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfreo_1y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfreo_8w",
              "assetId": "tall_box",
              "x": -13.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfreo_1y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfrep_8x",
              "assetId": "tall_box",
              "x": -12.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfreo_1y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfrep_8y",
              "assetId": "tall_box",
              "x": -11.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfreo_1y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfrl9_8z",
              "assetId": "tall_box",
              "x": -14.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfrl8_1z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfrl9_90",
              "assetId": "tall_box",
              "x": -13.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfrl8_1z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfrl9_91",
              "assetId": "tall_box",
              "x": -12.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfrl8_1z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfrla_92",
              "assetId": "tall_box",
              "x": -11.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfrl8_1z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfrtc_93",
              "assetId": "tall_box",
              "x": -14.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfrtb_20",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfrtc_94",
              "assetId": "tall_box",
              "x": -13.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfrtb_20",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfrtd_95",
              "assetId": "tall_box",
              "x": -12.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfrtb_20",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfrtd_96",
              "assetId": "tall_box",
              "x": -11.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfrtb_20",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzft81_97",
              "assetId": "tall_box",
              "x": -18.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzft81_21",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzft81_98",
              "assetId": "tall_box",
              "x": -17.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzft81_21",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzft81_99",
              "assetId": "tall_box",
              "x": -16.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzft81_21",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzft81_9a",
              "assetId": "tall_box",
              "x": -15.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzft81_21",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzftd3_9b",
              "assetId": "tall_box",
              "x": -18.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzftd2_22",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzftd3_9c",
              "assetId": "tall_box",
              "x": -17.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzftd2_22",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzftd3_9d",
              "assetId": "tall_box",
              "x": -16.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzftd2_22",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzftd3_9e",
              "assetId": "tall_box",
              "x": -15.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzftd2_22",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzftit_9f",
              "assetId": "tall_box",
              "x": -18.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzftit_23",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzftit_9g",
              "assetId": "tall_box",
              "x": -17.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzftit_23",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzftit_9h",
              "assetId": "tall_box",
              "x": -16.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzftit_23",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzftiu_9i",
              "assetId": "tall_box",
              "x": -15.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzftit_23",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzftt9_9j",
              "assetId": "tall_box",
              "x": -18.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzftt9_24",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzftt9_9k",
              "assetId": "tall_box",
              "x": -17.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzftt9_24",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzftta_9l",
              "assetId": "tall_box",
              "x": -16.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzftt9_24",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzftta_9m",
              "assetId": "tall_box",
              "x": -15.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzftt9_24",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfy0o_9n",
              "assetId": "tall_box",
              "x": -22.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfy0o_25",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfy0o_9o",
              "assetId": "tall_box",
              "x": -21.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfy0o_25",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfy0o_9p",
              "assetId": "tall_box",
              "x": -20.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfy0o_25",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfy0o_9q",
              "assetId": "tall_box",
              "x": -19.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfy0o_25",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfy5w_9r",
              "assetId": "tall_box",
              "x": -22.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfy5w_26",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfy5w_9s",
              "assetId": "tall_box",
              "x": -21.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfy5w_26",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfy5w_9t",
              "assetId": "tall_box",
              "x": -20.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfy5w_26",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfy5w_9u",
              "assetId": "tall_box",
              "x": -19.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfy5w_26",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfybm_9v",
              "assetId": "tall_box",
              "x": -22.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfybm_27",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfybm_9w",
              "assetId": "tall_box",
              "x": -21.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfybm_27",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfybn_9x",
              "assetId": "tall_box",
              "x": -20.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfybm_27",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfybn_9y",
              "assetId": "tall_box",
              "x": -19.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfybm_27",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfyl2_9z",
              "assetId": "tall_box",
              "x": -22.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfyl1_28",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfyl2_a0",
              "assetId": "tall_box",
              "x": -21.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfyl1_28",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfyl3_a1",
              "assetId": "tall_box",
              "x": -20.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfyl1_28",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfyl3_a2",
              "assetId": "tall_box",
              "x": -19.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfyl1_28",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfzpb_a3",
              "assetId": "tall_box",
              "x": -26.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfzpa_29",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfzpb_a4",
              "assetId": "tall_box",
              "x": -25.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfzpa_29",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfzpb_a5",
              "assetId": "tall_box",
              "x": -24.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfzpa_29",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfzpb_a6",
              "assetId": "tall_box",
              "x": -23.5,
              "y": 1,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfzpa_29",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfztu_a7",
              "assetId": "tall_box",
              "x": -26.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfztu_2a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfztv_a8",
              "assetId": "tall_box",
              "x": -25.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfztu_2a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfztv_a9",
              "assetId": "tall_box",
              "x": -24.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfztu_2a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfztv_aa",
              "assetId": "tall_box",
              "x": -23.5,
              "y": 3,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfztu_2a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfzyk_ab",
              "assetId": "tall_box",
              "x": -26.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfzyk_2b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfzyl_ac",
              "assetId": "tall_box",
              "x": -25.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfzyk_2b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfzyl_ad",
              "assetId": "tall_box",
              "x": -24.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfzyk_2b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzfzyl_ae",
              "assetId": "tall_box",
              "x": -23.5,
              "y": 5,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzfzyk_2b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzg086_af",
              "assetId": "tall_box",
              "x": -26.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzg086_2c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzg087_ag",
              "assetId": "tall_box",
              "x": -25.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzg086_2c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzg087_ah",
              "assetId": "tall_box",
              "x": -24.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzg086_2c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzg088_ai",
              "assetId": "tall_box",
              "x": -23.5,
              "y": 7,
              "z": -4.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzg086_2c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgh8e_aj",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgh8e_2d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgh8e_ak",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgh8e_2d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgh8e_al",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgh8e_2d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgh8f_am",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgh8e_2d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzghql_an",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzghql_2e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzghql_ao",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzghql_2e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzghqm_ap",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzghql_2e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzghqm_aq",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzghql_2e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzghut_ar",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzghut_2f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzghut_as",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzghut_2f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzghuu_at",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzghut_2f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzghuu_au",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzghut_2f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzghzp_av",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzghzo_2g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzghzp_aw",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzghzo_2g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzghzq_ax",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzghzo_2g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzghzq_ay",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzghzo_2g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgiw1_az",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgiw1_2h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgiw1_b0",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgiw1_2h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgiw1_b1",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgiw1_2h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgiw1_b2",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgiw1_2h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgj0r_b3",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgj0q_2i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgj0r_b4",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgj0q_2i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgj0r_b5",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgj0q_2i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgj0r_b6",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgj0q_2i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgj4s_b7",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgj4s_2j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgj4t_b8",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgj4s_2j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgj4t_b9",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgj4s_2j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgj4u_ba",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgj4s_2j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgje2_bb",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgje1_2k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgje3_bc",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgje1_2k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgje3_bd",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgje1_2k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgje3_be",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgje1_2k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkaw_bf",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkaw_2l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkaw_bg",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkaw_2l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkaw_bh",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkaw_2l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkaw_bi",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkaw_2l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkfy_bj",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkfy_2m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkfy_bk",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkfy_2m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkfz_bl",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkfy_2m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkfz_bm",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkfy_2m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkku_bn",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkkt_2n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkku_bo",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkkt_2n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkkv_bp",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkkt_2n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkkv_bq",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkkt_2n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkpe_br",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkpd_2o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkpe_bs",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkpd_2o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkpf_bt",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkpd_2o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgkpf_bu",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgkpd_2o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzglmq_bv",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzglmq_2p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzglmq_bw",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzglmq_2p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzglmq_bx",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzglmq_2p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzglmq_by",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzglmq_2p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzglra_bz",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzglr9_2q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzglra_c0",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzglr9_2q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzglra_c1",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzglr9_2q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzglrb_c2",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzglr9_2q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzglvu_c3",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzglvt_2r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzglvu_c4",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzglvt_2r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzglvu_c5",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzglvt_2r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzglvv_c6",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzglvt_2r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgm5f_c7",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgm5f_2s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgm5g_c8",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgm5f_2s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgm5h_c9",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgm5f_2s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgm5h_ca",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgm5f_2s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgpuz_cb",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": -4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgpuz_2t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgpuz_cc",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgpuz_2t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgpv0_cd",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgpuz_2t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgpv0_ce",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgpuz_2t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgpzd_cf",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": -4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgpzd_2u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgpzd_cg",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgpzd_2u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgpze_ch",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgpzd_2u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgpze_ci",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgpzd_2u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgq3r_cj",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": -4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgq3q_2v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgq3r_ck",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgq3q_2v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgq3s_cl",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgq3q_2v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgq3s_cm",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgq3q_2v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgq7m_cn",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": -4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgq7m_2w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgq7n_co",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": -3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgq7m_2w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgq7o_cp",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": -2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgq7m_2w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgq7o_cq",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": -1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgq7m_2w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgqyq_cr",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgqyq_2x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgqyq_cs",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgqyq_2x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgqyr_ct",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgqyq_2x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgqyr_cu",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgqyq_2x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgr34_cv",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgr34_2y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgr34_cw",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgr34_2y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgr35_cx",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgr34_2y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgr35_cy",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgr34_2y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgr7o_cz",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgr7n_2z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgr7o_d0",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgr7n_2z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgr7p_d1",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgr7n_2z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgr7p_d2",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgr7n_2z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgrfl_d3",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": -0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgrfk_30",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgrfm_d4",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 0.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgrfk_30",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgrfm_d5",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 1.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgrfk_30",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgrfn_d6",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 2.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgrfk_30",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgshh_d7",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgshh_31",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgshh_d8",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgshh_31",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgshh_d9",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgshh_31",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgshh_da",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgshh_31",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgslv_db",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgslu_32",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgslv_dc",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgslu_32",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgslv_dd",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgslu_32",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgslw_de",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgslu_32",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgsq8_df",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgsq8_33",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgsq9_dg",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgsq8_33",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgsqa_dh",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgsq8_33",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgsqa_di",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgsq8_33",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgsum_dj",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 3.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgsum_34",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgsun_dk",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 4.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgsum_34",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgsun_dl",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 5.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgsum_34",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgsuo_dm",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 6.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgsum_34",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgu1k_dn",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgu1k_35",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgu1k_do",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgu1k_35",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgu1k_dp",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgu1k_35",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgu1k_dq",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgu1k_35",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgu5y_dr",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgu5x_36",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgu5y_ds",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgu5x_36",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgu5y_dt",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgu5x_36",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzgu5z_du",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzgu5x_36",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzguai_dv",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzguah_37",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzguai_dw",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzguah_37",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzguaj_dx",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzguah_37",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzguaj_dy",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzguah_37",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzguew_dz",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 7.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzguev_38",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzguew_e0",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 8.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzguev_38",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzguex_e1",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 9.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzguev_38",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzguex_e2",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 10.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzguev_38",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhctz_e3",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhcty_39",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhctz_e4",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 12.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhcty_39",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhctz_e5",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 13.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhcty_39",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhctz_e6",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 14.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhcty_39",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhcyd_e7",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhcyc_3a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhcyd_e8",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 12.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhcyc_3a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhcyd_e9",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 13.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhcyc_3a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhcye_ea",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 14.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhcyc_3a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhd2q_eb",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhd2q_3b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhd2r_ec",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 12.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhd2q_3b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhd2r_ed",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 13.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhd2q_3b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhd2s_ee",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 14.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhd2q_3b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhdb0_ef",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 11.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhdaz_3c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhdb0_eg",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 12.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhdaz_3c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhdb1_eh",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 13.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhdaz_3c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhdb2_ei",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 14.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhdaz_3c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhekg_ej",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 15.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhekg_3d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhekg_ek",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 16.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhekg_3d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhekh_el",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 17.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhekg_3d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhekh_em",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 18.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhekg_3d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhepc_en",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 15.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhepc_3e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhepd_eo",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 16.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhepc_3e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhepd_ep",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 17.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhepc_3e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhepd_eq",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 18.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhepc_3e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzheu2_er",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 15.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzheu2_3f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzheu3_es",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 16.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzheu2_3f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzheu4_et",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 17.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzheu2_3f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzheu4_eu",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 18.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzheu2_3f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhez4_ev",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 15.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhez4_3g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhez5_ew",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 16.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhez4_3g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhez6_ex",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 17.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhez4_3g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhez6_ey",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 18.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhez4_3g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhgut_ez",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 19.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhgut_3h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhgut_f0",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 20.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhgut_3h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhguu_f1",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 21.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhgut_3h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhguu_f2",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 22.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhgut_3h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhgzd_f3",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 19.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhgzd_3i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhgze_f4",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 20.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhgzd_3i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhgze_f5",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 21.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhgzd_3i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhgze_f6",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 22.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhgzd_3i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhh3r_f7",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 19.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhh3q_3j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhh3s_f8",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 20.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhh3q_3j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhh3s_f9",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 21.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhh3q_3j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhh3t_fa",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 22.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhh3q_3j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhh7t_fb",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 19.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhh7s_3k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhh7u_fc",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 20.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhh7s_3k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhh7u_fd",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 21.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhh7s_3k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhh7v_fe",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 22.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhh7s_3k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhjok_ff",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 12.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhjok_3l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhjok_fg",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 13.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhjok_3l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhjok_fh",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 14.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhjok_3l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhjok_fi",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 15.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhjok_3l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhjsx_fj",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 12.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhjsx_3m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhjsy_fk",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 13.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhjsx_3m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhjsy_fl",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 14.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhjsx_3m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhjsz_fm",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 15.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhjsx_3m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhjxh_fn",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 12.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhjxh_3n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhjxi_fo",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 13.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhjxh_3n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhjxj_fp",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 14.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhjxh_3n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhjxj_fq",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 15.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhjxh_3n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhk1v_fr",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 12.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhk1u_3o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhk1w_fs",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 13.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhk1u_3o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhk1x_ft",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 14.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhk1u_3o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhk1x_fu",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 15.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhk1u_3o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhkvc_fv",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 16.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhkvc_3p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhkvc_fw",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 17.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhkvc_3p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhkvc_fx",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 18.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhkvc_3p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhkvc_fy",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 19.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhkvc_3p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhkzw_fz",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 16.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhkzv_3q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhkzw_g0",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 17.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhkzv_3q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhkzx_g1",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 18.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhkzv_3q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhkzx_g2",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 19.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhkzv_3q",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhl3x_g3",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 16.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhl3x_3r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhl3y_g4",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 17.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhl3x_3r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhl3z_g5",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 18.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhl3x_3r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhl3z_g6",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 19.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhl3x_3r",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhlcj_g7",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 16.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhlci_3s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhlck_g8",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 17.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhlci_3s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhlcl_g9",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 18.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhlci_3s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhlcm_ga",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 19.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhlci_3s",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhn1u_gb",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 20.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhn1u_3t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhn1u_gc",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 21.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhn1u_3t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhn1u_gd",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 22.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhn1u_3t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhn1v_ge",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 1,
              "z": 23.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhn1u_3t",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhn6j_gf",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 20.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhn6j_3u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhn6k_gg",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 21.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhn6j_3u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhn6k_gh",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 22.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhn6j_3u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhn6k_gi",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 3,
              "z": 23.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhn6j_3u",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhnar_gj",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 20.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhnaq_3v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhnas_gk",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 21.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhnaq_3v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhnas_gl",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 22.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhnaq_3v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhnat_gm",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 5,
              "z": 23.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhnaq_3v",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhnf5_gn",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 20.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhnf5_3w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhnf6_go",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 21.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhnf5_3w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhnf7_gp",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 22.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhnf5_3w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzhnf8_gq",
              "assetId": "tall_box",
              "x": -3.5,
              "y": 7,
              "z": 23.5,
              "ry": 1.5707963267948966,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzhnf5_3w",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi4co_gr",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi4co_3x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi4co_gs",
              "assetId": "tall_box",
              "x": -26.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi4co_3x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi4co_gt",
              "assetId": "tall_box",
              "x": -25.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi4co_3x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi4cp_gu",
              "assetId": "tall_box",
              "x": -24.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi4co_3x",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi4uj_gv",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi4ui_3y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi4uj_gw",
              "assetId": "tall_box",
              "x": -26.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi4ui_3y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi4uk_gx",
              "assetId": "tall_box",
              "x": -25.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi4ui_3y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi4uk_gy",
              "assetId": "tall_box",
              "x": -24.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi4ui_3y",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi4yl_gz",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi4yk_3z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi4yl_h0",
              "assetId": "tall_box",
              "x": -26.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi4yk_3z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi4ym_h1",
              "assetId": "tall_box",
              "x": -25.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi4yk_3z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi4ym_h2",
              "assetId": "tall_box",
              "x": -24.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi4yk_3z",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi586_h3",
              "assetId": "tall_box",
              "x": -27.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi585_40",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi587_h4",
              "assetId": "tall_box",
              "x": -26.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi585_40",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi588_h5",
              "assetId": "tall_box",
              "x": -25.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi585_40",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi589_h6",
              "assetId": "tall_box",
              "x": -24.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi585_40",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi60t_h7",
              "assetId": "tall_box",
              "x": -23.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi60s_41",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi60t_h8",
              "assetId": "tall_box",
              "x": -22.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi60s_41",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi60t_h9",
              "assetId": "tall_box",
              "x": -21.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi60s_41",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi60t_ha",
              "assetId": "tall_box",
              "x": -20.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi60s_41",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi65c_hb",
              "assetId": "tall_box",
              "x": -23.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi65c_42",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi65d_hc",
              "assetId": "tall_box",
              "x": -22.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi65c_42",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi65d_hd",
              "assetId": "tall_box",
              "x": -21.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi65c_42",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi65e_he",
              "assetId": "tall_box",
              "x": -20.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi65c_42",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi69e_hf",
              "assetId": "tall_box",
              "x": -23.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi69e_43",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi69f_hg",
              "assetId": "tall_box",
              "x": -22.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi69e_43",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi69g_hh",
              "assetId": "tall_box",
              "x": -21.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi69e_43",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi69g_hi",
              "assetId": "tall_box",
              "x": -20.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi69e_43",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi6ic_hj",
              "assetId": "tall_box",
              "x": -23.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi6ib_44",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi6id_hk",
              "assetId": "tall_box",
              "x": -22.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi6ib_44",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi6id_hl",
              "assetId": "tall_box",
              "x": -21.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi6ib_44",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi6ie_hm",
              "assetId": "tall_box",
              "x": -20.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi6ib_44",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi7qy_hn",
              "assetId": "tall_box",
              "x": -19.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi7qy_45",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi7qy_ho",
              "assetId": "tall_box",
              "x": -18.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi7qy_45",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi7qy_hp",
              "assetId": "tall_box",
              "x": -17.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi7qy_45",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi7qz_hq",
              "assetId": "tall_box",
              "x": -16.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi7qy_45",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi7vc_hr",
              "assetId": "tall_box",
              "x": -19.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi7vb_46",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi7vd_hs",
              "assetId": "tall_box",
              "x": -18.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi7vb_46",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi7vd_ht",
              "assetId": "tall_box",
              "x": -17.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi7vb_46",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi7ve_hu",
              "assetId": "tall_box",
              "x": -16.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi7vb_46",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi7zq_hv",
              "assetId": "tall_box",
              "x": -19.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi7zp_47",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi7zq_hw",
              "assetId": "tall_box",
              "x": -18.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi7zp_47",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi7zr_hx",
              "assetId": "tall_box",
              "x": -17.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi7zp_47",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi7zs_hy",
              "assetId": "tall_box",
              "x": -16.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi7zp_47",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi83s_hz",
              "assetId": "tall_box",
              "x": -19.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi83r_48",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi83t_i0",
              "assetId": "tall_box",
              "x": -18.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi83r_48",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi83u_i1",
              "assetId": "tall_box",
              "x": -17.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi83r_48",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi83v_i2",
              "assetId": "tall_box",
              "x": -16.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi83r_48",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi93z_i3",
              "assetId": "tall_box",
              "x": -15.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi93z_49",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi93z_i4",
              "assetId": "tall_box",
              "x": -14.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi93z_49",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi93z_i5",
              "assetId": "tall_box",
              "x": -13.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi93z_49",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi940_i6",
              "assetId": "tall_box",
              "x": -12.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi93z_49",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi98c_i7",
              "assetId": "tall_box",
              "x": -15.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi98c_4a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi98d_i8",
              "assetId": "tall_box",
              "x": -14.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi98c_4a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi98d_i9",
              "assetId": "tall_box",
              "x": -13.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi98c_4a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi98e_ia",
              "assetId": "tall_box",
              "x": -12.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi98c_4a",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi9ct_ib",
              "assetId": "tall_box",
              "x": -15.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi9cs_4b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi9cu_ic",
              "assetId": "tall_box",
              "x": -14.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi9cs_4b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi9cu_id",
              "assetId": "tall_box",
              "x": -13.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi9cs_4b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi9cv_ie",
              "assetId": "tall_box",
              "x": -12.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi9cs_4b",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi9gv_if",
              "assetId": "tall_box",
              "x": -15.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi9gu_4c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi9gw_ig",
              "assetId": "tall_box",
              "x": -14.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi9gu_4c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi9gx_ih",
              "assetId": "tall_box",
              "x": -13.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi9gu_4c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzi9gy_ii",
              "assetId": "tall_box",
              "x": -12.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzi9gu_4c",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzib4n_ij",
              "assetId": "tall_box",
              "x": -11.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzib4n_4d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzib4o_ik",
              "assetId": "tall_box",
              "x": -10.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzib4n_4d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzib4o_il",
              "assetId": "tall_box",
              "x": -9.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzib4n_4d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzib4o_im",
              "assetId": "tall_box",
              "x": -8.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzib4n_4d",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzib93_in",
              "assetId": "tall_box",
              "x": -11.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzib92_4e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzib93_io",
              "assetId": "tall_box",
              "x": -10.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzib92_4e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzib94_ip",
              "assetId": "tall_box",
              "x": -9.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzib92_4e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzib94_iq",
              "assetId": "tall_box",
              "x": -8.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzib92_4e",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzibdf_ir",
              "assetId": "tall_box",
              "x": -11.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzibde_4f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzibdg_is",
              "assetId": "tall_box",
              "x": -10.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzibde_4f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzibdg_it",
              "assetId": "tall_box",
              "x": -9.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzibde_4f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzibdh_iu",
              "assetId": "tall_box",
              "x": -8.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzibde_4f",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzibhs_iv",
              "assetId": "tall_box",
              "x": -11.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzibhr_4g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzibht_iw",
              "assetId": "tall_box",
              "x": -10.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzibhr_4g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzibhu_ix",
              "assetId": "tall_box",
              "x": -9.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzibhr_4g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzibhu_iy",
              "assetId": "tall_box",
              "x": -8.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzibhr_4g",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicjt_iz",
              "assetId": "tall_box",
              "x": -7.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicjs_4h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicjt_j0",
              "assetId": "tall_box",
              "x": -6.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicjs_4h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicjt_j1",
              "assetId": "tall_box",
              "x": -5.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicjs_4h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicjt_j2",
              "assetId": "tall_box",
              "x": -4.5,
              "y": 1,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicjs_4h",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicoj_j3",
              "assetId": "tall_box",
              "x": -7.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicoh_4i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicok_j4",
              "assetId": "tall_box",
              "x": -6.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicoh_4i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicok_j5",
              "assetId": "tall_box",
              "x": -5.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicoh_4i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicol_j6",
              "assetId": "tall_box",
              "x": -4.5,
              "y": 3,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicoh_4i",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicsi_j7",
              "assetId": "tall_box",
              "x": -7.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicsh_4j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicsj_j8",
              "assetId": "tall_box",
              "x": -6.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicsh_4j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicsj_j9",
              "assetId": "tall_box",
              "x": -5.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicsh_4j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicsk_ja",
              "assetId": "tall_box",
              "x": -4.5,
              "y": 5,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicsh_4j",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicwu_jb",
              "assetId": "tall_box",
              "x": -7.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicwt_4k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicwv_jc",
              "assetId": "tall_box",
              "x": -6.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicwt_4k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicww_jd",
              "assetId": "tall_box",
              "x": -5.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicwt_4k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzicwx_je",
              "assetId": "tall_box",
              "x": -4.5,
              "y": 7,
              "z": 23.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzicwt_4k",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjsfg_jf",
              "assetId": "tall_box",
              "x": 50.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjsfg_4l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjsfh_jg",
              "assetId": "tall_box",
              "x": 51.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjsfg_4l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjsfh_jh",
              "assetId": "tall_box",
              "x": 52.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjsfg_4l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjsfh_ji",
              "assetId": "tall_box",
              "x": 53.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjsfg_4l",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjtk2_jj",
              "assetId": "tall_box",
              "x": 54.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjtk1_4m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjtk2_jk",
              "assetId": "tall_box",
              "x": 55.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjtk1_4m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjtk2_jl",
              "assetId": "tall_box",
              "x": 56.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjtk1_4m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjtk2_jm",
              "assetId": "tall_box",
              "x": 57.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjtk1_4m",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjvh4_jn",
              "assetId": "tall_box",
              "x": 58.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjvh3_4n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjvh4_jo",
              "assetId": "tall_box",
              "x": 59.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjvh3_4n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjvh4_jp",
              "assetId": "tall_box",
              "x": 60.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjvh3_4n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjvh4_jq",
              "assetId": "tall_box",
              "x": 61.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjvh3_4n",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjwmv_jr",
              "assetId": "tall_box",
              "x": 62.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjwmv_4o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjwmw_js",
              "assetId": "tall_box",
              "x": 63.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjwmv_4o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjwmw_jt",
              "assetId": "tall_box",
              "x": 64.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjwmv_4o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjwmw_ju",
              "assetId": "tall_box",
              "x": 65.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjwmv_4o",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjxj2_jv",
              "assetId": "tall_box",
              "x": 66.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjxj1_4p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjxj2_jw",
              "assetId": "tall_box",
              "x": 67.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjxj1_4p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjxj2_jx",
              "assetId": "tall_box",
              "x": 68.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjxj1_4p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          },
          {
              "objectId": "placed_mpwzjxj2_jy",
              "assetId": "tall_box",
              "x": 69.5,
              "y": 1,
              "z": -30.5,
              "ry": 0,
              "scaleX": 1,
              "scaleY": 1,
              "scaleZ": 1,
              "groupId": "prefab_mpwzjxj1_4p",
              "prefabId": "prefab_crate_wall_4x2",
              "color": "#445566"
          }
      ],
      "placerSelectedAsset": "prefab_crate_wall_4x2",
      "radarEnabled": true,
      "radarRadius": 90,
      "radarRange": 60,
      "radarBgColor": "#0a1628",
      "radarEnemyColor": "#ff3030",
      "radarOpacity": 0.82,
      "radarTaggedColor": "#FF3030",
      "soundMuted": false,
      "soundMusicVolume": 0.4,
      "soundSfxVolume": 1,
      "soundSfx_shoot": 1,
      "soundSfx_dash": 1,
      "soundSfx_player_hit": 1,
      "soundSfx_standard_hit": 1,
      "soundSfx_elite_hit": 1,
      "soundSfx_explode": 1,
      "soundSfx_coin": 1,
      "soundSfx_heal": 1,
      "soundSfx_levelup": 1,
      "soundSfx_gameover": 1,
      "soundSfx_victory": 1,
      "soundSfx_ambience": 1,
      "enemyDestructionParticleCount": 40,
      "enemyDestructionParticleSize": 0.32,
      "enemyDestructionParticleSpeed": 1.25,
      "enemyDestructionParticleGlow": 8,
      "enemyDestructionPhysics": true,
      "destructionRusherParticleCount": 50,
      "destructionRusherParticleSize": 0.32,
      "destructionRusherParticleSpeed": 0.6,
      "destructionRusherParticleGlow": 24,
      "destructionRusherColor": "#ff0000",
      "destructionRusherPhysics": "gravity",
      "destructionRusherDespawnTime": 5,
      "destructionRusherCorpseFadeTime": 1,
      "destructionOrbiterParticleCount": 40,
      "destructionOrbiterParticleSize": 0.32,
      "destructionOrbiterParticleSpeed": 1.25,
      "destructionOrbiterParticleGlow": 8,
      "destructionOrbiterColor": "#00cc44",
      "destructionOrbiterPhysics": "gravity",
      "destructionOrbiterDespawnTime": 3,
      "destructionOrbiterCorpseFadeTime": 1,
      "destructionTankerParticleCount": 40,
      "destructionTankerParticleSize": 0.32,
      "destructionTankerParticleSpeed": 1.25,
      "destructionTankerParticleGlow": 8,
      "destructionTankerColor": "#2b2b2b",
      "destructionTankerPhysics": "gravity",
      "destructionTankerDespawnTime": 3,
      "destructionTankerCorpseFadeTime": 1,
      "destructionSniperParticleCount": 40,
      "destructionSniperParticleSize": 0.32,
      "destructionSniperParticleSpeed": 1.25,
      "destructionSniperParticleGlow": 8,
      "destructionSniperColor": "#9b30ff",
      "destructionSniperPhysics": "gravity",
      "destructionSniperDespawnTime": 3,
      "destructionSniperCorpseFadeTime": 1,
      "destructionTeleporterParticleCount": 40,
      "destructionTeleporterParticleSize": 0.32,
      "destructionTeleporterParticleSpeed": 1.25,
      "destructionTeleporterParticleGlow": 8,
      "destructionTeleporterColor": "#e0e0e0",
      "destructionTeleporterPhysics": "gravity",
      "destructionTeleporterDespawnTime": 3,
      "destructionTeleporterCorpseFadeTime": 1,
      "destructionShieldedParticleCount": 40,
      "destructionShieldedParticleSize": 0.32,
      "destructionShieldedParticleSpeed": 1.25,
      "destructionShieldedParticleGlow": 8,
      "destructionShieldedColor": "#4aa3ff",
      "destructionShieldedPhysics": "gravity",
      "destructionShieldedDespawnTime": 3,
      "destructionShieldedCorpseFadeTime": 1,
      "destructionSplitterParticleCount": 100,
      "destructionSplitterParticleSize": 0.5,
      "destructionSplitterParticleSpeed": 1.75,
      "destructionSplitterParticleGlow": 12,
      "destructionSplitterColor": "#80fb37",
      "destructionSplitterPhysics": "gravity",
      "destructionSplitterDespawnTime": 3,
      "destructionSplitterCorpseFadeTime": 1,
      "destructionBossParticleCount": 100,
      "destructionBossParticleSize": 0.5,
      "destructionBossParticleSpeed": 1.75,
      "destructionBossParticleGlow": 12,
      "destructionBossColor": "#111111",
      "destructionBossPhysics": "gravity",
      "destructionBossDespawnTime": 3,
      "destructionBossCorpseFadeTime": 1,
      "destructionDestructibleParticleCount": 40,
      "destructionDestructibleParticleSize": 0.25,
      "destructionDestructibleParticleSpeed": 6,
      "destructionDestructibleParticleGlow": 8,
      "destructionDestructibleColor": "#ffffff",
      "destructionDestructiblePhysics": "gravity",
      "placerObjectColor": "#445566",
      "placedAssetShadows": false,
      "placerScaleX": 2,
      "placerScaleY": 1.5,
      "placerScaleZ": 1,
      "placerRotationDeg": 0,
      "placerTransformModalX": 22,
      "placerTransformModalY": 22,
      "editorModeEnabled": false,
      "editorPlacementTarget": "asset",
      "editorMoveSpeed": 15,
      "editorSprintMultiplier": 2.25,
      "editorPrecisionMultiplier": 0.28,
      "editorFlyMode": true,
      "editorEyeHeight": 1.7,
      "editorFov": 70,
      "editorMouseSensitivityX": 0.003,
      "editorMouseSensitivityY": 0.0024,
      "editorCameraX": 40.48972202963538,
      "editorCameraY": 10.930499999821192,
      "editorCameraZ": -39.45350409879743,
      "editorYaw": 4.601444078461341,
      "editorPitch": -0.4707999999999992,
      "editorPlacedNpcs": [],
      "soundSfx_jump": 1,
      "soundSfx_enemy_grunt": 1,
      "soundSfx_object_explode": 1,
      "soundSfx_bullet_time_slow": 1,
      "soundSfx_bullet_time_heart": 1,
      "destructionDestructibleShockwaveSpeed": 40,
      "destructionDestructibleShockwaveColor": "#ffffff",
      "destructionDestructibleShockwaveFadeTime": 0.12,
      "destructionDestructibleShockwaveDelay": 0,
      "destructionDestructibleShockwaveTransparency": 0.1,
      "destructionDestructibleSplashDamage": 100,
      "destructionDestructibleSplashRadius": 4,
      "destructionDestructibleSplashFalloff": 1,
      "destructionDestructibleSplashMinFactor": 0.15,
      "soundProximityEnabled": true,
      "soundProximityRange": 100,
      "soundProximityFalloff": 2,
      "soundProximityMinFactor": 0.1,
      "enemyAwarenessRange": 40,
      "allyAwarenessRange": 50,
      "destructionRusherParticleDespawnTime": 1,
      "destructionOrbiterParticleDespawnTime": 1,
      "destructionTankerParticleDespawnTime": 1,
      "destructionSniperParticleDespawnTime": 1,
      "destructionTeleporterParticleDespawnTime": 1,
      "destructionShieldedParticleDespawnTime": 1,
      "destructionSplitterParticleDespawnTime": 1,
      "destructionBossParticleDespawnTime": 1,
      "destructionDestructibleParticleDespawnTime": 1,
      "overallBloomIntensity": 1.8,
      "playerWeaponType": "rifle",
      "weaponInfiniteAmmo": true,
      "weaponPistolMagazineSize": 12,
      "weaponPistolTotalAmmo": 60,
      "weaponRifleMagazineSize": 30,
      "weaponRifleTotalAmmo": 180,
      "weaponShotgunMagazineSize": 8,
      "weaponShotgunTotalAmmo": 40,
      "weaponSniperMagazineSize": 5,
      "weaponSniperTotalAmmo": 25,
      "weaponGrenadeTotalAmmo": 10,
      "weaponRocketClipCapacity": 1,
      "weaponRocketTotalAmmo": 8,
      "weaponPistolDamage": 24,
      "weaponPistolRange": 55,
      "weaponPistolSpread": 0.01,
      "weaponPistolFireRate": 3.6,
      "weaponPistolProjectileSpeed": 250,
      "weaponPistolProjectileSize": 0.1,
      "weaponPistolProjectileColor": "#FF1100",
      "weaponPistolProjectileBloom": false,
      "weaponPistolProjectileLength": 6,
      "weaponPistolProjectileBloomIntensity": 3,
      "weaponPistolProjectileBloomSize": 2,
      "weaponPistolReticleType": "dot",
      "weaponPistolReticleSize": 50,
      "weaponPistolReticleWeight": 0.5,
      "weaponRifleDamage": 34,
      "weaponRifleRange": 42,
      "weaponRifleSpread": 0.01,
      "weaponRifleFireRate": 15,
      "weaponRifleProjectileSpeed": 300,
      "weaponRifleProjectileSize": 0.05,
      "weaponRifleProjectileColor": "#ff1100",
      "weaponRifleProjectileBloom": true,
      "weaponRifleProjectileLength": 6,
      "weaponRifleProjectileBloomIntensity": 3,
      "weaponRifleProjectileBloomSize": 2,
      "weaponRifleReticleType": "tr42",
      "weaponRifleReticleSize": 50,
      "weaponRifleReticleWeight": 0.5,
      "weaponShotgunDamage": 12,
      "weaponShotgunRange": 28,
      "weaponShotgunSpread": 0.16,
      "weaponShotgunFireRate": 1.15,
      "weaponShotgunPellets": 8,
      "weaponShotgunProjectileSpeed": 250,
      "weaponShotgunProjectileSize": 0.05,
      "weaponShotgunProjectileColor": "#ff0000",
      "weaponShotgunProjectileBloom": true,
      "weaponShotgunProjectileLength": 6,
      "weaponShotgunProjectileBloomIntensity": 1,
      "weaponShotgunProjectileBloomSize": 1,
      "weaponShotgunReticleType": "shotgun",
      "weaponShotgunReticleSize": 50,
      "weaponShotgunReticleWeight": 2,
      "weaponSniperDamage": 120,
      "weaponSniperRange": 180,
      "weaponSniperSpread": 0.002,
      "weaponSniperFireRate": 0.65,
      "weaponSniperProjectileSpeed": 130,
      "weaponSniperProjectileSize": 0.24,
      "weaponSniperProjectileColor": "#d975ff",
      "weaponSniperProjectileBloom": true,
      "weaponSniperProjectileLength": 0.56,
      "weaponSniperProjectileBloomIntensity": 1,
      "weaponSniperProjectileBloomSize": 1,
      "weaponSniperReticleType": "cross",
      "weaponSniperReticleSize": 24,
      "weaponSniperReticleWeight": 2,
      "weaponGrenadeDamage": 95,
      "weaponGrenadeRange": 60,
      "weaponGrenadeSpread": 0.01,
      "weaponGrenadeFireRate": 0.72,
      "weaponGrenadeProjectileSpeed": 16,
      "weaponGrenadeProjectileSize": 0.25,
      "weaponGrenadeProjectileColor": "#429a5c",
      "weaponGrenadeProjectileBloom": false,
      "weaponGrenadeProjectileLength": 0.27,
      "weaponGrenadeProjectileBloomIntensity": 1,
      "weaponGrenadeProjectileBloomSize": 1,
      "weaponGrenadeRadius": 5,
      "weaponGrenadeReticleType": "dot",
      "weaponGrenadeReticleSize": 24,
      "weaponGrenadeReticleWeight": 2,
      "weaponRocketDamage": 130,
      "weaponRocketRange": 95,
      "weaponRocketSpread": 0.004,
      "weaponRocketFireRate": 0.68,
      "weaponRocketProjectileSpeed": 75,
      "weaponRocketProjectileSize": 0.3,
      "weaponRocketProjectileColor": "#000000",
      "weaponRocketProjectileBloom": true,
      "weaponRocketProjectileLength": 2,
      "weaponRocketProjectileBloomIntensity": 3,
      "weaponRocketProjectileBloomSize": 1,
      "weaponRocketRadius": 6,
      "weaponRocketReticleType": "rocket_launcher",
      "weaponRocketReticleSize": 75,
      "weaponRocketReticleWeight": 0.5,
      "weaponPistolProjectileBloomColor": "#FF1100",
      "weaponPistolReticleOpacity": 0.5,
      "weaponRifleProjectileBloomColor": "#ff1100",
      "weaponRifleReticleOpacity": 0.5,
      "weaponShotgunProjectileBloomColor": "#d8dde6",
      "weaponShotgunReticleOpacity": 1,
      "weaponSniperProjectileBloomColor": "#d975ff",
      "weaponSniperReticleOpacity": 0.5,
      "weaponGrenadeProjectileBloomColor": "#ff8844",
      "weaponGrenadeReticleOpacity": 1,
      "weaponRocketProjectileBloomColor": "#ffffff",
      "weaponRocketReticleOpacity": 0.5,
      "weaponGrenadeShockwaveSpeed": 40,
      "weaponGrenadeShockwaveColor": "#ffffff",
      "weaponGrenadeShockwaveFadeTime": 0.12,
      "weaponGrenadeShockwaveDelay": 0,
      "weaponGrenadeShockwaveTransparency": 0.1,
      "hudBulletTimeIndicator": true,
      "hudBulletTimeIndicatorSize": 41,
      "hudBulletTimeReadyOpacity": 1,
      "hudBulletTimeEmptyOpacity": 1,
      "hudBulletTimeActiveIcon": true,
      "hudBulletTimeActiveIconSize": 68,
      "hudBulletTimeActiveIconOpacity": 0.5,
      "weaponGrenadeShockwaveSplashDamage": 100,
      "weaponGrenadeShockwaveSplashRadius": 4,
      "weaponGrenadeShockwaveSplashFalloff": 1,
      "weaponGrenadeShockwaveSplashMinFactor": 0.15,
      "weaponRocketShockwaveSpeed": 40,
      "weaponRocketShockwaveColor": "#ffffff",
      "weaponRocketShockwaveFadeTime": 0.12,
      "weaponRocketShockwaveDelay": 0,
      "weaponRocketShockwaveTransparency": 0.1,
      "weaponRocketShockwaveSplashDamage": 100,
      "weaponRocketShockwaveSplashRadius": 4,
      "weaponRocketShockwaveSplashFalloff": 1,
      "weaponRocketShockwaveSplashMinFactor": 0.15,
      "weaponGrenadeShockwaveParticleCount": 40,
      "weaponGrenadeShockwaveParticleSize": 0.25,
      "weaponGrenadeShockwaveParticleSpeed": 6,
      "weaponGrenadeShockwaveParticleGlow": 8,
      "weaponGrenadeShockwaveParticleDespawnTime": 1,
      "weaponGrenadeShockwaveParticleColor": "#ffffff",
      "weaponGrenadeShockwaveParticlePhysics": "gravity",
      "weaponRocketShockwaveParticleCount": 40,
      "weaponRocketShockwaveParticleSize": 0.25,
      "weaponRocketShockwaveParticleSpeed": 6,
      "weaponRocketShockwaveParticleGlow": 8,
      "weaponRocketShockwaveParticleDespawnTime": 1,
      "weaponRocketShockwaveParticleColor": "#ffffff",
      "weaponRocketShockwaveParticlePhysics": "gravity",
      "weaponPistolReloadTime": 1,
      "weaponRifleReloadTime": 1.5,
      "weaponShotgunReloadTime": 1.6,
      "weaponSniperReloadTime": 2,
      "weaponRocketReloadTime": 2.4,
      "soundSfx_reload": 1,
      "weaponPistolOffsetX": 0,
      "weaponPistolOffsetY": 0,
      "weaponPistolRecoil": 0.15,
      "weaponRifleOffsetX": 0,
      "weaponRifleOffsetY": 0,
      "weaponRifleRecoil": 0.5,
      "weaponShotgunOffsetX": 0,
      "weaponShotgunOffsetY": 0,
      "weaponShotgunRecoil": 0,
      "weaponSniperOffsetX": 0,
      "weaponSniperOffsetY": 0,
      "weaponSniperRecoil": 0,
      "weaponGrenadeOffsetX": 0,
      "weaponGrenadeOffsetY": 0,
      "weaponRocketOffsetX": 0,
      "weaponRocketOffsetY": 0,
      "weaponRocketRecoil": 0,
      "soundSfx_empty": 1,
      "reticleKillConfirmEnabled": true,
      "reticleKillConfirmColor": "#ffffff",
      "reticleKillConfirmSize": 50,
      "reticleKillConfirmOpacity": 0.5,
      "weaponRifleTracers": false,
      "reticleHitMarkerSize": 54,
      "reticleHitMarkerWeight": 0.5,
      "reticleHitMarkerOpacity": 1,
      "reticleHitMarkerColor": "#ffffff",
      "reticleHitMarkerDuration": 190,
      "reticleKillConfirmDuration": 200,
      "soundSfx_pistol_reload": 1,
      "enemyAwarenessVisible": true,
      "enemyAwarenessColor": "#ff3030",
      "enemyAwarenessOpacity": 0.18,
      "allyAwarenessVisible": true,
      "allyAwarenessColor": "#ff0000",
      "allyAwarenessOpacity": 0.48,
      "reticleHitMarkerEnabled": true,
      "enemyAwarenessOutlineColor": "#000000",
      "allyAwarenessOutlineColor": "#ffffff",
      "enemyAccuracy": 60,
      "allyAccuracy": 60,
      "enemyAwarenessFillTransparent": true,
      "allyAwarenessFillTransparent": true,
      "landscapeEditorModeEnabled": false,
      "landscapeEditorCloneOffsetX": 1,
      "landscapeEditorCloneOffsetZ": 1,
      "landscapeEditorSelectionColor": "#445566",
      "landscapeEditorSelectionScaleX": 1,
      "landscapeEditorSelectionScaleY": 1,
      "landscapeEditorSelectionScaleZ": 1,
      "landscapeEditorSelectionRotationDeg": 0,
      "landscapeEditorPrefabName": "Saved Structure",
      "landscapeEditorSceneName": "Scene 1",
      "landscapeEditorSelectedSceneId": "",
      "savedPrefabs": [],
      "savedScenes": [],
      "playerSpawnEnabled": false,
      "playerSpawnX": 0,
      "playerSpawnY": 0,
      "playerSpawnZ": 0,
      "playerSpawnYaw": 3.141592653589793,
      "editorPlayerSpawnYaw": 3.141592653589793
  } },
  { key: 'g38', label: 'G38', path: './presets/g38.json', data: {
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
    "thirdAzimuth": 2.550629385640093,
    "thirdLookAhead": 3.8,
    "thirdSmoothPos": 10,
    "thirdSmoothLook": 12,
    "thirdMouseLook": true,
    "aimEnabled": true,
    "aimFovDelta": -18,
    "aimDistDelta": -1.5,
    "aimSpeedMult": 0.55,
    "aimSmooth": 10,
    "thirdMouseSensitivityX": 0.003,
    "thirdMouseSensitivityY": 0.0024,
    "thirdPitch": -0.040399999999998285,
    "thirdOffsetMode": "parallel",
    "thirdOffsetX": 1.25,
    "thirdOffsetY": -0.25,
    "thirdOffsetZ": -0.25,
    "cameraShakeEnabled": true,
    "cameraShakeIntensity": 1.5,
    "cameraShakeDuration": 1,
    "cameraShakeFrequency": 40,
    "cameraShakeProximity": true,
    "cameraShakeRadius": 30,
    "cameraShakeMinFactor": 0.25,
    "playerSpeed": 7,
    "playerColor": "#0044cc",
    "playerMetalness": 0.67,
    "playerRoughness": 0,
    "playerRadius": 0.4,
    "playerLength": 1.2,
    "playerMaxHealth": 100,
    "playerHealth": 0,
    "playerMaxArmor": 100,
    "playerArmor": 0,
    "playerInvincible": true,
    "jumpEnabled": true,
    "doubleJumpEnabled": true,
    "jumpForce": 9.5,
    "jumpGravity": 26,
    "bulletTimeEnabled": true,
    "bulletTimeDuration": 7.5,
    "bulletTimeCooldown": 4,
    "bulletTimeScale": 0.25,
    "shieldVisible": false,
    "shieldColor": "#1e7bff",
    "shieldOpacity": 0.4,
    "shieldRadius": 2.2,
    "shieldHexSize": 0.05,
    "shieldLineThickness": 0.01,
    "shieldGlow": true,
    "shieldLineBloom": 1,
    "shieldBloomIntensity": 0,
    "shieldBloomRadius": 2.01,
    "shieldFresnelPower": 3,
    "dashEnabled": true,
    "dashSpeed": 28,
    "dashDuration": 0.18,
    "dashCooldown": 1.4,
    "ambientIntensity": 0,
    "sunIntensity": 5.5,
    "fillIntensity": 4,
    "rimIntensity": 6,
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
    "floorMode": "hybrid",
    "buildAreaEnabled": true,
    "buildAreaCenterX": 0,
    "buildAreaCenterZ": 0,
    "buildAreaWidth": 200,
    "buildAreaDepth": 200,
    "buildAreaAutoExpand": false,
    "buildAreaAutoExpandMargin": 4,
    "buildAreaBoundaryVisible": true,
    "buildAreaBoundaryColor": "#ffffff",
    "buildAreaBoundaryWalls": true,
    "buildAreaBoundaryHeight": 2,
    "buildAreaBoundaryOpacity": 0.28,
    "buildAreaBoundaryCollision": true,
    "showFps": true,
    "hudVisible": true,
    "hudFont": "michroma",
    "hudNpcHealthBars": true,
    "hudEnemyHealthBars": true,
    "hudAllyHealthBars": true,
    "hudNpcHealthBarRange": 60,
    "reticleVisible": true,
    "reticleType": "tr42",
    "reticleColor": "#ffffff",
    "reticleSize": 50,
    "reticleThickness": 0.5,
    "reticleWeight": 0.5,
    "reticleOpacity": 0.5,
    "reticleGlow": false,
    "laserEnabled": true,
    "laserBloom": true,
    "laserBloomColor": "#ff1100",
    "laserBloomIntensity": 0.55,
    "laserProjectileSpeed": 80,
    "laserRange": 42,
    "laserFireRate": 5,
    "enemyType": "rusher",
    "enemyCount": 10,
    "enemyHealth": 10,
    "enemyInvincible": false,
    "enemyBehavior": "rush",
    "enemyMoveSpeed": 2.2,
    "enemyDamage": 10,
    "enemyPlacement": "random",
    "enemyWeaponType": "pistol",
    "allyType": "orbiter",
    "allyCount": 10,
    "allyHealth": 100,
    "allyInvincible": false,
    "allyFriendlyFire": false,
    "allyBehavior": "keepDistance",
    "allyMoveSpeed": 2.2,
    "allyDamage": 10,
    "allyPlacement": "random",
    "allyWeaponType": "rifle",
    "enemyDestructionEnabled": true,
    "destructionEnemiesParticleCount": 50,
    "destructionEnemiesParticleSize": 0.32,
    "destructionEnemiesParticleSpeed": 0.6,
    "destructionEnemiesParticleGlow": 24,
    "destructionEnemiesColor": "#ff0000",
    "destructionEnemiesPhysics": "gravity",
    "destructionEnemiesDespawnTime": 5,
    "destructionEnemiesParticleDespawnTime": 1,
    "destructionEnemiesCorpseFadeTime": 1,
    "destructionAlliesParticleCount": 40,
    "destructionAlliesParticleSize": 0.32,
    "destructionAlliesParticleSpeed": 1.25,
    "destructionAlliesParticleGlow": 8,
    "destructionAlliesColor": "#00cc44",
    "destructionAlliesPhysics": "gravity",
    "destructionAlliesDespawnTime": 3,
    "destructionAlliesParticleDespawnTime": 1,
    "destructionAlliesCorpseFadeTime": 1,
    "enemyDestructionStandardCount": 10,
    "enemyDestructionStandardSize": 0.25,
    "enemyDestructionStandardSpeed": 1,
    "enemyDestructionEliteCount": 100,
    "enemyDestructionEliteSize": 0.5,
    "enemyDestructionEliteSpeed": 1.75,
    "enemyDestructionEliteGlow": 12,
    "controllerEnabled": true,
    "controllerMoveDeadzone": 0.12,
    "controllerLookDeadzone": 0.1,
    "controllerLookSensX": 0.045,
    "controllerLookSensY": 0.036,
    "controllerInvertY": false,
    "controllerFireThreshold": 0.5,
    "controllerVibration": true,
    "tagEnabled": true,
    "tagColor": "#ff2828",
    "tagSize": 25,
    "tagDwellTime": 0.6,
    "tagThickness": 12,
    "tagBloom": 0,
    "tagShadow": 1,
    "tagHeight": 30,
    "placedObjects": [
        {
            "objectId": "placed_mpwiloj1_1",
            "assetId": "sphere",
            "x": -180.5,
            "y": 0.5,
            "z": 514.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwyzrqd_9",
            "assetId": "tall_box",
            "x": -361.5,
            "y": 1,
            "z": 1500.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwyzrqd_3",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwyzrqd_a",
            "assetId": "tall_box",
            "x": -361.5,
            "y": 1,
            "z": 1501.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwyzrqd_3",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwyzrqd_b",
            "assetId": "tall_box",
            "x": -361.5,
            "y": 1,
            "z": 1502.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwyzrqd_3",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwyzrqd_c",
            "assetId": "tall_box",
            "x": -361.5,
            "y": 1,
            "z": 1503.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwyzrqd_3",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwz9lbp_2b",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwz9lbp_b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwz9lbp_2c",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwz9lbp_b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwz9lbp_2d",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwz9lbp_b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwz9lbp_2e",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwz9lbp_b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwz9qhh_2f",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwz9qhh_c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwz9qhh_2g",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwz9qhh_c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwz9qhh_2h",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwz9qhh_c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwz9qhh_2i",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwz9qhh_c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwz9ypk_2j",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwz9ypk_d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwz9ypk_2k",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwz9ypk_d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwz9ypk_2l",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwz9ypk_d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwz9ypk_2m",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwz9ypk_d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwza13n_2n",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwza13n_e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwza13n_2o",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwza13n_e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwza13n_2p",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwza13n_e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwza13n_2q",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwza13n_e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzadn7_2r",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzadn7_f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzadn7_2s",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzadn7_f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzadn7_2t",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzadn7_f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzadn7_2u",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzadn7_f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzaekd_2v",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzaekd_g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzaekd_2w",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzaekd_g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzaekd_2x",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzaekd_g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzaekd_2y",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzaekd_g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzafjx_2z",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzafjx_h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzafjx_30",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzafjx_h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzafjx_31",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzafjx_h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzafjx_32",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzafjx_h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzahm7_33",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzahm7_i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzahm7_34",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzahm7_i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzahm7_35",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzahm7_i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzahm7_36",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzahm7_i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzai6e_37",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzai6e_j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzai6e_38",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzai6e_j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzai6e_39",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzai6e_j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzai6e_3a",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzai6e_j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzajdd_3b",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzajdc_k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzajdd_3c",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzajdc_k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzajdd_3d",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzajdc_k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzamhd_3f",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzamhd_l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzamhd_3g",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzamhd_l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzamhd_3h",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzamhd_l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzamhd_3i",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzamhd_l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzaou3_3j",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzaou3_m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzaou3_3k",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzaou3_m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzaou3_3l",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzaou3_m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzaou3_3m",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzaou3_m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzapxu_3n",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzapxu_n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb5fo_3r",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb5fo_o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb5fo_3s",
            "assetId": "tall_box",
            "x": 2.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb5fo_o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb5fo_3t",
            "assetId": "tall_box",
            "x": 3.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb5fo_o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb5fo_3u",
            "assetId": "tall_box",
            "x": 4.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb5fo_o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb6tv_3v",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb6tv_p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb6tv_3w",
            "assetId": "tall_box",
            "x": 2.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb6tv_p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb6tv_3x",
            "assetId": "tall_box",
            "x": 3.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb6tv_p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb6tv_3y",
            "assetId": "tall_box",
            "x": 4.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb6tv_p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb73g_3z",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb73g_q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb73g_40",
            "assetId": "tall_box",
            "x": 2.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb73g_q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb73g_41",
            "assetId": "tall_box",
            "x": 3.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb73g_q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb73g_42",
            "assetId": "tall_box",
            "x": 4.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb73g_q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb9k2_43",
            "assetId": "tall_box",
            "x": 5.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb9k1_r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb9k2_44",
            "assetId": "tall_box",
            "x": 6.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb9k1_r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb9k2_45",
            "assetId": "tall_box",
            "x": 7.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb9k1_r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb9k2_46",
            "assetId": "tall_box",
            "x": 8.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb9k1_r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb9s5_47",
            "assetId": "tall_box",
            "x": 5.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb9s5_s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb9s5_48",
            "assetId": "tall_box",
            "x": 6.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb9s5_s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb9s5_49",
            "assetId": "tall_box",
            "x": 7.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb9s5_s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzb9s5_4a",
            "assetId": "tall_box",
            "x": 8.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzb9s5_s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzba18_4b",
            "assetId": "tall_box",
            "x": 5.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzba18_t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzba18_4c",
            "assetId": "tall_box",
            "x": 6.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzba18_t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzba18_4d",
            "assetId": "tall_box",
            "x": 7.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzba18_t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzba18_4e",
            "assetId": "tall_box",
            "x": 8.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzba18_t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbbtw_4f",
            "assetId": "tall_box",
            "x": 9.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbbtw_u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbbtw_4g",
            "assetId": "tall_box",
            "x": 10.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbbtw_u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbbtx_4h",
            "assetId": "tall_box",
            "x": 11.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbbtw_u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbbtx_4i",
            "assetId": "tall_box",
            "x": 12.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbbtw_u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbc0b_4j",
            "assetId": "tall_box",
            "x": 9.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbc0b_v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbc0b_4k",
            "assetId": "tall_box",
            "x": 10.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbc0b_v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbc0b_4l",
            "assetId": "tall_box",
            "x": 11.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbc0b_v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbc0b_4m",
            "assetId": "tall_box",
            "x": 12.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbc0b_v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbc77_4n",
            "assetId": "tall_box",
            "x": 9.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbc77_w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbc78_4o",
            "assetId": "tall_box",
            "x": 10.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbc77_w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbc78_4p",
            "assetId": "tall_box",
            "x": 11.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbc77_w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbc78_4q",
            "assetId": "tall_box",
            "x": 12.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbc77_w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbgy6_4r",
            "assetId": "tall_box",
            "x": 13.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbgy6_x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbgy6_4s",
            "assetId": "tall_box",
            "x": 14.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbgy6_x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbgy6_4t",
            "assetId": "tall_box",
            "x": 15.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbgy6_x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbgy6_4u",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbgy6_x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbh52_4v",
            "assetId": "tall_box",
            "x": 13.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbh52_y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbh53_4w",
            "assetId": "tall_box",
            "x": 14.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbh52_y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbh53_4x",
            "assetId": "tall_box",
            "x": 15.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbh52_y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbh53_4y",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbh52_y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbhch_4z",
            "assetId": "tall_box",
            "x": 13.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbhch_z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbhci_50",
            "assetId": "tall_box",
            "x": 14.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbhch_z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbhci_51",
            "assetId": "tall_box",
            "x": 15.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbhch_z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbhci_52",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 12.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbhch_z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbszp_53",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbszp_10",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbszp_54",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbszp_10",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbszp_55",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbszp_10",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbszp_56",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbszp_10",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbtbu_57",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbtbu_11",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbtbu_58",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbtbu_11",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbtbu_59",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbtbu_11",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbtbu_5a",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbtbu_11",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbtj9_5b",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbtj8_12",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbtj9_5c",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbtj8_12",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbtj9_5d",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbtj8_12",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbtj9_5e",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbtj8_12",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbumn_5f",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbumn_13",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbumn_5g",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbumn_13",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbumn_5h",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbumn_13",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbumn_5i",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbumn_13",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzburp_5j",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzburp_14",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzburp_5k",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzburp_14",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzburp_5l",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzburp_14",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzburq_5m",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzburp_14",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbuxf_5n",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbuxf_15",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbuxg_5o",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbuxf_15",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbuxg_5p",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbuxf_15",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbuxg_5q",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbuxf_15",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbvu4_5r",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbvu4_16",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbvu4_5s",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbvu4_16",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbvu4_5t",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbvu4_16",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbvu4_5u",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbvu4_16",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbw89_5v",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbw89_17",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbw89_5w",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbw89_17",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbw89_5x",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbw89_17",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbw89_5y",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbw89_17",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbwcz_5z",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbwcz_18",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbwcz_60",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbwcz_18",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbwcz_61",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbwcz_18",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbwcz_62",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbwcz_18",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbyul_63",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbyuk_19",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbyul_64",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbyuk_19",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbyul_65",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbyuk_19",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbyul_66",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbyuk_19",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbz0h_67",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbz0h_1a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbz0h_68",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbz0h_1a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbz0h_69",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbz0h_1a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbz0h_6a",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbz0h_1a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbz9w_6b",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbz9w_1b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbz9x_6c",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbz9w_1b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbz9x_6d",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbz9w_1b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzbz9x_6e",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzbz9w_1b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcaf9_6f",
            "assetId": "tall_box",
            "x": 13.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcaf9_1c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcafa_6g",
            "assetId": "tall_box",
            "x": 14.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcaf9_1c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcafa_6h",
            "assetId": "tall_box",
            "x": 15.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcaf9_1c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcafa_6i",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcaf9_1c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcbzd_6j",
            "assetId": "tall_box",
            "x": 9.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcbzd_1d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcbzd_6k",
            "assetId": "tall_box",
            "x": 10.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcbzd_1d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcbzd_6l",
            "assetId": "tall_box",
            "x": 11.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcbzd_1d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcbzd_6m",
            "assetId": "tall_box",
            "x": 12.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcbzd_1d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcdir_6n",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcdir_1e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcdis_6p",
            "assetId": "tall_box",
            "x": 3.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcdir_1e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcdis_6q",
            "assetId": "tall_box",
            "x": 4.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcdir_1e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcend_6r",
            "assetId": "tall_box",
            "x": 5.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcend_1f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcend_6s",
            "assetId": "tall_box",
            "x": 6.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcend_1f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcend_6t",
            "assetId": "tall_box",
            "x": 7.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcend_1f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcend_6u",
            "assetId": "tall_box",
            "x": 8.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcend_1f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcg8s_6v",
            "assetId": "tall_box",
            "x": 13.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcg8s_1g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcg8t_6w",
            "assetId": "tall_box",
            "x": 14.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcg8s_1g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcg8t_6x",
            "assetId": "tall_box",
            "x": 15.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcg8s_1g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcg8t_6y",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcg8s_1g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcggq_6z",
            "assetId": "tall_box",
            "x": 13.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcggp_1h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcggq_70",
            "assetId": "tall_box",
            "x": 14.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcggp_1h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcggq_71",
            "assetId": "tall_box",
            "x": 15.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcggp_1h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcggq_72",
            "assetId": "tall_box",
            "x": 16.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcggp_1h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzchno_73",
            "assetId": "tall_box",
            "x": 9.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzchnn_1i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzchno_74",
            "assetId": "tall_box",
            "x": 10.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzchnn_1i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzchno_75",
            "assetId": "tall_box",
            "x": 11.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzchnn_1i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzchno_76",
            "assetId": "tall_box",
            "x": 12.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzchnn_1i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzchsq_77",
            "assetId": "tall_box",
            "x": 9.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzchsp_1j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzchsq_78",
            "assetId": "tall_box",
            "x": 10.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzchsp_1j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzchsq_79",
            "assetId": "tall_box",
            "x": 11.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzchsp_1j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzchsq_7a",
            "assetId": "tall_box",
            "x": 12.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzchsp_1j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcivs_7b",
            "assetId": "tall_box",
            "x": 5.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcivs_1k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcivs_7c",
            "assetId": "tall_box",
            "x": 6.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcivs_1k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcivs_7d",
            "assetId": "tall_box",
            "x": 7.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcivs_1k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcivt_7e",
            "assetId": "tall_box",
            "x": 8.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcivs_1k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcj06_7f",
            "assetId": "tall_box",
            "x": 5.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcj06_1l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcj06_7g",
            "assetId": "tall_box",
            "x": 6.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcj06_1l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcj06_7h",
            "assetId": "tall_box",
            "x": 7.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcj06_1l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcj07_7i",
            "assetId": "tall_box",
            "x": 8.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcj06_1l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzck39_7j",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzck38_1m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzck39_7k",
            "assetId": "tall_box",
            "x": 2.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzck38_1m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzck39_7l",
            "assetId": "tall_box",
            "x": 3.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzck38_1m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzck39_7m",
            "assetId": "tall_box",
            "x": 4.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzck38_1m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzck8b_7n",
            "assetId": "tall_box",
            "x": 1.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzck8a_1n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzck8b_7o",
            "assetId": "tall_box",
            "x": 2.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzck8a_1n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzck8b_7p",
            "assetId": "tall_box",
            "x": 3.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzck8a_1n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzck8b_7q",
            "assetId": "tall_box",
            "x": 4.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzck8a_1n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzcqut_7s",
            "assetId": "tall_box",
            "x": 2.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzcqus_1o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfm5v_7v",
            "assetId": "tall_box",
            "x": -6.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfm5v_1p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfm5v_7w",
            "assetId": "tall_box",
            "x": -5.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfm5v_1p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfm5v_7x",
            "assetId": "tall_box",
            "x": -4.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfm5v_1p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfm5v_7y",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfm5v_1p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfn58_7z",
            "assetId": "tall_box",
            "x": -6.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfn58_1q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfn58_80",
            "assetId": "tall_box",
            "x": -5.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfn58_1q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfn59_81",
            "assetId": "tall_box",
            "x": -4.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfn58_1q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfn59_82",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfn58_1q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfne0_83",
            "assetId": "tall_box",
            "x": -6.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfne0_1r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfne0_84",
            "assetId": "tall_box",
            "x": -5.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfne0_1r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfne0_85",
            "assetId": "tall_box",
            "x": -4.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfne0_1r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfne1_86",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfne0_1r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfo3y_87",
            "assetId": "tall_box",
            "x": -6.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfo3x_1s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfo3y_88",
            "assetId": "tall_box",
            "x": -5.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfo3x_1s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfo3y_89",
            "assetId": "tall_box",
            "x": -4.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfo3x_1s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfo3z_8a",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfo3x_1s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfp35_8b",
            "assetId": "tall_box",
            "x": -10.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfp34_1t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfp35_8c",
            "assetId": "tall_box",
            "x": -9.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfp34_1t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfp35_8d",
            "assetId": "tall_box",
            "x": -8.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfp34_1t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfp35_8e",
            "assetId": "tall_box",
            "x": -7.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfp34_1t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfpa1_8f",
            "assetId": "tall_box",
            "x": -10.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfpa1_1u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfpa2_8g",
            "assetId": "tall_box",
            "x": -9.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfpa1_1u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfpa2_8h",
            "assetId": "tall_box",
            "x": -8.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfpa1_1u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfpa2_8i",
            "assetId": "tall_box",
            "x": -7.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfpa1_1u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfpgg_8j",
            "assetId": "tall_box",
            "x": -10.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfpgf_1v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfpgg_8k",
            "assetId": "tall_box",
            "x": -9.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfpgf_1v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfpgg_8l",
            "assetId": "tall_box",
            "x": -8.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfpgf_1v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfpgh_8m",
            "assetId": "tall_box",
            "x": -7.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfpgf_1v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfppw_8n",
            "assetId": "tall_box",
            "x": -10.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfppv_1w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfppw_8o",
            "assetId": "tall_box",
            "x": -9.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfppv_1w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfppx_8p",
            "assetId": "tall_box",
            "x": -8.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfppv_1w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfppx_8q",
            "assetId": "tall_box",
            "x": -7.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfppv_1w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfr94_8r",
            "assetId": "tall_box",
            "x": -14.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfr94_1x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfr94_8s",
            "assetId": "tall_box",
            "x": -13.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfr94_1x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfr94_8t",
            "assetId": "tall_box",
            "x": -12.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfr94_1x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfr94_8u",
            "assetId": "tall_box",
            "x": -11.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfr94_1x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfreo_8v",
            "assetId": "tall_box",
            "x": -14.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfreo_1y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfreo_8w",
            "assetId": "tall_box",
            "x": -13.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfreo_1y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfrep_8x",
            "assetId": "tall_box",
            "x": -12.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfreo_1y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfrep_8y",
            "assetId": "tall_box",
            "x": -11.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfreo_1y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfrl9_8z",
            "assetId": "tall_box",
            "x": -14.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfrl8_1z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfrl9_90",
            "assetId": "tall_box",
            "x": -13.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfrl8_1z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfrl9_91",
            "assetId": "tall_box",
            "x": -12.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfrl8_1z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfrla_92",
            "assetId": "tall_box",
            "x": -11.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfrl8_1z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfrtc_93",
            "assetId": "tall_box",
            "x": -14.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfrtb_20",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfrtc_94",
            "assetId": "tall_box",
            "x": -13.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfrtb_20",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfrtd_95",
            "assetId": "tall_box",
            "x": -12.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfrtb_20",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfrtd_96",
            "assetId": "tall_box",
            "x": -11.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfrtb_20",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzft81_97",
            "assetId": "tall_box",
            "x": -18.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzft81_21",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzft81_98",
            "assetId": "tall_box",
            "x": -17.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzft81_21",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzft81_99",
            "assetId": "tall_box",
            "x": -16.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzft81_21",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzft81_9a",
            "assetId": "tall_box",
            "x": -15.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzft81_21",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzftd3_9b",
            "assetId": "tall_box",
            "x": -18.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzftd2_22",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzftd3_9c",
            "assetId": "tall_box",
            "x": -17.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzftd2_22",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzftd3_9d",
            "assetId": "tall_box",
            "x": -16.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzftd2_22",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzftd3_9e",
            "assetId": "tall_box",
            "x": -15.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzftd2_22",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzftit_9f",
            "assetId": "tall_box",
            "x": -18.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzftit_23",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzftit_9g",
            "assetId": "tall_box",
            "x": -17.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzftit_23",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzftit_9h",
            "assetId": "tall_box",
            "x": -16.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzftit_23",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzftiu_9i",
            "assetId": "tall_box",
            "x": -15.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzftit_23",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzftt9_9j",
            "assetId": "tall_box",
            "x": -18.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzftt9_24",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzftt9_9k",
            "assetId": "tall_box",
            "x": -17.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzftt9_24",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzftta_9l",
            "assetId": "tall_box",
            "x": -16.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzftt9_24",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzftta_9m",
            "assetId": "tall_box",
            "x": -15.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzftt9_24",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfy0o_9n",
            "assetId": "tall_box",
            "x": -22.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfy0o_25",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfy0o_9o",
            "assetId": "tall_box",
            "x": -21.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfy0o_25",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfy0o_9p",
            "assetId": "tall_box",
            "x": -20.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfy0o_25",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfy0o_9q",
            "assetId": "tall_box",
            "x": -19.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfy0o_25",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfy5w_9r",
            "assetId": "tall_box",
            "x": -22.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfy5w_26",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfy5w_9s",
            "assetId": "tall_box",
            "x": -21.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfy5w_26",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfy5w_9t",
            "assetId": "tall_box",
            "x": -20.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfy5w_26",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfy5w_9u",
            "assetId": "tall_box",
            "x": -19.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfy5w_26",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfybm_9v",
            "assetId": "tall_box",
            "x": -22.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfybm_27",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfybm_9w",
            "assetId": "tall_box",
            "x": -21.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfybm_27",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfybn_9x",
            "assetId": "tall_box",
            "x": -20.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfybm_27",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfybn_9y",
            "assetId": "tall_box",
            "x": -19.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfybm_27",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfyl2_9z",
            "assetId": "tall_box",
            "x": -22.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfyl1_28",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfyl2_a0",
            "assetId": "tall_box",
            "x": -21.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfyl1_28",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfyl3_a1",
            "assetId": "tall_box",
            "x": -20.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfyl1_28",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfyl3_a2",
            "assetId": "tall_box",
            "x": -19.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfyl1_28",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfzpb_a3",
            "assetId": "tall_box",
            "x": -26.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfzpa_29",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfzpb_a4",
            "assetId": "tall_box",
            "x": -25.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfzpa_29",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfzpb_a5",
            "assetId": "tall_box",
            "x": -24.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfzpa_29",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfzpb_a6",
            "assetId": "tall_box",
            "x": -23.5,
            "y": 1,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfzpa_29",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfztu_a7",
            "assetId": "tall_box",
            "x": -26.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfztu_2a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfztv_a8",
            "assetId": "tall_box",
            "x": -25.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfztu_2a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfztv_a9",
            "assetId": "tall_box",
            "x": -24.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfztu_2a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfztv_aa",
            "assetId": "tall_box",
            "x": -23.5,
            "y": 3,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfztu_2a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfzyk_ab",
            "assetId": "tall_box",
            "x": -26.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfzyk_2b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfzyl_ac",
            "assetId": "tall_box",
            "x": -25.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfzyk_2b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfzyl_ad",
            "assetId": "tall_box",
            "x": -24.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfzyk_2b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzfzyl_ae",
            "assetId": "tall_box",
            "x": -23.5,
            "y": 5,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzfzyk_2b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzg086_af",
            "assetId": "tall_box",
            "x": -26.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzg086_2c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzg087_ag",
            "assetId": "tall_box",
            "x": -25.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzg086_2c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzg087_ah",
            "assetId": "tall_box",
            "x": -24.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzg086_2c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzg088_ai",
            "assetId": "tall_box",
            "x": -23.5,
            "y": 7,
            "z": -4.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzg086_2c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgh8e_aj",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgh8e_2d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgh8e_ak",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgh8e_2d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgh8e_al",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgh8e_2d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgh8f_am",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgh8e_2d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzghql_an",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzghql_2e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzghql_ao",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzghql_2e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzghqm_ap",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzghql_2e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzghqm_aq",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzghql_2e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzghut_ar",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzghut_2f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzghut_as",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzghut_2f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzghuu_at",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzghut_2f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzghuu_au",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzghut_2f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzghzp_av",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzghzo_2g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzghzp_aw",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzghzo_2g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzghzq_ax",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzghzo_2g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzghzq_ay",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzghzo_2g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgiw1_az",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgiw1_2h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgiw1_b0",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgiw1_2h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgiw1_b1",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgiw1_2h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgiw1_b2",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgiw1_2h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgj0r_b3",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgj0q_2i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgj0r_b4",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgj0q_2i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgj0r_b5",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgj0q_2i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgj0r_b6",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgj0q_2i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgj4s_b7",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgj4s_2j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgj4t_b8",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgj4s_2j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgj4t_b9",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgj4s_2j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgj4u_ba",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgj4s_2j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgje2_bb",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgje1_2k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgje3_bc",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgje1_2k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgje3_bd",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgje1_2k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgje3_be",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgje1_2k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkaw_bf",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkaw_2l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkaw_bg",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkaw_2l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkaw_bh",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkaw_2l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkaw_bi",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkaw_2l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkfy_bj",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkfy_2m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkfy_bk",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkfy_2m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkfz_bl",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkfy_2m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkfz_bm",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkfy_2m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkku_bn",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkkt_2n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkku_bo",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkkt_2n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkkv_bp",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkkt_2n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkkv_bq",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkkt_2n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkpe_br",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkpd_2o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkpe_bs",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkpd_2o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkpf_bt",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkpd_2o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgkpf_bu",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgkpd_2o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzglmq_bv",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzglmq_2p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzglmq_bw",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzglmq_2p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzglmq_bx",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzglmq_2p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzglmq_by",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzglmq_2p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzglra_bz",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzglr9_2q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzglra_c0",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzglr9_2q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzglra_c1",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzglr9_2q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzglrb_c2",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzglr9_2q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzglvu_c3",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzglvt_2r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzglvu_c4",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzglvt_2r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzglvu_c5",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzglvt_2r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzglvv_c6",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzglvt_2r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgm5f_c7",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgm5f_2s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgm5g_c8",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgm5f_2s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgm5h_c9",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgm5f_2s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgm5h_ca",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgm5f_2s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgpuz_cb",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": -4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgpuz_2t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgpuz_cc",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgpuz_2t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgpv0_cd",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgpuz_2t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgpv0_ce",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgpuz_2t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgpzd_cf",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": -4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgpzd_2u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgpzd_cg",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgpzd_2u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgpze_ch",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgpzd_2u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgpze_ci",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgpzd_2u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgq3r_cj",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": -4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgq3q_2v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgq3r_ck",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgq3q_2v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgq3s_cl",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgq3q_2v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgq3s_cm",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgq3q_2v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgq7m_cn",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": -4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgq7m_2w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgq7n_co",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": -3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgq7m_2w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgq7o_cp",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": -2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgq7m_2w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgq7o_cq",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": -1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgq7m_2w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgqyq_cr",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgqyq_2x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgqyq_cs",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgqyq_2x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgqyr_ct",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgqyq_2x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgqyr_cu",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgqyq_2x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgr34_cv",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgr34_2y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgr34_cw",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgr34_2y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgr35_cx",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgr34_2y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgr35_cy",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgr34_2y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgr7o_cz",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgr7n_2z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgr7o_d0",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgr7n_2z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgr7p_d1",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgr7n_2z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgr7p_d2",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgr7n_2z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgrfl_d3",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": -0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgrfk_30",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgrfm_d4",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 0.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgrfk_30",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgrfm_d5",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 1.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgrfk_30",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgrfn_d6",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 2.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgrfk_30",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgshh_d7",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgshh_31",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgshh_d8",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgshh_31",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgshh_d9",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgshh_31",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgshh_da",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgshh_31",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgslv_db",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgslu_32",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgslv_dc",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgslu_32",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgslv_dd",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgslu_32",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgslw_de",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgslu_32",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgsq8_df",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgsq8_33",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgsq9_dg",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgsq8_33",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgsqa_dh",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgsq8_33",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgsqa_di",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgsq8_33",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgsum_dj",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 3.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgsum_34",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgsun_dk",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 4.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgsum_34",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgsun_dl",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 5.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgsum_34",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgsuo_dm",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 6.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgsum_34",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgu1k_dn",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgu1k_35",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgu1k_do",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgu1k_35",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgu1k_dp",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgu1k_35",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgu1k_dq",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgu1k_35",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgu5y_dr",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgu5x_36",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgu5y_ds",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgu5x_36",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgu5y_dt",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgu5x_36",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzgu5z_du",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzgu5x_36",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzguai_dv",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzguah_37",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzguai_dw",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzguah_37",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzguaj_dx",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzguah_37",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzguaj_dy",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzguah_37",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzguew_dz",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 7.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzguev_38",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzguew_e0",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 8.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzguev_38",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzguex_e1",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 9.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzguev_38",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzguex_e2",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 10.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzguev_38",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhctz_e3",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhcty_39",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhctz_e4",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 12.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhcty_39",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhctz_e5",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 13.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhcty_39",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhctz_e6",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 14.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhcty_39",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhcyd_e7",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhcyc_3a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhcyd_e8",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 12.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhcyc_3a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhcyd_e9",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 13.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhcyc_3a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhcye_ea",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 14.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhcyc_3a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhd2q_eb",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhd2q_3b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhd2r_ec",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 12.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhd2q_3b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhd2r_ed",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 13.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhd2q_3b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhd2s_ee",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 14.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhd2q_3b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhdb0_ef",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 11.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhdaz_3c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhdb0_eg",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 12.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhdaz_3c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhdb1_eh",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 13.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhdaz_3c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhdb2_ei",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 14.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhdaz_3c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhekg_ej",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 15.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhekg_3d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhekg_ek",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 16.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhekg_3d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhekh_el",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 17.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhekg_3d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhekh_em",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 18.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhekg_3d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhepc_en",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 15.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhepc_3e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhepd_eo",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 16.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhepc_3e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhepd_ep",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 17.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhepc_3e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhepd_eq",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 18.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhepc_3e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzheu2_er",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 15.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzheu2_3f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzheu3_es",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 16.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzheu2_3f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzheu4_et",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 17.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzheu2_3f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzheu4_eu",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 18.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzheu2_3f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhez4_ev",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 15.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhez4_3g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhez5_ew",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 16.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhez4_3g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhez6_ex",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 17.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhez4_3g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhez6_ey",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 18.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhez4_3g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhgut_ez",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 19.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhgut_3h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhgut_f0",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 20.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhgut_3h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhguu_f1",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 21.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhgut_3h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhguu_f2",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 22.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhgut_3h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhgzd_f3",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 19.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhgzd_3i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhgze_f4",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 20.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhgzd_3i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhgze_f5",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 21.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhgzd_3i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhgze_f6",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 22.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhgzd_3i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhh3r_f7",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 19.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhh3q_3j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhh3s_f8",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 20.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhh3q_3j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhh3s_f9",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 21.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhh3q_3j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhh3t_fa",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 22.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhh3q_3j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhh7t_fb",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 19.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhh7s_3k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhh7u_fc",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 20.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhh7s_3k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhh7u_fd",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 21.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhh7s_3k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhh7v_fe",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 22.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhh7s_3k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhjok_ff",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 12.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhjok_3l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhjok_fg",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 13.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhjok_3l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhjok_fh",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 14.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhjok_3l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhjok_fi",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 15.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhjok_3l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhjsx_fj",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 12.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhjsx_3m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhjsy_fk",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 13.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhjsx_3m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhjsy_fl",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 14.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhjsx_3m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhjsz_fm",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 15.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhjsx_3m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhjxh_fn",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 12.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhjxh_3n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhjxi_fo",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 13.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhjxh_3n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhjxj_fp",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 14.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhjxh_3n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhjxj_fq",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 15.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhjxh_3n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhk1v_fr",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 12.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhk1u_3o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhk1w_fs",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 13.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhk1u_3o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhk1x_ft",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 14.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhk1u_3o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhk1x_fu",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 15.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhk1u_3o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhkvc_fv",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 16.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhkvc_3p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhkvc_fw",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 17.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhkvc_3p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhkvc_fx",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 18.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhkvc_3p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhkvc_fy",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 19.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhkvc_3p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhkzw_fz",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 16.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhkzv_3q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhkzw_g0",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 17.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhkzv_3q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhkzx_g1",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 18.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhkzv_3q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhkzx_g2",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 19.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhkzv_3q",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhl3x_g3",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 16.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhl3x_3r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhl3y_g4",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 17.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhl3x_3r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhl3z_g5",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 18.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhl3x_3r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhl3z_g6",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 19.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhl3x_3r",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhlcj_g7",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 16.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhlci_3s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhlck_g8",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 17.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhlci_3s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhlcl_g9",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 18.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhlci_3s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhlcm_ga",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 19.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhlci_3s",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhn1u_gb",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 20.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhn1u_3t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhn1u_gc",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 21.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhn1u_3t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhn1u_gd",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 22.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhn1u_3t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhn1v_ge",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 1,
            "z": 23.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhn1u_3t",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhn6j_gf",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 20.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhn6j_3u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhn6k_gg",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 21.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhn6j_3u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhn6k_gh",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 22.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhn6j_3u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhn6k_gi",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 3,
            "z": 23.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhn6j_3u",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhnar_gj",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 20.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhnaq_3v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhnas_gk",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 21.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhnaq_3v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhnas_gl",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 22.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhnaq_3v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhnat_gm",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 5,
            "z": 23.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhnaq_3v",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhnf5_gn",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 20.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhnf5_3w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhnf6_go",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 21.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhnf5_3w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhnf7_gp",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 22.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhnf5_3w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzhnf8_gq",
            "assetId": "tall_box",
            "x": -3.5,
            "y": 7,
            "z": 23.5,
            "ry": 1.5707963267948966,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzhnf5_3w",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi4co_gr",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi4co_3x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi4co_gs",
            "assetId": "tall_box",
            "x": -26.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi4co_3x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi4co_gt",
            "assetId": "tall_box",
            "x": -25.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi4co_3x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi4cp_gu",
            "assetId": "tall_box",
            "x": -24.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi4co_3x",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi4uj_gv",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi4ui_3y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi4uj_gw",
            "assetId": "tall_box",
            "x": -26.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi4ui_3y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi4uk_gx",
            "assetId": "tall_box",
            "x": -25.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi4ui_3y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi4uk_gy",
            "assetId": "tall_box",
            "x": -24.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi4ui_3y",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi4yl_gz",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi4yk_3z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi4yl_h0",
            "assetId": "tall_box",
            "x": -26.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi4yk_3z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi4ym_h1",
            "assetId": "tall_box",
            "x": -25.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi4yk_3z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi4ym_h2",
            "assetId": "tall_box",
            "x": -24.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi4yk_3z",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi586_h3",
            "assetId": "tall_box",
            "x": -27.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi585_40",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi587_h4",
            "assetId": "tall_box",
            "x": -26.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi585_40",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi588_h5",
            "assetId": "tall_box",
            "x": -25.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi585_40",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi589_h6",
            "assetId": "tall_box",
            "x": -24.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi585_40",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi60t_h7",
            "assetId": "tall_box",
            "x": -23.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi60s_41",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi60t_h8",
            "assetId": "tall_box",
            "x": -22.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi60s_41",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi60t_h9",
            "assetId": "tall_box",
            "x": -21.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi60s_41",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi60t_ha",
            "assetId": "tall_box",
            "x": -20.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi60s_41",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi65c_hb",
            "assetId": "tall_box",
            "x": -23.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi65c_42",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi65d_hc",
            "assetId": "tall_box",
            "x": -22.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi65c_42",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi65d_hd",
            "assetId": "tall_box",
            "x": -21.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi65c_42",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi65e_he",
            "assetId": "tall_box",
            "x": -20.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi65c_42",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi69e_hf",
            "assetId": "tall_box",
            "x": -23.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi69e_43",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi69f_hg",
            "assetId": "tall_box",
            "x": -22.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi69e_43",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi69g_hh",
            "assetId": "tall_box",
            "x": -21.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi69e_43",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi69g_hi",
            "assetId": "tall_box",
            "x": -20.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi69e_43",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi6ic_hj",
            "assetId": "tall_box",
            "x": -23.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi6ib_44",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi6id_hk",
            "assetId": "tall_box",
            "x": -22.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi6ib_44",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi6id_hl",
            "assetId": "tall_box",
            "x": -21.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi6ib_44",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi6ie_hm",
            "assetId": "tall_box",
            "x": -20.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi6ib_44",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi7qy_hn",
            "assetId": "tall_box",
            "x": -19.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi7qy_45",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi7qy_ho",
            "assetId": "tall_box",
            "x": -18.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi7qy_45",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi7qy_hp",
            "assetId": "tall_box",
            "x": -17.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi7qy_45",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi7qz_hq",
            "assetId": "tall_box",
            "x": -16.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi7qy_45",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi7vc_hr",
            "assetId": "tall_box",
            "x": -19.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi7vb_46",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi7vd_hs",
            "assetId": "tall_box",
            "x": -18.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi7vb_46",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi7vd_ht",
            "assetId": "tall_box",
            "x": -17.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi7vb_46",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi7ve_hu",
            "assetId": "tall_box",
            "x": -16.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi7vb_46",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi7zq_hv",
            "assetId": "tall_box",
            "x": -19.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi7zp_47",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi7zq_hw",
            "assetId": "tall_box",
            "x": -18.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi7zp_47",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi7zr_hx",
            "assetId": "tall_box",
            "x": -17.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi7zp_47",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi7zs_hy",
            "assetId": "tall_box",
            "x": -16.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi7zp_47",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi83s_hz",
            "assetId": "tall_box",
            "x": -19.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi83r_48",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi83t_i0",
            "assetId": "tall_box",
            "x": -18.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi83r_48",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi83u_i1",
            "assetId": "tall_box",
            "x": -17.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi83r_48",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi83v_i2",
            "assetId": "tall_box",
            "x": -16.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi83r_48",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi93z_i3",
            "assetId": "tall_box",
            "x": -15.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi93z_49",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi93z_i4",
            "assetId": "tall_box",
            "x": -14.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi93z_49",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi93z_i5",
            "assetId": "tall_box",
            "x": -13.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi93z_49",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi940_i6",
            "assetId": "tall_box",
            "x": -12.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi93z_49",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi98c_i7",
            "assetId": "tall_box",
            "x": -15.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi98c_4a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi98d_i8",
            "assetId": "tall_box",
            "x": -14.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi98c_4a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi98d_i9",
            "assetId": "tall_box",
            "x": -13.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi98c_4a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi98e_ia",
            "assetId": "tall_box",
            "x": -12.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi98c_4a",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi9ct_ib",
            "assetId": "tall_box",
            "x": -15.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi9cs_4b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi9cu_ic",
            "assetId": "tall_box",
            "x": -14.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi9cs_4b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi9cu_id",
            "assetId": "tall_box",
            "x": -13.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi9cs_4b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi9cv_ie",
            "assetId": "tall_box",
            "x": -12.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi9cs_4b",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi9gv_if",
            "assetId": "tall_box",
            "x": -15.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi9gu_4c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi9gw_ig",
            "assetId": "tall_box",
            "x": -14.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi9gu_4c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi9gx_ih",
            "assetId": "tall_box",
            "x": -13.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi9gu_4c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzi9gy_ii",
            "assetId": "tall_box",
            "x": -12.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzi9gu_4c",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzib4n_ij",
            "assetId": "tall_box",
            "x": -11.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzib4n_4d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzib4o_ik",
            "assetId": "tall_box",
            "x": -10.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzib4n_4d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzib4o_il",
            "assetId": "tall_box",
            "x": -9.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzib4n_4d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzib4o_im",
            "assetId": "tall_box",
            "x": -8.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzib4n_4d",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzib93_in",
            "assetId": "tall_box",
            "x": -11.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzib92_4e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzib93_io",
            "assetId": "tall_box",
            "x": -10.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzib92_4e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzib94_ip",
            "assetId": "tall_box",
            "x": -9.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzib92_4e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzib94_iq",
            "assetId": "tall_box",
            "x": -8.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzib92_4e",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzibdf_ir",
            "assetId": "tall_box",
            "x": -11.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzibde_4f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzibdg_is",
            "assetId": "tall_box",
            "x": -10.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzibde_4f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzibdg_it",
            "assetId": "tall_box",
            "x": -9.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzibde_4f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzibdh_iu",
            "assetId": "tall_box",
            "x": -8.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzibde_4f",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzibhs_iv",
            "assetId": "tall_box",
            "x": -11.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzibhr_4g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzibht_iw",
            "assetId": "tall_box",
            "x": -10.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzibhr_4g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzibhu_ix",
            "assetId": "tall_box",
            "x": -9.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzibhr_4g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzibhu_iy",
            "assetId": "tall_box",
            "x": -8.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzibhr_4g",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicjt_iz",
            "assetId": "tall_box",
            "x": -7.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicjs_4h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicjt_j0",
            "assetId": "tall_box",
            "x": -6.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicjs_4h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicjt_j1",
            "assetId": "tall_box",
            "x": -5.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicjs_4h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicjt_j2",
            "assetId": "tall_box",
            "x": -4.5,
            "y": 1,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicjs_4h",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicoj_j3",
            "assetId": "tall_box",
            "x": -7.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicoh_4i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicok_j4",
            "assetId": "tall_box",
            "x": -6.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicoh_4i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicok_j5",
            "assetId": "tall_box",
            "x": -5.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicoh_4i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicol_j6",
            "assetId": "tall_box",
            "x": -4.5,
            "y": 3,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicoh_4i",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicsi_j7",
            "assetId": "tall_box",
            "x": -7.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicsh_4j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicsj_j8",
            "assetId": "tall_box",
            "x": -6.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicsh_4j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicsj_j9",
            "assetId": "tall_box",
            "x": -5.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicsh_4j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicsk_ja",
            "assetId": "tall_box",
            "x": -4.5,
            "y": 5,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicsh_4j",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicwu_jb",
            "assetId": "tall_box",
            "x": -7.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicwt_4k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicwv_jc",
            "assetId": "tall_box",
            "x": -6.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicwt_4k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicww_jd",
            "assetId": "tall_box",
            "x": -5.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicwt_4k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzicwx_je",
            "assetId": "tall_box",
            "x": -4.5,
            "y": 7,
            "z": 23.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzicwt_4k",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjsfg_jf",
            "assetId": "tall_box",
            "x": 50.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjsfg_4l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjsfh_jg",
            "assetId": "tall_box",
            "x": 51.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjsfg_4l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjsfh_jh",
            "assetId": "tall_box",
            "x": 52.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjsfg_4l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjsfh_ji",
            "assetId": "tall_box",
            "x": 53.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjsfg_4l",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjtk2_jj",
            "assetId": "tall_box",
            "x": 54.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjtk1_4m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjtk2_jk",
            "assetId": "tall_box",
            "x": 55.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjtk1_4m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjtk2_jl",
            "assetId": "tall_box",
            "x": 56.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjtk1_4m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjtk2_jm",
            "assetId": "tall_box",
            "x": 57.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjtk1_4m",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjvh4_jn",
            "assetId": "tall_box",
            "x": 58.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjvh3_4n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjvh4_jo",
            "assetId": "tall_box",
            "x": 59.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjvh3_4n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjvh4_jp",
            "assetId": "tall_box",
            "x": 60.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjvh3_4n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjvh4_jq",
            "assetId": "tall_box",
            "x": 61.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjvh3_4n",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjwmv_jr",
            "assetId": "tall_box",
            "x": 62.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjwmv_4o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjwmw_js",
            "assetId": "tall_box",
            "x": 63.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjwmv_4o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjwmw_jt",
            "assetId": "tall_box",
            "x": 64.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjwmv_4o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjwmw_ju",
            "assetId": "tall_box",
            "x": 65.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjwmv_4o",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjxj2_jv",
            "assetId": "tall_box",
            "x": 66.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjxj1_4p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjxj2_jw",
            "assetId": "tall_box",
            "x": 67.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjxj1_4p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjxj2_jx",
            "assetId": "tall_box",
            "x": 68.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjxj1_4p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        },
        {
            "objectId": "placed_mpwzjxj2_jy",
            "assetId": "tall_box",
            "x": 69.5,
            "y": 1,
            "z": -30.5,
            "ry": 0,
            "scaleX": 1,
            "scaleY": 1,
            "scaleZ": 1,
            "groupId": "prefab_mpwzjxj1_4p",
            "prefabId": "prefab_crate_wall_4x2",
            "color": "#445566"
        }
    ],
    "placerSelectedAsset": "prefab_crate_wall_4x2",
    "radarEnabled": true,
    "radarRadius": 90,
    "radarRange": 60,
    "radarBgColor": "#0a1628",
    "radarEnemyColor": "#ff3030",
    "radarOpacity": 0.82,
    "radarTaggedColor": "#FF3030",
    "soundMuted": false,
    "soundMusicVolume": 0.4,
    "soundSfxVolume": 1,
    "soundSfx_shoot": 1,
    "soundSfx_dash": 1,
    "soundSfx_player_hit": 1,
    "soundSfx_standard_hit": 1,
    "soundSfx_elite_hit": 1,
    "soundSfx_explode": 1,
    "soundSfx_coin": 1,
    "soundSfx_heal": 1,
    "soundSfx_levelup": 1,
    "soundSfx_gameover": 1,
    "soundSfx_victory": 1,
    "soundSfx_ambience": 1,
    "enemyDestructionParticleCount": 40,
    "enemyDestructionParticleSize": 0.32,
    "enemyDestructionParticleSpeed": 1.25,
    "enemyDestructionParticleGlow": 8,
    "enemyDestructionPhysics": true,
    "destructionRusherParticleCount": 50,
    "destructionRusherParticleSize": 0.32,
    "destructionRusherParticleSpeed": 0.6,
    "destructionRusherParticleGlow": 24,
    "destructionRusherColor": "#ff0000",
    "destructionRusherPhysics": "gravity",
    "destructionRusherDespawnTime": 5,
    "destructionRusherCorpseFadeTime": 1,
    "destructionOrbiterParticleCount": 40,
    "destructionOrbiterParticleSize": 0.32,
    "destructionOrbiterParticleSpeed": 1.25,
    "destructionOrbiterParticleGlow": 8,
    "destructionOrbiterColor": "#00cc44",
    "destructionOrbiterPhysics": "gravity",
    "destructionOrbiterDespawnTime": 3,
    "destructionOrbiterCorpseFadeTime": 1,
    "destructionTankerParticleCount": 40,
    "destructionTankerParticleSize": 0.32,
    "destructionTankerParticleSpeed": 1.25,
    "destructionTankerParticleGlow": 8,
    "destructionTankerColor": "#2b2b2b",
    "destructionTankerPhysics": "gravity",
    "destructionTankerDespawnTime": 3,
    "destructionTankerCorpseFadeTime": 1,
    "destructionSniperParticleCount": 40,
    "destructionSniperParticleSize": 0.32,
    "destructionSniperParticleSpeed": 1.25,
    "destructionSniperParticleGlow": 8,
    "destructionSniperColor": "#9b30ff",
    "destructionSniperPhysics": "gravity",
    "destructionSniperDespawnTime": 3,
    "destructionSniperCorpseFadeTime": 1,
    "destructionTeleporterParticleCount": 40,
    "destructionTeleporterParticleSize": 0.32,
    "destructionTeleporterParticleSpeed": 1.25,
    "destructionTeleporterParticleGlow": 8,
    "destructionTeleporterColor": "#e0e0e0",
    "destructionTeleporterPhysics": "gravity",
    "destructionTeleporterDespawnTime": 3,
    "destructionTeleporterCorpseFadeTime": 1,
    "destructionShieldedParticleCount": 40,
    "destructionShieldedParticleSize": 0.32,
    "destructionShieldedParticleSpeed": 1.25,
    "destructionShieldedParticleGlow": 8,
    "destructionShieldedColor": "#4aa3ff",
    "destructionShieldedPhysics": "gravity",
    "destructionShieldedDespawnTime": 3,
    "destructionShieldedCorpseFadeTime": 1,
    "destructionSplitterParticleCount": 100,
    "destructionSplitterParticleSize": 0.5,
    "destructionSplitterParticleSpeed": 1.75,
    "destructionSplitterParticleGlow": 12,
    "destructionSplitterColor": "#80fb37",
    "destructionSplitterPhysics": "gravity",
    "destructionSplitterDespawnTime": 3,
    "destructionSplitterCorpseFadeTime": 1,
    "destructionBossParticleCount": 100,
    "destructionBossParticleSize": 0.5,
    "destructionBossParticleSpeed": 1.75,
    "destructionBossParticleGlow": 12,
    "destructionBossColor": "#111111",
    "destructionBossPhysics": "gravity",
    "destructionBossDespawnTime": 3,
    "destructionBossCorpseFadeTime": 1,
    "destructionDestructibleParticleCount": 40,
    "destructionDestructibleParticleSize": 0.25,
    "destructionDestructibleParticleSpeed": 6,
    "destructionDestructibleParticleGlow": 8,
    "destructionDestructibleColor": "#ffffff",
    "destructionDestructiblePhysics": "gravity",
    "placerObjectColor": "#445566",
    "placedAssetShadows": false,
    "placerScaleX": 2,
    "placerScaleY": 1.5,
    "placerScaleZ": 1,
    "placerRotationDeg": 0,
    "placerTransformModalX": 22,
    "placerTransformModalY": 22,
    "editorModeEnabled": true,
    "editorPlacementTarget": "asset",
    "editorMoveSpeed": 15,
    "editorSprintMultiplier": 2.25,
    "editorPrecisionMultiplier": 0.28,
    "editorFlyMode": true,
    "editorEyeHeight": 1.7,
    "editorFov": 70,
    "editorMouseSensitivityX": 0.003,
    "editorMouseSensitivityY": 0.0024,
    "editorCameraX": 40.48972202963538,
    "editorCameraY": 10.930499999821192,
    "editorCameraZ": -39.45350409879743,
    "editorYaw": 4.601444078461338,
    "editorPitch": -0.4707999999999998,
    "editorPlacedNpcs": [],
    "soundSfx_jump": 1,
    "soundSfx_enemy_grunt": 1,
    "soundSfx_object_explode": 1,
    "soundSfx_bullet_time_slow": 1,
    "soundSfx_bullet_time_heart": 1,
    "destructionDestructibleShockwaveSpeed": 40,
    "destructionDestructibleShockwaveColor": "#ffffff",
    "destructionDestructibleShockwaveFadeTime": 0.12,
    "destructionDestructibleShockwaveDelay": 0,
    "destructionDestructibleShockwaveTransparency": 0.1,
    "destructionDestructibleSplashDamage": 100,
    "destructionDestructibleSplashRadius": 4,
    "destructionDestructibleSplashFalloff": 1,
    "destructionDestructibleSplashMinFactor": 0.15,
    "soundProximityEnabled": true,
    "soundProximityRange": 100,
    "soundProximityFalloff": 2,
    "soundProximityMinFactor": 0.1,
    "enemyAwarenessRange": 40,
    "allyAwarenessRange": 50,
    "destructionRusherParticleDespawnTime": 1,
    "destructionOrbiterParticleDespawnTime": 1,
    "destructionTankerParticleDespawnTime": 1,
    "destructionSniperParticleDespawnTime": 1,
    "destructionTeleporterParticleDespawnTime": 1,
    "destructionShieldedParticleDespawnTime": 1,
    "destructionSplitterParticleDespawnTime": 1,
    "destructionBossParticleDespawnTime": 1,
    "destructionDestructibleParticleDespawnTime": 1,
    "overallBloomIntensity": 1.8,
    "playerWeaponType": "rifle",
    "weaponInfiniteAmmo": true,
    "weaponPistolMagazineSize": 12,
    "weaponPistolTotalAmmo": 60,
    "weaponRifleMagazineSize": 30,
    "weaponRifleTotalAmmo": 180,
    "weaponShotgunMagazineSize": 8,
    "weaponShotgunTotalAmmo": 40,
    "weaponSniperMagazineSize": 5,
    "weaponSniperTotalAmmo": 25,
    "weaponGrenadeTotalAmmo": 10,
    "weaponRocketClipCapacity": 1,
    "weaponRocketTotalAmmo": 8,
    "weaponPistolDamage": 24,
    "weaponPistolRange": 55,
    "weaponPistolSpread": 0.01,
    "weaponPistolFireRate": 3.6,
    "weaponPistolProjectileSpeed": 250,
    "weaponPistolProjectileSize": 0.1,
    "weaponPistolProjectileColor": "#FF1100",
    "weaponPistolProjectileBloom": false,
    "weaponPistolProjectileLength": 6,
    "weaponPistolProjectileBloomIntensity": 3,
    "weaponPistolProjectileBloomSize": 2,
    "weaponPistolReticleType": "dot",
    "weaponPistolReticleSize": 50,
    "weaponPistolReticleWeight": 0.5,
    "weaponRifleDamage": 34,
    "weaponRifleRange": 42,
    "weaponRifleSpread": 0.01,
    "weaponRifleFireRate": 15,
    "weaponRifleProjectileSpeed": 300,
    "weaponRifleProjectileSize": 0.05,
    "weaponRifleProjectileColor": "#ff1100",
    "weaponRifleProjectileBloom": true,
    "weaponRifleProjectileLength": 6,
    "weaponRifleProjectileBloomIntensity": 3,
    "weaponRifleProjectileBloomSize": 2,
    "weaponRifleReticleType": "tr42",
    "weaponRifleReticleSize": 50,
    "weaponRifleReticleWeight": 0.5,
    "weaponShotgunDamage": 12,
    "weaponShotgunRange": 28,
    "weaponShotgunSpread": 0.16,
    "weaponShotgunFireRate": 1.15,
    "weaponShotgunPellets": 8,
    "weaponShotgunProjectileSpeed": 250,
    "weaponShotgunProjectileSize": 0.05,
    "weaponShotgunProjectileColor": "#ff0000",
    "weaponShotgunProjectileBloom": true,
    "weaponShotgunProjectileLength": 6,
    "weaponShotgunProjectileBloomIntensity": 1,
    "weaponShotgunProjectileBloomSize": 1,
    "weaponShotgunReticleType": "shotgun",
    "weaponShotgunReticleSize": 50,
    "weaponShotgunReticleWeight": 2,
    "weaponSniperDamage": 120,
    "weaponSniperRange": 180,
    "weaponSniperSpread": 0.002,
    "weaponSniperFireRate": 0.65,
    "weaponSniperProjectileSpeed": 130,
    "weaponSniperProjectileSize": 0.24,
    "weaponSniperProjectileColor": "#d975ff",
    "weaponSniperProjectileBloom": true,
    "weaponSniperProjectileLength": 0.56,
    "weaponSniperProjectileBloomIntensity": 1,
    "weaponSniperProjectileBloomSize": 1,
    "weaponSniperReticleType": "cross",
    "weaponSniperReticleSize": 24,
    "weaponSniperReticleWeight": 2,
    "weaponGrenadeDamage": 95,
    "weaponGrenadeRange": 60,
    "weaponGrenadeSpread": 0.01,
    "weaponGrenadeFireRate": 0.72,
    "weaponGrenadeProjectileSpeed": 16,
    "weaponGrenadeProjectileSize": 0.25,
    "weaponGrenadeProjectileColor": "#429a5c",
    "weaponGrenadeProjectileBloom": false,
    "weaponGrenadeProjectileLength": 0.27,
    "weaponGrenadeProjectileBloomIntensity": 1,
    "weaponGrenadeProjectileBloomSize": 1,
    "weaponGrenadeRadius": 5,
    "weaponGrenadeReticleType": "dot",
    "weaponGrenadeReticleSize": 24,
    "weaponGrenadeReticleWeight": 2,
    "weaponRocketDamage": 130,
    "weaponRocketRange": 95,
    "weaponRocketSpread": 0.004,
    "weaponRocketFireRate": 0.68,
    "weaponRocketProjectileSpeed": 75,
    "weaponRocketProjectileSize": 0.3,
    "weaponRocketProjectileColor": "#000000",
    "weaponRocketProjectileBloom": true,
    "weaponRocketProjectileLength": 2,
    "weaponRocketProjectileBloomIntensity": 3,
    "weaponRocketProjectileBloomSize": 1,
    "weaponRocketRadius": 6,
    "weaponRocketReticleType": "rocket_launcher",
    "weaponRocketReticleSize": 75,
    "weaponRocketReticleWeight": 0.5,
    "weaponPistolProjectileBloomColor": "#FF1100",
    "weaponPistolReticleOpacity": 0.5,
    "weaponRifleProjectileBloomColor": "#ff1100",
    "weaponRifleReticleOpacity": 0.5,
    "weaponShotgunProjectileBloomColor": "#d8dde6",
    "weaponShotgunReticleOpacity": 1,
    "weaponSniperProjectileBloomColor": "#d975ff",
    "weaponSniperReticleOpacity": 0.5,
    "weaponGrenadeProjectileBloomColor": "#ff8844",
    "weaponGrenadeReticleOpacity": 1,
    "weaponRocketProjectileBloomColor": "#ffffff",
    "weaponRocketReticleOpacity": 0.5,
    "weaponGrenadeShockwaveSpeed": 40,
    "weaponGrenadeShockwaveColor": "#ffffff",
    "weaponGrenadeShockwaveFadeTime": 0.12,
    "weaponGrenadeShockwaveDelay": 0,
    "weaponGrenadeShockwaveTransparency": 0.1,
    "hudBulletTimeIndicator": true,
    "hudBulletTimeIndicatorSize": 41,
    "hudBulletTimeReadyOpacity": 1,
    "hudBulletTimeEmptyOpacity": 1,
    "hudBulletTimeActiveIcon": true,
    "hudBulletTimeActiveIconSize": 68,
    "hudBulletTimeActiveIconOpacity": 0.5,
    "weaponGrenadeShockwaveSplashDamage": 100,
    "weaponGrenadeShockwaveSplashRadius": 4,
    "weaponGrenadeShockwaveSplashFalloff": 1,
    "weaponGrenadeShockwaveSplashMinFactor": 0.15,
    "weaponRocketShockwaveSpeed": 40,
    "weaponRocketShockwaveColor": "#ffffff",
    "weaponRocketShockwaveFadeTime": 0.12,
    "weaponRocketShockwaveDelay": 0,
    "weaponRocketShockwaveTransparency": 0.1,
    "weaponRocketShockwaveSplashDamage": 100,
    "weaponRocketShockwaveSplashRadius": 4,
    "weaponRocketShockwaveSplashFalloff": 1,
    "weaponRocketShockwaveSplashMinFactor": 0.15,
    "weaponGrenadeShockwaveParticleCount": 40,
    "weaponGrenadeShockwaveParticleSize": 0.25,
    "weaponGrenadeShockwaveParticleSpeed": 6,
    "weaponGrenadeShockwaveParticleGlow": 8,
    "weaponGrenadeShockwaveParticleDespawnTime": 1,
    "weaponGrenadeShockwaveParticleColor": "#ffffff",
    "weaponGrenadeShockwaveParticlePhysics": "gravity",
    "weaponRocketShockwaveParticleCount": 40,
    "weaponRocketShockwaveParticleSize": 0.25,
    "weaponRocketShockwaveParticleSpeed": 6,
    "weaponRocketShockwaveParticleGlow": 8,
    "weaponRocketShockwaveParticleDespawnTime": 1,
    "weaponRocketShockwaveParticleColor": "#ffffff",
    "weaponRocketShockwaveParticlePhysics": "gravity",
    "weaponPistolReloadTime": 1,
    "weaponRifleReloadTime": 1.5,
    "weaponShotgunReloadTime": 1.6,
    "weaponSniperReloadTime": 2,
    "weaponRocketReloadTime": 2.4,
    "soundSfx_reload": 1,
    "weaponPistolOffsetX": 0,
    "weaponPistolOffsetY": 0,
    "weaponPistolRecoil": 0.15,
    "weaponRifleOffsetX": 0,
    "weaponRifleOffsetY": 0,
    "weaponRifleRecoil": 0.5,
    "weaponShotgunOffsetX": 0,
    "weaponShotgunOffsetY": 0,
    "weaponShotgunRecoil": 0,
    "weaponSniperOffsetX": 0,
    "weaponSniperOffsetY": 0,
    "weaponSniperRecoil": 0,
    "weaponGrenadeOffsetX": 0,
    "weaponGrenadeOffsetY": 0,
    "weaponRocketOffsetX": 0,
    "weaponRocketOffsetY": 0,
    "weaponRocketRecoil": 0,
    "soundSfx_empty": 1,
    "reticleKillConfirmEnabled": true,
    "reticleKillConfirmColor": "#ffffff",
    "reticleKillConfirmSize": 50,
    "reticleKillConfirmOpacity": 0.5,
    "weaponRifleTracers": false,
    "reticleHitMarkerSize": 54,
    "reticleHitMarkerWeight": 0.5,
    "reticleHitMarkerOpacity": 1,
    "reticleHitMarkerColor": "#ffffff",
    "reticleHitMarkerDuration": 190,
    "reticleKillConfirmDuration": 200,
    "soundSfx_pistol_reload": 1,
    "enemyAwarenessVisible": true,
    "enemyAwarenessColor": "#ff3030",
    "enemyAwarenessOpacity": 0.18,
    "allyAwarenessVisible": true,
    "allyAwarenessColor": "#ff0000",
    "allyAwarenessOpacity": 0.48,
    "reticleHitMarkerEnabled": true,
    "enemyAwarenessOutlineColor": "#000000",
    "allyAwarenessOutlineColor": "#ffffff",
    "enemyAccuracy": 50,
    "allyAccuracy": 50,
    "enemyAwarenessFillTransparent": true,
    "allyAwarenessFillTransparent": true,
    "playerSpawnEnabled": false,
    "playerSpawnX": 0,
    "playerSpawnY": 0,
    "playerSpawnZ": 0,
    "playerSpawnYaw": 3.141592653589793,
    "editorPlayerSpawnYaw": 3.141592653589793
} },
];



const ICON_ENEMIES = `<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor" aria-hidden="true"><path d="M292-132v-152q-36-15-65.5-39T176-378q-21-31-32.5-67T132-520q0-136 97.42-222 97.41-86 250.5-86Q633-828 730.5-742T828-520q0 39-11.5 75T784-378q-21 31-50.5 55T668-283.82V-132H292Zm28-28h62v-56h56v56h84v-56h56v56h62v-142q36-12 65.5-33.5t50.65-50.05q21.15-28.54 32.5-63Q800-483 800-520q0-125-88.5-202.5T480-800q-143 0-231.5 77.5T160-520q0 37 11.35 71.45 11.35 34.46 32.5 63Q225-357 254.5-335.5 284-314 320-302v142Zm110-200h100l-50-100-50 100Zm-89.82-100q24.82 0 42.32-17.68 17.5-17.67 17.5-42.5 0-24.82-17.68-42.32-17.67-17.5-42.5-17.5-24.82 0-42.32 17.68-17.5 17.67-17.5 42.5 0 24.82 17.68 42.32 17.67 17.5 42.5 17.5Zm280 0q24.82 0 42.32-17.68 17.5-17.67 17.5-42.5 0-24.82-17.68-42.32-17.67-17.5-42.5-17.5-24.82 0-42.32 17.68-17.5 17.67-17.5 42.5 0 24.82 17.68 42.32 17.67 17.5 42.5 17.5ZM480-160Z"/></svg>`;


const ICON_DESTRUCTION = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M361.24-112Q258-112 185-184.68 112-257.35 112-360q0-105 75.5-176.5T369-608q8 0 16.5.5T402-606l23-41q9-17 27-21.5t35 4.5l25 14 5-8q20-34 57-44t71 10l12 7-14 24-12-7q-24-14-51-7t-40 31l-4 8 25 14q17 9 21.5 27t-4.5 35l-24 42q23 38 39 78.5t16 85.5q0 102-72.26 172-72.27 70-175.5 70Zm-.24-27q92 0 156-64.5T581-359q0-31-8.5-61T547-477l-26-41 29-51q5-8 2.5-18T542-602l-63-36q-8-5-18-2t-15 11l-29 50h-48q-94 0-161.5 63T140-361q0 92 64.5 157T361-139Zm387-475v-28h68v28h-68ZM586-788v-68h28v68h-28Zm162 40-19-19 48-49 19 20-48 48ZM361-359Z"/></svg>`;
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

const PLAYER_WEAPON_OPTIONS = [
  ['pistol', 'Pistol'],
  ['rifle', 'Rifle'],
  ['shotgun', 'Shotgun'],
  ['sniperRifle', 'Sniper Rifle'],
  ['grenades', 'Grenades'],
  ['rocketLauncher', 'Rocket Launcher'],
];

const NPC_WEAPON_OPTIONS = PLAYER_WEAPON_OPTIONS;

const RETICLE_TYPE_OPTIONS = [
  ["dot", "Dot"],
  ["cross", "Crosshair"],
  ["ring", "Ring"],
  ["crossDot", "Cross + Dot"],
  ["triSpoke", "Tri-Spoke"],
  ["rl2", "RL 2"],
  ["rocket_launcher", "Rocket Launcher"],
  ["shotgun", "Shotgun"],
  ["tr1", "TR 1"],
  ["tr2", "TR 2"],
  ["tr3", "TR 3"],
  ["tr4", "TR 4"],
  ["tr5", "TR 5"],
  ["tr6", "TR 6"],
  ["tr7", "TR 7"],
  ["tr8", "TR 8"],
  ["tr9", "TR 9"],
  ["tr10", "TR 10"],
  ["tr11", "TR 11"],
  ["tr12", "TR 12"],
  ["tr13", "TR 13"],
  ["tr14", "TR 14"],
  ["tr15", "TR 15"],
  ["tr16", "TR 16"],
  ["tr17", "TR 17"],
  ["tr18", "TR 18"],
  ["tr19", "TR 19"],
  ["tr20", "TR 20"],
  ["tr21", "TR 21"],
  ["tr22", "TR 22"],
  ["tr23", "TR 23"],
  ["tr24", "TR 24"],
  ["tr25", "TR 25"],
  ["tr26", "TR 26"],
  ["tr27", "TR 27"],
  ["tr28", "TR 28"],
  ["tr29", "TR 29"],
  ["tr30", "TR 30"],
  ["tr31", "TR 31"],
  ["tr32", "TR 32"],
  ["tr33", "TR 33"],
  ["tr34", "TR 34"],
  ["tr35", "TR 35"],
  ["tr36", "TR 36"],
  ["tr37", "TR 37"],
  ["tr38", "TR 38"],
  ["tr39", "TR 39"],
  ["tr40", "TR 40"],
  ["tr41", "TR 41"],
  ["tr42", "TR 42"],
  ["tr43", "TR 43"],
  ["tr44", "TR 44"],
  ["tr45", "TR 45"],
  ["tr46", "TR 46"],
  ["tr47", "TR 47"],
  ["tr48", "TR 48"],
  ["tr49", "TR 49"],
];

const WEAPON_CONTROL_SPECS = [
  { type: 'pistol', label: 'Pistol', prefix: 'Pistol', reticleDefault: 'dot' },
  { type: 'rifle', label: 'Rifle', prefix: 'Rifle', reticleDefault: 'triSpoke' },
  { type: 'shotgun', label: 'Shotgun', prefix: 'Shotgun', reticleDefault: 'crossDot', extra: 'pellets' },
  { type: 'sniperRifle', label: 'Sniper Rifle', prefix: 'Sniper', reticleDefault: 'cross' },
  { type: 'grenades', label: 'Grenades', prefix: 'Grenade', reticleDefault: 'ring', radius: true },
  { type: 'rocketLauncher', label: 'Rocket Launcher', prefix: 'Rocket', reticleDefault: 'ring', radius: true },
];

function weaponSpecForType(type) {
  return WEAPON_CONTROL_SPECS.find(spec => spec.type === type) || WEAPON_CONTROL_SPECS[1];
}

function weaponKey(prefix, field) {
  return `weapon${prefix}${field}`;
}

function weaponMagazineKey(spec) {
  if (spec.type === 'grenades') return null;
  if (spec.type === 'rocketLauncher') return 'weaponRocketClipCapacity';
  return weaponKey(spec.prefix, 'MagazineSize');
}

function weaponTotalAmmoKey(spec) {
  return weaponKey(spec.prefix, 'TotalAmmo');
}

function weaponReloadKey(spec) {
  if (spec.type === 'grenades') return null;
  return weaponKey(spec.prefix, 'ReloadTime');
}

function weaponRecoilKey(spec) {
  if (spec.type === 'grenades') return null;
  return weaponKey(spec.prefix, 'Recoil');
}

function weaponOffsetXKey(spec) {
  return weaponKey(spec.prefix, 'OffsetX');
}

function weaponOffsetYKey(spec) {
  return weaponKey(spec.prefix, 'OffsetY');
}

function weaponAmmoDefaults(spec) {
  switch (spec.type) {
    case 'pistol': return { magazine: 12, total: 60, reloadTime: 1.0 };
    case 'rifle': return { magazine: 30, total: 180, reloadTime: 1.25 };
    case 'shotgun': return { magazine: 8, total: 40, reloadTime: 1.6 };
    case 'sniperRifle': return { magazine: 5, total: 25, reloadTime: 2.0 };
    case 'grenades': return { magazine: 0, total: 10, reloadTime: 0 };
    case 'rocketLauncher': return { magazine: 1, total: 8, reloadTime: 2.4 };
    default: return { magazine: 30, total: 180, reloadTime: 1.25 };
  }
}

function resetWeaponAmmoForSpec(spec) {
  resetWeaponAmmo(spec.type);
  syncWeaponAmmoHud();
}

function weaponReticleKey(spec) {
  return weaponKey(spec.prefix, 'ReticleType');
}

function weaponReticleSizeKey(spec) {
  return weaponKey(spec.prefix, 'ReticleSize');
}

function weaponReticleWeightKey(spec) {
  return weaponKey(spec.prefix, 'ReticleWeight');
}

function weaponReticleOpacityKey(spec) {
  return weaponKey(spec.prefix, 'ReticleOpacity');
}


const ENEMY_JSON_KEYS = [
  'enemyType',
  'enemyCount',
  'enemyHealth',
  'enemyInvincible',
  'enemyBehavior',
  'enemyMoveSpeed',
  'enemyDamage',
  'enemyPlacement',
  'enemyWeaponType',
  'enemyAwarenessRange',
  'enemyAwarenessVisible',
  'enemyAwarenessColor',
  'enemyAwarenessOutlineColor',
  'enemyAwarenessOpacity',
  'enemyAwarenessFillTransparent',
  'enemyAccuracy',
];

const ALLY_JSON_KEYS = [
  'allyType',
  'allyCount',
  'allyHealth',
  'allyInvincible',
  'allyFriendlyFire',
  'allyBehavior',
  'allyMoveSpeed',
  'allyDamage',
  'allyPlacement',
  'allyWeaponType',
  'allyAwarenessRange',
  'allyAwarenessVisible',
  'allyAwarenessColor',
  'allyAwarenessOutlineColor',
  'allyAwarenessOpacity',
  'allyAwarenessFillTransparent',
  'allyAccuracy',
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



function collectSubsectionParamKeys(container) {
  return [...new Set(Array.from(container.querySelectorAll('[data-param-key]'))
    .map(el => el.dataset.paramKey)
    .filter(key => key && Object.prototype.hasOwnProperty.call(defaultParams, key)))];
}

function syncSubsectionControls(container, keys) {
  const keySet = new Set(keys);
  container.querySelectorAll('[data-param-key]').forEach(control => {
    const key = control.dataset.paramKey;
    if (!keySet.has(key)) return;
    const value = state.params[key];
    if (control.type === 'checkbox') {
      control.checked = !!value;
    } else if (control.type === 'range') {
      control.value = value;
    } else if (control.type === 'number') {
      const step = Number(control.step);
      const decimals = Number.isFinite(step) && step > 0 && !Number.isInteger(step)
        ? String(control.step).split('.')[1]?.length || 0
        : 0;
      control.value = Number(value).toFixed(decimals);
    } else if (control.type === 'color') {
      control.value = value;
    } else {
      control.value = String(value ?? '');
    }
  });
}

function resetSubsectionParams(container, title = 'Subsection') {
  const keys = collectSubsectionParamKeys(container);
  if (!keys.length) return;
  keys.forEach(key => {
    state.params[key] = JSON.parse(JSON.stringify(defaultParams[key]));
  });
  syncSubsectionControls(container, keys);
  applyAllParams();
  notify(`${title} reset ✓`);
}

function createSubsectionUndoButton(container, title) {
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'sb-subsection-undo';
  undo.title = `Reset ${title}`;
  undo.setAttribute('aria-label', `Reset ${title}`);
  undo.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    resetSubsectionParams(container, title);
  });
  return undo;
}

function collapseDirectSubheaders(container) {
  let child = container?.firstElementChild || null;
  while (child) {
    if (!child.classList?.contains('sb-subhdr')) {
      child = child.nextElementSibling;
      continue;
    }

    const title = child.textContent || 'Section';
    const wrap = document.createElement('div');
    wrap.className = 'sb-subsection';

    const hdr = document.createElement('button');
    hdr.type = 'button';
    hdr.className = 'sb-subsection-hdr';
    hdr.innerHTML = `<span>${title}</span><span class="arrow">▾</span>`;

    const subBody = document.createElement('div');
    subBody.className = 'sb-subsection-body';

    const nextHeader = child.nextElementSibling;
    container.insertBefore(wrap, child);
    child.remove();

    let moving = nextHeader;
    while (moving && !moving.classList?.contains('sb-subhdr')) {
      const next = moving.nextElementSibling;
      subBody.appendChild(moving);
      moving = next;
    }

    hdr.addEventListener('click', () => {
      const open = subBody.classList.toggle('open');
      hdr.querySelector('.arrow').textContent = open ? '▴' : '▾';
    });

    wrap.appendChild(hdr);
    wrap.appendChild(createSubsectionUndoButton(subBody, title));
    wrap.appendChild(subBody);
    child = moving;
  }
}

function makeSubheadersCollapsible(root) {
  const containers = [root, ...root.querySelectorAll('div')].reverse();
  containers.forEach(collapseDirectSubheaders);
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
      wrap.classList.add('open');
      hdr.querySelector('.arrow').textContent = '▴';
      return;
    }

    const open = body.classList.toggle('open'); // display: block when open
    wrap.classList.toggle('open', open);
    hdr.querySelector('.arrow').textContent = open ? '▴' : '▾';
  });

  wrap.appendChild(hdr);
  wrap.appendChild(body);

  try {
    buildFn(body);
    makeSubheadersCollapsible(body);
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
  inp.dataset.paramKey = key;
  inp.min = min; inp.max = max; inp.step = step;
  inp.value = state.params[key];

  const num = document.createElement('input');
  num.type = 'number';
  num.className = 'sb-number';
  num.dataset.paramKey = key;
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
  // Number input: update slider position on every keystroke for visual feedback,
  // but only write to state.params on change/blur so the user can type freely.
  num.addEventListener('input', () => {
    const v = parseFloat(num.value);
    if (Number.isFinite(v)) inp.value = v; // move slider thumb live
  });
  num.addEventListener('change', () => commit(parseFloat(num.value), { clampValue: true }));
  num.addEventListener('blur',   () => commit(parseFloat(num.value), { clampValue: true }));

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
  swatch.dataset.paramKey = key;
  swatch.value = state.params[key];

  const hexInp = document.createElement('input');
  hexInp.type = 'text';
  hexInp.className = 'sb-hex';
  hexInp.dataset.paramKey = key;
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
  inp.dataset.paramKey = key;
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
  sel.dataset.paramKey = key;
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

  thirdGroup.appendChild(subhdr('Aim (ADS)'));
  thirdGroup.appendChild(toggle('ADS Enabled', 'aimEnabled'));
  thirdGroup.appendChild(slider({ key: 'aimFovDelta',  label: 'FOV Zoom',      min: -40, max: 0,   step: 1,    dec: 0 }));
  thirdGroup.appendChild(slider({ key: 'aimDistDelta', label: 'Dist. Pull-in', min: -6,  max: 0,   step: 0.25, dec: 2 }));
  thirdGroup.appendChild(slider({ key: 'aimSpeedMult', label: 'Speed Mult.',   min: 0.1, max: 1,   step: 0.05, dec: 2 }));
  thirdGroup.appendChild(slider({ key: 'aimSmooth',    label: 'Zoom Smooth',   min: 1,   max: 30,  step: 0.5,  dec: 1 }));

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

  const shakeGroup = document.createElement('div');
  shakeGroup.appendChild(subhdr('Camera Shake'));
  shakeGroup.appendChild(toggle('Shake Enabled', 'cameraShakeEnabled'));
  shakeGroup.appendChild(slider({ key: 'cameraShakeIntensity', label: 'Intensity', min: 0, max: 1.5, step: 0.01, dec: 2 }));
  shakeGroup.appendChild(slider({ key: 'cameraShakeDuration', label: 'Duration', min: 0.05, max: 2, step: 0.05, dec: 2 }));
  shakeGroup.appendChild(slider({ key: 'cameraShakeFrequency', label: 'Frequency', min: 1, max: 80, step: 1, dec: 0 }));
  shakeGroup.appendChild(toggle('Proximity Falloff', 'cameraShakeProximity'));
  shakeGroup.appendChild(slider({ key: 'cameraShakeRadius', label: 'Shake Radius', min: 1, max: 80, step: 1, dec: 0 }));
  shakeGroup.appendChild(slider({ key: 'cameraShakeMinFactor', label: 'Min Strength', min: 0, max: 1, step: 0.01, dec: 2 }));

  syncCameraGroups(state.params.cameraMode);
  body.appendChild(thirdGroup);
  body.appendChild(shakeGroup);
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
  body.appendChild(slider({ key: 'shieldLineBloom', label: 'Line Bloom', min: 0, max: 2, step: 0.05, dec: 2, onChange: () => applyShieldSettings() }));
  body.appendChild(slider({
    key: 'shieldOpacity', label: 'Opacity', min: 0.05, max: 0.75, step: 0.01, dec: 2,
    onChange: () => applyShieldSettings(),
  }));
  body.appendChild(toggle('Glow', 'shieldGlow', () => applyShieldSettings()));
  body.appendChild(slider({ key: 'shieldBloomIntensity', label: 'Bloom Intensity', min: 0, max: 1, step: 0.01, dec: 2, onChange: () => applyShieldSettings() }));
  body.appendChild(slider({ key: 'shieldFresnelPower', label: 'Rim Power', min: 0.5, max: 8, step: 0.1, dec: 1, onChange: () => applyShieldSettings() }));
  body.appendChild(slider({ key: 'shieldBloomRadius', label: 'Bloom Radius', min: 1.0, max: 3.0, step: 0.01, dec: 2, onChange: () => applyShieldSettings() }));
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

  body.appendChild(subhdr('Bloom'));
  body.appendChild(slider({
    key: 'overallBloomIntensity', label: 'Overall Bloom', min: 0, max: 4, step: 0.05, dec: 2,
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
  body.appendChild(colorPicker('Floor Color', 'floorColor', v => { setFloorColor(v); applyFloorSettings(); }));
  body.appendChild(colorPicker('Grid Color',  'gridColor',  v => { setGridColor(v); applyFloorSettings(); }));
  body.appendChild(toggle('Show Floor', 'showFloor', v => { setFloorVisible(v); applyFloorSettings(); }));
  body.appendChild(toggle('Show Grid',  'showGrid',  v => { setGridVisible(v); applyFloorSettings(); }));

  body.appendChild(subhdr('Build Area'));
  body.appendChild(select('Floor Mode', 'floorMode', [
    ['dynamic', 'Dynamic Follow Player'],
    ['fixed', 'Fixed Build Area'],
    ['hybrid', 'Hybrid'],
  ], () => applyFloorSettings({ force: true })));
  body.appendChild(toggle('Build Area Enabled', 'buildAreaEnabled', () => applyFloorSettings({ force: true })));
  body.appendChild(slider({ key: 'buildAreaCenterX', label: 'Center X', min: -1000, max: 1000, step: 1, dec: 0, onChange: () => applyFloorSettings({ force: true }) }));
  body.appendChild(slider({ key: 'buildAreaCenterZ', label: 'Center Z', min: -1000, max: 1000, step: 1, dec: 0, onChange: () => applyFloorSettings({ force: true }) }));
  body.appendChild(slider({ key: 'buildAreaWidth', label: 'Width', min: 20, max: 1000, step: 1, dec: 0, onChange: () => applyFloorSettings({ force: true }) }));
  body.appendChild(slider({ key: 'buildAreaDepth', label: 'Depth', min: 20, max: 1000, step: 1, dec: 0, onChange: () => applyFloorSettings({ force: true }) }));
  body.appendChild(toggle('Auto-expand To Objects', 'buildAreaAutoExpand', () => applyFloorSettings({ force: true })));
  body.appendChild(slider({ key: 'buildAreaAutoExpandMargin', label: 'Expand Margin', min: 0, max: 50, step: 1, dec: 0, onChange: () => applyFloorSettings({ force: true }) }));
  body.appendChild(btn('Fit Build Area To Objects', 'sb-btn-muted', () => {
    const changed = fitBuildAreaToPlacedObjects();
    applyAllParams();
    rebuildPanel();
    notify(changed ? 'Build area fitted to placed objects ✓' : 'No placed objects to fit');
  }));

  body.appendChild(subhdr('Boundaries'));
  body.appendChild(toggle('Boundary Visible', 'buildAreaBoundaryVisible', () => applyFloorSettings({ force: true })));
  body.appendChild(colorPicker('Boundary Color', 'buildAreaBoundaryColor', () => applyFloorSettings({ force: true })));
  body.appendChild(toggle('Boundary Walls', 'buildAreaBoundaryWalls', () => applyFloorSettings({ force: true })));
  body.appendChild(slider({ key: 'buildAreaBoundaryHeight', label: 'Wall Height', min: 0.25, max: 12, step: 0.25, dec: 2, onChange: () => applyFloorSettings({ force: true }) }));
  body.appendChild(slider({ key: 'buildAreaBoundaryOpacity', label: 'Wall Opacity', min: 0, max: 1, step: 0.05, dec: 2, onChange: () => applyFloorSettings({ force: true }) }));
  body.appendChild(toggle('Boundary Collision', 'buildAreaBoundaryCollision', () => applyFloorSettings({ force: true })));

  body.appendChild(subhdr('Debug'));
  body.appendChild(toggle('Show FPS', 'showFps', () => applyHudSettings()));
}


function buildHUD(body) {
  body.appendChild(toggle('HUD Enabled', 'hudVisible', () => applyHudSettings()));
  body.appendChild(select('Font', 'hudFont', HUD_FONT_OPTIONS, () => applyHudSettings()));
  body.appendChild(toggle('Enemy Health Bars', 'hudEnemyHealthBars', () => applyHudSettings()));
  body.appendChild(toggle('Ally Health Bars', 'hudAllyHealthBars', () => applyHudSettings()));
  body.appendChild(slider({ key: 'hudNpcHealthBarRange', label: 'Health Bar Range', min: 0, max: 200, step: 1, dec: 0, onChange: () => applyHudSettings() }));
  body.appendChild(toggle('Bullet Time Indicator', 'hudBulletTimeIndicator', () => applyHudSettings()));
  body.appendChild(slider({ key: 'hudBulletTimeIndicatorSize', label: 'BT Icon Size', min: 8, max: 64, step: 1, dec: 0, onChange: () => applyHudSettings() }));
  body.appendChild(slider({ key: 'hudBulletTimeReadyOpacity', label: 'BT Ready Opacity', min: 0, max: 1, step: 0.05, dec: 2, onChange: () => applyHudSettings() }));
  body.appendChild(slider({ key: 'hudBulletTimeEmptyOpacity', label: 'BT Empty Opacity', min: 0, max: 1, step: 0.05, dec: 2, onChange: () => applyHudSettings() }));
  body.appendChild(toggle('BT Active Icon', 'hudBulletTimeActiveIcon', () => applyHudSettings()));
  body.appendChild(slider({ key: 'hudBulletTimeActiveIconSize', label: 'BT Active Size', min: 12, max: 128, step: 1, dec: 0, onChange: () => applyHudSettings() }));
  body.appendChild(slider({ key: 'hudBulletTimeActiveIconOpacity', label: 'BT Active Opacity', min: 0, max: 1, step: 0.05, dec: 2, onChange: () => applyHudSettings() }));

  body.appendChild(subhdr('Enemy Tag'));
  body.appendChild(toggle('Tag Enabled', 'tagEnabled', () => applyTagSettings()));
  body.appendChild(colorPicker('Tag Color', 'tagColor', () => applyTagSettings()));
  body.appendChild(slider({ key: 'tagSize', label: 'Tag Size', min: 8, max: 48, step: 1, dec: 0, onChange: () => applyTagSettings() }));
  body.appendChild(slider({ key: 'tagDwellTime', label: 'Dwell Time (s)', min: 0.1, max: 5, step: 0.1, dec: 1 }));
  body.appendChild(slider({ key: 'tagThickness', label: 'Thickness', min: 0, max: 12, step: 0.5, dec: 1, onChange: () => applyTagSettings() }));
  body.appendChild(slider({ key: 'tagBloom', label: 'Bloom', min: 0, max: 20, step: 0.5, dec: 1, onChange: () => applyTagSettings() }));
  body.appendChild(slider({ key: 'tagShadow', label: 'Shadow', min: 0, max: 30, step: 0.5, dec: 1, onChange: () => applyTagSettings() }));
  body.appendChild(slider({ key: 'tagHeight', label: 'Height Offset', min: 0, max: 500, step: 1, dec: 0, onChange: () => applyTagSettings() }));

  body.appendChild(subhdr('Radar'));
  body.appendChild(toggle('Radar Enabled', 'radarEnabled'));
  body.appendChild(slider({ key: 'radarRadius', label: 'Radar Radius', min: 20, max: 150, step: 1, dec: 0 }));
  body.appendChild(slider({ key: 'radarRange', label: 'World Range', min: 10, max: 200, step: 1, dec: 0 }));
  body.appendChild(colorPicker('Radar BG', 'radarBgColor'));
  body.appendChild(colorPicker('Enemy Dot', 'radarEnemyColor'));
  body.appendChild(colorPicker('Tagged Icon', 'radarTaggedColor'));
  body.appendChild(slider({ key: 'radarOpacity', label: 'Opacity', min: 0, max: 1, step: 0.05, dec: 2 }));
}

function pickParamSubset(keys) {
  return keys.reduce((out, key) => {
    out[key] = state.params[key];
    return out;
  }, {});
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

function importJsonFileForKeys(keys, onDone) {
  const allowed = new Set(keys);
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
  inp.addEventListener('change', () => {
    if (!inp.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        const next = {};
        Object.keys(parsed || {}).forEach(key => {
          if (allowed.has(key)) next[key] = parsed[key];
        });
        Object.assign(state.params, next);
        state.activePreset = 'custom';
        applyAllParams();
        rebuildPanel();
        onDone?.();
      } catch {
        notify('⚠ Invalid JSON');
      }
    };
    reader.readAsText(inp.files[0]);
  });
  inp.click();
}

function buildScopedJsonControls(body, label, keys, filename) {
  const wrap = document.createElement('div');
  wrap.className = 'sb-export-row sb-section-json-row';
  wrap.appendChild(btn(`⬇ Export ${label} JSON`, 'sb-btn-accent', () => {
    downloadJsonFile(filename, pickParamSubset(keys));
  }));
  wrap.appendChild(btn(`⬆ Import ${label} JSON`, '', () => {
    importJsonFileForKeys(keys, () => notify(`${label} JSON imported ✓`));
  }));
  body.appendChild(wrap);
}

function buildEnemies(body) {
  buildScopedJsonControls(body, 'Enemies', ENEMY_JSON_KEYS, 'enemies.json');
  body.appendChild(select('Enemy Type', 'enemyType', ENEMY_TYPE_OPTIONS));
  body.appendChild(slider({ key: 'enemyCount', label: 'Number of Enemies', min: 0, max: 50, step: 1, dec: 0 }));
  body.appendChild(slider({ key: 'enemyHealth', label: 'Health Amount', min: 1, max: 1000, step: 1, dec: 0 }));
  body.appendChild(toggle('Enemy Invincible', 'enemyInvincible'));
  body.appendChild(select('Behavior', 'enemyBehavior', ENEMY_BEHAVIOR_OPTIONS));
  body.appendChild(slider({ key: 'enemyMoveSpeed', label: 'Movement Speed', min: 0, max: 12, step: 0.1, dec: 1 }));
  body.appendChild(slider({ key: 'enemyDamage', label: 'Damage Amount', min: 0, max: 250, step: 1, dec: 0 }));
  body.appendChild(slider({ key: 'enemyAccuracy', label: 'Accuracy', min: 0, max: 100, step: 1, dec: 0 }));
  body.appendChild(select('Placement', 'enemyPlacement', ENEMY_PLACEMENT_OPTIONS));
  body.appendChild(select('Weapon Type', 'enemyWeaponType', NPC_WEAPON_OPTIONS));
  body.appendChild(subhdr('Enemy Awareness Range'));
  body.appendChild(slider({ key: 'enemyAwarenessRange', label: 'Enemy Awareness Range', min: 1, max: 200, step: 1, dec: 0 }));
  body.appendChild(toggle('Show Enemy Awareness', 'enemyAwarenessVisible'));
  body.appendChild(colorPicker('Enemy Awareness Color', 'enemyAwarenessColor'));
  body.appendChild(toggle('Transparent Enemy Awareness Fill', 'enemyAwarenessFillTransparent'));
  body.appendChild(colorPicker('Enemy Awareness Outline Color', 'enemyAwarenessOutlineColor'));
  body.appendChild(slider({ key: 'enemyAwarenessOpacity', label: 'Enemy Awareness Opacity', min: 0, max: 1, step: 0.01, dec: 2 }));

  body.appendChild(btn('Spawn / Apply Enemies', 'sb-btn-accent', () => {
    const count = spawnEnemiesFromSettings();
    notify(`${count} enemies spawned ✓`);
  }));
  body.appendChild(btn('Clear Enemies', 'sb-btn-muted', () => {
    clearEnemies();
    notify('Enemies cleared ✓');
  }));
}

const DESTRUCTION_CONTROL_GROUPS = [
  ['Enemies', 'destructionEnemies', true],
  ['Allies', 'destructionAllies', true],
  ['Destructible Assets', 'destructionDestructible', false],
];

function buildDestructionGroup(body, label, prefix, includeDespawn) {
  body.appendChild(subhdr(label));
  body.appendChild(slider({ key: `${prefix}ParticleCount`, label: 'Particle Count', min: 0, max: 250, step: 1, dec: 0 }));
  body.appendChild(slider({ key: `${prefix}ParticleSize`, label: 'Particle Size', min: 0.05, max: 2, step: 0.05, dec: 2 }));
  body.appendChild(slider({ key: `${prefix}ParticleSpeed`, label: 'Particle Speed', min: 0.1, max: 8, step: 0.05, dec: 2 }));
  body.appendChild(slider({ key: `${prefix}ParticleGlow`, label: 'Particle Glow', min: 0, max: 24, step: 0.5, dec: 1 }));
  body.appendChild(slider({ key: `${prefix}ParticleDespawnTime`, label: 'Particle Despawn Time', min: 0.1, max: 10, step: 0.1, dec: 1 }));
  body.appendChild(colorPicker('Color', `${prefix}Color`));
  body.appendChild(select('Physics', `${prefix}Physics`, [
    ['gravity', 'Gravity'],
    ['ethereal', 'Ethereal'],
  ]));

  if (prefix === 'destructionDestructible') {
    const shockwaveGroup = document.createElement('div');
    shockwaveGroup.appendChild(subhdr('Shockwave'));
    shockwaveGroup.appendChild(slider({ key: `${prefix}ShockwaveSpeed`, label: 'Speed', min: 0, max: 40, step: 0.5, dec: 1 }));
    shockwaveGroup.appendChild(colorPicker('Color', `${prefix}ShockwaveColor`));
    shockwaveGroup.appendChild(slider({ key: `${prefix}ShockwaveTransparency`, label: 'Transparency', min: 0, max: 1, step: 0.01, dec: 2 }));
    shockwaveGroup.appendChild(slider({ key: `${prefix}ShockwaveFadeTime`, label: 'Fade Time', min: 0.05, max: 3, step: 0.05, dec: 2 }));
    shockwaveGroup.appendChild(slider({ key: `${prefix}ShockwaveDelay`, label: 'Delay', min: 0, max: 3, step: 0.05, dec: 2 }));
    shockwaveGroup.appendChild(slider({ key: `${prefix}SplashDamage`, label: 'Splash Damage', min: 0, max: 500, step: 1, dec: 0 }));
    shockwaveGroup.appendChild(slider({ key: `${prefix}SplashRadius`, label: 'Splash Radius', min: 0, max: 80, step: 0.5, dec: 1 }));
    shockwaveGroup.appendChild(slider({ key: `${prefix}SplashFalloff`, label: 'Damage Falloff', min: 0.1, max: 4, step: 0.1, dec: 1 }));
    shockwaveGroup.appendChild(slider({ key: `${prefix}SplashMinFactor`, label: 'Min Damage', min: 0, max: 1, step: 0.01, dec: 2 }));
    body.appendChild(shockwaveGroup);
  }

  if (includeDespawn) {
    body.appendChild(slider({ key: `${prefix}DespawnTime`, label: 'Despawn Time', min: 0.1, max: 10, step: 0.1, dec: 1 }));
    body.appendChild(slider({ key: `${prefix}CorpseFadeTime`, label: 'Corpse Fade Time', min: 0.1, max: 10, step: 0.1, dec: 1 }));
  }
}

function buildDestruction(body) {
  body.appendChild(toggle('Destruction FX', 'enemyDestructionEnabled'));
  DESTRUCTION_CONTROL_GROUPS.forEach(([label, prefix, includeDespawn]) => {
    buildDestructionGroup(body, label, prefix, includeDespawn);
  });
}

function buildAbilities(body) {
  body.appendChild(subhdr('Bullet Time'));
  body.appendChild(toggle('Bullet Time Enabled', 'bulletTimeEnabled'));
  body.appendChild(slider({ key: 'bulletTimeDuration', label: 'Duration', min: 0.1, max: 30, step: 0.1, dec: 1 }));
  body.appendChild(slider({ key: 'bulletTimeCooldown', label: 'Cooldown', min: 0, max: 120, step: 0.5, dec: 1 }));
  body.appendChild(slider({ key: 'bulletTimeScale', label: 'World Scale', min: 0.05, max: 1, step: 0.05, dec: 2 }));

  body.appendChild(subhdr('Movement'));
  body.appendChild(toggle('Double Jump', 'doubleJumpEnabled'));
}

function createManualSubsection(title, buildFn, open = false) {
  const wrap = document.createElement('div');
  wrap.className = 'sb-subsection';

  const hdr = document.createElement('button');
  hdr.type = 'button';
  hdr.className = 'sb-subsection-hdr';
  hdr.innerHTML = `<span>${title}</span><span class="arrow">${open ? '▴' : '▾'}</span>`;

  const subBody = document.createElement('div');
  subBody.className = 'sb-subsection-body';
  subBody.classList.toggle('open', open);

  hdr.addEventListener('click', () => {
    const isOpen = subBody.classList.toggle('open');
    hdr.querySelector('.arrow').textContent = isOpen ? '▴' : '▾';
  });

  wrap.appendChild(hdr);
  wrap.appendChild(createSubsectionUndoButton(subBody, title));
  wrap.appendChild(subBody);
  buildFn(subBody);
  return wrap;
}

function getReticleLabel(type) {
  return RETICLE_TYPE_OPTIONS.find(([key]) => key === type)?.[1] || 'Dot';
}

function syncReticleToCurrentWeapon() {
  const spec = weaponSpecForType(state.params.playerWeaponType);
  const key = weaponReticleKey(spec);
  const reticleType = RETICLE_MARKUP[state.params[key]] ? state.params[key] : spec.reticleDefault;
  state.params[key] = reticleType;
  state.params.reticleType = reticleType;

  const sizeKey = weaponReticleSizeKey(spec);
  const weightKey = weaponReticleWeightKey(spec);
  const opacityKey = weaponReticleOpacityKey(spec);
  const size = Number(state.params[sizeKey]);
  const weight = Number(state.params[weightKey]);
  const opacity = Number(state.params[opacityKey]);
  state.params.reticleSize = Number.isFinite(size) ? size : 24;
  state.params.reticleThickness = Number.isFinite(weight) ? weight : 2;
  state.params.reticleWeight = Number.isFinite(weight) ? weight : 2;
  state.params.reticleOpacity = Number.isFinite(opacity) ? Math.min(1, Math.max(0.05, opacity)) : 1;
  return reticleType;
}

function makeReticlePreview(type) {
  const preview = document.createElement('span');
  preview.className = 'reticle-picker-preview';
  preview.dataset.reticleType = type;
  preview.innerHTML = RETICLE_MARKUP[type] || RETICLE_MARKUP.dot;
  return preview;
}

function openWeaponReticleModal(spec, triggerButton = null) {
  const modal = document.createElement('div');
  modal.className = 'weapon-reticle-modal';

  const card = document.createElement('div');
  card.className = 'weapon-reticle-card';

  const header = document.createElement('div');
  header.className = 'weapon-reticle-header';
  const title = document.createElement('div');
  title.textContent = `${spec.label} Reticle`;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'weapon-reticle-close';
  close.textContent = '×';
  header.appendChild(title);
  header.appendChild(close);
  card.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'weapon-reticle-grid';
  const key = weaponReticleKey(spec);
  const current = RETICLE_MARKUP[state.params[key]] ? state.params[key] : spec.reticleDefault;

  RETICLE_TYPE_OPTIONS.forEach(([type, label]) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'weapon-reticle-option';
    option.classList.toggle('selected', type === current);
    option.appendChild(makeReticlePreview(type));
    const text = document.createElement('span');
    text.textContent = label;
    option.appendChild(text);
    option.addEventListener('click', () => {
      state.params[key] = type;
      if (state.params.playerWeaponType === spec.type) {
        syncReticleToCurrentWeapon();
        applyReticleSettings();
      }
      if (triggerButton) triggerButton.textContent = getReticleLabel(type);
      document.body.removeChild(modal);
    });
    grid.appendChild(option);
  });

  card.appendChild(grid);
  modal.appendChild(card);
  const closeModal = () => { if (modal.parentNode) document.body.removeChild(modal); };
  close.addEventListener('click', closeModal);
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  document.body.appendChild(modal);
}

function reticlePickerRow(spec) {
  const key = weaponReticleKey(spec);
  if (!RETICLE_MARKUP[state.params[key]]) state.params[key] = spec.reticleDefault;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sb-btn sb-reticle-picker-btn';
  button.dataset.paramKey = key;
  button.textContent = getReticleLabel(state.params[key]);
  button.addEventListener('click', () => openWeaponReticleModal(spec, button));
  return row('Reticle', button);
}

function buildWeaponControls(body, spec) {
  const prefix = spec.prefix;
  const syncActiveReticle = () => {
    if (state.params.playerWeaponType === spec.type) {
      syncReticleToCurrentWeapon();
      applyReticleSettings();
    }
  };
  const magKey = weaponMagazineKey(spec);
  if (magKey) {
    body.appendChild(slider({
      key: magKey,
      label: spec.type === 'rocketLauncher' ? 'Clip Capacity' : 'Magazine Amount',
      min: 1, max: 999, step: 1, dec: 0,
      onChange: () => resetWeaponAmmoForSpec(spec),
    }));
  }
  body.appendChild(slider({
    key: weaponTotalAmmoKey(spec),
    label: 'Total Ammo',
    min: 0, max: 9999, step: 1, dec: 0,
    onChange: () => resetWeaponAmmoForSpec(spec),
  }));
  const reloadKey = weaponReloadKey(spec);
  if (reloadKey) {
    body.appendChild(slider({ key: reloadKey, label: 'Reload Time', min: 0, max: 10, step: 0.1, dec: 1 }));
  }
  body.appendChild(slider({ key: weaponOffsetXKey(spec), label: 'Offset X', min: -2, max: 2, step: 0.01, dec: 2, onChange: () => applyPlayerWeaponSettings() }));
  body.appendChild(slider({ key: weaponOffsetYKey(spec), label: 'Offset Y', min: -2, max: 2, step: 0.01, dec: 2, onChange: () => applyPlayerWeaponSettings() }));
  const recoilKey = weaponRecoilKey(spec);
  if (recoilKey) {
    body.appendChild(slider({ key: recoilKey, label: 'Recoil', min: 0, max: 1, step: 0.01, dec: 2 }));
  }
  body.appendChild(slider({ key: weaponKey(prefix, 'Damage'), label: 'Damage', min: 0, max: 1000, step: 1, dec: 0 }));
  body.appendChild(slider({ key: weaponKey(prefix, 'Range'), label: 'Range', min: 1, max: 500, step: 1, dec: 0 }));
  body.appendChild(slider({ key: weaponKey(prefix, 'Spread'), label: 'Spread', min: 0, max: 1, step: 0.001, dec: 3 }));
  body.appendChild(slider({ key: weaponKey(prefix, 'FireRate'), label: 'Fire Rate', min: 0.1, max: 30, step: 0.1, dec: 1 }));
  if (spec.extra === 'pellets') {
    body.appendChild(slider({ key: 'weaponShotgunPellets', label: 'Pellets', min: 1, max: 24, step: 1, dec: 0 }));
  }
  if (spec.radius) {
    body.appendChild(slider({ key: weaponKey(prefix, 'Radius'), label: 'Radius', min: 0.5, max: 60, step: 0.5, dec: 1 }));
  }
  body.appendChild(reticlePickerRow(spec));
  body.appendChild(slider({ key: weaponReticleSizeKey(spec), label: 'Reticle Size', min: 4, max: 96, step: 1, dec: 0, onChange: syncActiveReticle }));
  body.appendChild(slider({ key: weaponReticleWeightKey(spec), label: 'Reticle Weight', min: 0.5, max: 12, step: 0.1, dec: 1, onChange: syncActiveReticle }));
  body.appendChild(slider({ key: weaponReticleOpacityKey(spec), label: 'Reticle Opacity', min: 0.05, max: 1, step: 0.05, dec: 2, onChange: syncActiveReticle }));
  body.appendChild(slider({ key: weaponKey(prefix, 'ProjectileSpeed'), label: 'Projectile Speed', min: 1, max: 500, step: 1, dec: 0 }));
  if (spec.type === 'rifle') body.appendChild(toggle('Tracers', 'weaponRifleTracers'));
  body.appendChild(slider({ key: weaponKey(prefix, 'ProjectileSize'), label: 'Projectile Size', min: 0.05, max: 2, step: 0.01, dec: 2 }));
  body.appendChild(slider({ key: weaponKey(prefix, 'ProjectileLength'), label: 'Projectile Length', min: 0.05, max: 8, step: 0.01, dec: 2 }));
  body.appendChild(colorPicker('Projectile Color', weaponKey(prefix, 'ProjectileColor')));
  body.appendChild(toggle('Projectile Bloom', weaponKey(prefix, 'ProjectileBloom')));
  body.appendChild(colorPicker('Bloom Color', weaponKey(prefix, 'ProjectileBloomColor')));
  body.appendChild(slider({ key: weaponKey(prefix, 'ProjectileBloomIntensity'), label: 'Bloom Intensity', min: 0, max: 3, step: 0.05, dec: 2 }));
  body.appendChild(slider({ key: weaponKey(prefix, 'ProjectileBloomSize'), label: 'Bloom Size', min: 0.25, max: 4, step: 0.05, dec: 2 }));
  if (spec.type === 'grenades' || spec.type === 'rocketLauncher') {
    const shockPrefix = spec.type === 'rocketLauncher' ? 'weaponRocketShockwave' : 'weaponGrenadeShockwave';
    body.appendChild(subhdr('Shockwave'));
    body.appendChild(slider({ key: `${shockPrefix}Speed`, label: 'Speed', min: 0, max: 40, step: 0.5, dec: 1 }));
    body.appendChild(colorPicker('Color', `${shockPrefix}Color`));
    body.appendChild(slider({ key: `${shockPrefix}Transparency`, label: 'Transparency', min: 0, max: 1, step: 0.01, dec: 2 }));
    body.appendChild(slider({ key: `${shockPrefix}FadeTime`, label: 'Fade Time', min: 0.05, max: 3, step: 0.05, dec: 2 }));
    body.appendChild(slider({ key: `${shockPrefix}Delay`, label: 'Delay', min: 0, max: 3, step: 0.05, dec: 2 }));
    body.appendChild(slider({ key: `${shockPrefix}SplashDamage`, label: 'Splash Damage', min: 0, max: 500, step: 1, dec: 0 }));
    body.appendChild(slider({ key: `${shockPrefix}SplashRadius`, label: 'Splash Radius', min: 0, max: 80, step: 0.5, dec: 1 }));
    body.appendChild(slider({ key: `${shockPrefix}SplashFalloff`, label: 'Damage Falloff', min: 0.1, max: 4, step: 0.1, dec: 1 }));
    body.appendChild(slider({ key: `${shockPrefix}SplashMinFactor`, label: 'Min Damage', min: 0, max: 1, step: 0.01, dec: 2 }));
    body.appendChild(subhdr('Particles'));
    body.appendChild(slider({ key: `${shockPrefix}ParticleCount`, label: 'Particle Count', min: 0, max: 250, step: 1, dec: 0 }));
    body.appendChild(slider({ key: `${shockPrefix}ParticleSize`, label: 'Particle Size', min: 0.05, max: 2, step: 0.05, dec: 2 }));
    body.appendChild(slider({ key: `${shockPrefix}ParticleSpeed`, label: 'Particle Speed', min: 0.1, max: 8, step: 0.05, dec: 2 }));
    body.appendChild(slider({ key: `${shockPrefix}ParticleGlow`, label: 'Particle Glow', min: 0, max: 24, step: 0.5, dec: 1 }));
    body.appendChild(slider({ key: `${shockPrefix}ParticleDespawnTime`, label: 'Particle Despawn Time', min: 0.1, max: 10, step: 0.1, dec: 1 }));
    body.appendChild(colorPicker('Particle Color', `${shockPrefix}ParticleColor`));
    body.appendChild(select('Particle Physics', `${shockPrefix}ParticlePhysics`, [
      ['gravity', 'Gravity'],
      ['ethereal', 'Ethereal'],
    ]));
  }
}

function buildWeapons(body) {
  body.appendChild(createManualSubsection('Current Weapon', currentBody => {
    currentBody.appendChild(toggle('Weapons Enabled', 'laserEnabled', () => syncWeaponAmmoHud()));
    const infiniteAmmoToggle = toggle('Infinite Ammo', 'weaponInfiniteAmmo', () => syncWeaponAmmoHud());
    infiniteAmmoToggle.classList.add('sb-toggle-spaced');
    currentBody.appendChild(infiniteAmmoToggle);
    currentBody.appendChild(select('Player Weapon', 'playerWeaponType', PLAYER_WEAPON_OPTIONS, () => {
      applyPlayerWeaponSettings();
      syncReticleToCurrentWeapon();
      applyReticleSettings();
      syncWeaponAmmoHud();
    }));
  }, true));

  WEAPON_CONTROL_SPECS.forEach(spec => {
    body.appendChild(createManualSubsection(spec.label, sectionBody => buildWeaponControls(sectionBody, spec), spec.type === state.params.playerWeaponType));
  });

  body.appendChild(createManualSubsection('Reticle Display', reticleBody => {
    reticleBody.appendChild(toggle('Show Reticle', 'reticleVisible', () => applyReticleSettings()));
    reticleBody.appendChild(colorPicker('Color', 'reticleColor', () => applyReticleSettings()));
    reticleBody.appendChild(slider({
      key: 'reticleSize', label: 'Size', min: 4, max: 96, step: 1, dec: 0,
      onChange: value => {
        const spec = weaponSpecForType(state.params.playerWeaponType);
        state.params[weaponReticleSizeKey(spec)] = value;
        applyReticleSettings();
      },
    }));
    reticleBody.appendChild(slider({
      key: 'reticleWeight', label: 'Weight', min: 0.5, max: 12, step: 0.1, dec: 1,
      onChange: value => {
        const spec = weaponSpecForType(state.params.playerWeaponType);
        state.params[weaponReticleWeightKey(spec)] = value;
        state.params.reticleThickness = value;
        applyReticleSettings();
      },
    }));
    reticleBody.appendChild(slider({
      key: 'reticleOpacity', label: 'Opacity', min: 0.05, max: 1, step: 0.05, dec: 2,
      onChange: value => {
        const spec = weaponSpecForType(state.params.playerWeaponType);
        state.params[weaponReticleOpacityKey(spec)] = value;
        applyReticleSettings();
      },
    }));
    reticleBody.appendChild(toggle('Glow', 'reticleGlow', () => applyReticleSettings()));
    reticleBody.appendChild(subhdr('Hit Marker'));
    reticleBody.appendChild(toggle('Hit Marker', 'reticleHitMarkerEnabled', () => applyReticleSettings()));
    reticleBody.appendChild(colorPicker('Hit Color', 'reticleHitMarkerColor', () => applyReticleSettings()));
    reticleBody.appendChild(slider({ key: 'reticleHitMarkerSize', label: 'Hit Size', min: 12, max: 160, step: 1, dec: 0, onChange: () => applyReticleSettings() }));
    reticleBody.appendChild(slider({ key: 'reticleHitMarkerWeight', label: 'Hit Weight', min: 0.5, max: 12, step: 0.1, dec: 1, onChange: () => applyReticleSettings() }));
    reticleBody.appendChild(slider({ key: 'reticleHitMarkerOpacity', label: 'Hit Opacity', min: 0, max: 1, step: 0.05, dec: 2, onChange: () => applyReticleSettings() }));
    reticleBody.appendChild(slider({ key: 'reticleHitMarkerDuration', label: 'Hit Duration', min: 80, max: 500, step: 10, dec: 0, onChange: () => applyReticleSettings() }));
    reticleBody.appendChild(subhdr('Kill Confirmation'));
    reticleBody.appendChild(toggle('Kill Confirmation', 'reticleKillConfirmEnabled', () => applyReticleSettings()));
    reticleBody.appendChild(colorPicker('Kill Color', 'reticleKillConfirmColor', () => applyReticleSettings()));
    reticleBody.appendChild(slider({ key: 'reticleKillConfirmSize', label: 'Kill Size', min: 12, max: 160, step: 1, dec: 0, onChange: () => applyReticleSettings() }));
    reticleBody.appendChild(slider({ key: 'reticleKillConfirmOpacity', label: 'Kill Opacity', min: 0, max: 1, step: 0.05, dec: 2, onChange: () => applyReticleSettings() }));
    reticleBody.appendChild(slider({ key: 'reticleKillConfirmDuration', label: 'Kill Duration', min: 80, max: 800, step: 10, dec: 0, onChange: () => applyReticleSettings() }));
  }, false));
}

// Ambience audio element — created once, persists across panel rebuilds.
let _ambienceEl = null;
function getAmbienceEl() {
  if (!_ambienceEl) {
    _ambienceEl = registerManagedAudio(new Audio('./assets/storm.mp3'));
    _ambienceEl.loop = true;
    _ambienceEl.volume = Math.max(0, Math.min(1, Number(state.params.soundSfx_ambience) ?? 0.5));
  }
  return _ambienceEl;
}

function canStartAudioPlaybackFromUserActivation() {
  const activation = navigator.userActivation;
  return !activation || activation.isActive || activation.hasBeenActive;
}

function playAmbienceIfAllowed() {
  if (state.paused || state.params.soundSfx_ambience <= 0 || state.params.soundMuted) return;
  if (!canStartAudioPlaybackFromUserActivation()) return;
  const el = getAmbienceEl();
  if (!el.paused) return;
  applyBulletTimeAudioPitch(el);
  const playRequest = el.play();
  if (playRequest?.catch) playRequest.catch(() => {});
}

function buildSound(body) {
  body.appendChild(subhdr('Master'));
  body.appendChild(slider({ key: 'soundMusicVolume', label: 'Music', min: 0, max: 1, step: 0.01, dec: 2 }));
  body.appendChild(slider({ key: 'soundSfxVolume', label: 'SFX Master', min: 0, max: 1, step: 0.01, dec: 2 }));
  body.appendChild(toggle('Muted', 'soundMuted'));

  body.appendChild(subhdr('Proximity'));
  body.appendChild(toggle('Proximity Audio', 'soundProximityEnabled'));
  body.appendChild(slider({ key: 'soundProximityRange', label: 'Audible Range', min: 1, max: 200, step: 1, dec: 0 }));
  body.appendChild(slider({ key: 'soundProximityFalloff', label: 'Distance Falloff', min: 0.1, max: 4, step: 0.1, dec: 1 }));
  body.appendChild(slider({ key: 'soundProximityMinFactor', label: 'Min Volume', min: 0, max: 1, step: 0.01, dec: 2 }));

  body.appendChild(subhdr('SFX Mixer'));
  const sfxKeys = [
    ['Player Shoot',   'soundSfx_shoot'],
    ['Player Reload',  'soundSfx_reload'],
    ['Pistol Reload',  'soundSfx_pistol_reload'],
    ['Empty Magazine', 'soundSfx_empty'],
    ['Dash',           'soundSfx_dash'],
    ['Jump',           'soundSfx_jump'],
    ['Player Hit',     'soundSfx_player_hit'],
    ['Enemy Grunt',    'soundSfx_enemy_grunt'],
    ['Bullet Time Slow', 'soundSfx_bullet_time_slow'],
    ['Bullet Time Heart', 'soundSfx_bullet_time_heart'],
    ['Standard Hit',   'soundSfx_standard_hit'],
    ['Elite Hit',    'soundSfx_elite_hit'],
    ['Explode',      'soundSfx_explode'],
    ['Coin',         'soundSfx_coin'],
    ['Heal',         'soundSfx_heal'],
    ['Level Up',     'soundSfx_levelup'],
    ['Game Over',    'soundSfx_gameover'],
    ['Victory',      'soundSfx_victory'],
  ];
  sfxKeys.forEach(([label, key]) => {
    if (!(key in state.params)) state.params[key] = 1.0;
    body.appendChild(slider({ key, label, min: 0, max: 1, step: 0.05, dec: 2 }));
  });

  // Ambience row — controls storm.wav loop volume
  if (!('soundSfx_ambience' in state.params)) state.params.soundSfx_ambience = 0.5;
  const ambienceRow = slider({
    key: 'soundSfx_ambience',
    label: 'Ambience',
    min: 0, max: 1, step: 0.05, dec: 2,
    onChange: (v) => {
      const el = getAmbienceEl();
      el.volume = Math.max(0, Math.min(1, v));
      if (v > 0 && el.paused && !state.params.soundMuted) {
        playAmbienceIfAllowed();
      } else if (v <= 0) {
        el.pause();
      }
    },
  });
  body.appendChild(ambienceRow);

  // Do not start ambience during initial panel construction; browsers block
  // unmuted media until the player has interacted with the page.
  if (canStartAudioPlaybackFromUserActivation()) playAmbienceIfAllowed();
}


function buildController(body) {
  // Live status indicator that updates every 2 seconds without rebuilding the panel.
  const statusRow = document.createElement('div');
  statusRow.className = 'sb-row';
  const statusLabel = document.createElement('label');
  statusLabel.className = 'sb-label';
  statusLabel.textContent = 'Connected';
  const statusVal = document.createElement('span');
  statusVal.className = 'sb-value';
  function refreshStatus() {
    const connected = !!state.controllerConnected;
    statusVal.textContent = connected ? '✓ Yes' : '— None';
    statusVal.style.color = connected ? '#4caf50' : '';
  }
  refreshStatus();
  const _statusTimer = setInterval(refreshStatus, 1500);
  // Clean up interval if section is ever removed from DOM.
  statusRow.addEventListener('disconnected', () => clearInterval(_statusTimer));
  statusRow.appendChild(statusLabel);
  statusRow.appendChild(statusVal);

  body.appendChild(toggle('Controller Enabled', 'controllerEnabled'));
  body.appendChild(statusRow);

  body.appendChild(subhdr('Sticks'));
  body.appendChild(slider({ key: 'controllerMoveDeadzone', label: 'Move Deadzone', min: 0, max: 0.5, step: 0.01, dec: 2 }));
  body.appendChild(slider({ key: 'controllerLookDeadzone', label: 'Look Deadzone', min: 0, max: 0.5, step: 0.01, dec: 2 }));
  body.appendChild(slider({ key: 'controllerLookSensX',    label: 'Look Sensitivity X', min: 0.005, max: 0.2, step: 0.005, dec: 3 }));
  body.appendChild(slider({ key: 'controllerLookSensY',    label: 'Look Sensitivity Y', min: 0.005, max: 0.2, step: 0.005, dec: 3 }));
  body.appendChild(toggle('Invert Y', 'controllerInvertY'));

  body.appendChild(subhdr('Triggers'));
  body.appendChild(slider({ key: 'controllerFireThreshold', label: 'Fire Threshold', min: 0.05, max: 0.95, step: 0.05, dec: 2 }));

  body.appendChild(subhdr('Feedback'));
  body.appendChild(toggle('Vibration', 'controllerVibration'));

  body.appendChild(subhdr('Mappings'));
  const mappings = [
    [null,           'Left Stick',   'Movement'],
    [null,           'Right Stick',  'Camera Look'],
    [null,           'R2 / R1',      'Fire Laser'],
    ['<svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="currentColor"><path d="m336-316 144-144 144 144 20-20-144-144 144-144-20-20-144 144-144-144-20 20 144 144-144 144 20 20Zm144.17 184q-72.17 0-135.73-27.39-63.56-27.39-110.57-74.35-47.02-46.96-74.44-110.43Q132-407.65 132-479.83q0-72.17 27.39-135.73 27.39-63.56 74.35-110.57 46.96-47.02 110.43-74.44Q407.65-828 479.83-828q72.17 0 135.73 27.39 63.56 27.39 110.57 74.35 47.02 46.96 74.44 110.43Q828-552.35 828-480.17q0 72.17-27.39 135.73-27.39 63.56-74.35 110.57-46.96 47.02-110.43 74.44Q552.35-132 480.17-132Zm-.17-28q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>', null,      'Jump'],
    ['<svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="currentColor"><path d="M479.88-345q-55.88 0-95.38-39.32-39.5-39.33-39.5-95.5Q345-536 384.32-575q39.33-39 95.5-39Q536-614 575-574.88q39 39.12 39 95t-39.12 95.38q-39.12 39.5-95 39.5ZM344.5-159q-63.5-27-111-74.5T159-344.41q-27-63.4-27-135.5 0-72.09 27-135.59T233.5-726q47.5-47 110.91-74.5 63.4-27.5 135.5-27.5 72.09 0 135.65 27.39t110.57 74.35q47.02 46.96 74.44 110.43Q828-552.35 828-480.17q0 72.17-27.5 135.67Q773-281 726-233.5T615.59-159q-63.4 27-135.5 27-72.09 0-135.59-27Zm135-1q133.5 0 227-93T800-479.5q0-133.5-93.5-227T480-800q-134 0-227 93.5T160-480q0 134 93 227t226.5 93Zm.5-320Zm115 115.5Q642-412 642-480t-47-115q-47-47-115-47t-115.5 47Q317-548 317-480t47.5 115.5Q412-317 480-317t115-47.5Z"/></svg>', null, 'Dash'],
    [null,           'L1 / L2',      'Bullet Time'],
    ['<svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="currentColor"><path d="M336-336h288v-288H336v288Zm28-28v-232h232v232H364Zm-19.5 205q-63.5-27-111-74.5t-74.5-111Q132-408 132-480t27-135.5Q186-679 233.5-726t111-74.5Q408-828 480-828t135.5 27.5Q679-773 726-726t74.5 110.5Q828-552 828-480t-27.5 135.5Q773-281 726-233.5T615.5-159Q552-132 480-132t-135.5-27Zm135.5-1q133 0 226.5-93T800-480q0-133-93.5-226.5T480-800q-134 0-227 93.5T160-480q0 134 93 227t227 93Zm0-320Z"/></svg>', null, '—'],
    ['<svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="currentColor"><path d="M297-373h365L480-676 297-373Zm50-28 133-220 132 220H347Zm-2.5 242q-63.5-27-111-74.5t-74.5-111Q132-408 132-480t27-135.5Q186-679 233.5-726t111-74.5Q408-828 480-828t135.5 27.5Q679-773 726-726t74.5 110.5Q828-552 828-480t-27.5 135.5Q773-281 726-233.5T615.5-159Q552-132 480-132t-135.5-27Zm135.5-1q133 0 226.5-93T800-480q0-133-93.5-226.5T480-800q-134 0-227 93.5T160-480q0 134 93 227t227 93Zm0-320Z"/></svg>', null, '—'],
    [null,           'Options',      'Toggle Sidebar'],
  ];
  const MUTED = 'var(--sb-muted, #6e7681)';
  mappings.forEach(([iconHtml, btnText, action]) => {
    const r = document.createElement('div');
    r.className = 'sb-row';
    const l = document.createElement('label');
    l.className = 'sb-label';
    l.style.color = MUTED;
    if (iconHtml) {
      const iconSpan = document.createElement('span');
      iconSpan.innerHTML = iconHtml;
      iconSpan.style.cssText = 'display:inline-flex;align-items:center;vertical-align:middle;margin-right:4px;color:' + MUTED;
      l.appendChild(iconSpan);
    } else if (btnText) {
      l.appendChild(document.createTextNode(btnText));
    }
    const v = document.createElement('span');
    v.className = 'sb-value';
    v.style.color = MUTED;
    v.style.fontSize = '11px';
    v.textContent = action;
    r.appendChild(l);
    r.appendChild(v);
    body.appendChild(r);
  });
}


function buildAllies(body) {
  buildScopedJsonControls(body, 'Allies', ALLY_JSON_KEYS, 'allies.json');
  body.appendChild(select('Ally Type', 'allyType', ENEMY_TYPE_OPTIONS));
  body.appendChild(slider({ key: 'allyCount', label: 'Number of Allies', min: 0, max: 50, step: 1, dec: 0 }));
  body.appendChild(slider({ key: 'allyHealth', label: 'Health Amount', min: 1, max: 1000, step: 1, dec: 0 }));
  body.appendChild(toggle('Ally Invincible', 'allyInvincible'));
  body.appendChild(toggle('Friendly Fire', 'allyFriendlyFire'));
  body.appendChild(select('Behavior', 'allyBehavior', ENEMY_BEHAVIOR_OPTIONS));
  body.appendChild(slider({ key: 'allyMoveSpeed', label: 'Movement Speed', min: 0, max: 12, step: 0.1, dec: 1 }));
  body.appendChild(slider({ key: 'allyDamage', label: 'Damage Amount', min: 0, max: 250, step: 1, dec: 0 }));
  body.appendChild(slider({ key: 'allyAccuracy', label: 'Accuracy', min: 0, max: 100, step: 1, dec: 0 }));
  body.appendChild(select('Placement', 'allyPlacement', ENEMY_PLACEMENT_OPTIONS));
  body.appendChild(select('Weapon Type', 'allyWeaponType', NPC_WEAPON_OPTIONS));
  body.appendChild(subhdr('Ally Awareness Range'));
  body.appendChild(slider({ key: 'allyAwarenessRange', label: 'Ally Awareness Range', min: 1, max: 200, step: 1, dec: 0 }));
  body.appendChild(toggle('Show Ally Awareness', 'allyAwarenessVisible'));
  body.appendChild(colorPicker('Ally Awareness Color', 'allyAwarenessColor'));
  body.appendChild(toggle('Transparent Ally Awareness Fill', 'allyAwarenessFillTransparent'));
  body.appendChild(colorPicker('Ally Awareness Outline Color', 'allyAwarenessOutlineColor'));
  body.appendChild(slider({ key: 'allyAwarenessOpacity', label: 'Ally Awareness Opacity', min: 0, max: 1, step: 0.01, dec: 2 }));

  body.appendChild(btn('Spawn / Apply Allies', 'sb-btn-accent', () => {
    const count = spawnAlliesFromSettings();
    notify(`${count} allies spawned ✓`);
  }));
  body.appendChild(btn('Clear Allies', 'sb-btn-muted', () => {
    clearAllies();
    notify('Allies cleared ✓');
  }));
}



function smallInfo(text) {
  const el = document.createElement('div');
  el.style.cssText = 'font-size:10px;color:var(--sb-muted);padding:2px 0 8px;line-height:1.5;';
  el.textContent = text;
  return el;
}

function textInputRow(label, key, onChange) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'sb-text-input';
  input.dataset.paramKey = key;
  input.value = state.params[key] ?? '';
  input.spellcheck = false;
  input.addEventListener('input', () => {
    state.params[key] = input.value;
    onChange?.(input.value);
  });
  return row(label, input);
}

function landscapeEditorEnabledChanged(value) {
  state.params.landscapeEditorModeEnabled = value === true;
  state.activePreset = 'custom';
  if (value) {
    state.params.editorModeEnabled = true;
    state.params.editorPlacementTarget = 'asset';
    state.activeSlot = 1;
    setEditorModeEnabled(true);
  } else if (state.params.editorModeEnabled === true && state.params.editorPlacementTarget === 'asset') {
    state.params.editorModeEnabled = false;
    setEditorModeEnabled(false);
  }
  applyAllParams();
}

function selectedSceneOptions() {
  const scenes = Array.isArray(state.params.savedScenes) ? state.params.savedScenes : [];
  if (!scenes.length) return [['', 'No saved scenes']];
  return scenes.map((scene, index) => [scene.id || String(index), scene.name || `Scene ${index + 1}`]);
}

const SCENE_KEYS = [
  'placedObjects', 'editorPlacedNpcs',
  'playerSpawnEnabled', 'playerSpawnX', 'playerSpawnY', 'playerSpawnZ', 'playerSpawnYaw', 'editorPlayerSpawnYaw',
  'floorMode', 'buildAreaEnabled', 'buildAreaCenterX', 'buildAreaCenterZ', 'buildAreaWidth', 'buildAreaDepth',
  'buildAreaAutoExpand', 'buildAreaAutoExpandMargin', 'buildAreaBoundaryVisible', 'buildAreaBoundaryColor',
  'buildAreaBoundaryWalls', 'buildAreaBoundaryHeight', 'buildAreaBoundaryOpacity', 'buildAreaBoundaryCollision',
];

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeSceneSnapshot(name) {
  const data = {};
  for (const key of SCENE_KEYS) data[key] = cloneData(state.params[key]);
  return {
    id: `scene_${Date.now().toString(36)}`,
    name: String(name || '').trim() || `Scene ${(state.params.savedScenes || []).length + 1}`,
    savedAt: new Date().toISOString(),
    data,
  };
}

function saveCurrentLandscapeScene() {
  if (!Array.isArray(state.params.savedScenes)) state.params.savedScenes = [];
  const snapshot = makeSceneSnapshot(state.params.landscapeEditorSceneName);
  state.params.savedScenes.push(snapshot);
  state.params.landscapeEditorSelectedSceneId = snapshot.id;
  state.activePreset = 'custom';
  return snapshot;
}

function loadLandscapeSceneById(sceneId) {
  const scenes = Array.isArray(state.params.savedScenes) ? state.params.savedScenes : [];
  const sceneData = scenes.find(scene => scene.id === sceneId) || scenes[Number(sceneId)] || null;
  if (!sceneData?.data) return false;
  for (const key of SCENE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(sceneData.data, key)) state.params[key] = cloneData(sceneData.data[key]);
  }
  state.activePreset = 'custom';
  applyAllParams();
  return true;
}

function deleteLandscapeSceneById(sceneId) {
  const scenes = Array.isArray(state.params.savedScenes) ? state.params.savedScenes : [];
  const before = scenes.length;
  state.params.savedScenes = scenes.filter((scene, index) => (scene.id || String(index)) !== sceneId);
  if (state.params.landscapeEditorSelectedSceneId === sceneId) state.params.landscapeEditorSelectedSceneId = '';
  return before - state.params.savedScenes.length;
}

function buildSceneSaveLoadControls(body) {
  body.appendChild(textInputRow('Scene Name', 'landscapeEditorSceneName'));
  body.appendChild(btn('💾 Save Current Scene', 'sb-btn-accent', () => {
    const sceneData = saveCurrentLandscapeScene();
    rebuildPanel();
    notify(`Saved ${sceneData.name} ✓`);
  }));
  body.appendChild(select('Saved Scene', 'landscapeEditorSelectedSceneId', selectedSceneOptions(), () => {}));
  const sceneButtons = document.createElement('div');
  sceneButtons.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 10px;';
  sceneButtons.appendChild(btn('Load Scene', 'sb-btn-accent', () => {
    if (loadLandscapeSceneById(state.params.landscapeEditorSelectedSceneId)) {
      rebuildPanel();
      notify('Scene loaded ✓');
    } else notify('No saved scene selected');
  }));
  sceneButtons.appendChild(btn('Delete Scene', 'sb-btn-muted', () => {
    const removed = deleteLandscapeSceneById(state.params.landscapeEditorSelectedSceneId);
    rebuildPanel();
    notify(removed ? 'Scene deleted ✓' : 'No saved scene selected');
  }));
  body.appendChild(sceneButtons);
}

function buildLandscapeEditor(body) {
  body.appendChild(subhdr('Landscape Editor Mode'));
  body.appendChild(smallInfo('A dedicated first-person build mode for level/stronghold layout. It uses the same grid placement workflow, plus structure selection, cloning, saved prefabs, selected-object editing, spawn tools, and saved scenes.'));
  body.appendChild(toggle('Landscape Editor Mode', 'landscapeEditorModeEnabled', landscapeEditorEnabledChanged));
  body.appendChild(select('Placement Target', 'editorPlacementTarget', [
    ['asset', 'Asset / Prefab'],
    ['enemy', 'Enemy NPC'],
    ['ally', 'Ally NPC'],
    ['playerSpawn', 'Player Spawn'],
  ], value => {
    state.params.editorPlacementTarget = value;
    if (state.params.landscapeEditorModeEnabled) {
      state.params.editorModeEnabled = true;
      state.activeSlot = 1;
      setEditorModeEnabled(true);
    }
    applyAllParams();
  }));
  body.appendChild(toggle('Fly Mode', 'editorFlyMode', applyAllParams));
  body.appendChild(slider({ key: 'editorMoveSpeed', label: 'Move Speed', min: 0.1, max: 40, step: 0.1, dec: 1, onChange: applyAllParams }));
  body.appendChild(slider({ key: 'editorFov', label: 'Editor FOV', min: 30, max: 110, step: 1, dec: 0, onChange: applyAllParams }));

  body.appendChild(subhdr('Place Assets'));
  body.appendChild(assetSelectRow());
  body.appendChild(colorPicker('New Asset Color', 'placerObjectColor', () => rebuildPlacedObjects()));
  body.appendChild(toggle('Placed Asset Shadows', 'placedAssetShadows', () => rebuildPlacedObjects()));
  body.appendChild(slider({ key: 'placerScaleX', label: 'New Width X', min: 0.5, max: 6, step: 0.5, dec: 1, onChange: applyAllParams }));
  body.appendChild(slider({ key: 'placerScaleY', label: 'New Height Y', min: 0.5, max: 6, step: 0.5, dec: 1, onChange: applyAllParams }));
  body.appendChild(slider({ key: 'placerScaleZ', label: 'New Depth Z', min: 0.5, max: 6, step: 0.5, dec: 1, onChange: applyAllParams }));
  body.appendChild(slider({ key: 'placerRotationDeg', label: 'New Rotation', min: 0, max: 270, step: 90, dec: 0, onChange: applyAllParams }));

  body.appendChild(subhdr('Selection / Structures'));
  const selectedRow = document.createElement('div');
  selectedRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;font-size:11px;color:var(--sb-muted);letter-spacing:0.06em;';
  const selectedLabel = document.createElement('span');
  selectedLabel.textContent = 'Selected Assets';
  const selectedValue = document.createElement('span');
  selectedValue.className = 'landscape-selection-count';
  selectedValue.style.cssText = 'color:var(--sb-text);font-weight:700;';
  selectedValue.textContent = String(getSelectedPlacedObjectCount());
  selectedRow.appendChild(selectedLabel);
  selectedRow.appendChild(selectedValue);
  body.appendChild(selectedRow);

  const selectButtons = document.createElement('div');
  selectButtons.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;';
  selectButtons.appendChild(btn('Select Structure', 'sb-btn-accent', () => {
    const count = selectConnectedPlacedStructureByAim() || selectConnectedPlacedStructureFromSelection();
    selectedValue.textContent = String(getSelectedPlacedObjectCount());
    notify(count ? `Selected ${count} connected asset${count === 1 ? '' : 's'} ✓` : 'Aim at a placed asset first');
  }));
  selectButtons.appendChild(btn('Select All', 'sb-btn-muted', () => {
    selectAllPlacedObjects();
    selectedValue.textContent = String(getSelectedPlacedObjectCount());
    notify('Selected all placed assets ✓');
  }));
  selectButtons.appendChild(btn('Clear Selection', 'sb-btn-muted', () => {
    clearPlacedObjectSelection();
    selectedValue.textContent = '0';
    notify('Selection cleared ✓');
  }));
  selectButtons.appendChild(btn('Delete Selected', 'sb-btn-muted', () => {
    const removed = deleteSelectedPlacedObjects();
    selectedValue.textContent = String(getSelectedPlacedObjectCount());
    notify(removed ? `Deleted ${removed} selected asset${removed === 1 ? '' : 's'} ✓` : 'No selected assets');
  }));
  body.appendChild(selectButtons);

  body.appendChild(subhdr('Clone / Prefab'));
  body.appendChild(slider({ key: 'landscapeEditorCloneOffsetX', label: 'Clone Offset X', min: -20, max: 20, step: 0.5, dec: 1 }));
  body.appendChild(slider({ key: 'landscapeEditorCloneOffsetZ', label: 'Clone Offset Z', min: -20, max: 20, step: 0.5, dec: 1 }));
  const cloneButtons = document.createElement('div');
  cloneButtons.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;';
  cloneButtons.appendChild(btn('Clone Selected', 'sb-btn-accent', () => {
    const count = duplicateSelectedPlacedObjects(state.params.landscapeEditorCloneOffsetX, state.params.landscapeEditorCloneOffsetZ);
    selectedValue.textContent = String(getSelectedPlacedObjectCount());
    notify(count ? `Cloned ${count} asset${count === 1 ? '' : 's'} ✓` : 'No selected assets');
  }));
  cloneButtons.appendChild(btn('Clear All Placed', 'sb-btn-muted', () => {
    clearPlacedObjects();
    selectedValue.textContent = '0';
    notify('Placed assets cleared ✓');
  }));
  body.appendChild(cloneButtons);
  body.appendChild(textInputRow('Prefab Name', 'landscapeEditorPrefabName'));
  body.appendChild(btn('Save Selected As Prefab', 'sb-btn-accent', () => {
    const prefab = saveSelectedPlacedObjectsAsPrefab(state.params.landscapeEditorPrefabName);
    if (prefab) {
      state.activePreset = 'custom';
      rebuildPanel();
      notify(`Saved prefab: ${prefab.label} ✓`);
    } else notify('Select a structure first');
  }));

  body.appendChild(subhdr('Edit Selected Assets'));
  body.appendChild(colorPicker('Selected Color', 'landscapeEditorSelectionColor', value => {
    const count = applySelectedPlacedObjectEdits({ color: value });
    if (count) notify(`Updated ${count} selected asset${count === 1 ? '' : 's'} ✓`);
  }));
  body.appendChild(slider({ key: 'landscapeEditorSelectionScaleX', label: 'Selected Width X', min: 0.5, max: 6, step: 0.5, dec: 1 }));
  body.appendChild(slider({ key: 'landscapeEditorSelectionScaleY', label: 'Selected Height Y', min: 0.5, max: 6, step: 0.5, dec: 1 }));
  body.appendChild(slider({ key: 'landscapeEditorSelectionScaleZ', label: 'Selected Depth Z', min: 0.5, max: 6, step: 0.5, dec: 1 }));
  body.appendChild(slider({ key: 'landscapeEditorSelectionRotationDeg', label: 'Selected Rotation', min: 0, max: 270, step: 90, dec: 0 }));
  body.appendChild(btn('Apply Transform To Selected', 'sb-btn-accent', () => {
    const count = applySelectedPlacedObjectEdits({
      scaleX: state.params.landscapeEditorSelectionScaleX,
      scaleY: state.params.landscapeEditorSelectionScaleY,
      scaleZ: state.params.landscapeEditorSelectionScaleZ,
      rotationDeg: state.params.landscapeEditorSelectionRotationDeg,
      color: state.params.landscapeEditorSelectionColor,
    });
    selectedValue.textContent = String(getSelectedPlacedObjectCount());
    notify(count ? `Updated ${count} selected asset${count === 1 ? '' : 's'} ✓` : 'No selected assets');
  }));

  body.appendChild(subhdr('Player Spawn'));
  body.appendChild(smallInfo('Choose Player Spawn as the placement target, aim at the grid, left-click to place/move it, and use Q/E to rotate the facing arrow.'));
  body.appendChild(toggle('Use Player Spawn', 'playerSpawnEnabled', value => {
    state.activePreset = 'custom';
    if (!value) clearPlayerSpawn();
    applyAllParams();
  }));
  const spawnButtons = document.createElement('div');
  spawnButtons.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 10px;';
  spawnButtons.appendChild(btn('Move Player To Spawn', 'sb-btn-accent', () => {
    if (teleportPlayerToSpawn()) notify('Player moved to spawn ✓');
    else notify('No player spawn set');
  }));
  spawnButtons.appendChild(btn('Clear Spawn', 'sb-btn-muted', () => {
    clearPlayerSpawn();
    applyAllParams();
    rebuildPanel();
    notify('Player spawn cleared ✓');
  }));
  body.appendChild(spawnButtons);

  body.appendChild(subhdr('Saved Scenes'));
  buildSceneSaveLoadControls(body);

  window.addEventListener('placed-selection-changed', event => {
    if (!selectedValue.isConnected) return;
    selectedValue.textContent = String(event.detail?.count ?? getSelectedPlacedObjectCount());
  });
}

function buildLandscape(body) {
  body.appendChild(subhdr('Sky & Fog'));
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

  body.appendChild(subhdr('Floor'));
  body.appendChild(colorPicker('Floor Color', 'floorColor', v => { setFloorColor(v); applyFloorSettings(); }));
  body.appendChild(colorPicker('Grid Color',  'gridColor',  v => { setGridColor(v); applyFloorSettings(); }));
  body.appendChild(toggle('Show Floor', 'showFloor', v => { setFloorVisible(v); applyFloorSettings(); }));
  body.appendChild(toggle('Show Grid',  'showGrid',  v => { setGridVisible(v); applyFloorSettings(); }));
}


function assetGroups() {
  const grouped = new Map();
  getAvailablePlaceableAssets().forEach(asset => {
    const key = asset.category || 'default';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(asset);
  });
  return grouped;
}

function assetSelectRow() {
  const sel = document.createElement('select');
  sel.dataset.paramKey = 'placerSelectedAsset';
  sel.className = 'sb-select';
  assetGroups().forEach((assets, category) => {
    const group = document.createElement('optgroup');
    group.label = ASSET_CATEGORY_LABELS[category] || category;
    assets.forEach(asset => {
      const opt = document.createElement('option');
      opt.value = asset.id;
      opt.textContent = asset.label;
      if (state.params.placerSelectedAsset === asset.id) opt.selected = true;
      group.appendChild(opt);
    });
    sel.appendChild(group);
  });
  sel.addEventListener('change', () => { state.params.placerSelectedAsset = sel.value; });
  return row('Selected Asset', sel);
}

function buildAssets(body) {
  body.appendChild(subhdr('Editor Mode'));

  const editorInfo = document.createElement('div');
  editorInfo.style.cssText = 'font-size:10px;color:var(--sb-muted);padding:2px 0 8px;line-height:1.5;';
  editorInfo.textContent = 'First-person placement mode for building on the grid floor. Minimize the sidebar after enabling it, then use WASD + mouse to move and aim.';
  body.appendChild(editorInfo);
  body.appendChild(toggle('Editor Mode', 'editorModeEnabled', value => {
    state.activePreset = 'custom';
    setEditorModeEnabled(value);
    applyAllParams();
  }));
  body.appendChild(select('Placement Target', 'editorPlacementTarget', [
    ['asset', 'Asset / Prefab'],
    ['enemy', 'Enemy NPC'],
    ['ally', 'Ally NPC'],
    ['playerSpawn', 'Player Spawn'],
  ], applyAllParams));
  body.appendChild(toggle('Fly Mode', 'editorFlyMode', applyAllParams));
  body.appendChild(slider({ key: 'editorMoveSpeed', label: 'Move Speed', min: 0.1, max: 40, step: 0.1, dec: 1, onChange: applyAllParams }));
  body.appendChild(slider({ key: 'editorSprintMultiplier', label: 'Sprint Mult', min: 1, max: 6, step: 0.05, dec: 2, onChange: applyAllParams }));
  body.appendChild(slider({ key: 'editorPrecisionMultiplier', label: 'Precision Mult', min: 0.05, max: 1, step: 0.01, dec: 2, onChange: applyAllParams }));
  body.appendChild(slider({ key: 'editorEyeHeight', label: 'Eye Height', min: 0.5, max: 5, step: 0.05, dec: 2, onChange: applyAllParams }));
  body.appendChild(slider({ key: 'editorFov', label: 'Editor FOV', min: 30, max: 110, step: 1, dec: 0, onChange: applyAllParams }));
  body.appendChild(slider({ key: 'editorMouseSensitivityX', label: 'Look X Sens', min: 0.0002, max: 0.012, step: 0.0001, dec: 4, onChange: applyAllParams }));
  body.appendChild(slider({ key: 'editorMouseSensitivityY', label: 'Look Y Sens', min: 0.0002, max: 0.012, step: 0.0001, dec: 4, onChange: applyAllParams }));

  body.appendChild(subhdr('Player Spawn'));
  const spawnInfo = document.createElement('div');
  spawnInfo.style.cssText = 'font-size:10px;color:var(--sb-muted);padding:2px 0 8px;line-height:1.5;';
  spawnInfo.textContent = 'Choose Player Spawn as the placement target, aim at the grid, left-click to set the start point, and use Q/E to rotate the facing arrow.';
  body.appendChild(spawnInfo);
  body.appendChild(toggle('Use Player Spawn', 'playerSpawnEnabled', value => {
    state.activePreset = 'custom';
    if (!value) clearPlayerSpawn();
    applyAllParams();
  }));
  const spawnButtons = document.createElement('div');
  spawnButtons.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 10px;';
  spawnButtons.appendChild(btn('Move Player To Spawn', 'sb-btn-accent', () => {
    if (teleportPlayerToSpawn()) notify('Player moved to spawn ✓');
    else notify('No player spawn set');
  }));
  spawnButtons.appendChild(btn('Clear Spawn', 'sb-btn-muted', () => {
    clearPlayerSpawn();
    applyAllParams();
    rebuildPanel();
    notify('Player spawn cleared ✓');
  }));
  body.appendChild(spawnButtons);

  body.appendChild(subhdr('Object Placer'));

  // Current slot indicator
  const slotInfo = document.createElement('div');
  slotInfo.style.cssText = 'font-size:10px;color:var(--sb-muted);padding:2px 0 8px;line-height:1.5;';
  slotInfo.textContent = 'Object placement is handled through Editor Mode. F opens the asset picker while editing. Ctrl-click selects objects. Ctrl+A selects all. C clears selection. Delete removes selected.';
  body.appendChild(slotInfo);

  body.appendChild(assetSelectRow());

  body.appendChild(colorPicker('Object Color', 'placerObjectColor', () => {
    rebuildPlacedObjects();
  }));

  const selectedRow = document.createElement('div');
  selectedRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;font-size:11px;color:var(--sb-muted);letter-spacing:0.06em;';
  const selectedLabel = document.createElement('span');
  selectedLabel.textContent = 'Selected Objects';
  const selectedValue = document.createElement('span');
  selectedValue.id = 'placed-selection-count';
  selectedValue.style.cssText = 'color:var(--sb-text);font-weight:700;';
  selectedValue.textContent = String(getSelectedPlacedObjectCount());
  selectedRow.appendChild(selectedLabel);
  selectedRow.appendChild(selectedValue);
  body.appendChild(selectedRow);

  const selectionButtons = document.createElement('div');
  selectionButtons.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;';
  selectionButtons.appendChild(btn('Select All', 'sb-btn-muted', () => {
    selectAllPlacedObjects();
    selectedValue.textContent = String(getSelectedPlacedObjectCount());
    notify('Selected all placed objects ✓');
  }));
  selectionButtons.appendChild(btn('Clear Selection', 'sb-btn-muted', () => {
    clearPlacedObjectSelection();
    selectedValue.textContent = '0';
    notify('Selection cleared ✓');
  }));
  body.appendChild(selectionButtons);

  body.appendChild(btn('🗑 Delete Selected', 'sb-btn-muted', () => {
    const removed = deleteSelectedPlacedObjects();
    selectedValue.textContent = String(getSelectedPlacedObjectCount());
    notify(removed ? `Deleted ${removed} selected object${removed === 1 ? '' : 's'} ✓` : 'No selected objects');
  }));

  body.appendChild(btn('🗑 Clear All Placed', 'sb-btn-muted', () => {
    clearPlacedObjects();
    selectedValue.textContent = '0';
    notify('Placed objects cleared ✓');
  }));

  window.addEventListener('placed-selection-changed', event => {
    if (!selectedValue.isConnected) return;
    selectedValue.textContent = String(event.detail?.count ?? getSelectedPlacedObjectCount());
  });
}


function buildScenes(body) {
  body.appendChild(subhdr('Saved Player Scenes'));
  body.appendChild(smallInfo('Save the current playable layout, then load it later from player mode or Landscape Editor. Scene data includes placed assets, editor-placed NPCs, player spawn point, and build-area settings.'));
  buildSceneSaveLoadControls(body);
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
    state.activePreset = 'g40';
    applyAllParams();
    rebuildPanel();
    notify('Reset ✓');
  }));

  container.appendChild(wrap);
}

function applyParamObject(params) {
  const incoming = params || {};
  Object.assign(
    state.params,
    JSON.parse(JSON.stringify(defaultParams)),
    incoming
  );

  // Older JSON files only had one global reticleType. Preserve that import by
  // copying it to the selected weapon's reticle when no per-weapon reticle keys
  // are present in the imported object.
  if (!Object.prototype.hasOwnProperty.call(incoming, 'weaponRifleRange') && Object.prototype.hasOwnProperty.call(incoming, 'laserRange')) {
    state.params.weaponRifleRange = incoming.laserRange;
  }
  if (!Object.prototype.hasOwnProperty.call(incoming, 'weaponRifleFireRate') && Object.prototype.hasOwnProperty.call(incoming, 'laserFireRate')) {
    state.params.weaponRifleFireRate = incoming.laserFireRate;
  }
  if (!Object.prototype.hasOwnProperty.call(incoming, 'weaponRifleProjectileSpeed') && Object.prototype.hasOwnProperty.call(incoming, 'laserProjectileSpeed')) {
    state.params.weaponRifleProjectileSpeed = incoming.laserProjectileSpeed;
  }
  if (!Object.prototype.hasOwnProperty.call(incoming, 'weaponRifleProjectileColor') && Object.prototype.hasOwnProperty.call(incoming, 'laserBloomColor')) {
    state.params.weaponRifleProjectileColor = incoming.laserBloomColor;
  }
  if (!Object.prototype.hasOwnProperty.call(incoming, 'weaponRifleProjectileBloom') && Object.prototype.hasOwnProperty.call(incoming, 'laserBloom')) {
    state.params.weaponRifleProjectileBloom = incoming.laserBloom;
  }

  const hasWeaponReticle = WEAPON_CONTROL_SPECS.some(spec => Object.prototype.hasOwnProperty.call(incoming, weaponReticleKey(spec)));
  if (!hasWeaponReticle && incoming.reticleType && RETICLE_MARKUP[incoming.reticleType]) {
    const spec = weaponSpecForType(state.params.playerWeaponType);
    state.params[weaponReticleKey(spec)] = incoming.reticleType;
  }
  const hasWeaponReticleOpacity = WEAPON_CONTROL_SPECS.some(spec => Object.prototype.hasOwnProperty.call(incoming, weaponReticleOpacityKey(spec)));
  if (!hasWeaponReticleOpacity && Object.prototype.hasOwnProperty.call(incoming, 'reticleOpacity')) {
    const spec = weaponSpecForType(state.params.playerWeaponType);
    state.params[weaponReticleOpacityKey(spec)] = incoming.reticleOpacity;
  }
  if (!Array.isArray(state.params.savedPrefabs)) state.params.savedPrefabs = [];
  if (!Array.isArray(state.params.savedScenes)) state.params.savedScenes = [];
  resetAllWeaponAmmo();
}

function applyPreset(key) {
  const preset = PRESET_SETTINGS.find(item => item.key === key);
  if (!preset) return;

  // Use the inline data exclusively — it is always kept in sync with the
  // JSON files and is the authoritative source of truth for each preset.
  // Fetching the JSON from the server was causing silent divergence: cached
  // or stale server responses would override inline values, making preset
  // loading behave differently from importing the same file via the file picker.
  applyParamObject(preset.data);
  state.activePreset = preset.key;
  applyAllParams();
  rebuildPanel();
  notify(`${preset.label} loaded ✓`);
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
  "dot": "<span class=\"reticle-part reticle-dot\"></span>",
  "cross": "<span class=\"reticle-part reticle-line reticle-line-h\"></span><span class=\"reticle-part reticle-line reticle-line-v\"></span>",
  "ring": "<span class=\"reticle-part reticle-ring\"></span>",
  "crossDot": "<span class=\"reticle-part reticle-line reticle-line-h\"></span><span class=\"reticle-part reticle-line reticle-line-v\"></span><span class=\"reticle-part reticle-dot\"></span>",
  "triSpoke": "<span class=\"reticle-part reticle-spoke\" style=\"--angle: 0deg\"></span><span class=\"reticle-part reticle-spoke\" style=\"--angle: 120deg\"></span><span class=\"reticle-part reticle-spoke\" style=\"--angle: 240deg\"></span><span class=\"reticle-part reticle-dot reticle-center-dot\"></span>",
  "rl2": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-rl2\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-122h28v94h94v28H172Zm494 0v-28h94v-94h28v122H666ZM318.5-318.5Q252-385 252-480t66.5-161.5Q385-708 480-708t161.5 66.5Q708-575 708-480t-66.5 161.5Q575-252 480-252t-161.5-66.5ZM480-280q83 0 141.5-58.5T680-480q0-83-58.5-141.5T480-680q-83 0-141.5 58.5T280-480q0 83 58.5 141.5T480-280ZM172-666v-122h122v28h-94v94h-28Zm588 0v-94h-94v-28h122v122h-28ZM480-480Z\"/></svg>",
  "rocket_launcher": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-rocket-launcher\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M431.5-431.5Q412-451 412-480t19.5-48.5Q451-548 480-548t48.5 19.5Q548-509 548-480t-19.5 48.5Q509-412 480-412t-48.5-19.5Zm77-20Q520-463 520-480t-11.5-28.5Q497-520 480-520t-28.5 11.5Q440-497 440-480t11.5 28.5Q463-440 480-440t28.5-11.5ZM232-172q-26 0-43-17t-17-43v-128h28v128q0 12 10 22t22 10h128v28H232Zm368 0v-28h128q12 0 22-10t10-22v-128h28v128q0 26-17 43t-43 17H600ZM172-600v-128q0-26 17-43t43-17h128v28H232q-12 0-22 10t-10 22v128h-28Zm588 0v-128q0-12-10-22t-22-10H600v-28h128q26 0 43 17t17 43v128h-28Z\"/></svg>",
  "shotgun": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-shotgun\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M480.17-132q-72.17 0-135.73-27.39-63.56-27.39-110.57-74.35-47.02-46.96-74.44-110.43Q132-407.65 132-479.83q0-72.17 27.39-135.73 27.39-63.56 74.35-110.57 46.96-47.02 110.43-74.44Q407.65-828 479.83-828q72.17 0 135.73 27.39 63.56 27.39 110.57 74.35 47.02 46.96 74.44 110.43Q828-552.35 828-480.17q0 72.17-27.39 135.73-27.39 63.56-74.35 110.57-46.96 47.02-110.43 74.44Q552.35-132 480.17-132Zm-.17-28q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z\"/></svg>",
  "tr1": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr1\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M800-600v-120H680v-28h148v148h-28Zm-668 0v-148h148v28H160v120h-28Zm548 388v-28h120v-120h28v148H680Zm-548 0v-148h28v120h120v28H132Zm152-152v-232h392v232H284Zm28-28h336v-176H312v176Zm0 0v-176 176Z\"/></svg>",
  "tr2": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr2\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M800-560v-120H680v-28h148v148h-28Zm-668 0v-148h148v28H160v120h-28Zm548 308v-28h120v-120h28v148H680Zm-548 0v-148h28v120h120v28H132Z\"/></svg>",
  "tr3": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr3\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M800-132v-696h28v696h-28Zm-668 0v-696h28v696h-28Zm494-174v-348h68v348h-68Zm-360 0v-348h68v348h-68Z\"/></svg>",
  "tr4": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr4\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M200-200h560v-560H200v560Zm-28 28v-616h616v616H172Zm144-288v-40h40v40h-40Zm144 144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm144 144v-40h40v40h-40Z\"/></svg>",
  "tr5": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr5\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-188h28v160h160v28H172Zm428 0v-28h160v-160h28v188H600ZM172-600v-188h188v28H200v160h-28Zm588 0v-160H600v-28h188v188h-28Z\"/></svg>",
  "tr6": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr6\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M236-786v-28h488v28H236Zm71 558.97q-71-71.03-71-173T307.03-573q71.03-71 173-71T653-572.97q71 71.03 71 173T652.97-227q-71.03 71-173 71T307-227.03ZM633-247q63-63 63-153t-63-153q-63-63-153-63t-153 63q-63 63-63 153t63 153q63 63 153 63t153-63Z\"/></svg>",
  "tr7": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr7\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-28h616v28H172Zm160-147v-28h296v28H332ZM172-466v-28h616v28H172Zm160-147v-28h296v28H332ZM172-760v-28h616v28H172Z\"/></svg>",
  "tr8": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr8\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M132-132v-40h696v40H132Zm174-314v-68h348v68H306ZM132-788v-40h696v40H132Z\"/></svg>",
  "tr9": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr9\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-28h616v28H172Zm0-128v-488h616v488H172Zm28-28h560v-432H200v432Zm0 0v-432 432Z\"/></svg>",
  "tr10": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr10\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M132-132v-696h40v696h-40Zm314-174v-348h68v348h-68Zm342 174v-696h40v696h-40Z\"/></svg>",
  "tr11": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr11\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M212-386v-28h536v28H212Zm0-160v-28h536v28H212Z\"/></svg>",
  "tr12": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr12\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-680v-28h616v28H172Zm0 428v-28h616v28H172Zm0-214v-28h616v28H172Z\"/></svg>",
  "tr13": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr13\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm144 576v-40h40v40h-40Zm0-288v-40h40v40h-40Zm0-288v-40h40v40h-40Zm150 576v-616h28v616h-28Zm138 0v-40h40v40h-40Zm0-288v-40h40v40h-40Zm0-288v-40h40v40h-40Zm144 576v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Z\"/></svg>",
  "tr14": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr14\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M132-800v-28h696v28H132Zm174 214v-68h348v68H306Zm0 240v-68h348v68H306Z\"/></svg>",
  "tr15": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr15\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M306-732v-68H132v-28h696v28H654v68H306ZM132-132v-28h174v-68h348v68h174v28H132Z\"/></svg>",
  "tr16": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr16\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M132-800v-28h696v28H132Zm0 668v-28h696v28H132Zm314-180v-356h68v356h-68Z\"/></svg>",
  "tr17": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr17\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M800-132v-696h28v696h-28Zm-668 0v-696h28v696h-28Zm494-174v-348h68v348h-68Zm-360 0v-348h68v348h-68Z\"/></svg>",
  "tr18": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr18\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M528.5-431.5Q548-451 548-480t-19.5-48.5Q509-548 480-548t-48.5 19.5Q412-509 412-480t19.5 48.5Q451-412 480-412t48.5-19.5ZM480.17-132q-72.17 0-135.73-27.39-63.56-27.39-110.57-74.35-47.02-46.96-74.44-110.43Q132-407.65 132-479.83q0-72.17 27.39-135.73 27.39-63.56 74.35-110.57 46.96-47.02 110.43-74.44Q407.65-828 479.83-828q72.17 0 135.73 27.39 63.56 27.39 110.57 74.35 47.02 46.96 74.44 110.43Q828-552.35 828-480.17q0 72.17-27.39 135.73-27.39 63.56-74.35 110.57-46.96 47.02-110.43 74.44Q552.35-132 480.17-132Zm-.17-28q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z\"/></svg>",
  "tr19": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr19\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M480-116 276-320l20-20 184 182 184-182 20 20-204 204ZM296-620l-20-20 204-204 204 204-20 20-184-182-184 182Z\"/></svg>",
  "tr20": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr20\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"m174-212 306-490 306 490H174Zm50-28h512L480-650 224-240Zm256-205Z\"/></svg>",
  "tr21": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr21\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M260-234v-24h440v24H260Zm4-144 216-322 216 322H264Zm216-24Zm-166 0h332L480-650 314-402Z\"/></svg>",
  "tr22": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr22\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M480-564 296-380l-20-20 204-204 204 204-20 20-184-184Z\"/></svg>",
  "tr23": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr23\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M304-455.88q10-9.88 10-24T304.12-504q-9.88-10-24-10T256-504.12q-10 9.88-10 24t9.88 24.12q9.88 10 24 10t24.12-9.88Zm200 0q10-9.88 10-24T504.12-504q-9.88-10-24-10T456-504.12q-10 9.88-10 24t9.88 24.12q9.88 10 24 10t24.12-9.88Zm200 0q10-9.88 10-24T704.12-504q-9.88-10-24-10T656-504.12q-10 9.88-10 24t9.88 24.12q9.88 10 24 10t24.12-9.88ZM480.17-132q-72.17 0-135.73-27.39-63.56-27.39-110.57-74.35-47.02-46.96-74.44-110.43Q132-407.65 132-479.83q0-72.17 27.39-135.73 27.39-63.56 74.35-110.57 46.96-47.02 110.43-74.44Q407.65-828 479.83-828q72.17 0 135.73 27.39 63.56 27.39 110.57 74.35 47.02 46.96 74.44 110.43Q828-552.35 828-480.17q0 72.17-27.39 135.73-27.39 63.56-74.35 110.57-46.96 47.02-110.43 74.44Q552.35-132 480.17-132Zm-.17-28q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z\"/></svg>",
  "tr24": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr24\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"m480-172 82-81 19 20-101 101-101-101 20-20 81 81ZM172-480l81 81-20 20-101-101 101-101 20 19-81 82Zm617 0-81-82 19-19 101 101-101 101-19-20 81-81ZM480-789l-81 81-20-19 101-101 101 101-19 19-82-81Z\"/></svg>",
  "tr25": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr25\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M383.5-582.5Q338-599 300-628l26-16q24 17 59 30t81 21v-228l14-9 14 9v228q44-8 79-21t61-30l26 16q-38 29-83.5 45.5T480-566q-51 0-96.5-16.5ZM412-204l-27-15q1-5 1-10.5V-240q0-26-7.5-58T357-366L160-248l-14-8v-16l196-118q-28-32-57.5-55.5T226-483v-31q82 32 135 106t53 168q0 9-.5 18t-1.5 18Zm136 0q-1-9-1.5-18t-.5-18q0-94 53-168t135-106v30q-28 12-57.5 36.5T618-390l196 118v16l-14 8-197-118q-14 36-21.5 68t-7.5 58v10.5q0 5.5 1 10.5l-27 15Z\"/></svg>",
  "tr26": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr26\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M287-146 94-480l193-334h386l193 334-193 334H287Zm16-28h354l176-306-176-306H303L126-480l177 306Zm177-306Z\"/></svg>",
  "tr27": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr27\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M480-827q66-1 101.5 49.5T644-664q24 57 48 129t50 145q26 70 55 131.5T864-155q4 5 4 10.5t-4 8.5q-5 4-10.5 4t-9.5-4q-67-66-113.5-137T642-390q-34-38-73-60.5T480-472q-50-1-89 21.5T318-390q-42 46-88.5 117T116-136q-4 4-9.5 4T96-136q-4-3-4-8.5t4-10.5q38-41 67-103t55-132q26-73 50-145t48-129q27-63 62.5-113.5T480-827Zm-84.5 73.5Q365-708 343-656q-36 86-64.5 178.5T213-297q21-29 42-59t45-57q38-40 81.5-63.5T480-500q55 0 98.5 23.5T660-413q24 27 45 57t42 59q-37-88-65.5-180.5T617-656q-22-52-52.5-97.5T480-799q-54 0-84.5 45.5ZM480-500Z\"/></svg>",
  "tr28": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr28\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M266-652v-28h428v28H266Zm30 396-20-20 204-204 204 204-20 20-184-184-184 184Z\"/></svg>",
  "tr29": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr29\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M363-351.5Q315-397 305-466H132v-28h173q10-69 58-114.5T480-654q69 0 117.5 45.5T655-494h173v28H655q-9 69-57.5 114.5T480-306q-69 0-117-45.5ZM480-334q60 0 103-43t43-103q0-60-43-103t-103-43q-60 0-103 43t-43 103q0 60 43 103t103 43Z\"/></svg>",
  "tr30": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr30\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M363-351.5Q315-397 305-466H132v-28h173q10-69 58-114.5T480-654q69 0 117.5 45.5T655-494h173v28H655q-9 69-57.5 114.5T480-306q-69 0-117-45.5ZM480-334q60 0 103-43t43-103q0-60-43-103t-103-43q-60 0-103 43t-43 103q0 60 43 103t103 43Z\"/></svg>",
  "tr31": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr31\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M441.5-441.5Q426-457 426-480t15.5-38.5Q457-534 480-534t38.5 15.5Q534-503 534-480t-15.5 38.5Q503-426 480-426t-38.5-15.5ZM466-640v-148h28v148h-28Zm0 468v-148h28v148h-28Zm174-294v-28h148v28H640Zm-468 0v-28h148v28H172Z\"/></svg>",
  "tr32": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr32\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M212-412v-188h28v160h480v-160h28v188H212Z\"/></svg>",
  "tr33": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr33\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M481-74 334-220l20-20 127 126 126-126 20 20L481-74Zm0-200L334-420l20-20 127 126 126-126 20 20-146 146ZM354-520l-20-21 146-146 147 147-20 20-127-126-126 126Zm0-200-20-21 146-146 147 147-20 20-127-126-126 126Z\"/></svg>",
  "tr34": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr34\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M466-132v-696h28v696h-28Zm120-174v-348h68v348h-68Zm-280 0v-348h68v348h-68Z\"/></svg>",
  "tr35": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr35\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M332-212v-536h296v536H332Zm-128-80v-376h28v376h-28Zm524 0v-376h28v376h-28Zm-368 52h240v-480H360v480Zm0 0v-480 480Z\"/></svg>",
  "tr36": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr36\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-28h616v28H172Zm0-588v-28h616v28H172Z\"/></svg>",
  "tr37": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr37\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-148h128l166-166v-112q-34-8-57-33.5T386-692q0-39 27.5-66.5T480-786q39 0 66.5 27.5T574-692q0 35-23 60.5T494-598v112l166 166h128v148H640v-128L480-460 320-300v128H172Z\"/></svg>",
  "tr38": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr38\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M429-292v-28h101v28H429ZM282-466v-28h395v28H282ZM172-640v-28h616v28H172Z\"/></svg>",
  "tr39": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr39\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M255-160h450q-23-78-34.47-158.5Q659.06-399 659.06-480t11.47-161.5Q682-722 705-800H255q23 78 33.5 158.5T299-480q0 81-10.5 161.5T255-160Zm-36 28q23-81 38.5-161.5T273-480q0-106-15.5-186.5T219-828h522q-23 81-37.5 161.5T689-480q0 106 14.5 186.5T741-132H219Zm261-348Z\"/></svg>",
  "tr40": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr40\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M479.81-374Q436-374 405-405.19q-31-31.2-31-75Q374-524 405.19-555q31.2-31 75-31Q524-586 555-554.81q31 31.2 31 75Q586-436 554.81-405q-31.2 31-75 31ZM575-385q39-39 39-95t-39-95q-39-39-95-39t-95 39q-39 39-39 95t39 95q39 39 95 39t95-39ZM132-212v-536h696v536H132Zm28-28h640v-480H160v480Zm0 0v-480 480Z\"/></svg>",
  "tr41": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr41\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M466-118v-52q-125-11-204-90t-90-204h-52v-28h52q11-125 90-204t204-90v-52h28v52q125 11 204 90t90 204h52v28h-52q-11 125-90 204t-204 90v52h-28Zm212-162q82-82 82-198t-82-198q-82-82-198-82t-198 82q-82 82-82 198t82 198q82 82 198 82t198-82Z\"/></svg>",
  "tr42": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr42\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M466-120v-52q-125-11-204-90t-90-204h-52v-28h52q11-125 90-204t204-90v-52h28v52q125 11 204 90t90 204h52v28h-52q-11 125-90 204t-204 90v52h-28Zm212-162q82-82 82-198t-82-198q-82-82-198-82t-198 82q-82 82-82 198t82 198q82 82 198 82t198-82ZM403.5-403.5Q372-435 372-480t31.5-76.5Q435-588 480-588t76.5 31.5Q588-525 588-480t-31.5 76.5Q525-372 480-372t-76.5-31.5Zm133-20Q560-447 560-480t-23.5-56.5Q513-560 480-560t-56.5 23.5Q400-513 400-480t23.5 56.5Q447-400 480-400t56.5-23.5ZM480-480Z\"/></svg>",
  "tr43": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr43\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M480-132 292-481l188-347 188 347-188 349Zm0-59 156-290-156-288-156 288 156 290Zm0-289Z\"/></svg>",
  "tr44": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr44\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"m250-198-12-10 242-544 242 544-12 10-230-98-230 98Zm34-46 196-84 196 84-196-440-196 440Zm196-84Z\"/></svg>",
  "tr45": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr45\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M480-132q-95.27 0-161.64-66.46Q252-264.93 252-360.34q0-76.66 47.85-138.33Q347.7-560.33 426-582v-242q0-12 8.63-21 8.62-9 21.37-9h48q12 0 21 9t9 21v242q77 22 125.5 83.5T708-360.34q0 95.41-66.77 161.88Q574.46-132 480-132Zm0-28q83 0 141.5-58T680-360q0-83-58.5-141.5T480-560q-84 0-142 58.5T280-360q0 84 58 142t142 58Z\"/></svg>",
  "tr46": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr46\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M344.5-159.5Q281-187 234-234t-74.5-110.5Q132-408 132-480t27.5-135.5Q187-679 234-726t110.5-74.5Q408-828 480-828t135.5 27.5Q679-773 726-726t74.5 110.5Q828-552 828-480t-27.5 135.5Q773-281 726-234t-110.5 74.5Q552-132 480-132t-135.5-27.5Zm335-121Q762-363 762-480t-82.5-199.5Q597-762 480-762t-199.5 82.5Q198-597 198-480t82.5 199.5Q363-198 480-198t199.5-82.5Z\"/></svg>",
  "tr47": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr47\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-616h40v616h-40Zm576 0v-616h40v616h-40ZM316-460v-40h40v40h-40Zm144 288v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm0-144v-40h40v40h-40Zm144 288v-40h40v40h-40Z\"/></svg>",
  "tr48": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr48\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M172-172v-616h40v616h-40Zm576 0v-616h40v616h-40ZM316-460v-40h40v40h-40Zm144 0v-40h40v40h-40Zm144 0v-40h40v40h-40Z\"/></svg>",
  "tr49": "<svg aria-hidden=\"true\" class=\"reticle-svg reticle-tr49\" xmlns=\"http://www.w3.org/2000/svg\" height=\"24px\" viewBox=\"0 -960 960 960\" width=\"24px\" fill=\"currentColor\"><path d=\"M332-212v-536h296v536H332Zm-128-80v-376h28v376h-28Zm524 0v-376h28v376h-28Zm-368 52h240v-480H360v480Zm0 0v-480 480Z\"/></svg>",
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
  syncReticleToCurrentWeapon();
  setReticleType(el, p.reticleType || 'dot');
  el.style.display = p.hudVisible && p.reticleVisible ? '' : 'none';
  el.style.setProperty('--reticle-color', p.reticleColor);
  const reticleWeight = Number.isFinite(Number(p.reticleWeight)) ? Number(p.reticleWeight) : Number(p.reticleThickness) || 2;
  el.style.setProperty('--reticle-size', `${p.reticleSize}px`);
  el.style.setProperty('--reticle-thickness', `${reticleWeight}px`);
  el.style.setProperty('--reticle-svg-stroke-width', `${Math.max(0, reticleWeight - 2)}px`);
  el.style.setProperty('--reticle-dot-size', `${Math.max(reticleWeight * 2, 3)}px`);
  el.style.setProperty('--reticle-opacity', p.reticleOpacity);

  const hitEl = document.getElementById('hit-marker');
  if (hitEl) {
    const hitColor = /^#[0-9a-f]{6}$/i.test(String(p.reticleHitMarkerColor || '')) ? p.reticleHitMarkerColor : '#ffffff';
    const hitSize = Math.min(160, Math.max(12, Number(p.reticleHitMarkerSize) || 54));
    const hitWeight = Math.min(12, Math.max(0.5, Number(p.reticleHitMarkerWeight) || 3));
    const hitOpacity = Math.min(1, Math.max(0, Number(p.reticleHitMarkerOpacity) || 1));
    const hitDuration = Math.min(500, Math.max(80, Number(p.reticleHitMarkerDuration) || 190));
    hitEl.style.display = p.hudVisible !== false && p.reticleVisible !== false && p.reticleHitMarkerEnabled !== false ? 'block' : 'none';
    hitEl.style.setProperty('--hit-marker-color', hitColor);
    hitEl.style.setProperty('--hit-marker-size', `${hitSize}px`);
    hitEl.style.setProperty('--hit-marker-weight', `${hitWeight}px`);
    hitEl.style.setProperty('--hit-marker-opacity', String(hitOpacity));
    hitEl.style.setProperty('--hit-marker-duration', `${hitDuration}ms`);
  }

  const killEl = document.getElementById('kill-confirmation');
  if (killEl) {
    const killColor = /^#[0-9a-f]{6}$/i.test(String(p.reticleKillConfirmColor || '')) ? p.reticleKillConfirmColor : '#ffffff';
    const killSize = Math.min(160, Math.max(12, Number(p.reticleKillConfirmSize) || 64));
    const killOpacity = Math.min(1, Math.max(0, Number(p.reticleKillConfirmOpacity) || 0.9));
    const killDuration = Math.min(800, Math.max(80, Number(p.reticleKillConfirmDuration) || 320));
    killEl.style.display = p.hudVisible !== false && p.reticleVisible !== false && p.reticleKillConfirmEnabled !== false ? 'block' : 'none';
    killEl.style.setProperty('--kill-confirm-color', killColor);
    killEl.style.setProperty('--kill-confirm-size', `${killSize}px`);
    killEl.style.setProperty('--kill-confirm-opacity', String(killOpacity));
    killEl.style.setProperty('--kill-confirm-duration', `${killDuration}ms`);
  }
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
  const hudFont = HUD_FONT_STYLES[p.hudFont] || HUD_FONT_STYLES.system;
  // Apply font CSS vars on <html> so #pause-overlay and any other HUD element
  // outside #game-hud (which is a child of body, not game-hud) also inherits them.
  document.documentElement.style.setProperty('--hud-font-family', hudFont.family);
  document.documentElement.style.setProperty('--hud-font-weight', hudFont.weight);
  document.documentElement.style.setProperty('--hud-letter-spacing', hudFont.letterSpacing || '0.18em');
  const gameHudEl = document.getElementById('game-hud');
  if (gameHudEl) {
    gameHudEl.style.display = p.hudVisible ? '' : 'none';
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

  const btIndicatorEl = document.getElementById('bullet-time-indicator');
  if (btIndicatorEl) {
    const btEnabled = p.hudVisible !== false && p.hudBulletTimeIndicator !== false && p.bulletTimeEnabled !== false;
    btIndicatorEl.style.display = btEnabled ? '' : 'none';
    btIndicatorEl.style.width = `${Math.min(64, Math.max(8, Number(p.hudBulletTimeIndicatorSize) || 24))}px`;
    btIndicatorEl.style.height = `${Math.min(64, Math.max(8, Number(p.hudBulletTimeIndicatorSize) || 24))}px`;
  }

  const btActiveIconEl = document.getElementById('bullet-time-active-indicator');
  if (btActiveIconEl) {
    const btActiveEnabled = p.hudVisible !== false && p.hudBulletTimeActiveIcon !== false && p.bulletTimeEnabled !== false && state.slowTimer > 0;
    const btActiveSize = Math.min(128, Math.max(12, Number(p.hudBulletTimeActiveIconSize) || 42));
    btActiveIconEl.style.display = btActiveEnabled ? 'block' : 'none';
    btActiveIconEl.style.width = `${btActiveSize}px`;
    btActiveIconEl.style.height = `${btActiveSize}px`;
    const btActiveIconAsset = new URL('../../assets/time.svg', import.meta.url).href;
    btActiveIconEl.style.webkitMaskImage = `url("${btActiveIconAsset}")`;
    btActiveIconEl.style.maskImage = `url("${btActiveIconAsset}")`;
    btActiveIconEl.style.opacity = `${Math.min(1, Math.max(0, Number(p.hudBulletTimeActiveIconOpacity) || 1))}`;
  }

  document.querySelectorAll('.npc-health-bar').forEach(el => {
    const teamEnabled = el.dataset.team === 'ally'
      ? p.hudAllyHealthBars !== false
      : p.hudEnemyHealthBars !== false;
    if (!p.hudVisible || p.hudNpcHealthBars === false || !teamEnabled) {
      el.style.display = 'none';
    }
  });

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
  applyPlayerWeaponSettings();
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
  applyFloorSettings({ force: true });
  const rotationDeg = ((Math.round((Number(p.placerRotationDeg) || 0) / 90) * 90) % 360 + 360) % 360;
  p.placerRotationDeg = rotationDeg;
  const snapScale = value => Math.min(6, Math.max(0.5, Math.round((Number(value) || 1) * 2) / 2));
  p.placerScaleX = snapScale(p.placerScaleX);
  p.placerScaleY = snapScale(p.placerScaleY);
  p.placerScaleZ = snapScale(p.placerScaleZ);
  const modalCoord = value => Math.max(22, Math.round(Number(value) || 22));
  p.placerTransformModalX = modalCoord(p.placerTransformModalX);
  p.placerTransformModalY = modalCoord(p.placerTransformModalY);
  p.editorModeEnabled = p.editorModeEnabled === true;
  p.editorPlacementTarget = ['asset', 'enemy', 'ally', 'playerSpawn'].includes(p.editorPlacementTarget) ? p.editorPlacementTarget : 'asset';
  p.editorMoveSpeed = Math.min(80, Math.max(0.1, Number(p.editorMoveSpeed) || 7));
  p.editorSprintMultiplier = Math.min(8, Math.max(1, Number(p.editorSprintMultiplier) || 2.25));
  p.editorPrecisionMultiplier = Math.min(1, Math.max(0.05, Number(p.editorPrecisionMultiplier) || 0.28));
  p.editorEyeHeight = Math.min(12, Math.max(0.25, Number(p.editorEyeHeight) || 1.7));
  p.editorFov = Math.min(110, Math.max(30, Number(p.editorFov) || 70));
  p.editorMouseSensitivityX = Math.min(0.03, Math.max(0.0002, Number(p.editorMouseSensitivityX) || 0.003));
  p.editorMouseSensitivityY = Math.min(0.03, Math.max(0.0002, Number(p.editorMouseSensitivityY) || 0.0024));
  p.editorCameraX = Number.isFinite(Number(p.editorCameraX)) ? Number(p.editorCameraX) : 0;
  p.editorCameraY = Number.isFinite(Number(p.editorCameraY)) ? Number(p.editorCameraY) : p.editorEyeHeight;
  p.editorCameraZ = Number.isFinite(Number(p.editorCameraZ)) ? Number(p.editorCameraZ) : 8;
  p.editorYaw = Number.isFinite(Number(p.editorYaw)) ? Number(p.editorYaw) : 0;
  p.editorPitch = Math.min(1.45, Math.max(-1.45, Number.isFinite(Number(p.editorPitch)) ? Number(p.editorPitch) : -0.12));
  const snapSpawnYaw = value => {
    const quarterTurn = Math.PI / 2;
    const yawValue = Number.isFinite(Number(value)) ? Number(value) : 0;
    return ((Math.round(yawValue / quarterTurn) * quarterTurn) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  };
  p.editorPlayerSpawnYaw = snapSpawnYaw(Number.isFinite(Number(p.editorPlayerSpawnYaw)) ? Number(p.editorPlayerSpawnYaw) : p.editorYaw);
  p.playerSpawnEnabled = p.playerSpawnEnabled === true;
  p.playerSpawnX = Number.isFinite(Number(p.playerSpawnX)) ? Number(p.playerSpawnX) : 0;
  p.playerSpawnY = Math.max(0, Number.isFinite(Number(p.playerSpawnY)) ? Number(p.playerSpawnY) : 0);
  p.playerSpawnZ = Number.isFinite(Number(p.playerSpawnZ)) ? Number(p.playerSpawnZ) : 0;
  p.playerSpawnYaw = snapSpawnYaw(Number.isFinite(Number(p.playerSpawnYaw)) ? Number(p.playerSpawnYaw) : p.editorPlayerSpawnYaw);
  if (!Array.isArray(p.editorPlacedNpcs)) p.editorPlacedNpcs = [];
  p.placedAssetShadows = p.placedAssetShadows === true;
  p.landscapeEditorModeEnabled = p.landscapeEditorModeEnabled === true;
  p.landscapeEditorCloneOffsetX = Math.min(20, Math.max(-20, Number(p.landscapeEditorCloneOffsetX) || 1));
  p.landscapeEditorCloneOffsetZ = Math.min(20, Math.max(-20, Number(p.landscapeEditorCloneOffsetZ) || 1));
  p.landscapeEditorSelectionColor = /^#[0-9a-fA-F]{6}$/.test(String(p.landscapeEditorSelectionColor || '')) ? p.landscapeEditorSelectionColor : '#445566';
  const landscapeScale = value => Math.min(6, Math.max(0.5, Math.round((Number(value) || 1) * 2) / 2));
  p.landscapeEditorSelectionScaleX = landscapeScale(p.landscapeEditorSelectionScaleX);
  p.landscapeEditorSelectionScaleY = landscapeScale(p.landscapeEditorSelectionScaleY);
  p.landscapeEditorSelectionScaleZ = landscapeScale(p.landscapeEditorSelectionScaleZ);
  p.landscapeEditorSelectionRotationDeg = ((Math.round((Number(p.landscapeEditorSelectionRotationDeg) || 0) / 90) * 90) % 360 + 360) % 360;
  p.landscapeEditorPrefabName = typeof p.landscapeEditorPrefabName === 'string' ? p.landscapeEditorPrefabName : 'Saved Structure';
  p.landscapeEditorSceneName = typeof p.landscapeEditorSceneName === 'string' ? p.landscapeEditorSceneName : 'Scene 1';
  p.landscapeEditorSelectedSceneId = typeof p.landscapeEditorSelectedSceneId === 'string' ? p.landscapeEditorSelectedSceneId : '';
  if (!Array.isArray(p.savedPrefabs)) p.savedPrefabs = [];
  if (!Array.isArray(p.savedScenes)) p.savedScenes = [];
  if (!('soundSfx_jump' in p)) p.soundSfx_jump = 1;
  if (!('soundSfx_reload' in p)) p.soundSfx_reload = 1;
  if (!('soundSfx_pistol_reload' in p)) p.soundSfx_pistol_reload = 1;
  if (!('soundSfx_empty' in p)) p.soundSfx_empty = 1;
  if (!('weaponRifleTracers' in p)) p.weaponRifleTracers = true;
  if (!('reticleHitMarkerSize' in p)) p.reticleHitMarkerSize = 54;
  if (!('reticleHitMarkerWeight' in p)) p.reticleHitMarkerWeight = 3;
  if (!('reticleHitMarkerOpacity' in p)) p.reticleHitMarkerOpacity = 1;
  if (!('reticleHitMarkerColor' in p)) p.reticleHitMarkerColor = '#ffffff';
  if (!('reticleHitMarkerDuration' in p)) p.reticleHitMarkerDuration = 190;
  if (!('reticleKillConfirmDuration' in p)) p.reticleKillConfirmDuration = 320;
  if (!('soundSfx_enemy_grunt' in p)) p.soundSfx_enemy_grunt = 1;
  if (!('soundSfx_object_explode' in p)) p.soundSfx_object_explode = p.soundSfx_explode ?? 1;
  if (!('soundProximityEnabled' in p)) p.soundProximityEnabled = true;
  const clampSetting = (value, min, max, fallback) => {
    const numeric = Number(value);
    return Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : fallback));
  };
  const normalizeChoice = (value, options, fallback) => (
    options.some(([key]) => key === value) ? value : fallback
  );
  const normalizeNpcWeaponChoice = value => {
    if (value === 'laser') return 'rifle';
    if (value === 'sniper') return 'sniperRifle';
    if (value === 'projectile') return 'pistol';
    return normalizeChoice(value, NPC_WEAPON_OPTIONS, 'rifle');
  };
  p.playerWeaponType = normalizeChoice(p.playerWeaponType, PLAYER_WEAPON_OPTIONS, 'rifle');
  p.weaponInfiniteAmmo = p.weaponInfiniteAmmo === true;
  p.weaponRifleTracers = p.weaponRifleTracers !== false;
  const hexSetting = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback);
  const boolSetting = (value, fallback = false) => (value === true || value === false ? value : fallback);
  const weaponDefaults = {
    Pistol: { damage: 24, range: 55, spread: 0.01, fireRate: 3.6, speed: 70, size: 0.28, length: 0.65, bloomIntensity: 1, bloomSize: 1, color: '#d8dde6', bloomColor: '#d8dde6', bloom: false, reticle: 'dot', reticleSize: 24, reticleWeight: 2, reticleOpacity: 1 },
    Rifle: { damage: 34, range: Number(p.laserRange) || 42, spread: 0.003, fireRate: Number(p.laserFireRate) || 5, speed: Number(p.laserProjectileSpeed) || 80, size: 0.36, length: 0.84, bloomIntensity: 1, bloomSize: 1, color: p.laserBloomColor || '#ff1100', bloomColor: p.laserBloomColor || '#ff1100', bloom: p.laserBloom !== false, reticle: 'triSpoke', reticleSize: 24, reticleWeight: 2, reticleOpacity: 1 },
    Shotgun: { damage: 12, range: 28, spread: 0.16, fireRate: 1.15, speed: 60, size: 0.32, length: 0.75, bloomIntensity: 1, bloomSize: 1, color: '#d8dde6', bloomColor: '#d8dde6', bloom: false, reticle: 'crossDot', reticleSize: 24, reticleWeight: 2, reticleOpacity: 1 },
    Sniper: { damage: 120, range: 180, spread: 0.002, fireRate: 0.65, speed: 130, size: 0.24, length: 0.56, bloomIntensity: 1, bloomSize: 1, color: '#d975ff', bloomColor: '#d975ff', bloom: true, reticle: 'cross', reticleSize: 24, reticleWeight: 2, reticleOpacity: 1 },
    Grenade: { damage: 95, range: 60, spread: 0.01, fireRate: 0.72, speed: 16, size: 0.25, length: 0.27, bloomIntensity: 1, bloomSize: 1, color: '#ff8844', bloomColor: '#ff8844', bloom: false, reticle: 'ring', radius: 5, reticleSize: 24, reticleWeight: 2, reticleOpacity: 1 },
    Rocket: { damage: 130, range: 95, spread: 0.004, fireRate: 0.68, speed: 34, size: 0.42, length: 1.33, bloomIntensity: 1, bloomSize: 1, color: '#ff3333', bloomColor: '#ff3333', bloom: true, reticle: 'ring', radius: 6, reticleSize: 24, reticleWeight: 2, reticleOpacity: 1 },
  };
  WEAPON_CONTROL_SPECS.forEach(spec => {
    const d = weaponDefaults[spec.prefix];
    const ammo = weaponAmmoDefaults(spec);
    const magKey = weaponMagazineKey(spec);
    if (magKey) p[magKey] = Math.round(clampSetting(p[magKey], 1, 999, ammo.magazine));
    p[weaponTotalAmmoKey(spec)] = Math.round(clampSetting(p[weaponTotalAmmoKey(spec)], 0, 9999, ammo.total));
    const reloadKey = weaponReloadKey(spec);
    if (reloadKey) p[reloadKey] = clampSetting(p[reloadKey], 0, 10, ammo.reloadTime);
    p[weaponOffsetXKey(spec)] = clampSetting(p[weaponOffsetXKey(spec)], -2, 2, d.offsetX ?? 0);
    p[weaponOffsetYKey(spec)] = clampSetting(p[weaponOffsetYKey(spec)], -2, 2, d.offsetY ?? 0);
    const recoilKey = weaponRecoilKey(spec);
    if (recoilKey) p[recoilKey] = clampSetting(p[recoilKey], 0, 1, d.recoil ?? 0);
    p[weaponKey(spec.prefix, 'Damage')] = Math.round(clampSetting(p[weaponKey(spec.prefix, 'Damage')], 0, 1000, d.damage));
    p[weaponKey(spec.prefix, 'Range')] = clampSetting(p[weaponKey(spec.prefix, 'Range')], 1, 500, d.range);
    p[weaponKey(spec.prefix, 'Spread')] = clampSetting(p[weaponKey(spec.prefix, 'Spread')], 0, 1, d.spread);
    p[weaponKey(spec.prefix, 'FireRate')] = clampSetting(p[weaponKey(spec.prefix, 'FireRate')], 0.1, 30, d.fireRate);
    p[weaponKey(spec.prefix, 'ProjectileSpeed')] = clampSetting(p[weaponKey(spec.prefix, 'ProjectileSpeed')], 1, 500, d.speed);
    p[weaponKey(spec.prefix, 'ProjectileSize')] = clampSetting(p[weaponKey(spec.prefix, 'ProjectileSize')], 0.05, 2, d.size);
    p[weaponKey(spec.prefix, 'ProjectileLength')] = clampSetting(p[weaponKey(spec.prefix, 'ProjectileLength')], 0.05, 8, d.length);
    p[weaponKey(spec.prefix, 'ProjectileColor')] = hexSetting(p[weaponKey(spec.prefix, 'ProjectileColor')], d.color);
    p[weaponKey(spec.prefix, 'ProjectileBloom')] = boolSetting(p[weaponKey(spec.prefix, 'ProjectileBloom')], d.bloom);
    p[weaponKey(spec.prefix, 'ProjectileBloomColor')] = hexSetting(p[weaponKey(spec.prefix, 'ProjectileBloomColor')], d.bloomColor || p[weaponKey(spec.prefix, 'ProjectileColor')]);
    p[weaponKey(spec.prefix, 'ProjectileBloomIntensity')] = clampSetting(p[weaponKey(spec.prefix, 'ProjectileBloomIntensity')], 0, 3, d.bloomIntensity);
    p[weaponKey(spec.prefix, 'ProjectileBloomSize')] = clampSetting(p[weaponKey(spec.prefix, 'ProjectileBloomSize')], 0.25, 4, d.bloomSize);
    p[weaponReticleKey(spec)] = RETICLE_MARKUP[p[weaponReticleKey(spec)]] ? p[weaponReticleKey(spec)] : d.reticle;
    p[weaponReticleSizeKey(spec)] = clampSetting(p[weaponReticleSizeKey(spec)], 4, 96, d.reticleSize);
    p[weaponReticleWeightKey(spec)] = clampSetting(p[weaponReticleWeightKey(spec)], 0.5, 12, d.reticleWeight);
    p[weaponReticleOpacityKey(spec)] = clampSetting(p[weaponReticleOpacityKey(spec)], 0.05, 1, d.reticleOpacity);
    if (spec.radius) p[weaponKey(spec.prefix, 'Radius')] = clampSetting(p[weaponKey(spec.prefix, 'Radius')], 0.5, 60, d.radius);
  });
  p.weaponShotgunPellets = Math.round(clampSetting(p.weaponShotgunPellets, 1, 24, 8));
  ['Grenade', 'Rocket'].forEach(prefix => {
    const key = `weapon${prefix}Shockwave`;
    const radiusFallback = prefix === 'Rocket' ? (p.weaponRocketRadius || 6) : (p.weaponGrenadeRadius || 5);
    p[`${key}Speed`] = clampSetting(p[`${key}Speed`], 0, 40, Number(p.destructionDestructibleShockwaveSpeed) || 40);
    p[`${key}FadeTime`] = clampSetting(p[`${key}FadeTime`], 0.05, 3, Number(p.destructionDestructibleShockwaveFadeTime) || 0.12);
    p[`${key}Delay`] = clampSetting(p[`${key}Delay`], 0, 3, Number(p.destructionDestructibleShockwaveDelay) || 0);
    p[`${key}Transparency`] = clampSetting(p[`${key}Transparency`], 0, 1, Number(p.destructionDestructibleShockwaveTransparency) || 0.1);
    p[`${key}Color`] = hexSetting(p[`${key}Color`], p.destructionDestructibleShockwaveColor || '#ffffff');
    p[`${key}SplashDamage`] = clampSetting(p[`${key}SplashDamage`], 0, 500, Number(p.destructionDestructibleSplashDamage) || (prefix === 'Rocket' ? 130 : 95));
    p[`${key}SplashRadius`] = clampSetting(p[`${key}SplashRadius`], 0, 80, Number(p.destructionDestructibleSplashRadius) || radiusFallback);
    p[`${key}SplashFalloff`] = clampSetting(p[`${key}SplashFalloff`], 0.1, 4, Number(p.destructionDestructibleSplashFalloff) || 1);
    p[`${key}SplashMinFactor`] = clampSetting(p[`${key}SplashMinFactor`], 0, 1, Number(p.destructionDestructibleSplashMinFactor) || 0.15);
  });
  syncReticleToCurrentWeapon();
  applyPlayerWeaponSettings();
  syncWeaponAmmoHud();
  p.allyType = normalizeChoice(p.allyType, ENEMY_TYPE_OPTIONS, 'rusher');
  p.allyCount = Math.round(clampSetting(p.allyCount, 0, 50, 0));
  p.allyHealth = Math.round(clampSetting(p.allyHealth, 1, 1000, 100));
  p.allyInvincible = p.allyInvincible === true;
  p.allyFriendlyFire = p.allyFriendlyFire === true;
  p.allyBehavior = normalizeChoice(p.allyBehavior, ENEMY_BEHAVIOR_OPTIONS, 'guard');
  p.allyMoveSpeed = clampSetting(p.allyMoveSpeed, 0, 12, 2.2);
  p.allyDamage = Math.round(clampSetting(p.allyDamage, 0, 250, 10));
  p.allyAccuracy = Math.round(clampSetting(p.allyAccuracy, 0, 100, 100));
  p.allyPlacement = normalizeChoice(p.allyPlacement, ENEMY_PLACEMENT_OPTIONS, 'random');
  p.enemyWeaponType = normalizeNpcWeaponChoice(p.enemyWeaponType);
  p.enemyAwarenessRange = clampSetting(p.enemyAwarenessRange, 1, 200, 40);
  p.enemyAwarenessVisible = p.enemyAwarenessVisible === true;
  p.enemyAwarenessColor = hexSetting(p.enemyAwarenessColor, '#ff3030');
  p.enemyAwarenessOutlineColor = hexSetting(p.enemyAwarenessOutlineColor, '#000000');
  p.enemyAwarenessOpacity = clampSetting(p.enemyAwarenessOpacity, 0, 1, 0.18);
  p.enemyAwarenessFillTransparent = p.enemyAwarenessFillTransparent === true;
  p.allyWeaponType = normalizeNpcWeaponChoice(p.allyWeaponType);
  p.allyAwarenessRange = clampSetting(p.allyAwarenessRange, 1, 200, 40);
  p.allyAwarenessVisible = p.allyAwarenessVisible === true;
  p.allyAwarenessColor = hexSetting(p.allyAwarenessColor, '#00cc44');
  p.allyAwarenessOutlineColor = hexSetting(p.allyAwarenessOutlineColor, '#000000');
  p.allyAwarenessOpacity = clampSetting(p.allyAwarenessOpacity, 0, 1, 0.18);
  p.allyAwarenessFillTransparent = p.allyAwarenessFillTransparent === true;
  p.soundProximityEnabled = p.soundProximityEnabled !== false;
  p.reticleHitMarkerEnabled = p.reticleHitMarkerEnabled !== false;
  p.reticleHitMarkerSize = clampSetting(p.reticleHitMarkerSize, 12, 160, 54);
  p.reticleHitMarkerWeight = clampSetting(p.reticleHitMarkerWeight, 0.5, 12, 3);
  p.reticleHitMarkerOpacity = clampSetting(p.reticleHitMarkerOpacity, 0, 1, 1);
  p.reticleHitMarkerColor = hexSetting(p.reticleHitMarkerColor, '#ffffff');
  p.reticleHitMarkerDuration = Math.round(clampSetting(p.reticleHitMarkerDuration, 80, 500, 190));
  p.reticleKillConfirmEnabled = p.reticleKillConfirmEnabled !== false;
  p.reticleKillConfirmColor = hexSetting(p.reticleKillConfirmColor, '#ffffff');
  p.reticleKillConfirmSize = clampSetting(p.reticleKillConfirmSize, 12, 160, 64);
  p.reticleKillConfirmOpacity = clampSetting(p.reticleKillConfirmOpacity, 0, 1, 0.9);
  p.reticleKillConfirmDuration = Math.round(clampSetting(p.reticleKillConfirmDuration, 80, 800, 320));
  p.soundProximityRange = clampSetting(p.soundProximityRange, 1, 200, 40);
  p.soundProximityFalloff = clampSetting(p.soundProximityFalloff, 0.1, 4, 1);
  p.soundProximityMinFactor = clampSetting(p.soundProximityMinFactor, 0, 1, 0);
  p.cameraShakeEnabled = p.cameraShakeEnabled !== false;
  p.cameraShakeIntensity = clampSetting(p.cameraShakeIntensity, 0, 1.5, 0.28);
  p.cameraShakeDuration = clampSetting(p.cameraShakeDuration, 0.05, 2, 0.35);
  p.cameraShakeFrequency = clampSetting(p.cameraShakeFrequency, 1, 80, 28);
  p.cameraShakeProximity = p.cameraShakeProximity !== false;
  p.cameraShakeRadius = clampSetting(p.cameraShakeRadius, 1, 80, 24);
  p.cameraShakeMinFactor = clampSetting(p.cameraShakeMinFactor, 0, 1, 0.12);
  p.overallBloomIntensity = clampSetting(p.overallBloomIntensity, 0, 4, 1.8);
  p.hudNpcHealthBars = p.hudNpcHealthBars !== false;
  if (!('hudEnemyHealthBars' in p)) p.hudEnemyHealthBars = p.hudNpcHealthBars !== false;
  if (!('hudAllyHealthBars' in p)) p.hudAllyHealthBars = p.hudNpcHealthBars !== false;
  p.hudEnemyHealthBars = p.hudEnemyHealthBars !== false;
  p.hudAllyHealthBars = p.hudAllyHealthBars !== false;
  p.hudNpcHealthBarRange = clampSetting(p.hudNpcHealthBarRange, 0, 200, 60);
  p.hudBulletTimeIndicator = p.hudBulletTimeIndicator !== false;
  p.hudBulletTimeIndicatorSize = clampSetting(p.hudBulletTimeIndicatorSize, 8, 64, 24);
  p.hudBulletTimeReadyOpacity = clampSetting(p.hudBulletTimeReadyOpacity, 0, 1, 1);
  p.hudBulletTimeEmptyOpacity = clampSetting(p.hudBulletTimeEmptyOpacity, 0, 1, 0.5);
  p.hudBulletTimeActiveIcon = p.hudBulletTimeActiveIcon !== false;
  p.hudBulletTimeActiveIconSize = clampSetting(p.hudBulletTimeActiveIconSize, 12, 128, 42);
  p.hudBulletTimeActiveIconOpacity = clampSetting(p.hudBulletTimeActiveIconOpacity, 0, 1, 1);
  p.reticleKillConfirmEnabled = p.reticleKillConfirmEnabled !== false;
  p.reticleKillConfirmColor = hexSetting(p.reticleKillConfirmColor, '#ffffff');
  p.reticleKillConfirmSize = clampSetting(p.reticleKillConfirmSize, 12, 160, 64);
  p.reticleKillConfirmOpacity = clampSetting(p.reticleKillConfirmOpacity, 0, 1, 0.9);
  const enemyDestructionPrefixes = [
    'destructionEnemies',
    'destructionAllies',
    'destructionRusher',
    'destructionOrbiter',
    'destructionTanker',
    'destructionSniper',
    'destructionTeleporter',
    'destructionShielded',
    'destructionSplitter',
    'destructionBoss',
  ];
  [
    ...enemyDestructionPrefixes,
    'destructionDestructible',
  ].forEach(prefix => {
    const key = `${prefix}ParticleDespawnTime`;
    p[key] = clampSetting(p[key], 0.1, 10, 1);
  });
  enemyDestructionPrefixes.forEach(prefix => {
    const key = `${prefix}CorpseFadeTime`;
    p[key] = clampSetting(p[key], 0.1, 10, 1);
  });
  p.radarRadius = clampSetting(p.radarRadius, 20, 150, 90);
  p.destructionDestructibleShockwaveSpeed = clampSetting(p.destructionDestructibleShockwaveSpeed, 0, 40, 10);
  p.destructionDestructibleShockwaveFadeTime = clampSetting(p.destructionDestructibleShockwaveFadeTime, 0.05, 3, 0.45);
  p.destructionDestructibleShockwaveDelay = clampSetting(p.destructionDestructibleShockwaveDelay, 0, 3, 0);
  p.destructionDestructibleShockwaveTransparency = clampSetting(p.destructionDestructibleShockwaveTransparency, 0, 1, 0.34);
  p.destructionDestructibleSplashDamage = clampSetting(p.destructionDestructibleSplashDamage, 0, 500, 45);
  p.destructionDestructibleSplashRadius = clampSetting(p.destructionDestructibleSplashRadius, 0, 80, 8);
  p.destructionDestructibleSplashFalloff = clampSetting(p.destructionDestructibleSplashFalloff, 0.1, 4, 1);
  p.destructionDestructibleSplashMinFactor = clampSetting(p.destructionDestructibleSplashMinFactor, 0, 1, 0.15);
  if (!/^#[0-9a-fA-F]{6}$/.test(String(p.destructionDestructibleShockwaveColor || ''))) {
    p.destructionDestructibleShockwaveColor = p.destructionDestructibleColor || '#ffd400';
  }
  state.placerRotation = THREE.MathUtils.degToRad(rotationDeg);
  applyHudSettings();
  applyTagSettings();
  rebuildPlacedObjects();
  applyEditorSettings();
  refreshPlayerSpawnMarker();
  rebuildEditorPlacedNpcs();
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
    [ICON_SHIELD, 'Shield', buildShield],
    [ICON_LIGHT, 'Lighting', buildLighting],
    [ICON_SCENE, 'World', buildScene],
    [ICON_HUD, 'HUD', buildHUD],
    [ICON_ALLIES, 'Allies', buildAllies],
    [ICON_ENEMIES, 'Enemies', buildEnemies],
    [ICON_DESTRUCTION, 'Destruction', buildDestruction],
    [ICON_WEAPONS, 'Weapons', buildWeapons],
    [ICON_SOUND, 'Sound', buildSound],
    [ICON_CONTROLLER, 'Controller', buildController],
    [ICON_LANDSCAPE, 'Landscape Editor', buildLandscapeEditor],
    [ICON_ASSETS, 'Assets', buildAssets],
    [ICON_SCENARIOS, 'Scenes', buildScenes],
  ];

  sectionDefs.forEach(([icon, title, buildFn]) => {
    body.appendChild(section(icon, title, buildFn).el);
  });

  // Required gameplay-test sections. This failsafe keeps these controls visible
  // even if a future edit accidentally removes them from the main section list.
  const requiredSections = [
    [ICON_ABILITIES, 'Abilities', buildAbilities, 'Shield'],
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

const SIDEBAR_MINIMIZED_WIDTH = 56;

function applySidebarWidth() {
  if (!sidebar) return;
  const fullWidth = clampSidebarWidth(state.sidebarWidth || SIDEBAR_DEFAULT_WIDTH);
  state.sidebarWidth = fullWidth;
  // Use the actual visual width: minimized sidebar is 56px, full sidebar is state.sidebarWidth.
  // This keeps --sb-width in sync with the real sidebar edge so positioned elements
  // like the radar stay correctly anchored to the right of the visible sidebar.
  const visualWidth = state.panelMinimized ? SIDEBAR_MINIMIZED_WIDTH : fullWidth;
  sidebar.style.setProperty('--sb-width', `${fullWidth}px`);
  document.documentElement.style.setProperty('--sb-width', `${visualWidth}px`);
}


function rememberSidebarScroll() {
  if (!sidebar) return;
  state.sidebarScrollTop = Math.max(0, Math.round(sidebar.scrollTop || 0));
}

function restoreSidebarScroll() {
  if (!sidebar) return;
  const y = Math.max(0, Number(state.sidebarScrollTop) || 0);
  requestAnimationFrame(() => { sidebar.scrollTop = y; });
}

function initSidebarScrollMemory() {
  if (!sidebar || sidebar.dataset.scrollMemoryReady === '1') return;
  sidebar.dataset.scrollMemoryReady = '1';
  sidebar.addEventListener('scroll', () => {
    if (!state.panelMinimized) rememberSidebarScroll();
  }, { passive: true });
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
  // Pause or resume all managed audio when game pauses/unpauses.
  if (state.paused) {
    pauseManagedAudio();
  } else {
    if (state.params.editorModeEnabled !== true) teleportPlayerToSpawn();
    resumeManagedAudio();
    if (state.params.soundSfx_ambience > 0 && !state.params.soundMuted) {
      playAmbienceIfAllowed();
    }
  }
}

function setPanelMinimized(minimized) {
  if (minimized) rememberSidebarScroll();
  state.panelMinimized = minimized;
  state.panelOpen = true;
  if (sidebar) sidebar.style.display = '';
  updatePanelChrome();
  syncPauseToSidebar();
  if (!minimized) restoreSidebarScroll();
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

  // ── Asset picker modal ──────────────────────────────────────────────────────
  if (!document.getElementById('placer-modal')) {
    const modal = document.createElement('div');
    modal.id = 'placer-modal';
    modal.style.cssText = [
      'display:none', 'position:fixed', 'inset:0', 'z-index:200',
      'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.65)', 'backdrop-filter:blur(4px)',
      'cursor:default',
    ].join(';');

    const openModal = () => {
      state.primaryFire = false;
      state.secondaryFire = false;
      state.isAiming = false;
      document.exitPointerLock?.();
      document.body.classList.remove('third-person-mouse-look');
      modal.style.display = 'flex';
    };
    const closeModal = () => {
      state.secondaryFire = false;
      modal.style.display = 'none';
    };
    window.__openPlacerAssetModal = openModal;
    window.__closePlacerAssetModal = closeModal;

    const box = document.createElement('div');
    box.style.cssText = [
      'background:#0d1117', 'border:1px solid #21262d', 'border-radius:10px',
      'padding:20px', 'max-width:480px', 'width:90%',
      'font-family:var(--hud-font-family,system-ui)',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'SELECT ASSET';
    title.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:0.18em;color:#58a6ff;margin-bottom:14px;';
    box.appendChild(title);

    const assetList = document.createElement('div');
    assetList.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

    const makeAssetButton = asset => {
      const btn2 = document.createElement('button');
      btn2.textContent = asset.label;
      btn2.style.cssText = [
        'background:#161b22', 'border:1px solid #21262d', 'border-radius:6px',
        'color:#c9d1d9', 'font-size:11px', 'letter-spacing:0.08em',
        'padding:10px 8px', 'cursor:pointer', 'text-align:center',
        'transition:background 0.12s,border-color 0.12s',
      ].join(';');
      btn2.onmouseenter = () => { btn2.style.background = '#1f2937'; btn2.style.borderColor = '#58a6ff'; };
      btn2.onmouseleave = () => { btn2.style.background = '#161b22'; btn2.style.borderColor = '#21262d'; };
      btn2.addEventListener('click', () => {
        state.params.placerSelectedAsset = asset.id;
        state.activeSlot = 1;
        closeModal();
        // Sync sidebar select if visible
        const sel = document.querySelector('[data-param-key="placerSelectedAsset"]');
        if (sel) sel.value = asset.id;
      });
      return btn2;
    };

    assetGroups().forEach((assets, category) => {
      const groupWrap = document.createElement('div');
      const groupTitle = document.createElement('div');
      groupTitle.textContent = ASSET_CATEGORY_LABELS[category] || category;
      groupTitle.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:0.14em;color:#8b949e;margin:0 0 8px;';
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;';
      assets.forEach(asset => grid.appendChild(makeAssetButton(asset)));
      groupWrap.appendChild(groupTitle);
      groupWrap.appendChild(grid);
      assetList.appendChild(groupWrap);
    });
    box.appendChild(assetList);

    const closeRow = document.createElement('div');
    closeRow.style.cssText = 'margin-top:14px;text-align:right;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = [
      'background:transparent', 'border:1px solid #21262d', 'border-radius:6px',
      'color:#6e7681', 'font-size:11px', 'padding:6px 16px', 'cursor:pointer',
    ].join(';');
    closeBtn.addEventListener('click', closeModal);
    closeRow.appendChild(closeBtn);
    box.appendChild(closeRow);

    // Click backdrop to close
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  // ── Object placer transform modal ───────────────────────────────────────────
  if (!document.getElementById('placer-transform-modal')) {
    const modal = document.createElement('div');
    modal.id = 'placer-transform-modal';
    modal.style.cssText = [
      'display:none', 'position:fixed', 'inset:0', 'z-index:201',
      'background:rgba(0,0,0,0.65)', 'backdrop-filter:blur(4px)',
      'cursor:default',
    ].join(';');

    const MODAL_PADDING = 22;
    const clampScale = value => Math.min(6, Math.max(0.5, Math.round((Number(value) || 1) * 2) / 2));
    const normalizeDeg = value => ((Math.round((Number(value) || 0) / 90) * 90) % 360 + 360) % 360;
    const syncRotation = deg => {
      const normalized = normalizeDeg(deg);
      state.params.placerRotationDeg = normalized;
      state.placerRotation = THREE.MathUtils.degToRad(normalized);
      return normalized;
    };
    const clampModalPosition = (x, y) => {
      const boxWidth = box?.offsetWidth || 460;
      const boxHeight = box?.offsetHeight || 320;
      const maxX = Math.max(MODAL_PADDING, window.innerWidth - boxWidth - MODAL_PADDING);
      const maxY = Math.max(MODAL_PADDING, window.innerHeight - boxHeight - MODAL_PADDING);
      return {
        x: Math.min(maxX, Math.max(MODAL_PADDING, Number(x) || MODAL_PADDING)),
        y: Math.min(maxY, Math.max(MODAL_PADDING, Number(y) || MODAL_PADDING)),
      };
    };
    const setModalPosition = (x, y, persist = true) => {
      const pos = clampModalPosition(x, y);
      box.style.left = `${pos.x}px`;
      box.style.top = `${pos.y}px`;
      if (persist) {
        state.params.placerTransformModalX = Math.round(pos.x);
        state.params.placerTransformModalY = Math.round(pos.y);
      }
    };

    const openModal = () => {
      state.primaryFire = false;
      state.secondaryFire = false;
      state.isAiming = false;
      document.exitPointerLock?.();
      document.body.classList.remove('third-person-mouse-look');
      syncFields();
      modal.style.display = 'block';
      requestAnimationFrame(() => {
        setModalPosition(
          state.params.placerTransformModalX ?? MODAL_PADDING,
          state.params.placerTransformModalY ?? MODAL_PADDING,
          true
        );
      });
    };
    const closeModal = () => {
      state.secondaryFire = false;
      modal.style.display = 'none';
    };
    window.__openPlacerTransformModal = openModal;
    window.__closePlacerTransformModal = closeModal;

    const box = document.createElement('div');
    box.style.cssText = [
      'position:absolute', `left:${MODAL_PADDING}px`, `top:${MODAL_PADDING}px`,
      'background:#0d1117', 'border:1px solid #21262d', 'border-radius:10px',
      'padding:20px', 'max-width:460px', 'width:min(90vw,460px)',
      'box-sizing:border-box', 'box-shadow:0 18px 42px rgba(0,0,0,0.35)',
      'font-family:var(--hud-font-family,system-ui)', 'color:#c9d1d9',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'SHAPE TRANSFORM';
    title.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:0.18em;color:#58a6ff;margin-bottom:14px;cursor:move;user-select:none;';
    box.appendChild(title);

    let draggingTransformModal = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    title.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      draggingTransformModal = true;
      dragOffsetX = event.clientX - box.offsetLeft;
      dragOffsetY = event.clientY - box.offsetTop;
      title.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    title.addEventListener('pointermove', event => {
      if (!draggingTransformModal) return;
      setModalPosition(event.clientX - dragOffsetX, event.clientY - dragOffsetY, true);
    });
    title.addEventListener('pointerup', event => {
      draggingTransformModal = false;
      title.releasePointerCapture?.(event.pointerId);
    });
    title.addEventListener('pointercancel', event => {
      draggingTransformModal = false;
      title.releasePointerCapture?.(event.pointerId);
    });
    window.addEventListener('resize', () => {
      if (modal.style.display === 'none') return;
      setModalPosition(
        state.params.placerTransformModalX ?? MODAL_PADDING,
        state.params.placerTransformModalY ?? MODAL_PADDING,
        true
      );
    });

    const hint = document.createElement('div');
    hint.textContent = 'Resize and rotate the next object placed.';
    hint.style.cssText = 'font-size:11px;color:#8b949e;margin-bottom:14px;letter-spacing:0.03em;';
    box.appendChild(hint);

    const inputs = {};
    const makeNumberRow = (label, key, min, max, step) => {
      const rowEl = document.createElement('label');
      rowEl.style.cssText = 'display:grid;grid-template-columns:130px 1fr 70px;gap:10px;align-items:center;margin:10px 0;font-size:11px;letter-spacing:0.08em;color:#8b949e;';

      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      rowEl.appendChild(labelEl);

      const range = document.createElement('input');
      range.type = 'range';
      range.min = min;
      range.max = max;
      range.step = step;
      range.style.cssText = 'width:100%;';
      rowEl.appendChild(range);

      const number = document.createElement('input');
      number.type = 'number';
      number.min = min;
      number.max = max;
      number.step = step;
      number.style.cssText = 'background:#161b22;border:1px solid #21262d;border-radius:6px;color:#c9d1d9;padding:6px 8px;font-size:11px;width:70px;box-sizing:border-box;';
      rowEl.appendChild(number);

      const apply = value => {
        const next = clampScale(value);
        state.params[key] = next;
        range.value = String(next);
        number.value = String(next);
      };
      range.addEventListener('input', () => apply(range.value));
      number.addEventListener('input', () => apply(number.value));
      inputs[key] = { range, number, apply };
      return rowEl;
    };

    const makeRotationRow = () => {
      const rowEl = document.createElement('label');
      rowEl.style.cssText = 'display:grid;grid-template-columns:130px 1fr;gap:10px;align-items:center;margin:10px 0;font-size:11px;letter-spacing:0.08em;color:#8b949e;';

      const labelEl = document.createElement('span');
      labelEl.textContent = 'Rotation';
      rowEl.appendChild(labelEl);

      const selectEl = document.createElement('select');
      selectEl.className = 'sb-select';
      [0, 90, 180, 270].forEach(deg => {
        const opt = document.createElement('option');
        opt.value = String(deg);
        opt.textContent = `${deg}°`;
        selectEl.appendChild(opt);
      });
      selectEl.addEventListener('change', () => syncRotation(selectEl.value));
      rowEl.appendChild(selectEl);
      inputs.placerRotationDeg = { select: selectEl, apply: value => { selectEl.value = String(syncRotation(value)); } };
      return rowEl;
    };

    box.appendChild(makeRotationRow());
    box.appendChild(makeNumberRow('Width', 'placerScaleX', 0.5, 6, 0.5));
    box.appendChild(makeNumberRow('Height', 'placerScaleY', 0.5, 6, 0.5));
    box.appendChild(makeNumberRow('Depth', 'placerScaleZ', 0.5, 6, 0.5));

    function syncFields() {
      inputs.placerRotationDeg?.apply(state.params.placerRotationDeg ?? THREE.MathUtils.radToDeg(state.placerRotation ?? 0));
      inputs.placerScaleX?.apply(state.params.placerScaleX ?? 1);
      inputs.placerScaleY?.apply(state.params.placerScaleY ?? 1);
      inputs.placerScaleZ?.apply(state.params.placerScaleZ ?? 1);
    }

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px;';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.cssText = 'background:transparent;border:1px solid #21262d;border-radius:6px;color:#8b949e;font-size:11px;padding:7px 14px;cursor:pointer;';
    resetBtn.addEventListener('click', () => {
      state.params.placerScaleX = 1;
      state.params.placerScaleY = 1;
      state.params.placerScaleZ = 1;
      syncRotation(0);
      syncFields();
    });
    buttonRow.appendChild(resetBtn);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:11px;padding:7px 16px;cursor:pointer;';
    closeBtn.addEventListener('click', closeModal);
    buttonRow.appendChild(closeBtn);

    box.appendChild(buttonRow);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    modal.appendChild(box);
    document.body.appendChild(modal);
  }


  initSidebarScrollMemory();
  initSidebarResize();
  // Apply the active preset at startup so state.params matches the selected preset's
  // values rather than the hardcoded state.js defaults.
  const startPreset = PRESET_SETTINGS.find(p => p.key === state.activePreset);
  if (startPreset) {
    applyParamObject(startPreset.data);
  }
  applyAllParams();
  rebuildPanel();
  updatePanelChrome();
  syncPauseToSidebar();
}

export function togglePanel() {
  setPanelMinimized(!state.panelMinimized);
}

initPanel();
