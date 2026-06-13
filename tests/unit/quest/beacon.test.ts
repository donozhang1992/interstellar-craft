// Spec: GAME_DESIGN §3d Ch4 step 1 — "Build the beacon (launchpad → 6 beacon-core
// mast → antenna cap)". Blueprint: a launchpad(13) on solid ground, EXACTLY 6
// contiguous beacon_core(12) directly above it, topped by 1 antenna(11).
// validateBeacon(world) scans the world for any such assembly;
// validateBeaconAt(world, x, z) checks a single column.
import { describe, expect, it } from 'vitest';
import { VoxelWorld } from '../../../src/core/world/voxelWorld';
import type { WorldDims } from '../../../src/core/world/voxelWorld';
import { BlockId } from '../../../src/core/world/blocks';
import { validateBeacon, validateBeaconAt, BEACON_CORE_COUNT } from '../../../src/core/quest/beacon';

// Small hand-crafted world so scans are cheap.
const SMALL: WorldDims = { sizeX: 16, sizeY: 32, sizeZ: 16 };

/**
 * Build a beacon at column (x, z): a solid ground block at `groundY`, a
 * launchpad directly above it, then `cores` beacon_core blocks, then `cap`
 * antenna blocks. Returns the launchpad y.
 */
function buildBeacon(
  world: VoxelWorld,
  x: number,
  z: number,
  groundY: number,
  cores: number = BEACON_CORE_COUNT,
  cap: number = 1,
  groundId: number = BlockId.Rock,
): number {
  world.setBlock(x, groundY, z, groundId);
  const padY = groundY + 1;
  world.setBlock(x, padY, z, BlockId.Launchpad);
  for (let i = 0; i < cores; i++) world.setBlock(x, padY + 1 + i, z, BlockId.BeaconCore);
  for (let i = 0; i < cap; i++) world.setBlock(x, padY + 1 + cores + i, z, BlockId.Antenna);
  return padY;
}

describe('validateBeaconAt (GAME_DESIGN §3d Ch4 step 1)', () => {
  it('valid blueprint: ground + launchpad + 6 beacon_core + antenna → true', () => {
    const w = new VoxelWorld(SMALL);
    buildBeacon(w, 8, 8, 2);
    expect(validateBeaconAt(w, 8, 8)).toBe(true);
  });

  it('only 5 beacon_core → false', () => {
    const w = new VoxelWorld(SMALL);
    buildBeacon(w, 8, 8, 2, 5);
    expect(validateBeaconAt(w, 8, 8)).toBe(false);
  });

  it('7 beacon_core (one too many) → false (must be EXACTLY 6, cap must be antenna)', () => {
    const w = new VoxelWorld(SMALL);
    buildBeacon(w, 8, 8, 2, 7);
    expect(validateBeaconAt(w, 8, 8)).toBe(false);
  });

  it('missing antenna cap (air above the 6th core) → false', () => {
    const w = new VoxelWorld(SMALL);
    buildBeacon(w, 8, 8, 2, BEACON_CORE_COUNT, 0);
    expect(validateBeaconAt(w, 8, 8)).toBe(false);
  });

  it('launchpad resting on air (no solid below) → false', () => {
    const w = new VoxelWorld(SMALL);
    // Build the assembly but leave the ground cell air.
    const padY = 3;
    w.setBlock(8, padY, 8, BlockId.Launchpad);
    for (let i = 0; i < BEACON_CORE_COUNT; i++) w.setBlock(8, padY + 1 + i, 8, BlockId.BeaconCore);
    w.setBlock(8, padY + 1 + BEACON_CORE_COUNT, 8, BlockId.Antenna);
    expect(validateBeaconAt(w, 8, 8)).toBe(false);
  });

  it('gap in the core stack (air at the 4th core) → false', () => {
    const w = new VoxelWorld(SMALL);
    buildBeacon(w, 8, 8, 2);
    // Carve a hole in the middle of the 6-core mast.
    const padY = 3;
    w.setBlock(8, padY + 3, 8, BlockId.Air);
    expect(validateBeaconAt(w, 8, 8)).toBe(false);
  });

  it('launchpad with a non-beacon block in the mast → false', () => {
    const w = new VoxelWorld(SMALL);
    buildBeacon(w, 8, 8, 2);
    const padY = 3;
    w.setBlock(8, padY + 2, 8, BlockId.Rock); // a core slot is plain rock
    expect(validateBeaconAt(w, 8, 8)).toBe(false);
  });

  it('launchpad on air column (empty column) → false', () => {
    const w = new VoxelWorld(SMALL);
    expect(validateBeaconAt(w, 8, 8)).toBe(false);
  });

  it('launchpad on the world floor (no cell below) → false', () => {
    const w = new VoxelWorld(SMALL);
    // launchpad at y=0: there is no y=-1 ground, reads as air → fail.
    const padY = 0;
    w.setBlock(8, padY, 8, BlockId.Launchpad);
    for (let i = 0; i < BEACON_CORE_COUNT; i++) w.setBlock(8, padY + 1 + i, 8, BlockId.BeaconCore);
    w.setBlock(8, padY + 1 + BEACON_CORE_COUNT, 8, BlockId.Antenna);
    expect(validateBeaconAt(w, 8, 8)).toBe(false);
  });
});

describe('validateBeacon (world scan — GAME_DESIGN §3d Ch4 step 1)', () => {
  it('empty world → false', () => {
    const w = new VoxelWorld(SMALL);
    expect(validateBeacon(w)).toBe(false);
  });

  it('finds a valid beacon built at an arbitrary offset in the world', () => {
    const w = new VoxelWorld(SMALL);
    buildBeacon(w, 3, 12, 5);
    expect(validateBeacon(w)).toBe(true);
  });

  it('finds a valid beacon at the world origin column', () => {
    const w = new VoxelWorld(SMALL);
    buildBeacon(w, 0, 0, 0);
    expect(validateBeacon(w)).toBe(true);
  });

  it('a world of only-invalid structures → false', () => {
    const w = new VoxelWorld(SMALL);
    buildBeacon(w, 2, 2, 0, 5); // too few cores
    buildBeacon(w, 6, 6, 0, BEACON_CORE_COUNT, 0); // no antenna cap
    expect(validateBeacon(w)).toBe(false);
  });

  it('validateBeaconAt isolates a single column — neighbour does not leak', () => {
    const w = new VoxelWorld(SMALL);
    buildBeacon(w, 8, 8, 2);
    expect(validateBeaconAt(w, 8, 8)).toBe(true);
    expect(validateBeaconAt(w, 9, 8)).toBe(false);
    expect(validateBeaconAt(w, 8, 9)).toBe(false);
  });
});
