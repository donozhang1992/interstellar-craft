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
  /**
   * M1 blocks 7–13 only: an extra deterministic detail pass painted AFTER the
   * base noise (and after glow streaks), in the same hash2/1-px-rect style.
   * Blocks 1–6 must NEVER set this — their 16×16 pixel output is frozen by
   * the M0 visual baselines.
   */
  paint?: (ctx: CanvasRenderingContext2D) => void;
}

/** Prototype `hash2` — unseeded deterministic sine hash (texture noise only). */
function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/* ── M1 detail painters (blocks 7–13, GAME_DESIGN §4) ─────────────────────
 * Same vocabulary as the frozen M0 pass: hash2-positioned 1×1/1×2 rects on a
 * 16×16 canvas. Every painter is a pure function of constants → identical
 * pixels on every machine (no PRNG state, no clock). */

/** Ore speckle pass: hash2-placed 1×1 flecks with a brighter highlight pixel. */
function paintOreSpeckles(seed: number, fleck: string, highlight: string) {
  return (ctx: CanvasRenderingContext2D): void => {
    for (let i = 0; i < 9; i++) {
      const x = (hash2(i * 7.3 + seed, seed * 1.7) * 16) | 0;
      const y = (hash2(i * 3.7 + seed, seed * 2.3) * 16) | 0;
      ctx.fillStyle = fleck;
      ctx.fillRect(x, y, 1, 1);
      if (i % 3 === 0) {
        ctx.fillStyle = highlight;
        ctx.fillRect((x + 1) & 15, y, 1, 1);
      }
    }
  };
}

/** Hull: clean plate — corner rivets + a darker panel seam. */
function paintHull(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; // horizontal panel seam
  ctx.fillRect(0, 8, 16, 1);
  for (const [x, y] of [
    [3, 3],
    [12, 3],
    [3, 12],
    [12, 12],
  ] as const) {
    ctx.fillStyle = 'rgb(96,100,112)'; // rivet
    ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = 'rgb(214,220,230)'; // specular pixel
    ctx.fillRect(x - 1, y - 1, 1, 1);
  }
}

/** Glass: pale tint + a light frame + two diagonal sheen streaks (opaque mesh). */
function paintGlass(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgb(228,242,250)'; // frame
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 15, 16, 1);
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillRect(15, 0, 1, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; // sheen
  for (let t = 2; t < 8; t++) ctx.fillRect(t, 9 - t + 2, 1, 1);
  for (let t = 8; t < 13; t++) ctx.fillRect(t, 22 - t, 1, 1);
}

/** Antenna: dark metal with a wrapping light diagonal stripe. */
function paintAntenna(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgb(198,204,216)';
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
      if ((x + y) % 16 < 2) ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** Beacon core: dark shell, warm bright 4×4 core in an ember ring + sparks. */
function paintBeaconCore(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgb(148,104,60)'; // ember ring
  ctx.fillRect(5, 5, 6, 6);
  ctx.fillStyle = 'rgb(255,214,140)'; // bright core
  ctx.fillRect(6, 6, 4, 4);
  ctx.fillStyle = 'rgba(255,240,200,0.8)'; // stray sparks
  for (let i = 0; i < 4; i++) {
    const x = (hash2(i * 11.3, 12) * 16) | 0;
    const y = (hash2(i * 5.9, 12) * 16) | 0;
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Launchpad: dark plate with a 2-px hazard-striped yellow border. */
function paintLaunchpad(ctx: CanvasRenderingContext2D): void {
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
      if (x < 2 || x > 13 || y < 2 || y > 13) {
        ctx.fillStyle = (x + y) % 4 < 2 ? 'rgb(226,186,62)' : 'rgb(36,36,42)';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

/**
 * Verbatim prototype `BLOCKS` table for ids 1–6 (FROZEN — M0 baselines);
 * ids 7–13 are the M1 extension (GAME_DESIGN §4) in the same style.
 */
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
  // ── M1 extension (ids 7–13, GAME_DESIGN §4) — base noise + detail paint ──
  [BlockId.IronOre]: {
    name: 'iron_ore',
    base: [104, 100, 122], // rock base
    noise: 18,
    emissive: 0x000000,
    paint: paintOreSpeckles(7, 'rgb(184,108,62)', 'rgb(224,150,92)'), // rust
  },
  [BlockId.CopperOre]: {
    name: 'copper_ore',
    base: [104, 100, 122], // rock base
    noise: 18,
    emissive: 0x000000,
    paint: paintOreSpeckles(8, 'rgb(52,168,142)', 'rgb(102,214,180)'), // teal-green
  },
  [BlockId.Hull]: {
    name: 'hull',
    base: [150, 154, 165], // clean plate
    noise: 7,
    emissive: 0x000000,
    paint: paintHull,
  },
  [BlockId.Glass]: {
    name: 'glass',
    base: [188, 214, 228], // pale translucent-look tint (mesh stays opaque)
    noise: 6,
    emissive: 0x0a141c,
    paint: paintGlass,
  },
  [BlockId.Antenna]: {
    name: 'antenna',
    base: [72, 76, 90], // dark metal
    noise: 10,
    emissive: 0x000000,
    paint: paintAntenna,
  },
  [BlockId.BeaconCore]: {
    name: 'beacon_core',
    base: [42, 46, 62], // dark shell
    noise: 8,
    emissive: 0x2a1808, // warm core glow (lamp(6) emissive untouched)
    paint: paintBeaconCore,
  },
  [BlockId.Launchpad]: {
    name: 'launchpad',
    base: [56, 58, 66], // dark plate
    noise: 8,
    emissive: 0x000000,
    paint: paintLaunchpad,
  },
};

/**
 * The 16×16 canvas behind a block texture (prototype `makeTexture` pixels).
 * Exported for the HUD/inventory swatches — same pixels as the world texture.
 */
export function makeBlockCanvas(def: BlockTextureDef): HTMLCanvasElement {
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
  def.paint?.(ctx); // M1 blocks 7–13 detail pass (1–6 never set it)
  return c;
}

/** Verbatim prototype `makeTexture`: 16×16 noisy pixels (+ glow streaks). */
export function makeBlockTexture(def: BlockTextureDef): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(makeBlockCanvas(def));
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
