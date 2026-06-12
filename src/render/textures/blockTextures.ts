/**
 * Procedural block textures — verbatim port of prototype/index.html
 * (`BLOCKS` defs + `makeTexture` + the per-block MeshLambertMaterial setup).
 *
 * Pixel parity notes (do not "improve"):
 * - the noise source is the prototype's UNSEEDED sine hash `hash2` — it is a
 *   pure deterministic function of its inputs (no PRNG state), so the same
 *   16×16 pixel pattern is produced on every machine, no seed param needed.
 * - the hash inputs fold in the block's base colour (`x*3.1 + r`, `y*2.7 + g`)
 *   and the glow-streak positions use (`i*7.3`, r) / (`i*3.7`, b) — keep.
 * - `r + n | 0` binds as `(r + n) | 0` (truncation AFTER the add) — keep.
 * - one 16×16 CanvasTexture PER BLOCK (no atlas), NearestFilter mag+min,
 *   sRGB colour space, MeshLambertMaterial with vertexColors (the mesher's
 *   AO·shade channel) and a per-block emissive colour.
 */
import * as THREE from 'three';
import { BlockId } from '../../core/world/blocks';

export interface BlockTextureDef {
  name: string;
  base: readonly [number, number, number];
  noise: number;
  emissive: number;
  glow?: boolean;
}

/** Verbatim prototype `BLOCKS` table (ids match src/core/world/blocks.ts). */
export const BLOCK_DEFS: Readonly<Record<number, BlockTextureDef>> = {
  [BlockId.Regolith]: { name: '月壤', base: [148, 138, 158], noise: 22, emissive: 0x000000 },
  [BlockId.Rock]: { name: '星岩', base: [104, 100, 122], noise: 18, emissive: 0x000000 },
  [BlockId.Basalt]: { name: '玄武岩', base: [58, 56, 70], noise: 14, emissive: 0x000000 },
  [BlockId.Crystal]: {
    name: '能量晶簇',
    base: [80, 230, 235],
    noise: 55,
    emissive: 0x1f8c92,
    glow: true,
  },
  [BlockId.Ice]: { name: '寒冰', base: [168, 205, 235], noise: 16, emissive: 0x0c1a28 },
  [BlockId.Lamp]: {
    name: '聚变灯',
    base: [255, 200, 120],
    noise: 30,
    emissive: 0xa86420,
    glow: true,
  },
};

/** Prototype `hash2` — unseeded deterministic sine hash (texture noise only). */
function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Verbatim prototype `makeTexture`: 16×16 noisy pixels (+ glow streaks). */
export function makeBlockTexture(def: BlockTextureDef): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d')!;
  const [r, g, b] = def.base;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = (hash2(x * 3.1 + r, y * 2.7 + g) - 0.5) * 2 * def.noise;
      ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, (r + n) | 0))},${Math.max(0, Math.min(255, (g + n) | 0))},${Math.max(0, Math.min(255, (b + n) | 0))})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  if (def.glow) {
    // crystal/lamp bright streaks
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 5; i++) {
      const x = (hash2(i * 7.3, r) * 16) | 0,
        y = (hash2(i * 3.7, b) * 16) | 0;
      ctx.fillRect(x, y, 1, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Per-block-id materials, exactly as the prototype builds them:
 * Lambert + canvas map + vertexColors (AO·shade) + emissive.
 */
export function createBlockMaterials(): Record<number, THREE.MeshLambertMaterial> {
  const materials: Record<number, THREE.MeshLambertMaterial> = {};
  for (const id in BLOCK_DEFS) {
    const def = BLOCK_DEFS[id]!;
    materials[id] = new THREE.MeshLambertMaterial({
      map: makeBlockTexture(def),
      vertexColors: true,
      emissive: new THREE.Color(def.emissive),
    });
  }
  return materials;
}
