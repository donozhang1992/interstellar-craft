/**
 * Thin three.js wrapper around the pure geometry-data stage (./mesher.ts) —
 * the only chunkMesher file that imports three.
 *
 * The prototype creates one Mesh per (chunk, blockId); here the concatenated
 * buffers become ONE Mesh with a geometry group per block id, each group bound
 * to that block's prototype material (visually identical, fewer objects).
 */
import * as THREE from 'three';
import type { ChunkGeometryData } from './mesher';

/**
 * Build a renderable Mesh from buildChunkGeometry() output. `materials` maps
 * block id → material (e.g. createBlockMaterials() from textures/blockTextures).
 * Returns null for an empty chunk (no exposed faces).
 */
export function createChunkMesh(
  geom: ChunkGeometryData,
  materials: Readonly<Record<number, THREE.Material>>,
): THREE.Mesh | null {
  if (geom.indices.length === 0) return null;

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(geom.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(geom.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(geom.uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(geom.colors, 3));
  g.setIndex(new THREE.BufferAttribute(geom.indices, 1));

  const meshMaterials: THREE.Material[] = [];
  geom.groups.forEach((grp, i) => {
    g.addGroup(grp.start, grp.count, i);
    const mat = materials[grp.blockId];
    if (!mat) throw new Error(`createChunkMesh: no material for block id ${grp.blockId}`);
    meshMaterials.push(mat);
  });

  const mesh = new THREE.Mesh(g, meshMaterials);
  mesh.frustumCulled = true; // prototype parity
  return mesh;
}
