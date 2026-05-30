// src/assets-catalogue.js
// Plain data — no Three.js, no DOM. Safe to import from any module.
// footprintW and footprintH: grid-cell dimensions of the object base footprint.
// For an even footprint (e.g. 4x2), the object origin is placed at the centre of
// that footprint block and the whole block snaps to grid-line boundaries.
export const ASSET_CATALOGUE = [
  { id: 'box',      label: 'Crate',      color: 0x8b6914, yOffset: 0.5, footprintW: 1, footprintH: 1 },
  { id: 'tall_box', label: 'Tall Crate', color: 0x6b4f10, yOffset: 1.0, footprintW: 1, footprintH: 1 },
  { id: 'cylinder', label: 'Barrel',     color: 0x3a5a3a, yOffset: 0.6, footprintW: 1, footprintH: 1 },
  { id: 'sphere',   label: 'Orb',        color: 0x4488cc, yOffset: 0.5, footprintW: 1, footprintH: 1 },
  { id: 'wall',     label: 'Wall',       color: 0x556677, yOffset: 1.0, footprintW: 4, footprintH: 1 },
  { id: 'ramp',     label: 'Ramp',       color: 0x445566, yOffset: 0.0, footprintW: 4, footprintH: 2 },
];
