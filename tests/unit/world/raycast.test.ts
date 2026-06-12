// Spec: TECH_SPEC §2 (src/core/world: raycast) — voxel DDA ported from the
// prototype's raycastBlock(). TEST_STRATEGY §2 must-have: face selection edge cases.
//
// Documented port semantics (prototype parity):
//  - the STARTING voxel is never tested: the DDA steps into the next voxel before
//    its first solidity check, so a ray that starts inside a solid block passes out
//    of it and hits the next solid voxel along the path (or nothing);
//  - `dir` is expected to be normalized so `maxDist` is in world units;
//  - the face normal points back along the axis the ray entered through.
import { describe, expect, it } from 'vitest';
import { BlockId } from '../../../src/core/world/blocks';
import { raycast } from '../../../src/core/world/raycast';
import { VoxelWorld } from '../../../src/core/world/voxelWorld';

const DIMS = { sizeX: 32, sizeY: 32, sizeZ: 32 };

function worldWith(...blocks: [number, number, number][]): VoxelWorld {
  const w = new VoxelWorld(DIMS);
  for (const [x, y, z] of blocks) w.setBlock(x, y, z, BlockId.Rock);
  return w;
}

describe('raycast (voxel DDA)', () => {
  it('hits the obvious block straight down', () => {
    const w = worldWith([5, 3, 5]);
    const r = raycast(w, { x: 5.5, y: 6.5, z: 5.5 }, { x: 0, y: -1, z: 0 }, 10);
    expect(r).toEqual({ hit: { x: 5, y: 3, z: 5 }, face: { nx: 0, ny: 1, nz: 0 } });
  });

  it('reports the correct face normal for each axis approach', () => {
    const w = worldWith([5, 3, 5]);
    const cases: [origin: [number, number, number], dir: [number, number, number], face: object][] =
      [
        [[2.5, 3.5, 5.5], [1, 0, 0], { nx: -1, ny: 0, nz: 0 }], // approaching along +x
        [[8.5, 3.5, 5.5], [-1, 0, 0], { nx: 1, ny: 0, nz: 0 }], // approaching along -x
        [[5.5, 0.5, 5.5], [0, 1, 0], { nx: 0, ny: -1, nz: 0 }], // from below (+y)
        [[5.5, 6.5, 5.5], [0, -1, 0], { nx: 0, ny: 1, nz: 0 }], // from above (-y)
        [[5.5, 3.5, 2.5], [0, 0, 1], { nx: 0, ny: 0, nz: -1 }], // approaching along +z
        [[5.5, 3.5, 8.5], [0, 0, -1], { nx: 0, ny: 0, nz: 1 }], // approaching along -z
      ];
    for (const [o, d, face] of cases) {
      const r = raycast(w, { x: o[0], y: o[1], z: o[2] }, { x: d[0], y: d[1], z: d[2] }, 10);
      expect(r).not.toBeNull();
      expect(r!.hit).toEqual({ x: 5, y: 3, z: 5 });
      expect(r!.face).toEqual(face);
    }
  });

  it('respects maxDist (returns null when the block is out of reach)', () => {
    const w = worldWith([5, 3, 5]);
    // block surface is 3 units below the origin's voxel boundary path; 2 is too short
    expect(raycast(w, { x: 5.5, y: 6.5, z: 5.5 }, { x: 0, y: -1, z: 0 }, 2)).toBeNull();
    // and an empty world never hits anything
    expect(
      raycast(new VoxelWorld(DIMS), { x: 5.5, y: 6.5, z: 5.5 }, { x: 0, y: -1, z: 0 }, 100),
    ).toBeNull();
  });

  it('never returns the starting voxel: a ray starting inside a solid block exits it', () => {
    const w = worldWith([5, 3, 5]);
    // origin inside the only solid block, pointing down: passes out, hits nothing
    expect(raycast(w, { x: 5.5, y: 3.5, z: 5.5 }, { x: 0, y: -1, z: 0 }, 10)).toBeNull();
    // with a second block below, that one is hit instead of the starting voxel
    w.setBlock(5, 1, 5, BlockId.Basalt);
    const r = raycast(w, { x: 5.5, y: 3.5, z: 5.5 }, { x: 0, y: -1, z: 0 }, 10);
    expect(r).toEqual({ hit: { x: 5, y: 1, z: 5 }, face: { nx: 0, ny: 1, nz: 0 } });
  });

  it('follows a diagonal ray across a chunk border', () => {
    const w = worldWith([17, 3, 17]); // chunk (1,0,1); border at x=z=16
    const s = Math.SQRT1_2; // normalized (1,0,1)
    const r = raycast(w, { x: 14.5, y: 3.5, z: 14.5 }, { x: s, y: 0, z: s }, 10);
    expect(r).not.toBeNull();
    expect(r!.hit).toEqual({ x: 17, y: 3, z: 17 });
    // entered through a lateral face, never through ±y
    expect(r!.face.ny).toBe(0);
    expect(Math.abs(r!.face.nx) + Math.abs(r!.face.nz)).toBe(1);
  });

  it('passes through out-of-bounds space (reads as air) and returns null', () => {
    const w = worldWith([5, 3, 5]);
    // shooting out of the world from near its edge
    expect(raycast(w, { x: 0.5, y: 3.5, z: 0.5 }, { x: -1, y: 0, z: 0 }, 50)).toBeNull();
  });
});
