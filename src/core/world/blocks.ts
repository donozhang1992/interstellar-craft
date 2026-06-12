/**
 * Block ID table — M0 parity port of the legacy prototype's 6-block palette
 * (prototype/index.html `BLOCKS`). IDs MUST match the prototype exactly: air = 0
 * plus the 6 solids in prototype order.
 *
 * NOTE: the full 12-block table from GAME_DESIGN §4 lands in M1; this file only
 * carries the legacy prototype palette until then.
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
}

/** Display names, indexed by block id (0 = air has no entry in the prototype). */
export const BLOCK_NAMES: Readonly<Record<BlockId, string>> = {
  [BlockId.Air]: 'air',
  [BlockId.Regolith]: '月壤',
  [BlockId.Rock]: '星岩',
  [BlockId.Basalt]: '玄武岩',
  [BlockId.Crystal]: '能量晶簇',
  [BlockId.Ice]: '寒冰',
  [BlockId.Lamp]: '聚变灯',
};

/** Every non-air block in the M0 palette is solid (prototype treats any id > 0 as solid). */
export function isSolid(id: number): boolean {
  return id !== BlockId.Air;
}
