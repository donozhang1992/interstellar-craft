/**
 * Block table — the full 13-block palette of GAME_DESIGN §4 (canonical).
 *
 * IDs 1–6 are the M0 parity port of the legacy prototype's palette
 * (prototype/index.html `BLOCKS`) and are FROZEN: the terrain snapshot hash
 * depends on them. IDs 7–13 are the M1 extension (GAME_DESIGN §4); they do not
 * appear in worldgen until the M2 rework.
 *
 * Per-block mining data (hardness / minTool / drops) is consumed by the M1
 * mining task; this file only carries the data, no mining logic.
 */
export enum BlockId {
  Air = 0,
  /** 月壤 — regolith surface layer */
  Regolith = 1,
  /** 星岩 — star-rock stratum (hosts crystal ore) */
  Rock = 2,
  /** 玄武岩 — basalt bedrock */
  Basalt = 3,
  /** 能量晶簇 — energy crystal cluster (glowing) */
  Crystal = 4,
  /** 寒冰 — ice (low-altitude surfaces) */
  Ice = 5,
  /** 聚变灯 — fusion lamp (player-placeable light) */
  Lamp = 6,
  /** Iron ore — spawns in M2 worldgen rework (y<24) */
  IronOre = 7,
  /** Copper ore — spawns in M2 worldgen rework (y<28) */
  CopperOre = 8,
  /** Hull — salvage + crafted plate */
  Hull = 9,
  /** Glass — smelted from ice; breaks (drops nothing) */
  Glass = 10,
  /** Antenna — quest block, craftable ch2+ */
  Antenna = 11,
  /** Beacon core — quest block, craftable ch4+ */
  BeaconCore = 12,
  /** Launchpad — quest block, craftable ch4+ */
  Launchpad = 13,
}

/** Any block id except air. */
export type SolidBlockId = Exclude<BlockId, BlockId.Air>;

/** Minimum tool tier able to mine a block (GAME_DESIGN §4 "Min tool"). */
export type MinTool = 'hand' | 'mk1' | 'mk2' | 'plasma';

/** One row of the GAME_DESIGN §4 block table. */
export interface BlockDef {
  readonly id: SolidBlockId;
  /** Canonical snake_case name from GAME_DESIGN §4. */
  readonly name: string;
  /** Seconds to mine BY HAND (tool multipliers divide this — §4). */
  readonly hardness: number;
  readonly minTool: MinTool;
  /** Block id dropped when mined, or null for nothing (glass breaks). */
  readonly drops: SolidBlockId | null;
}

/**
 * The canonical 13-block table, every value a literal mirror of GAME_DESIGN §4.
 * Frozen by tests/unit/items/blockTable.test.ts — change the doc first.
 */
export const BLOCKS: Readonly<Record<SolidBlockId, BlockDef>> = {
  [BlockId.Regolith]: {
    id: BlockId.Regolith,
    name: 'regolith',
    hardness: 0.6,
    minTool: 'hand',
    drops: BlockId.Regolith,
  },
  [BlockId.Rock]: {
    id: BlockId.Rock,
    name: 'rock',
    hardness: 1.2,
    minTool: 'hand',
    drops: BlockId.Rock,
  },
  [BlockId.Basalt]: {
    id: BlockId.Basalt,
    name: 'basalt',
    hardness: 1.5,
    minTool: 'mk1',
    drops: BlockId.Basalt,
  },
  [BlockId.Crystal]: {
    id: BlockId.Crystal,
    name: 'crystal',
    hardness: 3.5,
    minTool: 'mk2',
    drops: BlockId.Crystal,
  },
  [BlockId.Ice]: {
    id: BlockId.Ice,
    name: 'ice',
    hardness: 0.8,
    minTool: 'hand',
    drops: BlockId.Ice,
  },
  [BlockId.Lamp]: {
    id: BlockId.Lamp,
    name: 'lamp',
    hardness: 1.0,
    minTool: 'mk1',
    drops: BlockId.Lamp,
  },
  [BlockId.IronOre]: {
    id: BlockId.IronOre,
    name: 'iron_ore',
    hardness: 2.5,
    minTool: 'mk1',
    drops: BlockId.IronOre,
  },
  [BlockId.CopperOre]: {
    id: BlockId.CopperOre,
    name: 'copper_ore',
    hardness: 2.0,
    minTool: 'mk1',
    drops: BlockId.CopperOre,
  },
  [BlockId.Hull]: {
    id: BlockId.Hull,
    name: 'hull',
    hardness: 2.0,
    minTool: 'mk1',
    drops: BlockId.Hull,
  },
  [BlockId.Glass]: {
    id: BlockId.Glass,
    name: 'glass',
    hardness: 0.5,
    minTool: 'hand',
    drops: null,
  },
  [BlockId.Antenna]: {
    id: BlockId.Antenna,
    name: 'antenna',
    hardness: 1.0,
    minTool: 'mk1',
    drops: BlockId.Antenna,
  },
  [BlockId.BeaconCore]: {
    id: BlockId.BeaconCore,
    name: 'beacon_core',
    hardness: 4.0,
    minTool: 'mk2',
    drops: BlockId.BeaconCore,
  },
  [BlockId.Launchpad]: {
    id: BlockId.Launchpad,
    name: 'launchpad',
    hardness: 4.0,
    minTool: 'mk2',
    drops: BlockId.Launchpad,
  },
};

/**
 * Display names, indexed by block id (0 = air has no entry in the prototype).
 * IDs 1–6 keep the FROZEN Chinese prototype names (M0 parity); 7–13 use the
 * canonical §4 names until the control plane decides on localized display text.
 */
export const BLOCK_NAMES: Readonly<Record<BlockId, string>> = {
  [BlockId.Air]: 'air',
  [BlockId.Regolith]: '月壤',
  [BlockId.Rock]: '星岩',
  [BlockId.Basalt]: '玄武岩',
  [BlockId.Crystal]: '能量晶簇',
  [BlockId.Ice]: '寒冰',
  [BlockId.Lamp]: '聚变灯',
  [BlockId.IronOre]: 'iron_ore',
  [BlockId.CopperOre]: 'copper_ore',
  [BlockId.Hull]: 'hull',
  [BlockId.Glass]: 'glass',
  [BlockId.Antenna]: 'antenna',
  [BlockId.BeaconCore]: 'beacon_core',
  [BlockId.Launchpad]: 'launchpad',
};

/** Every non-air block in the M0 palette is solid (prototype treats any id > 0 as solid). */
export function isSolid(id: number): boolean {
  return id !== BlockId.Air;
}
