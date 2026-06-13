/**
 * Beacon structural validator — GAME_DESIGN §3d Ch4 step 1 ("Build the beacon:
 * launchpad → 6 beacon-core mast → antenna cap"). The M4 sibling of antenna.ts.
 *
 * EXACT RULE. A column (x, z) holds a valid beacon iff there exists a y (the
 * launchpad level) such that:
 *   - (x, y-1, z) is SOLID (the launchpad rests on solid ground — out-of-world
 *     reads as air, so a pad on the world floor fails); AND
 *   - (x, y, z) is `launchpad` (BlockId 13); AND
 *   - the 6 cells (x, y+1, z) .. (x, y+6, z) are ALL `beacon_core` (BlockId 12)
 *     — exactly 6 contiguous cores directly above the pad; AND
 *   - (x, y+7, z) is `antenna` (BlockId 11) — the cap.
 *
 * "Exactly 6" is enforced from both ends: the cap directly above the 6th core
 * must be an antenna (a 7th core fails because the cap slot is a core, not an
 * antenna), and the pad-to-cap span is fully specified (a 5th-core gap fails the
 * core run). Out-of-world cells read as air (VoxelWorld.getBlock → 0), so an
 * assembly that runs off the top of the world fails.
 *
 * Pure core: reads the world via the VoxelWorld API only (no three.js / DOM).
 * The game layer (M4) calls this to set `ctx.flags.beaconValid`.
 */
import type { VoxelWorld } from '../world/voxelWorld';
import { BlockId } from '../world/blocks';

/** Exact number of contiguous beacon_core blocks required above the launchpad. */
export const BEACON_CORE_COUNT = 6;

/**
 * Total height of the assembly above (and including) the launchpad: the pad,
 * BEACON_CORE_COUNT cores, and 1 antenna cap.
 */
export const BEACON_HEIGHT = 1 + BEACON_CORE_COUNT + 1;

/**
 * True iff the column (x, z) holds a valid beacon somewhere along its height.
 * Scans every candidate launchpad level y from 1 (so a y-1 ground cell exists)
 * up to the top that still fits the full assembly.
 */
export function validateBeaconAt(world: VoxelWorld, x: number, z: number): boolean {
  // Topmost launchpad y such that the antenna cap (y + BEACON_HEIGHT - 1) fits.
  const maxY = world.sizeY - BEACON_HEIGHT;
  // y >= 1 so that (x, y-1, z) — the ground — is a real in-world cell.
  for (let y = 1; y <= maxY; y++) {
    // Launchpad must rest on a solid ground block.
    if (!world.isSolid(x, y - 1, z)) continue;
    if (world.getBlock(x, y, z) !== BlockId.Launchpad) continue;

    // Exactly BEACON_CORE_COUNT contiguous beacon_core blocks above the pad.
    let coresOk = true;
    for (let i = 1; i <= BEACON_CORE_COUNT; i++) {
      if (world.getBlock(x, y + i, z) !== BlockId.BeaconCore) {
        coresOk = false;
        break;
      }
    }
    if (!coresOk) continue;

    // Antenna cap directly above the 6th core (this also rejects a 7th core).
    if (world.getBlock(x, y + BEACON_CORE_COUNT + 1, z) === BlockId.Antenna) return true;
  }
  return false;
}

/**
 * True iff the world contains at least one valid beacon at any (x, z) column.
 * Scans the full world footprint. O(sizeX * sizeZ * sizeY) — cheap for the
 * prototype bounds and intended for occasional quest-step checks.
 */
export function validateBeacon(world: VoxelWorld): boolean {
  for (let x = 0; x < world.sizeX; x++) {
    for (let z = 0; z < world.sizeZ; z++) {
      if (validateBeaconAt(world, x, z)) return true;
    }
  }
  return false;
}
