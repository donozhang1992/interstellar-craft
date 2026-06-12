/**
 * Spawn point — prototype parity: the player spawns at the world centre column,
 * 2 blocks above the surface (`heightAt[SIZE/2][SIZE/2] + 2`, x/z centred at
 * +0.5). The worldgen module keeps its heightmap internal, so the surface is
 * recovered by scanning the centre column top-down for the highest solid voxel
 * (identical result; a rare surface crystal cluster at h+1 would raise the
 * spawn by one block — harmless, the player just falls one block further).
 *
 * The result feeds `createPlayer(spawn)` — M0.2b contract: heightmap-derived
 * spawn passed as player.spawn (also the fell-out-of-world respawn point).
 */
import type { Vec3 } from '../core/physics/aabb';
import type { VoxelWorld } from '../core/world/voxelWorld';

export function findSpawn(world: VoxelWorld): Vec3 {
  const cx = Math.floor(world.sizeX / 2);
  const cz = Math.floor(world.sizeZ / 2);
  let surface = 0;
  for (let y = world.sizeY - 1; y >= 0; y--) {
    if (world.getBlock(cx, y, cz) !== 0) {
      surface = y;
      break;
    }
  }
  return { x: cx + 0.5, y: surface + 2, z: cz + 0.5 };
}
