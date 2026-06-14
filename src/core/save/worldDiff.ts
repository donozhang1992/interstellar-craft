/**
 * World diff — the sparse representation of player-edited voxels (TECH_SPEC §4).
 *
 * A save must NEVER serialize the whole 96×81×96 world. Instead the game records
 * a sparse map of edited voxels (linear index → blockId); on load the seed world
 * is regenerated and the diff re-applied. This module is pure (no three.js / DOM,
 * no clock, no randomness) so both the capture path (game/loop) and the
 * serializer (core/save/serialize) share one canonical index encoding.
 *
 * Linear index layout matches the world's natural x-fastest ordering:
 *   index = ((y * sizeZ) + z) * sizeX + x
 * It is reversible given the world dims, so a diff is self-describing once paired
 * with the world's (sizeX, sizeY, sizeZ).
 */
import type { WorldDims } from '../world/voxelWorld';

/** A captured edit map: voxel linear index → blockId (0 = air, i.e. a mined-out cell). */
export type WorldDiff = Map<number, number>;

/** The serialized (JSON-friendly) diff form: a flat `[index, blockId, …]` pair array. */
export type WorldDiffJSON = number[];

/** Encode (x, y, z) → linear index for the given world dims. */
export function voxelLinearIndex(dims: WorldDims, x: number, y: number, z: number): number {
  return (y * dims.sizeZ + z) * dims.sizeX + x;
}

/** Decode a linear index → (x, y, z) for the given world dims. */
export function voxelFromLinearIndex(
  dims: WorldDims,
  index: number,
): { x: number; y: number; z: number } {
  const x = index % dims.sizeX;
  const t = (index - x) / dims.sizeX;
  const z = t % dims.sizeZ;
  const y = (t - z) / dims.sizeZ;
  return { x, y, z };
}

/** True when (x, y, z) is inside the world bounds (matches VoxelWorld.inBounds). */
export function inBounds(dims: WorldDims, x: number, y: number, z: number): boolean {
  return x >= 0 && y >= 0 && z >= 0 && x < dims.sizeX && y < dims.sizeY && z < dims.sizeZ;
}

/**
 * Flatten a diff map to its JSON pair-array form, sorted by index for a stable,
 * byte-deterministic serialization (same edits ⇒ identical JSON regardless of
 * insertion order).
 */
export function diffToJSON(diff: WorldDiff): WorldDiffJSON {
  const indices = Array.from(diff.keys()).sort((a, b) => a - b);
  const out: number[] = [];
  for (const idx of indices) {
    out.push(idx, diff.get(idx)!);
  }
  return out;
}

/** Rebuild a diff map from its JSON pair-array form. */
export function diffFromJSON(json: WorldDiffJSON): WorldDiff {
  const diff: WorldDiff = new Map();
  for (let i = 0; i + 1 < json.length; i += 2) {
    diff.set(json[i]!, json[i + 1]!);
  }
  return diff;
}
