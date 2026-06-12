/**
 * Mining model — GAME_DESIGN §4 (canonical).
 *
 * Pure data + pure functions, no state: tool speed ladder (hand ×1, Mk1 ×2,
 * Mk2 ×4, Plasma ×8), tier ordering, and mining time = hardness / multiplier.
 * A block below its min tool cannot be mined → time is null (progress.ts
 * surfaces this as `refused`).
 *
 * `MINING_TIME_MATRIX` exposes the full 13 blocks × 4 tiers table for the
 * M1 exit-criterion snapshot test.
 */
import { BLOCKS } from '../world/blocks';
import type { BlockDef, MinTool, SolidBlockId } from '../world/blocks';

/**
 * A mining tier: 'hand' (no tool) or a drill tier (items/catalog ToolTier).
 * Identical to world/blocks MinTool — re-exported under the mining-side name.
 */
export type MiningTier = MinTool;

/** All tiers, ascending. Index in this array IS the tier rank. */
export const MINING_TIERS: readonly MiningTier[] = ['hand', 'mk1', 'mk2', 'plasma'];

/** GAME_DESIGN §4: hand ×1, Drill Mk1 ×2, Mk2 ×4, Plasma ×8. */
const TOOL_MULTIPLIER: Readonly<Record<MiningTier, 1 | 2 | 4 | 8>> = {
  hand: 1,
  mk1: 2,
  mk2: 4,
  plasma: 8,
};

/** Speed multiplier for a tier (mining time = hardness / multiplier). */
export function toolMultiplier(tier: MiningTier): 1 | 2 | 4 | 8 {
  return TOOL_MULTIPLIER[tier];
}

const TIER_RANK: Readonly<Record<MiningTier, number>> = {
  hand: 0,
  mk1: 1,
  mk2: 2,
  plasma: 3,
};

/** True when `have` is at least `required` (hand < mk1 < mk2 < plasma). */
export function tierSatisfies(have: MiningTier, required: MiningTier): boolean {
  return TIER_RANK[have] >= TIER_RANK[required];
}

/**
 * Seconds to mine `blockId` with `tier`: hardness / multiplier (§4).
 * Returns null when the block id is not a §4 block (air, unknown) or the
 * tier is below the block's min tool (mining refuses to start).
 */
export function miningTime(blockId: number, tier: MiningTier): number | null {
  const def = (BLOCKS as Partial<Record<number, BlockDef>>)[blockId];
  if (def === undefined) return null;
  if (!tierSatisfies(tier, def.minTool)) return null;
  return def.hardness / toolMultiplier(tier);
}

/** One matrix row: seconds per tier, null where the tier is gated. */
export type MiningTimeRow = Readonly<Record<MiningTier, number | null>>;

function matrixRow(id: SolidBlockId): MiningTimeRow {
  return {
    hand: miningTime(id, 'hand'),
    mk1: miningTime(id, 'mk1'),
    mk2: miningTime(id, 'mk2'),
    plasma: miningTime(id, 'plasma'),
  };
}

/**
 * The full 13 × 4 mining-time matrix, keyed by block id (M1 exit criterion;
 * frozen by the snapshot in tests/unit/mining/model.test.ts).
 */
export const MINING_TIME_MATRIX: Readonly<Record<SolidBlockId, MiningTimeRow>> = Object.fromEntries(
  Object.values(BLOCKS).map((def: BlockDef) => [def.id, matrixRow(def.id)]),
) as Record<SolidBlockId, MiningTimeRow>;
