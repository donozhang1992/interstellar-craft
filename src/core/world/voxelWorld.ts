/**
 * Chunked voxel storage — TECH_SPEC §2/§6: 16×16×16 chunks backed by Uint8Array.
 * Pure logic, no three.js / DOM.
 *
 * M0 parity: defaults to the legacy prototype's world bounds. The prototype uses
 * SIZE = 96 for x/z and accepts y ∈ [0, 80] (its setBlock rejects `y > 80`),
 * i.e. 81 valid levels — hence sizeY = 81.
 */
import { isSolid as isSolidId } from './blocks';

export const CHUNK_SIZE = 16;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

export interface WorldDims {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
}

/** Prototype world bounds (prototype/index.html: SIZE=96, y ∈ [0,80]). */
export const PROTOTYPE_DIMS: Readonly<WorldDims> = { sizeX: 96, sizeY: 81, sizeZ: 96 };

/** World coordinate → chunk coordinate. */
export function toChunk(v: number): number {
  return v >> 4;
}

/** World coordinate → chunk-local coordinate ∈ [0, 16). */
export function toLocal(v: number): number {
  return v & 15;
}

/** Voxel offset inside a chunk's Uint8Array. */
function voxelIndex(lx: number, ly: number, lz: number): number {
  return (ly << 8) | (lz << 4) | lx;
}

export class VoxelWorld {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly chunksX: number;
  readonly chunksY: number;
  readonly chunksZ: number;
  /** Dense chunk storage, indexed by chunkIndex(). Allocated eagerly. */
  private readonly chunks: Uint8Array[];

  constructor(dims: WorldDims = PROTOTYPE_DIMS) {
    this.sizeX = dims.sizeX;
    this.sizeY = dims.sizeY;
    this.sizeZ = dims.sizeZ;
    this.chunksX = Math.ceil(this.sizeX / CHUNK_SIZE);
    this.chunksY = Math.ceil(this.sizeY / CHUNK_SIZE);
    this.chunksZ = Math.ceil(this.sizeZ / CHUNK_SIZE);
    const n = this.chunksX * this.chunksY * this.chunksZ;
    this.chunks = Array.from({ length: n }, () => new Uint8Array(CHUNK_VOLUME));
  }

  /** Flat index of chunk (cx, cy, cz) into the chunk array. */
  chunkIndex(cx: number, cy: number, cz: number): number {
    return (cy * this.chunksZ + cz) * this.chunksX + cx;
  }

  private inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sizeX && y < this.sizeY && z < this.sizeZ;
  }

  /** Block id at (x, y, z); 0 (air) outside world bounds — prototype behavior. */
  getBlock(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 0;
    const chunk = this.chunks[this.chunkIndex(toChunk(x), toChunk(y), toChunk(z))]!;
    return chunk[voxelIndex(toLocal(x), toLocal(y), toLocal(z))]!;
  }

  /** Write a block id. Out-of-range coordinates are a silent no-op (prototype parity). */
  setBlock(x: number, y: number, z: number, id: number): void {
    if (!this.inBounds(x, y, z)) return;
    const chunk = this.chunks[this.chunkIndex(toChunk(x), toChunk(y), toChunk(z))]!;
    chunk[voxelIndex(toLocal(x), toLocal(y), toLocal(z))] = id;
  }

  isSolid(x: number, y: number, z: number): boolean {
    return isSolidId(this.getBlock(x, y, z));
  }

  /** Raw chunk voxel data, or null if the chunk coordinate is out of range. */
  getChunkData(cx: number, cy: number, cz: number): Uint8Array | null {
    if (
      cx < 0 ||
      cy < 0 ||
      cz < 0 ||
      cx >= this.chunksX ||
      cy >= this.chunksY ||
      cz >= this.chunksZ
    )
      return null;
    return this.chunks[this.chunkIndex(cx, cy, cz)]!;
  }

  /**
   * Visit every NON-AIR voxel of chunk (cx, cy, cz) with world coordinates + id.
   * This is the iteration surface the chunk mesher needs (it skips air anyway).
   */
  forEachBlockInChunk(
    cx: number,
    cy: number,
    cz: number,
    cb: (x: number, y: number, z: number, id: number) => void,
  ): void {
    const chunk = this.getChunkData(cx, cy, cz);
    if (!chunk) return;
    const baseX = cx * CHUNK_SIZE;
    const baseY = cy * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const id = chunk[voxelIndex(lx, ly, lz)]!;
          if (id !== 0) cb(baseX + lx, baseY + ly, baseZ + lz, id);
        }
      }
    }
  }
}
