// Spec: TECH_SPEC §6 — `generateWorld(seed)` is pure and snapshot-tested (hash of
// voxel data). M0 parity: terrain logic ported from prototype/index.html (fbm
// heightmap + two craters, ice when h<=15, crystal ore in the rock stratum,
// surface crystal clusters) with ALL randomness via mulberry32.
import { describe, expect, it } from 'vitest';
import { BlockId } from '../../../src/core/world/blocks';
import { VoxelWorld } from '../../../src/core/world/voxelWorld';
import { generateWorld } from '../../../src/core/world/worldgen';

/** FNV-1a (32-bit) over every chunk's voxel bytes, in chunk-index order. */
function worldHash(w: VoxelWorld): string {
  let h = 0x811c9dc5;
  for (let cy = 0; cy < w.chunksY; cy++) {
    for (let cz = 0; cz < w.chunksZ; cz++) {
      for (let cx = 0; cx < w.chunksX; cx++) {
        const data = w.getChunkData(cx, cy, cz)!;
        for (let i = 0; i < data.length; i++) {
          h ^= data[i]!;
          h = Math.imul(h, 0x01000193);
        }
      }
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Topmost non-air y of a column, or -1 if the column is empty. */
function topSolid(w: VoxelWorld, x: number, z: number): number {
  for (let y = w.sizeY - 1; y >= 0; y--) if (w.getBlock(x, y, z) !== BlockId.Air) return y;
  return -1;
}

const SEED = 0x7e; // canonical test seed (TEST_STRATEGY §4)

describe('generateWorld', () => {
  const world = generateWorld(SEED);

  it('is deterministic: same seed ⇒ byte-identical voxel data (frozen snapshot)', () => {
    const again = generateWorld(SEED);
    const h1 = worldHash(world);
    const h2 = worldHash(again);
    expect(h1).toBe(h2);
    // Frozen: if this snapshot changes, every existing save's terrain changes.
    expect(h1).toMatchSnapshot();
  });

  it('different seeds ⇒ different worlds', () => {
    expect(worldHash(generateWorld(1))).not.toBe(worldHash(world));
  });

  it('uses the prototype world dimensions', () => {
    expect(world.sizeX).toBe(96);
    expect(world.sizeY).toBe(81);
    expect(world.sizeZ).toBe(96);
  });

  it('every column is solid up to its surface and air above (no floating gaps)', () => {
    let violations = 0;
    for (let x = 0; x < world.sizeX; x++) {
      for (let z = 0; z < world.sizeZ; z++) {
        const top = topSolid(world, x, z);
        if (top < 4) violations++; // prototype: h = max(4, ...)
        for (let y = 0; y <= top; y++) if (world.getBlock(x, y, z) === BlockId.Air) violations++;
        for (let y = top + 1; y < world.sizeY; y++)
          if (world.getBlock(x, y, z) !== BlockId.Air) violations++;
      }
    }
    expect(violations).toBe(0);
  });

  it('follows the prototype strata: surface regolith/ice, 3 rock layers (ore-bearing), basalt below', () => {
    let crystals = 0;
    let violations = 0;
    for (let x = 0; x < world.sizeX; x++) {
      for (let z = 0; z < world.sizeZ; z++) {
        let top = topSolid(world, x, z);
        // surface crystal clusters sit one block above the heightmap surface
        if (world.getBlock(x, top, z) === BlockId.Crystal) top -= 1;
        const surf = world.getBlock(x, top, z);
        // ice exactly when the surface is low (prototype rule: h <= 15). NOTE the
        // prototype formula (base 18 + non-negative fbm, craters −6 max) makes
        // h <= 15 effectively unreachable, so ice EXISTENCE is not asserted —
        // only the rule. Quirk preserved verbatim.
        const expected = top <= 15 ? BlockId.Ice : BlockId.Regolith;
        if (surf !== expected) violations++;
        for (let y = Math.max(0, top - 3); y < top; y++) {
          const id = world.getBlock(x, y, z);
          // rock stratum, with crystal ore where the roll exceeded the threshold
          if (id !== BlockId.Rock && id !== BlockId.Crystal) violations++;
          if (id === BlockId.Crystal) crystals++;
        }
        for (let y = 0; y < top - 3; y++)
          if (world.getBlock(x, y, z) !== BlockId.Basalt) violations++;
      }
    }
    expect(violations).toBe(0);
    expect(crystals).toBeGreaterThan(0); // ore exists (~3.5% of the rock stratum)
  });

  it('keeps the spawn-area assumptions the prototype makes', () => {
    // prototype spawns the player at (SIZE/2 + .5, heightAt[48][48] + 2, SIZE/2 + .5)
    const top = topSolid(world, 48, 48);
    expect(top).toBeGreaterThanOrEqual(4);
    expect(top + 3).toBeLessThan(world.sizeY); // headroom for player (h+2) inside bounds
    // standing space above the spawn surface
    expect(world.getBlock(48, top + 2, 48)).toBe(BlockId.Air);
    expect(world.getBlock(48, top + 3, 48)).toBe(BlockId.Air);
  });

  it('never generates ids outside the prototype palette', () => {
    for (let cy = 0; cy < world.chunksY; cy++)
      for (let cz = 0; cz < world.chunksZ; cz++)
        for (let cx = 0; cx < world.chunksX; cx++) {
          const data = world.getChunkData(cx, cy, cz)!;
          for (let i = 0; i < data.length; i++) {
            if (data[i]! > 6) throw new Error(`invalid block id ${data[i]}`);
          }
        }
  });
});
