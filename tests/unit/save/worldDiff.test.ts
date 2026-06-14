// Tests for worldDiff.ts — voxelLinearIndex / voxelFromLinearIndex roundtrip,
// diffToJSON sorted output, diffFromJSON reconstruction, and inBounds edge cases.
import { describe, expect, it } from 'vitest';
import {
  voxelLinearIndex,
  voxelFromLinearIndex,
  diffToJSON,
  diffFromJSON,
  inBounds,
  type WorldDiff,
} from '../../../src/core/save/worldDiff';
import type { WorldDims } from '../../../src/core/world/voxelWorld';

const DIMS: WorldDims = { sizeX: 96, sizeY: 81, sizeZ: 96 };

describe('voxelLinearIndex / voxelFromLinearIndex', () => {
  it('roundtrips (0,0,0)', () => {
    const idx = voxelLinearIndex(DIMS, 0, 0, 0);
    expect(idx).toBe(0);
    expect(voxelFromLinearIndex(DIMS, idx)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('roundtrips (1,0,0)', () => {
    const idx = voxelLinearIndex(DIMS, 1, 0, 0);
    expect(idx).toBe(1);
    expect(voxelFromLinearIndex(DIMS, idx)).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('roundtrips (0,0,1)', () => {
    const idx = voxelLinearIndex(DIMS, 0, 0, 1);
    expect(idx).toBe(96); // z * sizeX = 1 * 96
    expect(voxelFromLinearIndex(DIMS, idx)).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('roundtrips (0,1,0)', () => {
    const idx = voxelLinearIndex(DIMS, 0, 1, 0);
    expect(idx).toBe(96 * 96); // y * sizeZ * sizeX
    expect(voxelFromLinearIndex(DIMS, idx)).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('roundtrips arbitrary interior voxel (47, 30, 63)', () => {
    const x = 47,
      y = 30,
      z = 63;
    const idx = voxelLinearIndex(DIMS, x, y, z);
    expect(voxelFromLinearIndex(DIMS, idx)).toEqual({ x, y, z });
  });

  it('roundtrips max corner (95, 80, 95)', () => {
    const x = 95,
      y = 80,
      z = 95;
    const idx = voxelLinearIndex(DIMS, x, y, z);
    expect(voxelFromLinearIndex(DIMS, idx)).toEqual({ x, y, z });
  });

  it('roundtrips multiple voxels consistently', () => {
    const samples: [number, number, number][] = [
      [0, 0, 0],
      [95, 0, 0],
      [0, 80, 0],
      [0, 0, 95],
      [12, 5, 34],
      [48, 40, 48],
      [1, 1, 1],
    ];
    for (const [x, y, z] of samples) {
      const idx = voxelLinearIndex(DIMS, x, y, z);
      expect(voxelFromLinearIndex(DIMS, idx)).toEqual({ x, y, z });
    }
  });

  it('produces unique indices for different voxels', () => {
    const samples: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 1],
    ];
    const indices = samples.map(([x, y, z]) => voxelLinearIndex(DIMS, x, y, z));
    const unique = new Set(indices);
    expect(unique.size).toBe(samples.length);
  });
});

describe('inBounds', () => {
  it('returns true for origin', () => {
    expect(inBounds(DIMS, 0, 0, 0)).toBe(true);
  });

  it('returns true for max corner', () => {
    expect(inBounds(DIMS, 95, 80, 95)).toBe(true);
  });

  it('returns false for negative x', () => {
    expect(inBounds(DIMS, -1, 0, 0)).toBe(false);
  });

  it('returns false for negative y', () => {
    expect(inBounds(DIMS, 0, -1, 0)).toBe(false);
  });

  it('returns false for negative z', () => {
    expect(inBounds(DIMS, 0, 0, -1)).toBe(false);
  });

  it('returns false for x == sizeX', () => {
    expect(inBounds(DIMS, 96, 0, 0)).toBe(false);
  });

  it('returns false for y == sizeY', () => {
    expect(inBounds(DIMS, 0, 81, 0)).toBe(false);
  });

  it('returns false for z == sizeZ', () => {
    expect(inBounds(DIMS, 0, 0, 96)).toBe(false);
  });

  it('returns true for interior cell', () => {
    expect(inBounds(DIMS, 48, 40, 48)).toBe(true);
  });
});

describe('diffToJSON', () => {
  it('returns empty array for empty diff', () => {
    const diff: WorldDiff = new Map();
    expect(diffToJSON(diff)).toEqual([]);
  });

  it('returns sorted even-length pair array', () => {
    const diff: WorldDiff = new Map();
    // Insert out of order
    diff.set(200, 3);
    diff.set(100, 1);
    diff.set(150, 2);
    const json = diffToJSON(diff);
    expect(json).toEqual([100, 1, 150, 2, 200, 3]);
    expect(json.length % 2).toBe(0);
  });

  it('is stable: same edits in different order produce the same array', () => {
    const diff1: WorldDiff = new Map([
      [10, 4],
      [20, 5],
      [30, 6],
    ]);
    const diff2: WorldDiff = new Map([
      [30, 6],
      [10, 4],
      [20, 5],
    ]);
    expect(diffToJSON(diff1)).toEqual(diffToJSON(diff2));
  });

  it('handles a single entry', () => {
    const diff: WorldDiff = new Map([[42, 7]]);
    expect(diffToJSON(diff)).toEqual([42, 7]);
  });

  it('allows blockId 0 (air/mined-out)', () => {
    const diff: WorldDiff = new Map([[99, 0]]);
    expect(diffToJSON(diff)).toEqual([99, 0]);
  });
});

describe('diffFromJSON', () => {
  it('returns empty map for empty array', () => {
    const diff = diffFromJSON([]);
    expect(diff.size).toBe(0);
  });

  it('reconstructs the map from pair array', () => {
    const json = [100, 1, 150, 2, 200, 3];
    const diff = diffFromJSON(json);
    expect(diff.size).toBe(3);
    expect(diff.get(100)).toBe(1);
    expect(diff.get(150)).toBe(2);
    expect(diff.get(200)).toBe(3);
  });

  it('roundtrips through diffToJSON → diffFromJSON', () => {
    const original: WorldDiff = new Map([
      [10, 1],
      [20, 0],
      [30, 4],
    ]);
    const json = diffToJSON(original);
    const rebuilt = diffFromJSON(json);
    expect(rebuilt.size).toBe(original.size);
    for (const [k, v] of original) {
      expect(rebuilt.get(k)).toBe(v);
    }
  });
});
