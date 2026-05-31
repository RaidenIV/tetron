// src/assets-catalogue.js
// Plain data — no Three.js, no DOM. Safe to import from any module.
// footprintW and footprintH: grid-cell dimensions of the object base footprint.
// clip=true objects block player/enemy/projectile movement inside their footprint.
// height is used for simple vertical projectile clipping.
// walkable=true lets the player use a clipped asset as terrain instead of a blocker.
// destructible=true assets can be destroyed by projectiles and use danger.png face decals.
// For an even footprint (e.g. 4x2), the object origin is placed at the centre of
// that footprint block and the whole block snaps to grid-line boundaries.
export const ASSET_CATEGORY = Object.freeze({
  DEFAULT: 'default',
  DESTRUCTIBLE: 'destructible',
  PREFAB: 'prefab',
});

export const ASSET_CATALOGUE = [
  { id: 'box',      label: 'Crate',      category: ASSET_CATEGORY.DEFAULT, color: 0x8b6914, yOffset: 0.5, footprintW: 1, footprintH: 1, clip: true, height: 1.0 },
  { id: 'tall_box', label: 'Tall Crate', category: ASSET_CATEGORY.DEFAULT, color: 0x6b4f10, yOffset: 1.0, footprintW: 1, footprintH: 1, clip: true, height: 2.0 },
  { id: 'cylinder', label: 'Barrel',     category: ASSET_CATEGORY.DEFAULT, color: 0x3a5a3a, yOffset: 0.6, footprintW: 1, footprintH: 1, clip: true, height: 1.2 },
  { id: 'sphere',   label: 'Orb',        category: ASSET_CATEGORY.DEFAULT, color: 0x4488cc, yOffset: 0.5, footprintW: 1, footprintH: 1, clip: true, height: 1.0 },
  { id: 'wall',     label: 'Wall',       category: ASSET_CATEGORY.DEFAULT, color: 0x556677, yOffset: 1.0, footprintW: 4, footprintH: 1, clip: true, height: 2.0 },
  { id: 'ramp',     label: 'Ramp',       category: ASSET_CATEGORY.DEFAULT, color: 0x445566, yOffset: 0.0, footprintW: 4, footprintH: 2, clip: true, height: 2.0, walkable: true },
  { id: 'destructible_crate',  label: 'Destructible Crate',  category: ASSET_CATEGORY.DESTRUCTIBLE, color: 0x6b4f10, yOffset: 0.5, footprintW: 1, footprintH: 1, clip: true, height: 1.0, destructible: true, baseAssetId: 'box' },
  { id: 'destructible_barrel', label: 'Destructible Barrel', category: ASSET_CATEGORY.DESTRUCTIBLE, color: 0x3a5a3a, yOffset: 0.6, footprintW: 1, footprintH: 1, clip: true, height: 1.2, destructible: true, baseAssetId: 'cylinder' },

  // Prefabs are saved as regular placed objects with shared groupId metadata,
  // so exported JSON remains easy to edit and import without a separate format.
  {
    id: 'prefab_crate_wall_4x2',
    label: 'Prefab: Crate Wall 4x2',
    category: ASSET_CATEGORY.PREFAB,
    color: 0x6b4f10,
    yOffset: 0,
    footprintW: 4,
    footprintH: 1,
    prefab: true,
    prefabItems: [
      { assetId: 'tall_box', x: -1.5, z: 0 },
      { assetId: 'tall_box', x: -0.5, z: 0 },
      { assetId: 'tall_box', x:  0.5, z: 0 },
      { assetId: 'tall_box', x:  1.5, z: 0 },
    ],
  },
  {
    id: 'prefab_ramp_platform',
    label: 'Prefab: Ramp + Platform',
    category: ASSET_CATEGORY.PREFAB,
    color: 0x445566,
    yOffset: 0,
    footprintW: 4,
    footprintH: 3,
    prefab: true,
    prefabItems: [
      { assetId: 'ramp', x: 0, z: -0.5 },
      { assetId: 'tall_box', x: -1.5, z: 1.0 },
      { assetId: 'tall_box', x: -0.5, z: 1.0 },
      { assetId: 'tall_box', x:  0.5, z: 1.0 },
      { assetId: 'tall_box', x:  1.5, z: 1.0 },
    ],
  },
  {
    id: 'prefab_cover_barricade',
    label: 'Prefab: Cover Barricade',
    category: ASSET_CATEGORY.PREFAB,
    color: 0x556677,
    yOffset: 0,
    footprintW: 5,
    footprintH: 2,
    prefab: true,
    prefabItems: [
      { assetId: 'wall', x: 0, z: 0 },
      { assetId: 'destructible_barrel', x: -2, z: 0.5 },
      { assetId: 'box', x: 2, z: 0.5 },
    ],
  },
  {
    id: 'prefab_crate_platform_4x4',
    label: 'Prefab: Crate Platform 4x4',
    category: ASSET_CATEGORY.PREFAB,
    color: 0x6b4f10,
    yOffset: 0,
    footprintW: 4,
    footprintH: 4,
    prefab: true,
    prefabItems: [
      { assetId: 'tall_box', x: -1.5, z: -1.5 }, { assetId: 'tall_box', x: -0.5, z: -1.5 }, { assetId: 'tall_box', x: 0.5, z: -1.5 }, { assetId: 'tall_box', x: 1.5, z: -1.5 },
      { assetId: 'tall_box', x: -1.5, z: -0.5 }, { assetId: 'tall_box', x: -0.5, z: -0.5 }, { assetId: 'tall_box', x: 0.5, z: -0.5 }, { assetId: 'tall_box', x: 1.5, z: -0.5 },
      { assetId: 'tall_box', x: -1.5, z:  0.5 }, { assetId: 'tall_box', x: -0.5, z:  0.5 }, { assetId: 'tall_box', x: 0.5, z:  0.5 }, { assetId: 'tall_box', x: 1.5, z:  0.5 },
      { assetId: 'tall_box', x: -1.5, z:  1.5 }, { assetId: 'tall_box', x: -0.5, z:  1.5 }, { assetId: 'tall_box', x: 0.5, z:  1.5 }, { assetId: 'tall_box', x: 1.5, z:  1.5 },
    ],
  },
];

export const ASSET_CATEGORY_LABELS = Object.freeze({
  [ASSET_CATEGORY.DEFAULT]: 'Default Assets',
  [ASSET_CATEGORY.DESTRUCTIBLE]: 'Destructible Assets',
  [ASSET_CATEGORY.PREFAB]: 'Prefabs',
});
