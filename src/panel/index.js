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
import { setFloorVisible, setGridVisible, setFloorColor, setGridColor } from '../terrain.js';
import { spawnEnemiesFromSettings, clearEnemies, applyTagSettings, spawnAlliesFromSettings, clearAllies } from '../enemies.js';
import { clearGameplayInput } from '../input.js';
import { ASSET_CATALOGUE, ASSET_CATEGORY_LABELS } from '../assets-catalogue.js';
import {
  clearPlacedObjects, rebuildPlacedObjects,
  getSelectedPlacedObjectCount, deleteSelectedPlacedObjects,
  clearPlacedObjectSelection, selectAllPlacedObjects,
} from '../placer.js';

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
  { key: 'g21', label: 'G21', path: './presets/G21.json', data: {
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
  "thirdAzimuth": 3.998926535897084,
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
  "thirdPitch": -0.14559999999999562,
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
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
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
  "hudFont": "michroma",
  "hudNpcHealthBars": true,
  "hudNpcHealthBarRange": 60,
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
  "enemyCount": 20,
  "enemyHealth": 10,
  "enemyInvincible": false,
  "enemyBehavior": "rush",
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "laser",
  "allyType": "orbiter",
  "allyCount": 10,
  "allyHealth": 100,
  "allyInvincible": false,
  "allyFriendlyFire": false,
  "allyBehavior": "keepDistance",
  "allyMoveSpeed": 2.2,
  "allyDamage": 10,
  "allyPlacement": "random",
  "allyWeaponType": "laser",
  "enemyDestructionEnabled": true,
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
      "assetId": "cylinder",
      "x": -9.5,
      "y": 0.5,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_1"
    },
    {
      "assetId": "ramp",
      "x": -8,
      "y": 0,
      "z": 4,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_2"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_3"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_4"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_5"
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_6"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_7"
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_8"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_9"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_a"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_b"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_c"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_d"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_e"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_f"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_g"
    }
  ],
  "placerSelectedAsset": "destructible_barrel",
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
  "soundSfx_ambience": 0.5,
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
  "placerScaleX": 1,
  "placerScaleY": 1,
  "placerScaleZ": 1,
  "placerRotationDeg": 0,
  "placerTransformModalX": 22,
  "placerTransformModalY": 22,
  "soundSfx_jump": 1,
  "soundSfx_enemy_grunt": 1,
  "soundSfx_object_explode": 1,
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
  "allyAwarenessRange": 40,
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
  "weaponPistolDamage": 24,
  "weaponPistolRange": 55,
  "weaponPistolSpread": 0.01,
  "weaponPistolFireRate": 3.6,
  "weaponPistolProjectileSpeed": 70,
  "weaponPistolProjectileSize": 0.28,
  "weaponPistolProjectileColor": "#d8dde6",
  "weaponPistolProjectileBloom": false,
  "weaponPistolReticleType": "dot",
  "weaponRifleDamage": 34,
  "weaponRifleRange": 42,
  "weaponRifleSpread": 0.003,
  "weaponRifleFireRate": 5,
  "weaponRifleProjectileSpeed": 80,
  "weaponRifleProjectileSize": 0.36,
  "weaponRifleProjectileColor": "#ff1100",
  "weaponRifleProjectileBloom": true,
  "weaponRifleReticleType": "triSpoke",
  "weaponShotgunDamage": 12,
  "weaponShotgunRange": 28,
  "weaponShotgunSpread": 0.16,
  "weaponShotgunFireRate": 1.15,
  "weaponShotgunPellets": 8,
  "weaponShotgunProjectileSpeed": 60,
  "weaponShotgunProjectileSize": 0.32,
  "weaponShotgunProjectileColor": "#d8dde6",
  "weaponShotgunProjectileBloom": false,
  "weaponShotgunReticleType": "crossDot",
  "weaponSniperDamage": 120,
  "weaponSniperRange": 180,
  "weaponSniperSpread": 0.002,
  "weaponSniperFireRate": 0.65,
  "weaponSniperProjectileSpeed": 130,
  "weaponSniperProjectileSize": 0.24,
  "weaponSniperProjectileColor": "#d975ff",
  "weaponSniperProjectileBloom": true,
  "weaponSniperReticleType": "cross",
  "weaponGrenadeDamage": 95,
  "weaponGrenadeRange": 60,
  "weaponGrenadeSpread": 0.01,
  "weaponGrenadeFireRate": 0.72,
  "weaponGrenadeProjectileSpeed": 16,
  "weaponGrenadeProjectileSize": 0.25,
  "weaponGrenadeProjectileColor": "#ff8844",
  "weaponGrenadeProjectileBloom": false,
  "weaponGrenadeRadius": 5,
  "weaponGrenadeReticleType": "ring",
  "weaponRocketDamage": 130,
  "weaponRocketRange": 95,
  "weaponRocketSpread": 0.004,
  "weaponRocketFireRate": 0.68,
  "weaponRocketProjectileSpeed": 34,
  "weaponRocketProjectileSize": 0.42,
  "weaponRocketProjectileColor": "#ff3333",
  "weaponRocketProjectileBloom": true,
  "weaponRocketRadius": 6,
  "weaponRocketReticleType": "ring"
} },
  { key: 'g20', label: 'G20', path: './presets/G20.json', data: {
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
  "thirdAzimuth": 4.514926535897107,
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
  "thirdPitch": -0.003999999999995632,
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
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
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
  "hudFont": "michroma",
  "hudNpcHealthBars": true,
  "hudNpcHealthBarRange": 60,
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
  "enemyCount": 20,
  "enemyHealth": 10,
  "enemyInvincible": false,
  "enemyBehavior": "rush",
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "laser",
  "allyType": "orbiter",
  "allyCount": 5,
  "allyHealth": 100,
  "allyInvincible": false,
  "allyFriendlyFire": false,
  "allyBehavior": "keepDistance",
  "allyMoveSpeed": 2.2,
  "allyDamage": 10,
  "allyPlacement": "random",
  "allyWeaponType": "laser",
  "enemyDestructionEnabled": true,
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
      "assetId": "cylinder",
      "x": -9.5,
      "y": 0.5,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_1"
    },
    {
      "assetId": "ramp",
      "x": -8,
      "y": 0,
      "z": 4,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_2"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_3"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_4"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_5"
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_6"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_7"
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_8"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_9"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_a"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_b"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_c"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_d"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_e"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_f"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_g"
    }
  ],
  "placerSelectedAsset": "destructible_barrel",
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
  "soundSfx_ambience": 0.5,
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
  "destructionOrbiterParticleCount": 40,
  "destructionOrbiterParticleSize": 0.32,
  "destructionOrbiterParticleSpeed": 1.25,
  "destructionOrbiterParticleGlow": 8,
  "destructionOrbiterColor": "#00cc44",
  "destructionOrbiterPhysics": "gravity",
  "destructionOrbiterDespawnTime": 3,
  "destructionTankerParticleCount": 40,
  "destructionTankerParticleSize": 0.32,
  "destructionTankerParticleSpeed": 1.25,
  "destructionTankerParticleGlow": 8,
  "destructionTankerColor": "#2b2b2b",
  "destructionTankerPhysics": "gravity",
  "destructionTankerDespawnTime": 3,
  "destructionSniperParticleCount": 40,
  "destructionSniperParticleSize": 0.32,
  "destructionSniperParticleSpeed": 1.25,
  "destructionSniperParticleGlow": 8,
  "destructionSniperColor": "#9b30ff",
  "destructionSniperPhysics": "gravity",
  "destructionSniperDespawnTime": 3,
  "destructionTeleporterParticleCount": 40,
  "destructionTeleporterParticleSize": 0.32,
  "destructionTeleporterParticleSpeed": 1.25,
  "destructionTeleporterParticleGlow": 8,
  "destructionTeleporterColor": "#e0e0e0",
  "destructionTeleporterPhysics": "gravity",
  "destructionTeleporterDespawnTime": 3,
  "destructionShieldedParticleCount": 40,
  "destructionShieldedParticleSize": 0.32,
  "destructionShieldedParticleSpeed": 1.25,
  "destructionShieldedParticleGlow": 8,
  "destructionShieldedColor": "#4aa3ff",
  "destructionShieldedPhysics": "gravity",
  "destructionShieldedDespawnTime": 3,
  "destructionSplitterParticleCount": 100,
  "destructionSplitterParticleSize": 0.5,
  "destructionSplitterParticleSpeed": 1.75,
  "destructionSplitterParticleGlow": 12,
  "destructionSplitterColor": "#80fb37",
  "destructionSplitterPhysics": "gravity",
  "destructionSplitterDespawnTime": 3,
  "destructionBossParticleCount": 100,
  "destructionBossParticleSize": 0.5,
  "destructionBossParticleSpeed": 1.75,
  "destructionBossParticleGlow": 12,
  "destructionBossColor": "#111111",
  "destructionBossPhysics": "gravity",
  "destructionBossDespawnTime": 3,
  "destructionDestructibleParticleCount": 40,
  "destructionDestructibleParticleSize": 0.25,
  "destructionDestructibleParticleSpeed": 6,
  "destructionDestructibleParticleGlow": 8,
  "destructionDestructibleColor": "#ffffff",
  "destructionDestructiblePhysics": "gravity",
  "placerObjectColor": "#445566",
  "placerScaleX": 1,
  "placerScaleY": 1,
  "placerScaleZ": 1,
  "placerRotationDeg": 0,
  "placerTransformModalX": 22,
  "placerTransformModalY": 22,
  "soundSfx_jump": 1,
  "soundSfx_enemy_grunt": 1,
  "soundSfx_object_explode": 1,
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
  "allyAwarenessRange": 40,
  "destructionRusherParticleDespawnTime": 1.0,
  "destructionOrbiterParticleDespawnTime": 1.0,
  "destructionTankerParticleDespawnTime": 1.0,
  "destructionSniperParticleDespawnTime": 1.0,
  "destructionTeleporterParticleDespawnTime": 1.0,
  "destructionShieldedParticleDespawnTime": 1.0,
  "destructionSplitterParticleDespawnTime": 1.0,
  "destructionBossParticleDespawnTime": 1.0,
  "destructionDestructibleParticleDespawnTime": 1.0,
  "overallBloomIntensity": 1.8
} },
  { key: 'g19', label: 'G19', path: './presets/G19.json', data: {
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
  "thirdAzimuth": 6.20092653589726,
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
  "thirdPitch": -0.19119999999999565,
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
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
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
  "hudFont": "michroma",
  "hudNpcHealthBars": true,
  "hudNpcHealthBarRange": 60,
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
  "enemyCount": 20,
  "enemyHealth": 10,
  "enemyInvincible": false,
  "enemyBehavior": "rush",
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "allyType": "sniper",
  "allyCount": 5,
  "allyHealth": 100,
  "allyInvincible": false,
  "allyFriendlyFire": false,
  "allyBehavior": "keepDistance",
  "allyMoveSpeed": 2.2,
  "allyDamage": 10,
  "allyPlacement": "random",
  "allyWeaponType": "laser",
  "enemyDestructionEnabled": true,
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
      "assetId": "cylinder",
      "x": -9.5,
      "y": 0.5,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_1"
    },
    {
      "assetId": "ramp",
      "x": -8,
      "y": 0,
      "z": 4,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_2"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_3"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_4"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_5"
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_6"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_7"
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_8"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_9"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_a"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_b"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_c"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_d"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_e"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_f"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_g"
    }
  ],
  "placerSelectedAsset": "destructible_barrel",
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
  "soundSfx_ambience": 0.5,
  "enemyDestructionParticleCount": 40,
  "enemyDestructionParticleSize": 0.32,
  "enemyDestructionParticleSpeed": 1.25,
  "enemyDestructionParticleGlow": 8,
  "enemyDestructionPhysics": true,
  "destructionRusherParticleCount": 50,
  "destructionRusherParticleSize": 0.32,
  "destructionRusherParticleSpeed": 0.5,
  "destructionRusherParticleGlow": 24,
  "destructionRusherColor": "#ff0000",
  "destructionRusherPhysics": "gravity",
  "destructionRusherDespawnTime": 5,
  "destructionOrbiterParticleCount": 40,
  "destructionOrbiterParticleSize": 0.32,
  "destructionOrbiterParticleSpeed": 1.25,
  "destructionOrbiterParticleGlow": 8,
  "destructionOrbiterColor": "#00cc44",
  "destructionOrbiterPhysics": "gravity",
  "destructionOrbiterDespawnTime": 3,
  "destructionTankerParticleCount": 40,
  "destructionTankerParticleSize": 0.32,
  "destructionTankerParticleSpeed": 1.25,
  "destructionTankerParticleGlow": 8,
  "destructionTankerColor": "#2b2b2b",
  "destructionTankerPhysics": "gravity",
  "destructionTankerDespawnTime": 3,
  "destructionSniperParticleCount": 40,
  "destructionSniperParticleSize": 0.32,
  "destructionSniperParticleSpeed": 1.25,
  "destructionSniperParticleGlow": 8,
  "destructionSniperColor": "#9b30ff",
  "destructionSniperPhysics": "gravity",
  "destructionSniperDespawnTime": 3,
  "destructionTeleporterParticleCount": 40,
  "destructionTeleporterParticleSize": 0.32,
  "destructionTeleporterParticleSpeed": 1.25,
  "destructionTeleporterParticleGlow": 8,
  "destructionTeleporterColor": "#e0e0e0",
  "destructionTeleporterPhysics": "gravity",
  "destructionTeleporterDespawnTime": 3,
  "destructionShieldedParticleCount": 40,
  "destructionShieldedParticleSize": 0.32,
  "destructionShieldedParticleSpeed": 1.25,
  "destructionShieldedParticleGlow": 8,
  "destructionShieldedColor": "#4aa3ff",
  "destructionShieldedPhysics": "gravity",
  "destructionShieldedDespawnTime": 3,
  "destructionSplitterParticleCount": 100,
  "destructionSplitterParticleSize": 0.5,
  "destructionSplitterParticleSpeed": 1.75,
  "destructionSplitterParticleGlow": 12,
  "destructionSplitterColor": "#80fb37",
  "destructionSplitterPhysics": "gravity",
  "destructionSplitterDespawnTime": 3,
  "destructionBossParticleCount": 100,
  "destructionBossParticleSize": 0.5,
  "destructionBossParticleSpeed": 1.75,
  "destructionBossParticleGlow": 12,
  "destructionBossColor": "#111111",
  "destructionBossPhysics": "gravity",
  "destructionBossDespawnTime": 3,
  "destructionDestructibleParticleCount": 40,
  "destructionDestructibleParticleSize": 0.25,
  "destructionDestructibleParticleSpeed": 6,
  "destructionDestructibleParticleGlow": 8,
  "destructionDestructibleColor": "#ffffff",
  "destructionDestructiblePhysics": "gravity",
  "placerObjectColor": "#445566",
  "placerScaleX": 1,
  "placerScaleY": 1,
  "placerScaleZ": 1,
  "placerRotationDeg": 0,
  "placerTransformModalX": 22,
  "placerTransformModalY": 22,
  "soundSfx_jump": 1,
  "soundSfx_enemy_grunt": 1,
  "soundSfx_object_explode": 1,
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
  "allyAwarenessRange": 40
} },
  { key: 'g18', label: 'G18', path: './presets/G18.json', data: {
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
  "thirdAzimuth": 2.6429265358972494,
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
  "thirdPitch": 0.008000000000003784,
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
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
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
  "hudFont": "michroma",
  "hudNpcHealthBars": true,
  "hudNpcHealthBarRange": 60,
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
  "enemyCount": 10,
  "enemyHealth": 100,
  "enemyInvincible": false,
  "enemyBehavior": "rush",
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "allyType": "rusher",
  "allyCount": 0,
  "allyHealth": 100,
  "allyInvincible": false,
  "allyFriendlyFire": false,
  "allyBehavior": "guard",
  "allyMoveSpeed": 2.2,
  "allyDamage": 10,
  "allyPlacement": "random",
  "allyWeaponType": "contact",
  "enemyDestructionEnabled": true,
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
      "assetId": "cylinder",
      "x": -9.5,
      "y": 0.5,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_1"
    },
    {
      "assetId": "ramp",
      "x": -8,
      "y": 0,
      "z": 4,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_2"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_3"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_4"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_5"
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_6"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_7"
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_8"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_9"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_a"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_b"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_c"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_d"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_e"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_f"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_g"
    }
  ],
  "placerSelectedAsset": "destructible_barrel",
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
  "soundSfx_ambience": 0.5,
  "enemyDestructionParticleCount": 40,
  "enemyDestructionParticleSize": 0.32,
  "enemyDestructionParticleSpeed": 1.25,
  "enemyDestructionParticleGlow": 8,
  "enemyDestructionPhysics": true,
  "destructionRusherParticleCount": 100,
  "destructionRusherParticleSize": 0.32,
  "destructionRusherParticleSpeed": 1.25,
  "destructionRusherParticleGlow": 24,
  "destructionRusherColor": "#ff0000",
  "destructionRusherPhysics": "gravity",
  "destructionRusherDespawnTime": 3,
  "destructionOrbiterParticleCount": 40,
  "destructionOrbiterParticleSize": 0.32,
  "destructionOrbiterParticleSpeed": 1.25,
  "destructionOrbiterParticleGlow": 8,
  "destructionOrbiterColor": "#00cc44",
  "destructionOrbiterPhysics": "gravity",
  "destructionOrbiterDespawnTime": 3,
  "destructionTankerParticleCount": 40,
  "destructionTankerParticleSize": 0.32,
  "destructionTankerParticleSpeed": 1.25,
  "destructionTankerParticleGlow": 8,
  "destructionTankerColor": "#2b2b2b",
  "destructionTankerPhysics": "gravity",
  "destructionTankerDespawnTime": 3,
  "destructionSniperParticleCount": 40,
  "destructionSniperParticleSize": 0.32,
  "destructionSniperParticleSpeed": 1.25,
  "destructionSniperParticleGlow": 8,
  "destructionSniperColor": "#9b30ff",
  "destructionSniperPhysics": "gravity",
  "destructionSniperDespawnTime": 3,
  "destructionTeleporterParticleCount": 40,
  "destructionTeleporterParticleSize": 0.32,
  "destructionTeleporterParticleSpeed": 1.25,
  "destructionTeleporterParticleGlow": 8,
  "destructionTeleporterColor": "#e0e0e0",
  "destructionTeleporterPhysics": "gravity",
  "destructionTeleporterDespawnTime": 3,
  "destructionShieldedParticleCount": 40,
  "destructionShieldedParticleSize": 0.32,
  "destructionShieldedParticleSpeed": 1.25,
  "destructionShieldedParticleGlow": 8,
  "destructionShieldedColor": "#4aa3ff",
  "destructionShieldedPhysics": "gravity",
  "destructionShieldedDespawnTime": 3,
  "destructionSplitterParticleCount": 100,
  "destructionSplitterParticleSize": 0.5,
  "destructionSplitterParticleSpeed": 1.75,
  "destructionSplitterParticleGlow": 12,
  "destructionSplitterColor": "#80fb37",
  "destructionSplitterPhysics": "gravity",
  "destructionSplitterDespawnTime": 3,
  "destructionBossParticleCount": 100,
  "destructionBossParticleSize": 0.5,
  "destructionBossParticleSpeed": 1.75,
  "destructionBossParticleGlow": 12,
  "destructionBossColor": "#111111",
  "destructionBossPhysics": "gravity",
  "destructionBossDespawnTime": 3,
  "destructionDestructibleParticleCount": 40,
  "destructionDestructibleParticleSize": 0.25,
  "destructionDestructibleParticleSpeed": 6,
  "destructionDestructibleParticleGlow": 8,
  "destructionDestructibleColor": "#ffffff",
  "destructionDestructiblePhysics": "gravity",
  "placerObjectColor": "#445566",
  "placerScaleX": 1,
  "placerScaleY": 1,
  "placerScaleZ": 1,
  "placerRotationDeg": 0,
  "placerTransformModalX": 22,
  "placerTransformModalY": 22,
  "soundSfx_jump": 1,
  "soundSfx_enemy_grunt": 1,
  "soundSfx_object_explode": 1,
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
  "allyAwarenessRange": 40
} },
  { key: 'g17', label: 'G17', path: './presets/G17.json', data: {
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
  "thirdAzimuth": 5.977111843076823,
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
  "thirdPitch": -0.03519999999999626,
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
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
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
  "hudFont": "michroma",
  "hudNpcHealthBars": true,
  "hudNpcHealthBarRange": 60,
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
  "enemyCount": 10,
  "enemyHealth": 100,
  "enemyInvincible": false,
  "enemyBehavior": "rush",
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "allyType": "rusher",
  "allyCount": 0,
  "allyHealth": 100,
  "allyInvincible": false,
  "allyFriendlyFire": false,
  "allyBehavior": "guard",
  "allyMoveSpeed": 2.2,
  "allyDamage": 10,
  "allyPlacement": "random",
  "allyWeaponType": "none",
  "enemyDestructionEnabled": true,
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
      "assetId": "cylinder",
      "x": -9.5,
      "y": 0.5,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_1"
    },
    {
      "assetId": "ramp",
      "x": -8,
      "y": 0,
      "z": 4,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_2"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_3"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_4"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_5"
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_6"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_7"
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_8"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_9"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_a"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_b"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_c"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_d"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_e"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_f"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_g"
    },
    {
      "objectId": "placed_mptvzkvo_23",
      "assetId": "destructible_barrel",
      "x": -63.5,
      "y": 0.5,
      "z": -34.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "color": "#445566"
    },
    {
      "objectId": "placed_mptvzm3h_28",
      "assetId": "destructible_barrel",
      "x": -46.5,
      "y": 0.5,
      "z": -38.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "color": "#445566"
    },
    {
      "objectId": "placed_mptvzplm_2k",
      "assetId": "destructible_barrel",
      "x": 38.5,
      "y": 0.5,
      "z": -49.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "color": "#445566"
    }
  ],
  "placerSelectedAsset": "destructible_barrel",
  "radarEnabled": true,
  "radarRadius": 60,
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
  "soundSfx_ambience": 0.5,
  "enemyDestructionParticleCount": 40,
  "enemyDestructionParticleSize": 0.32,
  "enemyDestructionParticleSpeed": 1.25,
  "enemyDestructionParticleGlow": 8,
  "enemyDestructionPhysics": true,
  "destructionRusherParticleCount": 100,
  "destructionRusherParticleSize": 0.32,
  "destructionRusherParticleSpeed": 1.25,
  "destructionRusherParticleGlow": 24,
  "destructionRusherColor": "#ff0000",
  "destructionRusherPhysics": "gravity",
  "destructionRusherDespawnTime": 3,
  "destructionOrbiterParticleCount": 40,
  "destructionOrbiterParticleSize": 0.32,
  "destructionOrbiterParticleSpeed": 1.25,
  "destructionOrbiterParticleGlow": 8,
  "destructionOrbiterColor": "#00cc44",
  "destructionOrbiterPhysics": "gravity",
  "destructionOrbiterDespawnTime": 3,
  "destructionTankerParticleCount": 40,
  "destructionTankerParticleSize": 0.32,
  "destructionTankerParticleSpeed": 1.25,
  "destructionTankerParticleGlow": 8,
  "destructionTankerColor": "#2b2b2b",
  "destructionTankerPhysics": "gravity",
  "destructionTankerDespawnTime": 3,
  "destructionSniperParticleCount": 40,
  "destructionSniperParticleSize": 0.32,
  "destructionSniperParticleSpeed": 1.25,
  "destructionSniperParticleGlow": 8,
  "destructionSniperColor": "#9b30ff",
  "destructionSniperPhysics": "gravity",
  "destructionSniperDespawnTime": 3,
  "destructionTeleporterParticleCount": 40,
  "destructionTeleporterParticleSize": 0.32,
  "destructionTeleporterParticleSpeed": 1.25,
  "destructionTeleporterParticleGlow": 8,
  "destructionTeleporterColor": "#e0e0e0",
  "destructionTeleporterPhysics": "gravity",
  "destructionTeleporterDespawnTime": 3,
  "destructionShieldedParticleCount": 40,
  "destructionShieldedParticleSize": 0.32,
  "destructionShieldedParticleSpeed": 1.25,
  "destructionShieldedParticleGlow": 8,
  "destructionShieldedColor": "#4aa3ff",
  "destructionShieldedPhysics": "gravity",
  "destructionShieldedDespawnTime": 3,
  "destructionSplitterParticleCount": 100,
  "destructionSplitterParticleSize": 0.5,
  "destructionSplitterParticleSpeed": 1.75,
  "destructionSplitterParticleGlow": 12,
  "destructionSplitterColor": "#80fb37",
  "destructionSplitterPhysics": "gravity",
  "destructionSplitterDespawnTime": 3,
  "destructionBossParticleCount": 100,
  "destructionBossParticleSize": 0.5,
  "destructionBossParticleSpeed": 1.75,
  "destructionBossParticleGlow": 12,
  "destructionBossColor": "#111111",
  "destructionBossPhysics": "gravity",
  "destructionBossDespawnTime": 3,
  "destructionDestructibleParticleCount": 40,
  "destructionDestructibleParticleSize": 0.25,
  "destructionDestructibleParticleSpeed": 6,
  "destructionDestructibleParticleGlow": 8,
  "destructionDestructibleColor": "#ffffff",
  "destructionDestructiblePhysics": "gravity",
  "placerObjectColor": "#445566",
  "placerScaleX": 1,
  "placerScaleY": 1,
  "placerScaleZ": 1,
  "placerRotationDeg": 0,
  "placerTransformModalX": 22,
  "placerTransformModalY": 22,
  "soundSfx_jump": 1,
  "soundSfx_enemy_grunt": 1,
  "soundSfx_object_explode": 1,
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
  "soundProximityRange": 40,
  "soundProximityFalloff": 1,
  "soundProximityMinFactor": 0
} },
  { key: 'g14', label: 'G14', path: './presets/G14.json', data: {
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
  "thirdAzimuth": 2.00637061435906,
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
  "thirdPitch": 0.02240000000000423,
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
  "playerHealth": 100,
  "playerMaxArmor": 100,
  "playerArmor": 80,
  "playerInvincible": false,
  "jumpEnabled": true,
  "doubleJumpEnabled": true,
  "jumpForce": 9.5,
  "jumpGravity": 26,
  "bulletTimeEnabled": true,
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
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
  "hudFont": "michroma",
  "hudNpcHealthBars": true,
  "hudNpcHealthBarRange": 60,
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
  "enemyCount": 10,
  "enemyHealth": 100,
  "enemyInvincible": false,
  "enemyBehavior": "rush",
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "allyType": "rusher",
  "allyCount": 0,
  "allyHealth": 100,
  "allyInvincible": false,
  "allyFriendlyFire": false,
  "allyBehavior": "guard",
  "allyMoveSpeed": 2.2,
  "allyDamage": 10,
  "allyPlacement": "random",
  "allyWeaponType": "none",
  "enemyDestructionEnabled": true,
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
      "assetId": "cylinder",
      "x": -9.5,
      "y": 0.5,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_1"
    },
    {
      "assetId": "ramp",
      "x": -8,
      "y": 0,
      "z": 4,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_2"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_3"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_4"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_5"
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_6"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_7"
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_8"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_9"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_a"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_b"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_c"
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_d"
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_e"
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_f"
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "objectId": "placed_mptudxwh_g"
    },
    {
      "objectId": "placed_mptuf6o1_r",
      "assetId": "destructible_crate",
      "x": -65.5,
      "y": 0.5,
      "z": -17.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "color": "#445566"
    },
    {
      "objectId": "placed_mptuh5w7_16",
      "assetId": "destructible_crate",
      "x": -40.5,
      "y": 0.5,
      "z": 21.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1,
      "color": "#445566"
    }
  ],
  "placerSelectedAsset": "destructible_crate",
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
  "soundSfx_ambience": 0.5,
  "enemyDestructionParticleCount": 40,
  "enemyDestructionParticleSize": 0.32,
  "enemyDestructionParticleSpeed": 1.25,
  "enemyDestructionParticleGlow": 8,
  "enemyDestructionPhysics": true,
  "destructionRusherParticleCount": 100,
  "destructionRusherParticleSize": 0.32,
  "destructionRusherParticleSpeed": 1.25,
  "destructionRusherParticleGlow": 24,
  "destructionRusherColor": "#ff0000",
  "destructionRusherPhysics": "gravity",
  "destructionRusherDespawnTime": 3,
  "destructionOrbiterParticleCount": 40,
  "destructionOrbiterParticleSize": 0.32,
  "destructionOrbiterParticleSpeed": 1.25,
  "destructionOrbiterParticleGlow": 8,
  "destructionOrbiterColor": "#00cc44",
  "destructionOrbiterPhysics": "gravity",
  "destructionOrbiterDespawnTime": 3,
  "destructionTankerParticleCount": 40,
  "destructionTankerParticleSize": 0.32,
  "destructionTankerParticleSpeed": 1.25,
  "destructionTankerParticleGlow": 8,
  "destructionTankerColor": "#2b2b2b",
  "destructionTankerPhysics": "gravity",
  "destructionTankerDespawnTime": 3,
  "destructionSniperParticleCount": 40,
  "destructionSniperParticleSize": 0.32,
  "destructionSniperParticleSpeed": 1.25,
  "destructionSniperParticleGlow": 8,
  "destructionSniperColor": "#9b30ff",
  "destructionSniperPhysics": "gravity",
  "destructionSniperDespawnTime": 3,
  "destructionTeleporterParticleCount": 40,
  "destructionTeleporterParticleSize": 0.32,
  "destructionTeleporterParticleSpeed": 1.25,
  "destructionTeleporterParticleGlow": 8,
  "destructionTeleporterColor": "#e0e0e0",
  "destructionTeleporterPhysics": "gravity",
  "destructionTeleporterDespawnTime": 3,
  "destructionShieldedParticleCount": 40,
  "destructionShieldedParticleSize": 0.32,
  "destructionShieldedParticleSpeed": 1.25,
  "destructionShieldedParticleGlow": 8,
  "destructionShieldedColor": "#4aa3ff",
  "destructionShieldedPhysics": "gravity",
  "destructionShieldedDespawnTime": 3,
  "destructionSplitterParticleCount": 100,
  "destructionSplitterParticleSize": 0.5,
  "destructionSplitterParticleSpeed": 1.75,
  "destructionSplitterParticleGlow": 12,
  "destructionSplitterColor": "#80fb37",
  "destructionSplitterPhysics": "gravity",
  "destructionSplitterDespawnTime": 3,
  "destructionBossParticleCount": 100,
  "destructionBossParticleSize": 0.5,
  "destructionBossParticleSpeed": 1.75,
  "destructionBossParticleGlow": 12,
  "destructionBossColor": "#111111",
  "destructionBossPhysics": "gravity",
  "destructionBossDespawnTime": 3,
  "destructionDestructibleParticleCount": 40,
  "destructionDestructibleParticleSize": 0.32,
  "destructionDestructibleParticleSpeed": 1.25,
  "destructionDestructibleParticleGlow": 8,
  "destructionDestructibleColor": "#ffd400",
  "destructionDestructiblePhysics": "gravity",
  "placerObjectColor": "#445566",
  "placerScaleX": 1,
  "placerScaleY": 1,
  "placerScaleZ": 1,
  "placerRotationDeg": 0,
  "placerTransformModalX": 22,
  "placerTransformModalY": 22,
  "soundSfx_jump": 1,
  "soundSfx_enemy_grunt": 1,
  "soundSfx_object_explode": 1,
  "destructionDestructibleShockwaveSpeed": 10,
  "destructionDestructibleShockwaveColor": "#ffd400",
  "destructionDestructibleShockwaveFadeTime": 0.45,
  "destructionDestructibleShockwaveDelay": 0,
  "destructionDestructibleSplashDamage": 45,
  "destructionDestructibleShockwaveTransparency": 0.34,
  "destructionDestructibleSplashRadius": 8,
  "destructionDestructibleSplashFalloff": 1,
  "destructionDestructibleSplashMinFactor": 0.15
} },
  { key: 'g11', label: 'G11', path: './presets/G11.json', data: {
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
  "thirdAzimuth": 0.9581853071794288,
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
  "thirdPitch": -0.13359999999999644,
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
  "playerArmor": 80,
  "playerInvincible": false,
  "jumpEnabled": true,
  "doubleJumpEnabled": true,
  "jumpForce": 9.5,
  "jumpGravity": 26,
  "bulletTimeEnabled": true,
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
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
  "hudFont": "michroma",
  "hudNpcHealthBars": true,
  "hudNpcHealthBarRange": 60,
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
  "enemyCount": 10,
  "enemyHealth": 100,
  "enemyInvincible": false,
  "enemyBehavior": "rush",
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "enemyDestructionEnabled": true,
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
      "assetId": "cylinder",
      "x": -9.5,
      "y": 0.5,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "ramp",
      "x": -8,
      "y": 0,
      "z": 4,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    }
  ],
  "placerSelectedAsset": "tall_box",
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
  "soundSfx_ambience": 0.5,
  "enemyDestructionParticleCount": 40,
  "enemyDestructionParticleSize": 0.32,
  "enemyDestructionParticleSpeed": 1.25,
  "enemyDestructionParticleGlow": 8,
  "enemyDestructionPhysics": true,
  "destructionRusherParticleCount": 100,
  "destructionRusherParticleSize": 0.32,
  "destructionRusherParticleSpeed": 1.25,
  "destructionRusherParticleGlow": 24,
  "destructionRusherColor": "#ff0000",
  "destructionRusherPhysics": "gravity",
  "destructionRusherDespawnTime": 3.0,
  "destructionOrbiterParticleCount": 40,
  "destructionOrbiterParticleSize": 0.32,
  "destructionOrbiterParticleSpeed": 1.25,
  "destructionOrbiterParticleGlow": 8,
  "destructionOrbiterColor": "#00cc44",
  "destructionOrbiterPhysics": "gravity",
  "destructionOrbiterDespawnTime": 3.0,
  "destructionTankerParticleCount": 40,
  "destructionTankerParticleSize": 0.32,
  "destructionTankerParticleSpeed": 1.25,
  "destructionTankerParticleGlow": 8,
  "destructionTankerColor": "#2b2b2b",
  "destructionTankerPhysics": "gravity",
  "destructionTankerDespawnTime": 3.0,
  "destructionSniperParticleCount": 40,
  "destructionSniperParticleSize": 0.32,
  "destructionSniperParticleSpeed": 1.25,
  "destructionSniperParticleGlow": 8,
  "destructionSniperColor": "#9b30ff",
  "destructionSniperPhysics": "gravity",
  "destructionSniperDespawnTime": 3.0,
  "destructionTeleporterParticleCount": 40,
  "destructionTeleporterParticleSize": 0.32,
  "destructionTeleporterParticleSpeed": 1.25,
  "destructionTeleporterParticleGlow": 8,
  "destructionTeleporterColor": "#e0e0e0",
  "destructionTeleporterPhysics": "gravity",
  "destructionTeleporterDespawnTime": 3.0,
  "destructionShieldedParticleCount": 40,
  "destructionShieldedParticleSize": 0.32,
  "destructionShieldedParticleSpeed": 1.25,
  "destructionShieldedParticleGlow": 8,
  "destructionShieldedColor": "#4aa3ff",
  "destructionShieldedPhysics": "gravity",
  "destructionShieldedDespawnTime": 3.0,
  "destructionSplitterParticleCount": 100,
  "destructionSplitterParticleSize": 0.5,
  "destructionSplitterParticleSpeed": 1.75,
  "destructionSplitterParticleGlow": 12,
  "destructionSplitterColor": "#80fb37",
  "destructionSplitterPhysics": "gravity",
  "destructionSplitterDespawnTime": 3.0,
  "destructionBossParticleCount": 100,
  "destructionBossParticleSize": 0.5,
  "destructionBossParticleSpeed": 1.75,
  "destructionBossParticleGlow": 12,
  "destructionBossColor": "#111111",
  "destructionBossPhysics": "gravity",
  "destructionBossDespawnTime": 3.0,
  "destructionDestructibleParticleCount": 40,
  "destructionDestructibleParticleSize": 0.32,
  "destructionDestructibleParticleSpeed": 1.25,
  "destructionDestructibleParticleGlow": 8,
  "destructionDestructibleColor": "#ffd400",
  "destructionDestructiblePhysics": "gravity",
  "placerObjectColor": "#445566",
  "placerScaleX": 1,
  "placerScaleY": 1,
  "placerScaleZ": 1,
  "placerRotationDeg": 0,
  "placerTransformModalX": 22,
  "placerTransformModalY": 22,
  "soundSfx_jump": 1,
  "soundSfx_enemy_grunt": 1,
  "soundSfx_object_explode": 1
} },
  { key: 'g10', label: 'G10', path: './presets/G10.json', data: {
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
  "thirdAzimuth": 4.162185307179694,
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
  "thirdPitch": -0.2631999999999968,
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
  "bulletTimeEnabled": true,
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
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
  "hudFont": "michroma",
  "hudNpcHealthBars": true,
  "hudNpcHealthBarRange": 60,
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
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "enemyDestructionEnabled": true,
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
  "tagDwellTime": 0.8,
  "tagThickness": 12,
  "tagBloom": 0,
  "tagShadow": 1,
  "tagHeight": 30,
  "placedObjects": [
    {
      "assetId": "cylinder",
      "x": -9.5,
      "y": 0.5,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "ramp",
      "x": -8,
      "y": 0,
      "z": 4,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -9.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 6.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 5.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -5.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -6.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -7.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    },
    {
      "assetId": "tall_box",
      "x": -8.5,
      "y": 1,
      "z": 7.5,
      "ry": 0,
      "scaleX": 1,
      "scaleY": 1,
      "scaleZ": 1
    }
  ],
  "placerSelectedAsset": "tall_box",
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
  "soundSfx_ambience": 0.5,
  "enemyDestructionParticleCount": 40,
  "enemyDestructionParticleSize": 0.32,
  "enemyDestructionParticleSpeed": 1.25,
  "enemyDestructionParticleGlow": 8,
  "enemyDestructionPhysics": true,
  "placerObjectColor": "#445566",
  "doubleJumpEnabled": false,
  "placerScaleX": 1,
  "placerScaleY": 1,
  "placerScaleZ": 1,
  "placerRotationDeg": 0,
  "placerTransformModalX": 22,
  "placerTransformModalY": 22
} },
  { key: 'g9', label: 'G9', path: './presets/G9.json', data: {
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
  "thirdAzimuth": 0.046814692820649206,
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
  "thirdPitch": -0.03039999999999911,
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
  "doubleJumpEnabled": false,
  "jumpForce": 9.5,
  "jumpGravity": 26,
  "bulletTimeEnabled": true,
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
  "shieldVisible": true,
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
  "hudFont": "michroma",
  "hudNpcHealthBars": true,
  "hudNpcHealthBarRange": 60,
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
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "enemyDestructionEnabled": true,
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
  "tagDwellTime": 0.8,
  "tagThickness": 12,
  "tagBloom": 0,
  "tagShadow": 1,
  "tagHeight": 30,
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
  "soundSfx_ambience": 0.5,
  "enemyDestructionParticleCount": 40,
  "enemyDestructionParticleSize": 0.32,
  "enemyDestructionParticleSpeed": 1.25,
  "enemyDestructionParticleGlow": 8,
  "enemyDestructionPhysics": true,
  "placerSelectedAsset": "box",
  "placedObjects": []
} },
  { key: 'g8', label: 'G8', path: './presets/G8.json', data: {
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
  "thirdAzimuth": 3.5190000000001405,
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
  "thirdPitch": -0.05440000000000014,
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
  "doubleJumpEnabled": false,
  "jumpForce": 9.5,
  "jumpGravity": 26,
  "bulletTimeEnabled": true,
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
  "shieldVisible": false,
  "shieldColor": "#1e7bff",
  "shieldOpacity": 0.5,
  "shieldRadius": 2.2,
  "shieldHexSize": 0.05,
  "shieldLineThickness": 0.02,
  "shieldGlow": true,
  "shieldBloomIntensity": 0.1,
  "shieldBloomRadius": 1,
  "shieldFresnelPower": 2.1,
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
  "hudFont": "michroma",
  "hudNpcHealthBars": true,
  "hudNpcHealthBarRange": 60,
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
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "enemyDestructionEnabled": true,
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
  "tagDwellTime": 0.8,
  "tagThickness": 12,
  "tagBloom": 0,
  "tagShadow": 1,
  "tagHeight": 30,
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
  "soundSfx_ambience": 0.5,
  "enemyDestructionParticleCount": 40,
  "enemyDestructionParticleSize": 0.32,
  "enemyDestructionParticleSpeed": 1.25,
  "enemyDestructionParticleGlow": 8,
  "enemyDestructionPhysics": true,
  "shieldLineBloom": 0.5,
  "placedObjects": [],
  "placerSelectedAsset": "box",
} },
  { key: 'g7', label: 'G7', path: './presets/G7.json', data: {
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
  "thirdAzimuth": 4.356000000000172,
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
  "thirdPitch": -0.049600000000000144,
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
  "doubleJumpEnabled": false,
  "jumpForce": 9.5,
  "jumpGravity": 26,
  "bulletTimeEnabled": true,
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
  "shieldVisible": false,
  "shieldColor": "#1e7bff",
  "shieldOpacity": 0.5,
  "shieldRadius": 2.2,
  "shieldHexSize": 0.05,
  "shieldLineThickness": 0.02,
  "shieldGlow": true,
  "shieldBloomIntensity": 0.1,
  "shieldBloomRadius": 1,
  "shieldFresnelPower": 2.1,
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
  "hudFont": "michroma",
  "hudNpcHealthBars": true,
  "hudNpcHealthBarRange": 60,
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
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "enemyDestructionEnabled": true,
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
  "tagSize": 22,
  "tagDwellTime": 1.2,
  "tagThickness": 12,
  "tagBloom": 0,
  "tagShadow": 4,
  "tagHeight": 25,
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
  "soundSfx_ambience": 0.5,
  "shieldLineBloom": 0.5,
  "placedObjects": [],
  "placerSelectedAsset": "box",
} },
  { key: 'g6', label: 'G6', path: './presets/G6.json', data: {
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
  "thirdAzimuth": 0.28681469282060945,
  "thirdLookAhead": 3.8,
  "thirdSmoothPos": 10,
  "thirdSmoothLook": 12,
  "thirdMouseLook": true,
  "thirdMouseSensitivityX": 0.003,
  "thirdMouseSensitivityY": 0.0024,
  "thirdPitch": 0.03439999999999985,
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
  "doubleJumpEnabled": false,
  "jumpForce": 9.5,
  "jumpGravity": 26,
  "bulletTimeEnabled": true,
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
  "shieldVisible": false,
  "shieldColor": "#1e7bff",
  "shieldOpacity": 0.5,
  "shieldRadius": 2.2,
  "shieldHexSize": 0.05,
  "shieldLineThickness": 0.02,
  "shieldGlow": true,
  "shieldBloomIntensity": 0.1,
  "shieldBloomRadius": 1,
  "shieldFresnelPower": 2.1,
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
  "hudFont": "michroma",
  "hudNpcHealthBars": true,
  "hudNpcHealthBarRange": 60,
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
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "enemyDestructionEnabled": true,
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
  "tagSize": 20,
  "tagDwellTime": 0.8,
  "tagThickness": 0,
  "tagBloom": 0.5,
  "tagShadow": 3,
  "tagHeight": 25,
  "radarEnabled": true,
  "radarRadius": 90,
  "radarRange": 60,
  "radarBgColor": "#0a1628",
  "radarEnemyColor": "#ff3030",
  "radarOpacity": 0.82,
  "radarTaggedColor": "#ffee44",
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
  "soundSfx_ambience": 0.5,
  "enemyDestructionParticleCount": 40,
  "enemyDestructionParticleSize": 0.32,
  "enemyDestructionParticleSpeed": 1.25,
  "enemyDestructionParticleGlow": 8,
  "enemyDestructionPhysics": true,
  "aimEnabled": true,
  "aimFovDelta": -18,
  "aimDistDelta": -1.5,
  "aimSpeedMult": 0.55,
  "aimSmooth": 10,
  "shieldLineBloom": 0.5,
  "placedObjects": [],
  "placerSelectedAsset": "box",
} },
  { key: 'g5', label: 'G5', path: './presets/G5.json', data: {
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
  "thirdAzimuth": 0.28681469282060945,
  "thirdLookAhead": 3.8,
  "thirdSmoothPos": 10,
  "thirdSmoothLook": 12,
  "thirdMouseLook": true,
  "thirdMouseSensitivityX": 0.003,
  "thirdMouseSensitivityY": 0.0024,
  "thirdPitch": 0.03439999999999985,
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
  "doubleJumpEnabled": false,
  "jumpForce": 9.5,
  "jumpGravity": 26,
  "bulletTimeEnabled": true,
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
  "shieldVisible": false,
  "shieldColor": "#1e7bff",
  "shieldOpacity": 0.5,
  "shieldRadius": 2.2,
  "shieldHexSize": 0.05,
  "shieldLineThickness": 0.02,
  "shieldGlow": true,
  "shieldBloomIntensity": 0.1,
  "shieldBloomRadius": 1,
  "shieldFresnelPower": 2.1,
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
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "enemyDestructionEnabled": true,
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
  "tagSize": 22,
  "tagDwellTime": 1.2,
  "tagThickness": 2,
  "tagBloom": 3,
  "tagShadow": 4,
  "tagHeight": 18,
  "radarEnabled": true,
  "radarRadius": 90,
  "radarRange": 60,
  "radarBgColor": "#0a1628",
  "radarEnemyColor": "#ff3030",
  "radarOpacity": 0.82,
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
  "soundSfx_ambience": 0.5,
  "radarTaggedColor": "#ffee44",
  "aimDistDelta": -1.5,
  "aimEnabled": true,
  "aimFovDelta": -18,
  "aimSmooth": 10,
  "aimSpeedMult": 0.55,
  "shieldLineBloom": 0.5,
  "placedObjects": [],
  "placerSelectedAsset": "box",
} },
  { key: 'g4', label: 'G4', path: './presets/G4.json', data: {
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
  "thirdAzimuth": 3.2056661724146203,
  "thirdLookAhead": 3.8,
  "thirdSmoothPos": 10,
  "thirdSmoothLook": 12,
  "thirdMouseLook": true,
  "thirdMouseSensitivityX": 0.003,
  "thirdMouseSensitivityY": 0.0024,
  "thirdPitch": 0.0605766424205574,
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
  "doubleJumpEnabled": false,
  "jumpForce": 9.5,
  "jumpGravity": 26,
  "bulletTimeEnabled": true,
  "bulletTimeDuration": 3,
  "bulletTimeCooldown": 8,
  "bulletTimeScale": 0.35,
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
  "enemyMoveSpeed": 2.2,
  "enemyDamage": 10,
  "enemyPlacement": "random",
  "enemyWeaponType": "contact",
  "enemyDestructionEnabled": true,
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
  "controllerLookSensX": 0.05,
  "controllerLookSensY": 0.03,
  "controllerInvertY": true,
  "controllerFireThreshold": 0.5,
  "controllerVibration": true,
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
  "soundSfx_ambience": 0.75,
  "tagBloom": 1,
  "tagColor": "#ff2828",
  "tagDwellTime": 2,
  "tagEnabled": true,
  "tagHeight": 18,
  "tagShadow": 10,
  "tagSize": 20,
  "tagThickness": 0,
  "radarBgColor": "#0a1628",
  "radarEnabled": true,
  "radarEnemyColor": "#ff3030",
  "radarOpacity": 0.82,
  "radarRadius": 90,
  "radarRange": 60,
  "shieldBloomIntensity": 0.12,
  "shieldBloomRadius": 1.18,
  "shieldFresnelPower": 3.0,
  "radarTaggedColor": "#ffee44",
  "aimDistDelta": -1.5,
  "aimEnabled": true,
  "aimFovDelta": -18,
  "aimSmooth": 10,
  "aimSpeedMult": 0.55,
  "shieldLineBloom": 0.5,
  "placedObjects": [],
  "placerSelectedAsset": "box",
} },
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
  "doubleJumpEnabled": false,
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
  "enemyDestructionPhysics": true,
  "controllerEnabled": true,
  "controllerMoveDeadzone": 0.12,
  "controllerLookDeadzone": 0.10,
  "controllerLookSensX": 0.045,
  "controllerLookSensY": 0.036,
  "controllerInvertY": false,
  "controllerFireThreshold": 0.5,
  "controllerVibration": true,
  "enemyDestructionEliteCount": 100,
  "enemyDestructionEliteGlow": 12,
  "enemyDestructionEliteSize": 0.5,
  "enemyDestructionEliteSpeed": 1.75,
  "enemyDestructionStandardCount": 10,
  "enemyDestructionStandardSize": 0.25,
  "enemyDestructionStandardSpeed": 1,
  "soundMusicVolume": 0.4,
  "soundMuted": false,
  "soundSfxVolume": 1,
  "soundSfx_ambience": 0.5,
  "soundSfx_coin": 1,
  "soundSfx_dash": 1,
  "soundSfx_elite_hit": 1,
  "soundSfx_explode": 1,
  "soundSfx_gameover": 1,
  "soundSfx_heal": 1,
  "soundSfx_levelup": 1,
  "soundSfx_player_hit": 1,
  "soundSfx_shoot": 1,
  "soundSfx_standard_hit": 1,
  "soundSfx_victory": 1,
  "tagBloom": 1,
  "tagColor": "#ff2828",
  "tagDwellTime": 2,
  "tagEnabled": true,
  "tagHeight": 18,
  "tagShadow": 10,
  "tagSize": 20,
  "tagThickness": 0,
  "radarBgColor": "#0a1628",
  "radarEnabled": true,
  "radarEnemyColor": "#ff3030",
  "radarOpacity": 0.82,
  "radarRadius": 90,
  "radarRange": 60,
  "shieldBloomIntensity": 0.12,
  "shieldBloomRadius": 1.18,
  "shieldFresnelPower": 3.0,
  "radarTaggedColor": "#ffee44",
  "aimDistDelta": -1.5,
  "aimEnabled": true,
  "aimFovDelta": -18,
  "aimSmooth": 10,
  "aimSpeedMult": 0.55,
  "shieldLineBloom": 0.5,
  "placedObjects": [],
  "placerSelectedAsset": "box",
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
  "doubleJumpEnabled": false,
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
  "doubleJumpEnabled": false,
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
  ['dot', 'Dot'],
  ['cross', 'Crosshair'],
  ['ring', 'Ring'],
  ['crossDot', 'Cross + Dot'],
  ['triSpoke', 'Tri-Spoke'],
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

function weaponReticleKey(spec) {
  return weaponKey(spec.prefix, 'ReticleType');
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
  body.appendChild(toggle('Enemy Health Bars', 'hudEnemyHealthBars', () => applyHudSettings()));
  body.appendChild(toggle('Ally Health Bars', 'hudAllyHealthBars', () => applyHudSettings()));
  body.appendChild(slider({ key: 'hudNpcHealthBarRange', label: 'Health Bar Range', min: 0, max: 200, step: 1, dec: 0, onChange: () => applyHudSettings() }));

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
  body.appendChild(select('Placement', 'enemyPlacement', ENEMY_PLACEMENT_OPTIONS));
  body.appendChild(select('Weapon Type', 'enemyWeaponType', NPC_WEAPON_OPTIONS));
  body.appendChild(slider({ key: 'enemyAwarenessRange', label: 'Awareness Range', min: 1, max: 200, step: 1, dec: 0 }));

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
  button.textContent = getReticleLabel(state.params[key]);
  button.addEventListener('click', () => openWeaponReticleModal(spec, button));
  return row('Reticle', button);
}

function buildWeaponControls(body, spec) {
  const prefix = spec.prefix;
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

  body.appendChild(createManualSubsection('Projectile', projectileBody => {
    projectileBody.appendChild(slider({ key: weaponKey(prefix, 'ProjectileSpeed'), label: 'Projectile Speed', min: 1, max: 250, step: 1, dec: 0 }));
    projectileBody.appendChild(slider({ key: weaponKey(prefix, 'ProjectileSize'), label: 'Size', min: 0.05, max: 2, step: 0.01, dec: 2 }));
    projectileBody.appendChild(colorPicker('Color', weaponKey(prefix, 'ProjectileColor')));
    projectileBody.appendChild(toggle('Bloom', weaponKey(prefix, 'ProjectileBloom')));
  }, false));
}

function buildWeapons(body) {
  body.appendChild(createManualSubsection('Current Weapon', currentBody => {
    currentBody.appendChild(toggle('Weapons Enabled', 'laserEnabled'));
    currentBody.appendChild(select('Player Weapon', 'playerWeaponType', PLAYER_WEAPON_OPTIONS, () => {
      applyPlayerWeaponSettings();
      syncReticleToCurrentWeapon();
      applyReticleSettings();
    }));
  }, true));

  WEAPON_CONTROL_SPECS.forEach(spec => {
    body.appendChild(createManualSubsection(spec.label, sectionBody => buildWeaponControls(sectionBody, spec), spec.type === state.params.playerWeaponType));
  });

  body.appendChild(createManualSubsection('Reticle Display', reticleBody => {
    reticleBody.appendChild(toggle('Show Reticle', 'reticleVisible', () => applyReticleSettings()));
    reticleBody.appendChild(colorPicker('Color', 'reticleColor', () => applyReticleSettings()));
    reticleBody.appendChild(slider({
      key: 'reticleSize', label: 'Size', min: 2, max: 48, step: 1, dec: 0,
      onChange: () => applyReticleSettings(),
    }));
    reticleBody.appendChild(slider({
      key: 'reticleThickness', label: 'Thickness', min: 1, max: 8, step: 1, dec: 0,
      onChange: () => applyReticleSettings(),
    }));
    reticleBody.appendChild(slider({
      key: 'reticleOpacity', label: 'Opacity', min: 0.1, max: 1, step: 0.05, dec: 2,
      onChange: () => applyReticleSettings(),
    }));
    reticleBody.appendChild(toggle('Glow', 'reticleGlow', () => applyReticleSettings()));
  }, false));
}

// Ambience audio element — created once, persists across panel rebuilds.
let _ambienceEl = null;
function getAmbienceEl() {
  if (!_ambienceEl) {
    _ambienceEl = new Audio('./assets/storm.mp3');
    _ambienceEl.loop = true;
    _ambienceEl.volume = Math.max(0, Math.min(1, Number(state.params.soundSfx_ambience) ?? 0.5));
  }
  return _ambienceEl;
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
    ['Dash',           'soundSfx_dash'],
    ['Jump',           'soundSfx_jump'],
    ['Player Hit',     'soundSfx_player_hit'],
    ['Enemy Grunt',    'soundSfx_enemy_grunt'],
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
        el.play().catch(() => {});
      } else if (v <= 0) {
        el.pause();
      }
    },
  });
  body.appendChild(ambienceRow);

  // Start ambience if volume > 0
  const ambEl = getAmbienceEl();
  if (state.params.soundSfx_ambience > 0 && ambEl.paused && !state.params.soundMuted) {
    ambEl.play().catch(() => {});
  }
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
  body.appendChild(select('Placement', 'allyPlacement', ENEMY_PLACEMENT_OPTIONS));
  body.appendChild(select('Weapon Type', 'allyWeaponType', NPC_WEAPON_OPTIONS));
  body.appendChild(slider({ key: 'allyAwarenessRange', label: 'Awareness Range', min: 1, max: 200, step: 1, dec: 0 }));

  body.appendChild(btn('Spawn / Apply Allies', 'sb-btn-accent', () => {
    const count = spawnAlliesFromSettings();
    notify(`${count} allies spawned ✓`);
  }));
  body.appendChild(btn('Clear Allies', 'sb-btn-muted', () => {
    clearAllies();
    notify('Allies cleared ✓');
  }));
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
  body.appendChild(colorPicker('Floor Color', 'floorColor', v => setFloorColor(v)));
  body.appendChild(colorPicker('Grid Color',  'gridColor',  v => setGridColor(v)));
  body.appendChild(toggle('Show Floor', 'showFloor', v => setFloorVisible(v)));
  body.appendChild(toggle('Show Grid',  'showGrid',  v => setGridVisible(v)));
}


function assetGroups() {
  const grouped = new Map();
  ASSET_CATALOGUE.forEach(asset => {
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
  body.appendChild(subhdr('Object Placer'));

  // Current slot indicator
  const slotInfo = document.createElement('div');
  slotInfo.style.cssText = 'font-size:10px;color:var(--sb-muted);padding:2px 0 8px;line-height:1.5;';
  slotInfo.textContent = 'Scroll wheel switches between Laser and Placer. F opens asset picker. Ctrl-click selects objects. Ctrl+A selects all. C clears selection. Delete removes selected.';
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
  const note = document.createElement('div');
  note.style.cssText = 'padding:8px 4px;font-size:11px;color:var(--sb-muted);line-height:1.5;';
  note.textContent = 'Scenario configurations will appear here.';
  body.appendChild(note);
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
    state.activePreset = 'g21';
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
  syncReticleToCurrentWeapon();
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
  const rotationDeg = ((Math.round((Number(p.placerRotationDeg) || 0) / 90) * 90) % 360 + 360) % 360;
  p.placerRotationDeg = rotationDeg;
  const snapScale = value => Math.min(6, Math.max(0.5, Math.round((Number(value) || 1) * 2) / 2));
  p.placerScaleX = snapScale(p.placerScaleX);
  p.placerScaleY = snapScale(p.placerScaleY);
  p.placerScaleZ = snapScale(p.placerScaleZ);
  const modalCoord = value => Math.max(22, Math.round(Number(value) || 22));
  p.placerTransformModalX = modalCoord(p.placerTransformModalX);
  p.placerTransformModalY = modalCoord(p.placerTransformModalY);
  if (!('soundSfx_jump' in p)) p.soundSfx_jump = 1;
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
  const hexSetting = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback);
  const boolSetting = (value, fallback = false) => (value === true || value === false ? value : fallback);
  const weaponDefaults = {
    Pistol: { damage: 24, range: 55, spread: 0.01, fireRate: 3.6, speed: 70, size: 0.28, color: '#d8dde6', bloom: false, reticle: 'dot' },
    Rifle: { damage: 34, range: Number(p.laserRange) || 42, spread: 0.003, fireRate: Number(p.laserFireRate) || 5, speed: Number(p.laserProjectileSpeed) || 80, size: 0.36, color: p.laserBloomColor || '#ff1100', bloom: p.laserBloom !== false, reticle: 'triSpoke' },
    Shotgun: { damage: 12, range: 28, spread: 0.16, fireRate: 1.15, speed: 60, size: 0.32, color: '#d8dde6', bloom: false, reticle: 'crossDot' },
    Sniper: { damage: 120, range: 180, spread: 0.002, fireRate: 0.65, speed: 130, size: 0.24, color: '#d975ff', bloom: true, reticle: 'cross' },
    Grenade: { damage: 95, range: 60, spread: 0.01, fireRate: 0.72, speed: 16, size: 0.25, color: '#ff8844', bloom: false, reticle: 'ring', radius: 5 },
    Rocket: { damage: 130, range: 95, spread: 0.004, fireRate: 0.68, speed: 34, size: 0.42, color: '#ff3333', bloom: true, reticle: 'ring', radius: 6 },
  };
  WEAPON_CONTROL_SPECS.forEach(spec => {
    const d = weaponDefaults[spec.prefix];
    p[weaponKey(spec.prefix, 'Damage')] = Math.round(clampSetting(p[weaponKey(spec.prefix, 'Damage')], 0, 1000, d.damage));
    p[weaponKey(spec.prefix, 'Range')] = clampSetting(p[weaponKey(spec.prefix, 'Range')], 1, 500, d.range);
    p[weaponKey(spec.prefix, 'Spread')] = clampSetting(p[weaponKey(spec.prefix, 'Spread')], 0, 1, d.spread);
    p[weaponKey(spec.prefix, 'FireRate')] = clampSetting(p[weaponKey(spec.prefix, 'FireRate')], 0.1, 30, d.fireRate);
    p[weaponKey(spec.prefix, 'ProjectileSpeed')] = clampSetting(p[weaponKey(spec.prefix, 'ProjectileSpeed')], 1, 250, d.speed);
    p[weaponKey(spec.prefix, 'ProjectileSize')] = clampSetting(p[weaponKey(spec.prefix, 'ProjectileSize')], 0.05, 2, d.size);
    p[weaponKey(spec.prefix, 'ProjectileColor')] = hexSetting(p[weaponKey(spec.prefix, 'ProjectileColor')], d.color);
    p[weaponKey(spec.prefix, 'ProjectileBloom')] = boolSetting(p[weaponKey(spec.prefix, 'ProjectileBloom')], d.bloom);
    p[weaponReticleKey(spec)] = RETICLE_MARKUP[p[weaponReticleKey(spec)]] ? p[weaponReticleKey(spec)] : d.reticle;
    if (spec.radius) p[weaponKey(spec.prefix, 'Radius')] = clampSetting(p[weaponKey(spec.prefix, 'Radius')], 0.5, 60, d.radius);
  });
  p.weaponShotgunPellets = Math.round(clampSetting(p.weaponShotgunPellets, 1, 24, 8));
  syncReticleToCurrentWeapon();
  applyPlayerWeaponSettings();
  p.allyType = normalizeChoice(p.allyType, ENEMY_TYPE_OPTIONS, 'rusher');
  p.allyCount = Math.round(clampSetting(p.allyCount, 0, 50, 0));
  p.allyHealth = Math.round(clampSetting(p.allyHealth, 1, 1000, 100));
  p.allyInvincible = p.allyInvincible === true;
  p.allyFriendlyFire = p.allyFriendlyFire === true;
  p.allyBehavior = normalizeChoice(p.allyBehavior, ENEMY_BEHAVIOR_OPTIONS, 'guard');
  p.allyMoveSpeed = clampSetting(p.allyMoveSpeed, 0, 12, 2.2);
  p.allyDamage = Math.round(clampSetting(p.allyDamage, 0, 250, 10));
  p.allyPlacement = normalizeChoice(p.allyPlacement, ENEMY_PLACEMENT_OPTIONS, 'random');
  p.enemyWeaponType = normalizeNpcWeaponChoice(p.enemyWeaponType);
  p.enemyAwarenessRange = clampSetting(p.enemyAwarenessRange, 1, 200, 40);
  p.allyWeaponType = normalizeNpcWeaponChoice(p.allyWeaponType);
  p.allyAwarenessRange = clampSetting(p.allyAwarenessRange, 1, 200, 40);
  p.soundProximityEnabled = p.soundProximityEnabled !== false;
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
    [ICON_LANDSCAPE, 'Landscape', buildLandscape],
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
  // Pause or resume ambience when game pauses/unpauses
  if (_ambienceEl) {
    if (state.paused) {
      _ambienceEl.pause();
    } else if (state.params.soundSfx_ambience > 0 && !state.params.soundMuted) {
      _ambienceEl.play().catch(() => {});
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
