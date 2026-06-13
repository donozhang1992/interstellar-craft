/**
 * Antenna structural validator — GAME_DESIGN §3c step 1 (ch2 "Raise the antenna:
 * 3 antenna blocks atop a 4-high mast"). A mini beacon validator.
 *
 * EXACT RULE. A column (x, z) holds a valid antenna iff there exists a y such that:
 *   - the 3 cells (x, y, z), (x, y+1, z), (x, y+2, z) are all `antenna` (BlockId
 *     11) — three vertically-stacked, contiguous antenna blocks; AND
 *   - the 4 cells directly below — (x, y-1, z) down to (x, y-4, z) — are all
 *     SOLID (world.isSolid) and NONE of them is an antenna block. I.e. the
 *     antenna stack must sit atop ≥4 contiguous non-antenna solid mast blocks.
 *
 * Notes / edge handling:
 *   - "≥4": exactly the bottom 4 mast cells are required; a taller mast also
 *     passes (we only check the 4 immediately below).
 *   - Out-of-world cells read as air (VoxelWorld.getBlock returns 0 / not solid),
 *     so a mast that runs off the bottom of the world fails the solid check.
 *   - Antenna blocks are themselves solid, so the "NOT antenna" clause is what
 *     stops a tall antenna pole from validating as its own mast.
 *
 * Pure core: reads the world via the VoxelWorld API only (no three.js / DOM).
 * The game layer (M3.3) calls this to set `flags.antennaBuilt`.
 */
import type { VoxelWorld } from '../world/voxelWorld';
import { BlockId } from '../world/blocks';

/** Number of stacked antenna blocks required at the top of the structure. */
export const ANTENNA_STACK = 3;

/** Minimum contiguous solid (non-antenna) mast blocks required below the stack. */
export const MAST_MIN = 4;

/** True iff the cell (x, y, z) is an antenna block. */
function isAntenna(world: VoxelWorld, x: number, y: number, z: number): boolean {
  return world.getBlock(x, y, z) === BlockId.Antenna;
}

/**
 * True iff the column (x, z) holds a valid antenna somewhere along its height.
 * Scans every candidate lowest-antenna y from MAST_MIN up to the top of the
 * world, checking the 3-antenna stack + 4-block mast rule documented above.
 */
export function validateAntennaAt(world: VoxelWorld, x: number, z: number): boolean {
  // Lowest possible y for the bottom antenna: there must be MAST_MIN mast cells
  // below it (y-1 .. y-MAST_MIN), so y >= MAST_MIN.
  const maxY = world.sizeY - ANTENNA_STACK; // top antenna must fit: y+ANTENNA_STACK-1 < sizeY
  for (let y = MAST_MIN; y <= maxY; y++) {
    // 3 contiguous antenna blocks at y, y+1, y+2.
    let stackOk = true;
    for (let i = 0; i < ANTENNA_STACK; i++) {
      if (!isAntenna(world, x, y + i, z)) {
        stackOk = false;
        break;
      }
    }
    if (!stackOk) continue;

    // 4 contiguous solid, non-antenna mast cells directly below.
    let mastOk = true;
    for (let i = 1; i <= MAST_MIN; i++) {
      const my = y - i;
      if (!world.isSolid(x, my, z) || isAntenna(world, x, my, z)) {
        mastOk = false;
        break;
      }
    }
    if (mastOk) return true;
  }
  return false;
}

/**
 * True iff the world contains at least one valid antenna at any (x, z) column.
 * Scans the full world footprint. O(sizeX * sizeZ * sizeY) — cheap for the
 * prototype 96×81×96 bounds and intended for occasional quest-step checks.
 */
export function validateAntenna(world: VoxelWorld): boolean {
  for (let x = 0; x < world.sizeX; x++) {
    for (let z = 0; z < world.sizeZ; z++) {
      if (validateAntennaAt(world, x, z)) return true;
    }
  }
  return false;
}
