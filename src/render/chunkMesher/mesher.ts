/**
 * Chunk mesher — pure geometry-data stage, ported verbatim from
 * prototype/index.html (FACES / FACE_UV / AO_VALS / vertexAO / rebuildChunk).
 *
 * NO three.js in this file (TECH_SPEC §2: keeps the data stage unit-testable);
 * the thin THREE.BufferGeometry/Mesh wrapper lives in ./createChunkMesh.ts.
 *
 * LANDMINE — TECH_SPEC §7.6: the vertex-AO corner sample is `x + n + co` where
 * `co = s1o + s2o - n`, i.e. it reads ONE BLOCK FURTHER ALONG THE FACE NORMAL
 * than the geometric corner. This off-by-one is part of the approved look.
 * DO NOT "FIX" IT. Port verbatim, document, move on.
 *
 * Differences from the prototype (structure only, output-equivalent visuals):
 * - the prototype meshes 16×16 full-height columns; here a chunk is 16³
 *   (cx, cy, cz) per TECH_SPEC §6 — culling and AO still query the WORLD, so
 *   faces cull and shade correctly across chunk borders.
 * - the prototype emits one Mesh per (chunk, blockId); here all per-block-id
 *   buffers are concatenated (ascending block id, matching the prototype's
 *   integer-key object iteration) into one set of arrays plus `groups`, so the
 *   wrapper can map each range to its per-block material.
 */
import { CHUNK_SIZE, type VoxelWorld } from '../../core/world/voxelWorld';

/** 6 faces: normal, 4 vertices, base shade — verbatim prototype `FACES`. */
export const FACES: ReadonlyArray<{
  n: readonly [number, number, number];
  v: ReadonlyArray<readonly [number, number, number]>;
  s: number;
}> = [
  // prettier-ignore
  { n: [0, 1, 0],  v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1.0 }, // top
  // prettier-ignore
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.45 }, // bottom
  // prettier-ignore
  { n: [1, 0, 0],  v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.72 }, // +x
  // prettier-ignore
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.72 }, // -x
  // prettier-ignore
  { n: [0, 0, 1],  v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.82 }, // +z
  // prettier-ignore
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.6 }, // -z
];

/** Per-vertex quad UVs — verbatim prototype `FACE_UV`. */
export const FACE_UV: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** Minecraft-style AO levels (0–3 occluders) — verbatim prototype `AO_VALS`. */
export const AO_VALS: readonly [number, number, number, number] = [1.0, 0.82, 0.66, 0.5];

/** World-block accessor the mesher needs (VoxelWorld satisfies it). */
export interface BlockSource {
  getBlock(x: number, y: number, z: number): number;
}

/**
 * Minecraft-style vertex AO: two side blocks + one corner block pick the
 * occlusion tier. Verbatim prototype `vertexAO` — including the §7.6 corner
 * off-by-one (`x + n + co`, with co already containing `-n`).
 */
export function vertexAO(
  world: BlockSource,
  x: number,
  y: number,
  z: number,
  n: readonly [number, number, number],
  vx: number,
  vy: number,
  vz: number,
): number {
  let s1o: [number, number, number], s2o: [number, number, number];
  if (n[1] !== 0) {
    s1o = [vx * 2 - 1, n[1], 0];
    s2o = [0, n[1], vz * 2 - 1];
  } else if (n[0] !== 0) {
    s1o = [n[0], vy * 2 - 1, 0];
    s2o = [n[0], 0, vz * 2 - 1];
  } else {
    s1o = [0, vy * 2 - 1, n[2]];
    s2o = [vx * 2 - 1, 0, n[2]];
  }
  const co = [s1o[0] + s2o[0] - n[0], s1o[1] + s2o[1] - n[1], s1o[2] + s2o[2] - n[2]] as const;
  const s1 = world.getBlock(x + s1o[0], y + s1o[1], z + s1o[2]) ? 1 : 0;
  const s2 = world.getBlock(x + s2o[0], y + s2o[1], z + s2o[2]) ? 1 : 0;
  // §7.6 landmine: corner sampled at x+n+co (one block past the geometric
  // corner along the normal). KEEP.
  const c = world.getBlock(x + n[0] + co[0], y + n[1] + co[1], z + n[2] + co[2]) ? 1 : 0;
  return AO_VALS[s1 && s2 ? 3 : s1 + s2 + c]!;
}

/** Index range of one block id inside the concatenated buffers. */
export interface ChunkGeometryGroup {
  /** First index (into `indices`) of this block id's faces. */
  start: number;
  /** Number of indices (6 per face). */
  count: number;
  blockId: number;
}

/** Plain-typed-array geometry for one 16³ chunk — three.js-free. */
export interface ChunkGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Per-vertex grayscale shade = face shade × vertex AO, replicated to r,g,b. */
  colors: Float32Array;
  indices: Uint32Array;
  /** Ascending-blockId ranges for per-block-type materials. */
  groups: ChunkGeometryGroup[];
}

interface BufferAccumulator {
  pos: number[];
  nrm: number[];
  uv: number[];
  col: number[];
  idx: number[];
}

/**
 * Build the exposed-face geometry of chunk (cx, cy, cz). Pure: reads `world`,
 * allocates plain typed arrays. Loop body is the prototype's `rebuildChunk`
 * (face culling via world query, FACE_UV quads, shade = f.s × vertexAO).
 */
export function buildChunkGeometry(
  world: VoxelWorld,
  cx: number,
  cy: number,
  cz: number,
): ChunkGeometryData {
  const buffers = new Map<number, BufferAccumulator>(); // blockId -> accumulator
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;

  // prototype iteration order: x outer, z, then y innermost
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const x = x0 + lx;
      const z = z0 + lz;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const y = y0 + ly;
        const id = world.getBlock(x, y, z);
        if (!id) continue;
        for (const f of FACES) {
          if (world.getBlock(x + f.n[0], y + f.n[1], z + f.n[2])) continue;
          let b = buffers.get(id);
          if (!b) {
            b = { pos: [], nrm: [], uv: [], col: [], idx: [] };
            buffers.set(id, b);
          }
          const base = b.pos.length / 3;
          for (let i = 0; i < 4; i++) {
            const [vx, vy, vz] = f.v[i]!;
            b.pos.push(x + vx, y + vy, z + vz);
            b.nrm.push(f.n[0], f.n[1], f.n[2]);
            b.uv.push(FACE_UV[i]![0], FACE_UV[i]![1]);
            const sh = f.s * vertexAO(world, x, y, z, f.n, vx, vy, vz);
            b.col.push(sh, sh, sh);
          }
          b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  // concatenate per-block-id buffers in ascending id order (matches the
  // prototype's `for (const id in buffers)` integer-key iteration)
  const ids = [...buffers.keys()].sort((a, b) => a - b);
  let vertCount = 0;
  let idxCount = 0;
  for (const id of ids) {
    const b = buffers.get(id)!;
    vertCount += b.pos.length / 3;
    idxCount += b.idx.length;
  }

  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const colors = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(idxCount);
  const groups: ChunkGeometryGroup[] = [];

  let vertBase = 0;
  let idxBase = 0;
  for (const id of ids) {
    const b = buffers.get(id)!;
    positions.set(b.pos, vertBase * 3);
    normals.set(b.nrm, vertBase * 3);
    uvs.set(b.uv, vertBase * 2);
    colors.set(b.col, vertBase * 3);
    for (let i = 0; i < b.idx.length; i++) indices[idxBase + i] = b.idx[i]! + vertBase;
    groups.push({ start: idxBase, count: b.idx.length, blockId: id });
    vertBase += b.pos.length / 3;
    idxBase += b.idx.length;
  }

  return { positions, normals, uvs, colors, indices, groups };
}
