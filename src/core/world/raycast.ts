/**
 * Voxel DDA raycast — port of the prototype's raycastBlock() (mine/place targeting).
 * Pure logic: plain {x,y,z} vectors, no three.js.
 *
 * Semantics (prototype parity unless noted):
 *  - The STARTING voxel is never tested: the DDA steps into the next voxel before
 *    its first solidity check. A ray that starts inside a solid block exits it and
 *    hits the next solid voxel along the path (or nothing). This matches the
 *    prototype: you mine the block in front of you, never the one you stand in.
 *    (Edge quirk kept verbatim: if an axis has dir component 0 AND the origin lies
 *    exactly on that axis' grid line, the first "step" is zero-length and re-tests
 *    the starting voxel.)
 *  - `dir` is expected to be normalized; `maxDist` is then in world units.
 *  - `face` is the outward normal of the face the ray entered through.
 *  - DEVIATION: the prototype's `while (t < maxDist)` re-assigns `t` inside the
 *    loop, so it could return hits up to one voxel step BEYOND maxDist. Here the
 *    entry distance is checked after each step, so maxDist is strictly respected.
 */
import type { VoxelWorld } from './voxelWorld';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RaycastResult {
  /** Integer coordinates of the solid voxel that was hit. */
  hit: { x: number; y: number; z: number };
  /** Outward normal of the entered face (place target = hit + face). */
  face: { nx: number; ny: number; nz: number };
}

/** Prototype default reach. */
export const DEFAULT_MAX_DIST = 7;

export function raycast(
  world: VoxelWorld,
  origin: Vec3,
  dir: Vec3,
  maxDist: number = DEFAULT_MAX_DIST,
): RaycastResult | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  const stepX = Math.sign(dir.x);
  const stepY = Math.sign(dir.y);
  const stepZ = Math.sign(dir.z);
  const tdX = Math.abs(1 / (dir.x || 1e-9));
  const tdY = Math.abs(1 / (dir.y || 1e-9));
  const tdZ = Math.abs(1 / (dir.z || 1e-9));
  let tmX = (stepX > 0 ? x + 1 - origin.x : origin.x - x) * tdX;
  let tmY = (stepY > 0 ? y + 1 - origin.y : origin.y - y) * tdY;
  let tmZ = (stepZ > 0 ? z + 1 - origin.z : origin.z - z) * tdZ;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;
  while (t < maxDist) {
    if (tmX < tmY && tmX < tmZ) {
      x += stepX;
      t = tmX;
      tmX += tdX;
      nx = -stepX + 0; // `+ 0` normalizes -0 when stepX === 0
      ny = 0;
      nz = 0;
    } else if (tmY < tmZ) {
      y += stepY;
      t = tmY;
      tmY += tdY;
      nx = 0;
      ny = -stepY + 0;
      nz = 0;
    } else {
      z += stepZ;
      t = tmZ;
      tmZ += tdZ;
      nx = 0;
      ny = 0;
      nz = -stepZ + 0;
    }
    if (t > maxDist) return null; // strict reach (see DEVIATION note above)
    if (world.isSolid(x, y, z)) return { hit: { x, y, z }, face: { nx, ny, nz } };
  }
  return null;
}
