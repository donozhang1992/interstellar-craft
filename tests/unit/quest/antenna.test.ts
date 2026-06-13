// Spec: GAME_DESIGN §3c step 1 — ch2 "Raise the antenna (3 antenna blocks atop a
// 4-high mast)". Structural check (validator in core, like the M4 beacon
// validator but simpler): a vertical column ≥4 of any solid topped by 3 stacked
// antenna(11) blocks. validateAntenna(world) scans the world for any such
// structure; validateAntennaAt(world, x, z) checks a single column.
import { describe, expect, it } from 'vitest';
import { VoxelWorld } from '../../../src/core/world/voxelWorld';
import type { WorldDims } from '../../../src/core/world/voxelWorld';
import { BlockId } from '../../../src/core/world/blocks';
import { validateAntenna, validateAntennaAt } from '../../../src/core/quest/antenna';

// Small hand-crafted world so scans are cheap.
const SMALL: WorldDims = { sizeX: 16, sizeY: 32, sizeZ: 16 };

/** Place a `mast` of `mastH` solid blocks of `mastId` from y=base upward,
 *  topped by `antH` antenna blocks. Returns the y of the lowest antenna. */
function buildAntenna(
  world: VoxelWorld,
  x: number,
  z: number,
  base: number,
  mastH: number,
  antH: number,
  mastId: number = BlockId.Rock,
): number {
  for (let i = 0; i < mastH; i++) world.setBlock(x, base + i, z, mastId);
  const lowestAntenna = base + mastH;
  for (let i = 0; i < antH; i++) world.setBlock(x, lowestAntenna + i, z, BlockId.Antenna);
  return lowestAntenna;
}

describe('validateAntennaAt (GAME_DESIGN §3c step 1)', () => {
  it('valid: 4-solid mast + 3 stacked antenna → true', () => {
    const w = new VoxelWorld(SMALL);
    buildAntenna(w, 8, 8, 0, 4, 3);
    expect(validateAntennaAt(w, 8, 8)).toBe(true);
  });

  it('mast too short (only 3 solid below the 3 antenna) → false', () => {
    const w = new VoxelWorld(SMALL);
    buildAntenna(w, 8, 8, 0, 3, 3);
    expect(validateAntennaAt(w, 8, 8)).toBe(false);
  });

  it('only 2 antenna on top of a tall mast → false', () => {
    const w = new VoxelWorld(SMALL);
    buildAntenna(w, 8, 8, 0, 6, 2);
    expect(validateAntennaAt(w, 8, 8)).toBe(false);
  });

  it('antenna stack with a gap (not contiguous) → false', () => {
    const w = new VoxelWorld(SMALL);
    // mast 0..3, antenna at 4,5 then gap at 6, antenna at 7
    for (let y = 0; y < 4; y++) w.setBlock(8, y, 8, BlockId.Rock);
    w.setBlock(8, 4, 8, BlockId.Antenna);
    w.setBlock(8, 5, 8, BlockId.Antenna);
    // y=6 left as air (gap)
    w.setBlock(8, 7, 8, BlockId.Antenna);
    expect(validateAntennaAt(w, 8, 8)).toBe(false);
  });

  it('antenna sitting on air (no mast) → false', () => {
    const w = new VoxelWorld(SMALL);
    // floating antenna at y=10,11,12 with nothing below
    for (let i = 0; i < 3; i++) w.setBlock(8, 10 + i, 8, BlockId.Antenna);
    expect(validateAntennaAt(w, 8, 8)).toBe(false);
  });

  it('mast made of antenna blocks does NOT count as the supporting mast → false', () => {
    const w = new VoxelWorld(SMALL);
    // 7 antenna stacked: top 3 antenna sit on 4 antenna — mast must be non-antenna solid
    for (let i = 0; i < 7; i++) w.setBlock(8, i, 8, BlockId.Antenna);
    expect(validateAntennaAt(w, 8, 8)).toBe(false);
  });

  it('mast shorter than 4 because it runs off the bottom of the world → false', () => {
    const w = new VoxelWorld(SMALL);
    // antenna at y=2,3,4; only 2 mast blocks (y=0,1) below before world floor
    for (let y = 0; y < 2; y++) w.setBlock(8, y, 8, BlockId.Rock);
    for (let i = 0; i < 3; i++) w.setBlock(8, 2 + i, 8, BlockId.Antenna);
    expect(validateAntennaAt(w, 8, 8)).toBe(false);
  });

  it('mast of mixed solid types (≥4 contiguous, non-antenna) → true', () => {
    const w = new VoxelWorld(SMALL);
    w.setBlock(8, 0, 8, BlockId.Basalt);
    w.setBlock(8, 1, 8, BlockId.Rock);
    w.setBlock(8, 2, 8, BlockId.Hull);
    w.setBlock(8, 3, 8, BlockId.Rock);
    for (let i = 0; i < 3; i++) w.setBlock(8, 4 + i, 8, BlockId.Antenna);
    expect(validateAntennaAt(w, 8, 8)).toBe(true);
  });

  it('an empty column → false', () => {
    const w = new VoxelWorld(SMALL);
    expect(validateAntennaAt(w, 8, 8)).toBe(false);
  });
});

describe('validateAntenna (world scan — GAME_DESIGN §3c step 1)', () => {
  it('empty world → false', () => {
    const w = new VoxelWorld(SMALL);
    expect(validateAntenna(w)).toBe(false);
  });

  it('finds a valid antenna built at an arbitrary offset in the world', () => {
    const w = new VoxelWorld(SMALL);
    buildAntenna(w, 3, 12, 5, 4, 3);
    expect(validateAntenna(w)).toBe(true);
  });

  it('finds a valid antenna at the world origin column', () => {
    const w = new VoxelWorld(SMALL);
    buildAntenna(w, 0, 0, 0, 4, 3);
    expect(validateAntenna(w)).toBe(true);
  });

  it('a world full of only-invalid structures → false', () => {
    const w = new VoxelWorld(SMALL);
    buildAntenna(w, 2, 2, 0, 3, 3); // mast too short
    buildAntenna(w, 5, 5, 0, 6, 2); // only 2 antenna
    expect(validateAntenna(w)).toBe(false);
  });
});
