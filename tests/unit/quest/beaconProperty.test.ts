// Property-style coverage of the beacon structural validator (GAME_DESIGN §3d
// Ch4 step 1). beacon.test.ts pins hand-crafted cases; this file asserts the
// INVARIANTS over many seeded-random worlds: a programmatically-built VALID
// assembly (launchpad on solid ground → exactly 6 contiguous beacon_core →
// 1 antenna cap) ALWAYS validates wherever it lands, and every structural
// perturbation (wrong core count, missing/wrong cap, pad on air, gap in the
// mast) validates IFF it is exactly the blueprint.
//
// Determinism: mulberry32 (the only core PRNG, TECH_SPEC §2) seeded per case, so
// a failure is reproducible from its seed. No three.js / DOM — pure core import.
import { describe, expect, it } from 'vitest';
import { VoxelWorld, type WorldDims } from '../../../src/core/world/voxelWorld';
import { BlockId, isSolid } from '../../../src/core/world/blocks';
import {
  validateBeacon,
  validateBeaconAt,
  BEACON_CORE_COUNT,
  BEACON_HEIGHT,
} from '../../../src/core/quest/beacon';
import { mulberry32 } from '../../../src/core/rng';

// A roomy-but-cheap world: big enough to drop the BEACON_HEIGHT (=8) assembly at
// many (x, z, y) offsets with margin above and below.
const DIMS: WorldDims = { sizeX: 16, sizeY: 32, sizeZ: 16 };

/** All solid (placeable) block ids — used as random ground / wrong-cap fillers. */
const SOLID_IDS: number[] = [];
for (let id = 1; id <= 13; id++) if (isSolid(id)) SOLID_IDS.push(id);

/** Pick an int in [lo, hi] (inclusive) from a mulberry32 stream. */
function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/**
 * Build a beacon at (x, z) with `padY` the launchpad level: a solid ground block
 * at padY-1, the pad, `cores` beacon_core above it, then `cap` antenna cells.
 * The canonical blueprint is cores = BEACON_CORE_COUNT (6), cap = 1.
 */
function buildBeacon(
  world: VoxelWorld,
  x: number,
  z: number,
  padY: number,
  cores: number,
  cap: number,
  groundId: number = BlockId.Rock,
): void {
  world.setBlock(x, padY - 1, z, groundId);
  world.setBlock(x, padY, z, BlockId.Launchpad);
  for (let i = 0; i < cores; i++) world.setBlock(x, padY + 1 + i, z, BlockId.BeaconCore);
  for (let i = 0; i < cap; i++) world.setBlock(x, padY + 1 + cores + i, z, BlockId.Antenna);
}

/** A fresh world with a valid beacon at (x, z, padY) on a random solid ground. */
function worldWithValidBeacon(rng: () => number, x: number, z: number, padY: number): VoxelWorld {
  const w = new VoxelWorld(DIMS);
  buildBeacon(w, x, z, padY, BEACON_CORE_COUNT, 1, pick(rng, SOLID_IDS));
  return w;
}

const CASES = 200;

describe('beacon validator — property: a valid blueprint always validates', () => {
  it('a programmatically-built valid assembly validates at every legal (x, z, y) offset', () => {
    const rng = mulberry32(0xbeac0);
    for (let n = 0; n < CASES; n++) {
      const x = randInt(rng, 0, DIMS.sizeX - 1);
      const z = randInt(rng, 0, DIMS.sizeZ - 1);
      // padY in [1, sizeY - BEACON_HEIGHT]: ground cell exists below and the cap fits.
      const padY = randInt(rng, 1, DIMS.sizeY - BEACON_HEIGHT);
      const w = worldWithValidBeacon(rng, x, z, padY);
      expect(validateBeaconAt(w, x, z)).toBe(true);
      // And the full-world scan finds the one column too.
      expect(validateBeacon(w)).toBe(true);
      // Isolation: no neighbour column leaks the structure.
      const nx = (x + 1) % DIMS.sizeX;
      const nz = (z + 1) % DIMS.sizeZ;
      if (nx !== x) expect(validateBeaconAt(w, nx, z)).toBe(false);
      if (nz !== z) expect(validateBeaconAt(w, x, nz)).toBe(false);
    }
  });
});

describe('beacon validator — property: wrong core count validates iff exactly 6', () => {
  it('cores ∈ 0..10 (with a valid cap) validates iff cores === 6', () => {
    const rng = mulberry32(0xc04e5);
    for (let n = 0; n < CASES; n++) {
      const x = randInt(rng, 0, DIMS.sizeX - 1);
      const z = randInt(rng, 0, DIMS.sizeZ - 1);
      const cores = randInt(rng, 0, 10);
      // Reserve enough head-room for up to 10 cores + cap below the world top.
      const padY = randInt(rng, 1, DIMS.sizeY - (1 + 10 + 1) - 1);
      const w = new VoxelWorld(DIMS);
      buildBeacon(w, x, z, padY, cores, 1, pick(rng, SOLID_IDS));
      expect(validateBeaconAt(w, x, z)).toBe(cores === BEACON_CORE_COUNT);
    }
  });
});

describe('beacon validator — property: structural perturbations all fail', () => {
  it('missing cap (air above the 6th core) → false', () => {
    const rng = mulberry32(0x4ca00);
    for (let n = 0; n < CASES; n++) {
      const x = randInt(rng, 0, DIMS.sizeX - 1);
      const z = randInt(rng, 0, DIMS.sizeZ - 1);
      const padY = randInt(rng, 1, DIMS.sizeY - BEACON_HEIGHT);
      const w = new VoxelWorld(DIMS);
      buildBeacon(w, x, z, padY, BEACON_CORE_COUNT, 0, pick(rng, SOLID_IDS)); // no cap
      expect(validateBeaconAt(w, x, z)).toBe(false);
    }
  });

  it('cap is a wrong (non-antenna) solid block → false', () => {
    const rng = mulberry32(0x4ca11);
    const wrongCaps = SOLID_IDS.filter((id) => id !== BlockId.Antenna);
    for (let n = 0; n < CASES; n++) {
      const x = randInt(rng, 0, DIMS.sizeX - 1);
      const z = randInt(rng, 0, DIMS.sizeZ - 1);
      const padY = randInt(rng, 1, DIMS.sizeY - BEACON_HEIGHT);
      const w = new VoxelWorld(DIMS);
      buildBeacon(w, x, z, padY, BEACON_CORE_COUNT, 0, pick(rng, SOLID_IDS));
      // Place a non-antenna block in the cap slot.
      w.setBlock(x, padY + 1 + BEACON_CORE_COUNT, z, pick(rng, wrongCaps));
      expect(validateBeaconAt(w, x, z)).toBe(false);
    }
  });

  it('launchpad resting on air (no solid ground below) → false', () => {
    const rng = mulberry32(0x9a1d0);
    for (let n = 0; n < CASES; n++) {
      const x = randInt(rng, 0, DIMS.sizeX - 1);
      const z = randInt(rng, 0, DIMS.sizeZ - 1);
      const padY = randInt(rng, 1, DIMS.sizeY - BEACON_HEIGHT);
      const w = new VoxelWorld(DIMS);
      // Full valid assembly but leave the ground cell air.
      w.setBlock(x, padY, z, BlockId.Launchpad);
      for (let i = 0; i < BEACON_CORE_COUNT; i++)
        w.setBlock(x, padY + 1 + i, z, BlockId.BeaconCore);
      w.setBlock(x, padY + 1 + BEACON_CORE_COUNT, z, BlockId.Antenna);
      // (padY-1 is air by default.)
      expect(validateBeaconAt(w, x, z)).toBe(false);
    }
  });

  it('a single gap in the core stack → false', () => {
    const rng = mulberry32(0x6a90);
    for (let n = 0; n < CASES; n++) {
      const x = randInt(rng, 0, DIMS.sizeX - 1);
      const z = randInt(rng, 0, DIMS.sizeZ - 1);
      const padY = randInt(rng, 1, DIMS.sizeY - BEACON_HEIGHT);
      const w = worldWithValidBeacon(rng, x, z, padY);
      // Punch a hole at a random core position (0..5 above the pad).
      const gap = randInt(rng, 0, BEACON_CORE_COUNT - 1);
      w.setBlock(x, padY + 1 + gap, z, BlockId.Air);
      expect(validateBeaconAt(w, x, z)).toBe(false);
    }
  });

  it('a non-beacon solid in a random core slot → false', () => {
    const rng = mulberry32(0x6b10);
    const nonCore = SOLID_IDS.filter((id) => id !== BlockId.BeaconCore);
    for (let n = 0; n < CASES; n++) {
      const x = randInt(rng, 0, DIMS.sizeX - 1);
      const z = randInt(rng, 0, DIMS.sizeZ - 1);
      const padY = randInt(rng, 1, DIMS.sizeY - BEACON_HEIGHT);
      const w = worldWithValidBeacon(rng, x, z, padY);
      const slot = randInt(rng, 0, BEACON_CORE_COUNT - 1);
      w.setBlock(x, padY + 1 + slot, z, pick(rng, nonCore));
      expect(validateBeaconAt(w, x, z)).toBe(false);
    }
  });
});

describe('beacon validator — property: exactly-one-valid placement in a random world', () => {
  it('a valid beacon at a random offset is the ONLY validating column', () => {
    const rng = mulberry32(0x0ff5e7);
    for (let n = 0; n < CASES; n++) {
      const x = randInt(rng, 0, DIMS.sizeX - 1);
      const z = randInt(rng, 0, DIMS.sizeZ - 1);
      const padY = randInt(rng, 1, DIMS.sizeY - BEACON_HEIGHT);
      const w = worldWithValidBeacon(rng, x, z, padY);
      // Scatter some random solid noise that must never form a valid beacon.
      for (let k = 0; k < 6; k++) {
        const rx = randInt(rng, 0, DIMS.sizeX - 1);
        const ry = randInt(rng, 0, DIMS.sizeY - 1);
        const rz = randInt(rng, 0, DIMS.sizeZ - 1);
        if (rx === x && rz === z) continue; // never touch the real column
        w.setBlock(rx, ry, rz, pick(rng, SOLID_IDS));
      }
      // Count validating columns across the whole footprint — must be exactly 1.
      let validCols = 0;
      for (let cx = 0; cx < DIMS.sizeX; cx++)
        for (let cz = 0; cz < DIMS.sizeZ; cz++) if (validateBeaconAt(w, cx, cz)) validCols++;
      expect(validCols).toBe(1);
      expect(validateBeacon(w)).toBe(true);
    }
  });
});
