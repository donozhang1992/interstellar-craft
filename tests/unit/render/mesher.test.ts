// Spec: TECH_SPEC §2 (src/render/chunkMesher: prototype mesher port) and §7.6
// (vertex-AO corner sampling is `x+n+co` — off-by-one vs the geometric corner —
// and MUST stay that way). The pure-data stage buildChunkGeometry() imports no
// three.js, so the render L1 exemption does not apply: it is unit-tested here.
//
// All expected AO literals below are derived BY HAND from the prototype tables
// (prototype/index.html `FACES`, `AO_VALS`, `vertexAO`) and frozen:
//   AO_VALS = [1.0, 0.82, 0.66, 0.5], index = (s1 && s2) ? 3 : s1 + s2 + c
//   face shades s: top 1.0, bottom 0.45, ±x 0.72, +z 0.82, −z 0.6
//   vertex color = s · AO (replicated to r,g,b)
import { describe, expect, it } from 'vitest';
import { BlockId } from '../../../src/core/world/blocks';
import { VoxelWorld } from '../../../src/core/world/voxelWorld';
import { generateWorld } from '../../../src/core/world/worldgen';
import {
  AO_VALS,
  buildChunkGeometry,
  type ChunkGeometryData,
} from '../../../src/render/chunkMesher/mesher';

/** Number of quad faces in the geometry (4 verts / 6 indices per face). */
function faceCount(g: ChunkGeometryData): number {
  return g.indices.length / 6;
}

/**
 * Find the quad whose normal matches `n` and whose 4-vertex centroid is `center`
 * (world coords). Returns the face's first-vertex offset, or -1.
 */
function findFace(
  g: ChunkGeometryData,
  n: [number, number, number],
  center: [number, number, number],
): number {
  for (let f = 0; f < faceCount(g); f++) {
    const v = f * 4;
    if (g.normals[v * 3] !== n[0] || g.normals[v * 3 + 1] !== n[1] || g.normals[v * 3 + 2] !== n[2])
      continue;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < 4; i++) {
      cx += g.positions[(v + i) * 3]! / 4;
      cy += g.positions[(v + i) * 3 + 1]! / 4;
      cz += g.positions[(v + i) * 3 + 2]! / 4;
    }
    if (cx === center[0] && cy === center[1] && cz === center[2]) return v;
  }
  return -1;
}

/** Vertex color (r component) for vertex index `v` — r=g=b, so r is the AO·shade. */
function colorAt(g: ChunkGeometryData, v: number): number {
  return g.colors[v * 3]!;
}

describe('buildChunkGeometry — face culling', () => {
  it('single block in an empty chunk → 6 faces, 24 verts, 36 indices, prototype winding', () => {
    const world = new VoxelWorld();
    world.setBlock(8, 8, 8, BlockId.Regolith);
    const g = buildChunkGeometry(world, 0, 0, 0);

    expect(faceCount(g)).toBe(6);
    expect(g.positions.length).toBe(6 * 4 * 3); // 24 verts
    expect(g.normals.length).toBe(6 * 4 * 3);
    expect(g.uvs.length).toBe(6 * 4 * 2);
    expect(g.colors.length).toBe(6 * 4 * 3);
    expect(g.indices.length).toBe(6 * 6);

    // prototype winding: two CCW triangles (0,1,2)(0,2,3) per quad, rebased by 4
    expect(Array.from(g.indices.slice(0, 12))).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);

    // FACES order is top, bottom, +x, −x, +z, −z; first top vertex is v[0]=[0,1,1]
    expect(Array.from(g.positions.slice(0, 3))).toEqual([8, 9, 9]);

    // open air → AO = 1.0 everywhere; colors are the bare face shades
    const shades = [1.0, 0.45, 0.72, 0.72, 0.82, 0.6];
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        expect(colorAt(g, f * 4 + i)).toBeCloseTo(shades[f]!, 6);
      }
    }
  });

  it('two adjacent blocks → shared faces culled (10 faces total)', () => {
    const world = new VoxelWorld();
    world.setBlock(8, 8, 8, BlockId.Rock);
    world.setBlock(9, 8, 8, BlockId.Rock);
    const g = buildChunkGeometry(world, 0, 0, 0);
    expect(faceCount(g)).toBe(10);
    expect(g.positions.length).toBe(10 * 4 * 3);
    expect(g.indices.length).toBe(10 * 6);
    // neither the +x face of (8,8,8) nor the −x face of (9,8,8) exists
    expect(findFace(g, [1, 0, 0], [9, 8.5, 8.5])).toBe(-1);
    expect(findFace(g, [-1, 0, 0], [9, 8.5, 8.5])).toBe(-1);
  });

  it('block at chunk border → face culled against the neighbouring chunk (world-level query)', () => {
    const world = new VoxelWorld();
    world.setBlock(15, 8, 8, BlockId.Basalt); // chunk (0,0,0)
    world.setBlock(16, 8, 8, BlockId.Basalt); // chunk (1,0,0)

    const g0 = buildChunkGeometry(world, 0, 0, 0);
    const g1 = buildChunkGeometry(world, 1, 0, 0);
    expect(faceCount(g0)).toBe(5); // +x face culled across the border
    expect(faceCount(g1)).toBe(5); // −x face culled across the border
    expect(findFace(g0, [1, 0, 0], [16, 8.5, 8.5])).toBe(-1);
    expect(findFace(g1, [-1, 0, 0], [16, 8.5, 8.5])).toBe(-1);

    // world edge: out-of-bounds reads are air (prototype parity) → face kept
    const edge = new VoxelWorld();
    edge.setBlock(0, 8, 8, BlockId.Basalt);
    expect(faceCount(buildChunkGeometry(edge, 0, 0, 0))).toBe(6);
  });
});

describe('buildChunkGeometry — vertex AO (prototype tables, frozen)', () => {
  it('exposes the prototype AO value table', () => {
    expect(AO_VALS).toEqual([1.0, 0.82, 0.66, 0.5]);
  });

  it('block on a flat floor: side-face bottom verts AO=0.66, top verts AO=1.0', () => {
    const world = new VoxelWorld();
    for (let x = 0; x <= 4; x++)
      for (let z = 0; z <= 4; z++) world.setBlock(x, 0, z, BlockId.Regolith);
    world.setBlock(2, 1, 2, BlockId.Regolith);

    const g = buildChunkGeometry(world, 0, 0, 0);
    // +x face of the standing block: verts (3,1,3)(3,1,2)(3,2,2)(3,2,3), shade 0.72
    const v = findFace(g, [1, 0, 0], [3, 1.5, 2.5]);
    expect(v).toBeGreaterThanOrEqual(0);
    // hand-derived: bottom verts see s1=floor(3,0,2)=1, s2=air, corner(4,0,z±1)=floor
    // → AO_VALS[2] = 0.66; top verts see nothing → AO_VALS[0] = 1.0
    expect(colorAt(g, v)).toBeCloseTo(0.72 * 0.66, 6); // (3,1,3)
    expect(colorAt(g, v + 1)).toBeCloseTo(0.72 * 0.66, 6); // (3,1,2)
    expect(colorAt(g, v + 2)).toBeCloseTo(0.72 * 1.0, 6); // (3,2,2)
    expect(colorAt(g, v + 3)).toBeCloseTo(0.72 * 1.0, 6); // (3,2,3)
  });

  it('floor top face next to the standing block is corner-shaded 0.82', () => {
    const world = new VoxelWorld();
    for (let x = 0; x <= 4; x++)
      for (let z = 0; z <= 4; z++) world.setBlock(x, 0, z, BlockId.Regolith);
    world.setBlock(2, 1, 2, BlockId.Regolith);

    const g = buildChunkGeometry(world, 0, 0, 0);
    // top face of floor block (1,0,2): verts (1,1,3)(2,1,3)(2,1,2)(1,1,2), shade 1.0
    const v = findFace(g, [0, 1, 0], [1.5, 1, 2.5]);
    expect(v).toBeGreaterThanOrEqual(0);
    // verts touching the standing block (vx=1) get s1=1 → AO_VALS[1]=0.82
    expect(colorAt(g, v)).toBeCloseTo(1.0, 6); // (1,1,3)
    expect(colorAt(g, v + 1)).toBeCloseTo(0.82, 6); // (2,1,3)
    expect(colorAt(g, v + 2)).toBeCloseTo(0.82, 6); // (2,1,2)
    expect(colorAt(g, v + 3)).toBeCloseTo(1.0, 6); // (1,1,2)
  });

  it('KEEPS the x+n+co corner off-by-one (TECH_SPEC §7.6) — do NOT "fix" this', () => {
    // top face of (8,8,8), vertex (9,9,9): the corner sample reads (9,10,9) —
    // one block ABOVE the geometric corner (9,9,9). Frozen prototype behaviour:
    //   block at the geometric corner (9,9,9)  → NOT seen → AO 1.0
    //   block one above it at (9,10,9)         → seen     → AO 0.82
    const atGeometricCorner = new VoxelWorld();
    atGeometricCorner.setBlock(8, 8, 8, BlockId.Rock);
    atGeometricCorner.setBlock(9, 9, 9, BlockId.Rock);
    let g = buildChunkGeometry(atGeometricCorner, 0, 0, 0);
    let v = findFace(g, [0, 1, 0], [8.5, 9, 8.5]);
    expect(v).toBeGreaterThanOrEqual(0);
    // top-face verts are [0,1,1][1,1,1][1,1,0][0,1,0] → vertex (9,9,9) is index 1
    expect(colorAt(g, v + 1)).toBeCloseTo(1.0, 6); // quirk: geometric corner invisible

    const oneAbove = new VoxelWorld();
    oneAbove.setBlock(8, 8, 8, BlockId.Rock);
    oneAbove.setBlock(9, 10, 9, BlockId.Rock);
    g = buildChunkGeometry(oneAbove, 0, 0, 0);
    v = findFace(g, [0, 1, 0], [8.5, 9, 8.5]);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(colorAt(g, v + 1)).toBeCloseTo(0.82, 6); // quirk: off-corner block IS seen
  });
});

describe('buildChunkGeometry — UVs and block-type groups', () => {
  it('every face carries the prototype FACE_UV quad and groups map to block ids', () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BlockId.Regolith);
    world.setBlock(5, 1, 1, BlockId.Crystal);
    const g = buildChunkGeometry(world, 0, 0, 0);

    expect(faceCount(g)).toBe(12);
    // groups in ascending block-id order (prototype `for (const id in buffers)`)
    expect(g.groups).toEqual([
      { start: 0, count: 36, blockId: BlockId.Regolith },
      { start: 36, count: 36, blockId: BlockId.Crystal },
    ]);
    // FACE_UV = [[0,0],[1,0],[1,1],[0,1]] repeated per face
    for (let f = 0; f < faceCount(g); f++) {
      expect(Array.from(g.uvs.slice(f * 8, f * 8 + 8))).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    }
    // group vertex ranges really hold the right block: regolith faces sit at x∈[1,2]
    expect(g.positions[0]).toBeGreaterThanOrEqual(1);
    expect(g.positions[0]).toBeLessThanOrEqual(2);
    const crystalFirstVert = (g.groups[1]!.start / 6) * 4; // index offset → vertex offset
    expect(g.positions[crystalFirstVert * 3]).toBeGreaterThanOrEqual(5);
    expect(g.positions[crystalFirstVert * 3]!).toBeLessThanOrEqual(6);
  });
});

describe('buildChunkGeometry — bench guard (soft, TECH_SPEC §5 budget 8 ms)', () => {
  it('builds one 16³ chunk of the seed-0x7e world and reports the time', () => {
    const world = generateWorld(0x7e);
    // chunk (2,1,2) covers y∈[16,32) — the surface band, densest geometry
    const t0 = performance.now();
    const g = buildChunkGeometry(world, 2, 1, 2);
    const ms = performance.now() - t0;
    expect(g.indices.length).toBeGreaterThan(0);
    expect(g.indices.length % 6).toBe(0);
    console.log(`[bench] buildChunkGeometry(2,1,2) seed=0x7e: ${ms.toFixed(2)} ms`);
  });
});
