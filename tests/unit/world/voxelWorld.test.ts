// Spec: TECH_SPEC §2 (src/core/world: voxel storage in Uint8Array chunks) and §6
// (chunks 16×16×16). M0 parity: world dimensions default to the legacy prototype's
// bounds — x,z ∈ [0,96), y ∈ [0,80] (prototype setBlock rejects y>80, so 81 levels).
import { describe, expect, it } from 'vitest';
import { BlockId, isSolid as isSolidId } from '../../../src/core/world/blocks';
import {
  CHUNK_SIZE,
  PROTOTYPE_DIMS,
  toChunk,
  toLocal,
  VoxelWorld,
} from '../../../src/core/world/voxelWorld';

describe('blocks', () => {
  it('matches the prototype block ids exactly (air=0 + 6 solids in prototype order)', () => {
    expect(BlockId.Air).toBe(0);
    expect(BlockId.Regolith).toBe(1); // 月壤
    expect(BlockId.Rock).toBe(2); // 星岩
    expect(BlockId.Basalt).toBe(3); // 玄武岩
    expect(BlockId.Crystal).toBe(4); // 能量晶簇
    expect(BlockId.Ice).toBe(5); // 寒冰
    expect(BlockId.Lamp).toBe(6); // 聚变灯
  });

  it('isSolid: air is not solid, all six prototype blocks are', () => {
    expect(isSolidId(BlockId.Air)).toBe(false);
    for (const id of [
      BlockId.Regolith,
      BlockId.Rock,
      BlockId.Basalt,
      BlockId.Crystal,
      BlockId.Ice,
      BlockId.Lamp,
    ]) {
      expect(isSolidId(id)).toBe(true);
    }
  });
});

describe('VoxelWorld', () => {
  it('defaults to the prototype world dimensions (96 × 81 × 96)', () => {
    const w = new VoxelWorld();
    expect(w.sizeX).toBe(PROTOTYPE_DIMS.sizeX);
    expect(w.sizeY).toBe(PROTOTYPE_DIMS.sizeY);
    expect(w.sizeZ).toBe(PROTOTYPE_DIMS.sizeZ);
    expect(PROTOTYPE_DIMS).toEqual({ sizeX: 96, sizeY: 81, sizeZ: 96 });
    expect(CHUNK_SIZE).toBe(16);
    expect(w.chunksX).toBe(6);
    expect(w.chunksY).toBe(6); // ceil(81 / 16)
    expect(w.chunksZ).toBe(6);
  });

  it('set/get roundtrips a block', () => {
    const w = new VoxelWorld();
    expect(w.getBlock(10, 20, 30)).toBe(BlockId.Air);
    w.setBlock(10, 20, 30, BlockId.Basalt);
    expect(w.getBlock(10, 20, 30)).toBe(BlockId.Basalt);
    w.setBlock(10, 20, 30, BlockId.Air);
    expect(w.getBlock(10, 20, 30)).toBe(BlockId.Air);
  });

  it('handles chunk-border coordinates without bleeding into neighbour chunks', () => {
    const w = new VoxelWorld();
    const borders = [
      [15, 15, 15],
      [16, 16, 16],
      [15, 16, 17],
      [0, 0, 0],
      [95, 80, 95], // far corner of the valid range
      [31, 47, 63],
    ] as const;
    for (const [x, y, z] of borders) w.setBlock(x, y, z, BlockId.Rock);
    for (const [x, y, z] of borders) expect(w.getBlock(x, y, z)).toBe(BlockId.Rock);
    // direct neighbours across the chunk seam stay empty
    expect(w.getBlock(16, 15, 15)).toBe(BlockId.Air);
    expect(w.getBlock(15, 16, 16)).toBe(BlockId.Air);
    expect(w.getBlock(14, 15, 15)).toBe(BlockId.Air);
  });

  it('returns 0 for out-of-bounds reads', () => {
    const w = new VoxelWorld();
    w.setBlock(0, 80, 0, BlockId.Ice); // y=80 is the last valid level
    expect(w.getBlock(0, 80, 0)).toBe(BlockId.Ice);
    expect(w.getBlock(-1, 0, 0)).toBe(0);
    expect(w.getBlock(0, -1, 0)).toBe(0);
    expect(w.getBlock(0, 0, -1)).toBe(0);
    expect(w.getBlock(96, 0, 0)).toBe(0);
    expect(w.getBlock(0, 81, 0)).toBe(0); // prototype: y > 80 is outside
    expect(w.getBlock(0, 0, 96)).toBe(0);
  });

  it('ignores out-of-range setBlock (no-op, no throw)', () => {
    const w = new VoxelWorld();
    expect(() => {
      w.setBlock(-1, 0, 0, BlockId.Rock);
      w.setBlock(0, -1, 0, BlockId.Rock);
      w.setBlock(0, 0, -1, BlockId.Rock);
      w.setBlock(96, 0, 0, BlockId.Rock);
      w.setBlock(0, 81, 0, BlockId.Rock);
      w.setBlock(0, 0, 96, BlockId.Rock);
    }).not.toThrow();
    // nothing leaked into the world
    let count = 0;
    for (let cy = 0; cy < w.chunksY; cy++)
      for (let cz = 0; cz < w.chunksZ; cz++)
        for (let cx = 0; cx < w.chunksX; cx++) w.forEachBlockInChunk(cx, cy, cz, () => count++);
    expect(count).toBe(0);
  });

  it('isSolid distinguishes air, solids and out-of-bounds', () => {
    const w = new VoxelWorld();
    w.setBlock(5, 5, 5, BlockId.Crystal);
    expect(w.isSolid(5, 5, 5)).toBe(true);
    expect(w.isSolid(5, 6, 5)).toBe(false);
    expect(w.isSolid(-1, 5, 5)).toBe(false); // outside reads as air
  });

  it('respects custom dimensions', () => {
    const w = new VoxelWorld({ sizeX: 32, sizeY: 16, sizeZ: 48 });
    expect(w.chunksX).toBe(2);
    expect(w.chunksY).toBe(1);
    expect(w.chunksZ).toBe(3);
    w.setBlock(31, 15, 47, BlockId.Lamp);
    expect(w.getBlock(31, 15, 47)).toBe(BlockId.Lamp);
    w.setBlock(32, 0, 0, BlockId.Lamp); // outside the smaller world → no-op
    expect(w.getBlock(32, 0, 0)).toBe(0);
  });

  it('exposes chunk indexing helpers (toChunk/toLocal/chunkIndex/getChunkData)', () => {
    expect(toChunk(0)).toBe(0);
    expect(toChunk(15)).toBe(0);
    expect(toChunk(16)).toBe(1);
    expect(toChunk(95)).toBe(5);
    expect(toLocal(0)).toBe(0);
    expect(toLocal(15)).toBe(15);
    expect(toLocal(16)).toBe(0);
    expect(toLocal(33)).toBe(1);

    const w = new VoxelWorld();
    expect(w.chunkIndex(0, 0, 0)).toBe(0);
    // all chunk indices are distinct and in range
    const seen = new Set<number>();
    for (let cy = 0; cy < w.chunksY; cy++)
      for (let cz = 0; cz < w.chunksZ; cz++)
        for (let cx = 0; cx < w.chunksX; cx++) seen.add(w.chunkIndex(cx, cy, cz));
    expect(seen.size).toBe(w.chunksX * w.chunksY * w.chunksZ);

    w.setBlock(17, 1, 2, BlockId.Rock);
    const data = w.getChunkData(1, 0, 0);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data!.length).toBe(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
    let sum = 0;
    for (const b of data!) sum += b;
    expect(sum).toBe(BlockId.Rock); // exactly one rock voxel in that chunk
    expect(w.getChunkData(99, 0, 0)).toBeNull();
  });

  it('forEachBlockInChunk visits exactly the non-air voxels with world coordinates', () => {
    const w = new VoxelWorld();
    w.setBlock(17, 1, 2, BlockId.Rock); // chunk (1,0,0)
    w.setBlock(31, 15, 15, BlockId.Ice); // same chunk, far corner
    w.setBlock(3, 3, 3, BlockId.Lamp); // different chunk — must NOT be visited
    const visited: number[][] = [];
    w.forEachBlockInChunk(1, 0, 0, (x, y, z, id) => visited.push([x, y, z, id]));
    visited.sort((a, b) => a[0]! - b[0]!);
    expect(visited).toEqual([
      [17, 1, 2, BlockId.Rock],
      [31, 15, 15, BlockId.Ice],
    ]);
  });
});
