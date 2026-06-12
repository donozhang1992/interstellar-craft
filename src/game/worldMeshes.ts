/**
 * Chunk mesh manager — the prototype's `chunkMeshes` map + `dirtyChunks` set +
 * per-frame rebuild, adapted to 16³ chunks and the M0.3a mesher (one Mesh per
 * chunk with per-block material groups instead of one Mesh per block id).
 *
 * Per-edit remesh only touches dirty chunks (perf contract); the full-world
 * build runs once at boot.
 */
import type * as THREE from 'three';
import type { Material, Mesh, Scene } from 'three';
import { buildChunkGeometry } from '../render/chunkMesher/mesher';
import { createChunkMesh } from '../render/chunkMesher/createChunkMesh';
import type { VoxelWorld } from '../core/world/voxelWorld';
import { dirtyChunksForEdit } from './edits';

export class WorldMeshes {
  private readonly meshes = new Map<string, Mesh>();
  private readonly dirty = new Set<string>();

  constructor(
    private readonly world: VoxelWorld,
    private readonly scene: Scene,
    private readonly materials: Readonly<Record<number, Material>>,
  ) {}

  /** Boot-time full build of every chunk. */
  buildAll(): void {
    for (let cx = 0; cx < this.world.chunksX; cx++)
      for (let cy = 0; cy < this.world.chunksY; cy++)
        for (let cz = 0; cz < this.world.chunksZ; cz++) this.rebuildChunk(cx, cy, cz);
    this.dirty.clear();
  }

  /** Mark the chunks affected by an edit at voxel (x, y, z) — prototype markDirty. */
  markDirtyAt(x: number, y: number, z: number): void {
    for (const [cx, cy, cz] of dirtyChunksForEdit(x, y, z)) {
      if (cx < 0 || cy < 0 || cz < 0) continue;
      if (cx >= this.world.chunksX || cy >= this.world.chunksY || cz >= this.world.chunksZ)
        continue;
      this.dirty.add(`${cx},${cy},${cz}`);
    }
  }

  /** Rebuild every dirty chunk (called once per rendered frame, prototype loop). */
  rebuildDirty(): void {
    for (const key of this.dirty) {
      const [cx, cy, cz] = key.split(',').map(Number) as [number, number, number];
      this.rebuildChunk(cx, cy, cz);
    }
    this.dirty.clear();
  }

  private rebuildChunk(cx: number, cy: number, cz: number): void {
    const key = `${cx},${cy},${cz}`;
    const old = this.meshes.get(key);
    if (old) {
      this.scene.remove(old);
      (old.geometry as THREE.BufferGeometry).dispose(); // materials are shared — keep them
      this.meshes.delete(key);
    }
    const mesh = createChunkMesh(buildChunkGeometry(this.world, cx, cy, cz), this.materials);
    if (mesh) {
      this.scene.add(mesh);
      this.meshes.set(key, mesh);
    }
  }
}
