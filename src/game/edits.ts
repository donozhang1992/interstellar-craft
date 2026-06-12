/**
 * Mine / place block edits — port of prototype/index.html's mousedown handler
 * (raycast from the eye, reach 7) + `markDirty` chunk dirty propagation.
 *
 * Prototype semantics preserved:
 *  - the view ray is (0,0,-1) rotated by the YXZ euler (pitch, yaw, 0), cast
 *    from the camera/eye position (feet + EYE_HEIGHT), default reach 7;
 *  - mine: set the hit voxel to air, no other conditions;
 *  - place: target = hit + face normal; rejected if the target voxel is solid
 *    OR if the new block's cell would overlap the player AABB (the prototype's
 *    anti-place-inside-player check, verbatim inequality);
 *  - markDirty: an edit dirties its own chunk, plus neighbours INCLUDING the
 *    diagonal when the edit sits on a chunk border (AO samples reach diagonal
 *    neighbour blocks). The prototype meshes full-height 16×16 columns so it
 *    only propagates on x/z; our chunks are 16³ (TECH_SPEC §6), so the same
 *    rule is applied to y as well — the cross product of border offsets covers
 *    edge AND corner diagonals.
 */
import { PHYS, type PlayerState } from '../core/player/movement';
import { DEFAULT_MAX_DIST, raycast, type RaycastResult, type Vec3 } from '../core/world/raycast';
import type { VoxelWorld } from '../core/world/voxelWorld';

/** Facing direction from view angles — (0,0,-1) through Euler YXZ(pitch, yaw, 0). */
export function viewDir(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** Camera/eye position: feet + EYE_HEIGHT (prototype camera placement). */
export function eyePos(player: PlayerState): Vec3 {
  return { x: player.pos.x, y: player.pos.y + PHYS.EYE_HEIGHT, z: player.pos.z };
}

/** Crosshair raycast (prototype `raycastBlock()`, reach 7). */
export function raycastFromPlayer(world: VoxelWorld, player: PlayerState): RaycastResult | null {
  return raycast(world, eyePos(player), viewDir(player.yaw, player.pitch), DEFAULT_MAX_DIST);
}

/** Mine the targeted block. Returns the edited voxel, or null if nothing was hit. */
export function mineBlock(world: VoxelWorld, player: PlayerState): Vec3 | null {
  const hit = raycastFromPlayer(world, player);
  if (!hit) return null;
  const { x, y, z } = hit.hit;
  world.setBlock(x, y, z, 0);
  return { x, y, z };
}

/**
 * Place `blockId` against the targeted face. Returns the edited voxel, or null
 * if there was no target, the cell is occupied, the cell overlaps the player,
 * or the cell is outside world bounds (prototype setBlock bounds guard).
 */
export function placeBlock(world: VoxelWorld, player: PlayerState, blockId: number): Vec3 | null {
  const hit = raycastFromPlayer(world, player);
  if (!hit) return null;
  const nx = hit.hit.x + hit.face.nx;
  const ny = hit.hit.y + hit.face.ny;
  const nz = hit.hit.z + hit.face.nz;
  // 不能把方块放进自己身体里 — prototype anti-place-inside-player check, verbatim
  const hw = PHYS.PLAYER_WIDTH / 2;
  const p = player.pos;
  const overlap =
    nx + 1 > p.x - hw &&
    nx < p.x + hw &&
    nz + 1 > p.z - hw &&
    nz < p.z + hw &&
    ny + 1 > p.y &&
    ny < p.y + PHYS.PLAYER_HEIGHT;
  if (overlap || world.getBlock(nx, ny, nz)) return null;
  world.setBlock(nx, ny, nz, blockId);
  if (world.getBlock(nx, ny, nz) !== blockId) return null; // out-of-bounds no-op
  return { x: nx, y: ny, z: nz };
}

/**
 * Chunk coordinates whose meshes are stale after editing voxel (x, y, z) —
 * the prototype `markDirty` border/diagonal propagation, extended to the y
 * axis for 16³ chunks. Coordinates are NOT clamped; callers skip chunks they
 * don't manage.
 */
export function dirtyChunksForEdit(x: number, y: number, z: number): [number, number, number][] {
  const cx = x >> 4;
  const cy = y >> 4;
  const cz = z >> 4;
  const dxs = [0];
  const dys = [0];
  const dzs = [0];
  if ((x & 15) === 0) dxs.push(-1);
  if ((x & 15) === 15) dxs.push(1);
  if ((y & 15) === 0) dys.push(-1);
  if ((y & 15) === 15) dys.push(1);
  if ((z & 15) === 0) dzs.push(-1);
  if ((z & 15) === 15) dzs.push(1);
  const out: [number, number, number][] = [];
  for (const dx of dxs)
    for (const dy of dys) for (const dz of dzs) out.push([cx + dx, cy + dy, cz + dz]);
  return out;
}
