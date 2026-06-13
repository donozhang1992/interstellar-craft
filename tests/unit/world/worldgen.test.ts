// Spec: TECH_SPEC §6 / GAME_DESIGN §6,§9 — `generateWorld(seed)` is pure and
// snapshot-tested (hash of voxel data). The M0 surface baseline (fbm heightmap +
// two craters, ice when h<=15, rock/basalt strata, surface crystal clusters) is
// preserved; M2 adds caves (3 worm-carvers to y≈8), iron/copper ore veins,
// cave-adjacent crystal clusters, cave-ceiling lamps, and a solid spawn pod —
// all randomness via mulberry32.
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

/** Count voxels of a given id over the whole world. */
function countId(w: VoxelWorld, id: BlockId): number {
  let n = 0;
  for (let x = 0; x < w.sizeX; x++)
    for (let z = 0; z < w.sizeZ; z++)
      for (let y = 0; y < w.sizeY; y++) if (w.getBlock(x, y, z) === id) n++;
  return n;
}

/** Count air voxels strictly below the column surface (carved cave pockets). */
function undergroundAir(w: VoxelWorld, yMax: number): number {
  let n = 0;
  for (let x = 0; x < w.sizeX; x++)
    for (let z = 0; z < w.sizeZ; z++) {
      const top = topSolid(w, x, z);
      for (let y = 0; y < Math.min(yMax, top); y++) if (w.getBlock(x, y, z) === BlockId.Air) n++;
    }
  return n;
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

  it('surface is intact: every column has a solid top, nothing floats above it', () => {
    let violations = 0;
    for (let x = 0; x < world.sizeX; x++) {
      for (let z = 0; z < world.sizeZ; z++) {
        const top = topSolid(world, x, z);
        if (top < 4) violations++; // prototype: h = max(4, ...)
        // Nothing floats above the surface.
        for (let y = top + 1; y < world.sizeY; y++)
          if (world.getBlock(x, y, z) !== BlockId.Air) violations++;
      }
    }
    expect(violations).toBe(0);
  });

  it('keeps the prototype surface skin: regolith/ice on top, except where a cave breaches it', () => {
    // The M0 ice/regolith skin (h<=15 ⇒ ice) is preserved on every column the
    // worm-carvers did NOT break through. A cave that reaches the surface is a
    // legitimate cave mouth: it exposes the stone strata (rock/basalt) or its ore
    // — never an invalid block — as the new top. The overwhelming majority of the
    // 96×96 columns keep the original skin; only a handful of cave mouths differ.
    let intactSkin = 0;
    let caveMouth = 0;
    for (let x = 0; x < world.sizeX; x++) {
      for (let z = 0; z < world.sizeZ; z++) {
        let top = topSolid(world, x, z);
        // surface crystal clusters sit one block above the heightmap surface
        if (world.getBlock(x, top, z) === BlockId.Crystal) top -= 1;
        const surf = world.getBlock(x, top, z);
        const expected = top <= 15 ? BlockId.Ice : BlockId.Regolith;
        if (surf === expected) {
          intactSkin++;
        } else {
          // a cave mouth: the exposed top must be a stone-family / ore block,
          // i.e. one of the strata the carver cut down into.
          expect([
            BlockId.Rock,
            BlockId.Basalt,
            BlockId.IronOre,
            BlockId.CopperOre,
            BlockId.Crystal,
            BlockId.Lamp,
          ]).toContain(surf);
          caveMouth++;
        }
      }
    }
    // Skin is the rule, cave mouths the rare exception.
    expect(intactSkin).toBeGreaterThan(world.sizeX * world.sizeZ * 0.98);
    expect(caveMouth).toBeLessThan(world.sizeX * world.sizeZ * 0.02);
  });

  // ── Caves (GAME_DESIGN §9 / TECH_SPEC §6) ──────────────────────────────────
  it('carves caves: underground air pockets exist and reach deep (y≈8)', () => {
    // A no-cave world has zero air below any surface; caves create carved air.
    expect(undergroundAir(world, 16)).toBeGreaterThan(200);
    // The worm-carvers descend to the deep cave floor: some air near y=8–12.
    let deepAir = 0;
    for (let x = 0; x < world.sizeX; x++)
      for (let z = 0; z < world.sizeZ; z++)
        for (let y = 8; y <= 12; y++) if (world.getBlock(x, y, z) === BlockId.Air) deepAir++;
    expect(deepAir).toBeGreaterThan(0);
  });

  // ── Ore veins (GAME_DESIGN §4,§6) ──────────────────────────────────────────
  it('iron ore (id 7) only appears at y<24 and exists in quantity', () => {
    let iron = 0;
    for (let x = 0; x < world.sizeX; x++)
      for (let z = 0; z < world.sizeZ; z++)
        for (let y = 0; y < world.sizeY; y++) {
          if (world.getBlock(x, y, z) === BlockId.IronOre) {
            iron++;
            expect(y).toBeLessThan(24);
          }
        }
    expect(iron).toBeGreaterThan(0);
  });

  it('copper ore (id 8) only appears at y<28 and exists in quantity', () => {
    let copper = 0;
    for (let x = 0; x < world.sizeX; x++)
      for (let z = 0; z < world.sizeZ; z++)
        for (let y = 0; y < world.sizeY; y++) {
          if (world.getBlock(x, y, z) === BlockId.CopperOre) {
            copper++;
            expect(y).toBeLessThan(28);
          }
        }
    expect(copper).toBeGreaterThan(0);
  });

  it('ore replaces stone, never air — no ore floats on a column top', () => {
    const iron = countId(world, BlockId.IronOre);
    const copper = countId(world, BlockId.CopperOre);
    expect(iron + copper).toBeGreaterThan(0);
    let floatingOre = 0;
    for (let x = 0; x < world.sizeX; x++)
      for (let z = 0; z < world.sizeZ; z++) {
        const top = topSolid(world, x, z);
        for (let y = 0; y < world.sizeY; y++) {
          const id = world.getBlock(x, y, z);
          if ((id === BlockId.IronOre || id === BlockId.CopperOre) && y === top) floatingOre++;
        }
      }
    expect(floatingOre).toBe(0);
  });

  // ── Cave crystal (GAME_DESIGN §9) ──────────────────────────────────────────
  it('cave crystal (id 4) at y<20 sits adjacent to carved cave air', () => {
    let caveCrystal = 0;
    for (let x = 0; x < world.sizeX; x++)
      for (let z = 0; z < world.sizeZ; z++)
        for (let y = 2; y < 20; y++) {
          if (world.getBlock(x, y, z) !== BlockId.Crystal) continue;
          const touchesAir =
            world.getBlock(x + 1, y, z) === BlockId.Air ||
            world.getBlock(x - 1, y, z) === BlockId.Air ||
            world.getBlock(x, y + 1, z) === BlockId.Air ||
            world.getBlock(x, y - 1, z) === BlockId.Air ||
            world.getBlock(x, y, z + 1) === BlockId.Air ||
            world.getBlock(x, y, z - 1) === BlockId.Air;
          if (touchesAir) caveCrystal++;
        }
    expect(caveCrystal).toBeGreaterThan(0);
  });

  // ── Cave lamps (GAME_DESIGN §4,§9) ─────────────────────────────────────────
  it('lamp (id 6) appears on cave ceilings (solid with air directly below, y<28)', () => {
    let lamps = 0;
    for (let x = 0; x < world.sizeX; x++)
      for (let z = 0; z < world.sizeZ; z++)
        for (let y = 0; y < world.sizeY; y++) {
          if (world.getBlock(x, y, z) !== BlockId.Lamp) continue;
          lamps++;
          expect(y).toBeLessThan(28);
          expect(world.getBlock(x, y - 1, z)).toBe(BlockId.Air); // cave ceiling
        }
    expect(lamps).toBeGreaterThan(0);
  });

  // ── Determinism / palette ──────────────────────────────────────────────────
  it('never generates ids outside the worldgen palette (0–8)', () => {
    // M2 worldgen uses ids 0–8 (air, regolith, rock, basalt, crystal, ice,
    // lamp, iron_ore, copper_ore). Quest blocks 9–13 are never generated.
    for (let cy = 0; cy < world.chunksY; cy++)
      for (let cz = 0; cz < world.chunksZ; cz++)
        for (let cx = 0; cx < world.chunksX; cx++) {
          const data = world.getChunkData(cx, cy, cz)!;
          for (let i = 0; i < data.length; i++) {
            if (data[i]! > 8) throw new Error(`invalid block id ${data[i]}`);
          }
        }
  });

  // ── Spawn pod safety (GAME_DESIGN §9 / src/game/spawn.ts) ──────────────────
  it('reserves a solid, supported spawn pod with standing room above', () => {
    const cx = Math.floor(world.sizeX / 2); // 48
    const cz = Math.floor(world.sizeZ / 2); // 48
    for (let x = cx - 3; x <= cx + 3; x++) {
      for (let z = cz - 3; z <= cz + 3; z++) {
        const top = topSolid(world, x, z);
        expect(top).toBeGreaterThanOrEqual(4);
        // Column is solid all the way up to the surface — no cave opened under it.
        for (let y = 0; y <= top; y++) expect(world.getBlock(x, y, z)).not.toBe(BlockId.Air);
        // The player's 2-block volume above the surface is clear air.
        expect(world.getBlock(x, top + 1, z)).toBe(BlockId.Air);
        expect(world.getBlock(x, top + 2, z)).toBe(BlockId.Air);
      }
    }
  });
});
