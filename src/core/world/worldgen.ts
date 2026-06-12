/**
 * World generation — M0 parity port of prototype/index.html terrain:
 *
 *   h(x,z) = max(4, round(18 + fbm(x·.045, z·.045)·16 + fbm(x·.13, z·.13)·4 + craters))
 *   two fixed craters (cos bowl + Gaussian rim), ice surface when h <= 15,
 *   strata: surface regolith/ice → 3 rock layers → basalt,
 *   crystal ore replaces rock voxels (roll > 0.965),
 *   surface crystal clusters at h+1 on non-icy columns (roll > 0.993).
 *
 * The prototype's unseeded sine hash (`sin(x·127.1 + y·311.7)·43758.5453`) is the
 * ONE deliberate departure: all randomness here flows through mulberry32 (TECH_SPEC
 * §2), keyed by (seed, channel salt, integer lattice coordinates), so the same seed
 * yields a byte-identical world. Formulas, thresholds and strata are otherwise
 * verbatim.
 */
import { mulberry32 } from '../rng';
import { BlockId } from './blocks';
import { PROTOTYPE_DIMS, VoxelWorld } from './voxelWorld';

/** Fixed impact craters from the prototype (centre, radius, depth). */
const CRATERS = [
  { x: 30, z: 62, r: 13, d: 6 },
  { x: 70, z: 26, r: 9, d: 4 },
] as const;

/** Channel salts so the noise lattice, ore rolls and cluster rolls are decorrelated. */
const SALT_HEIGHT = 0x9c0ffee1;
const SALT_ORE = 0x0ddba115;
const SALT_CLUSTER = 0x5eedc0de;

/** One mulberry32 draw keyed by (seed, integer 2D coordinate) — replaces hash2(). */
function coordRand2(seed: number, x: number, y: number): number {
  const h = (seed ^ Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca6b)) >>> 0;
  return mulberry32(h)();
}

/** One mulberry32 draw keyed by (seed, integer 3D coordinate). */
function coordRand3(seed: number, x: number, y: number, z: number): number {
  const h =
    (seed ^
      Math.imul(x | 0, 0x9e3779b1) ^
      Math.imul(y | 0, 0x85ebca6b) ^
      Math.imul(z | 0, 0xc2b2ae35)) >>>
    0;
  return mulberry32(h)();
}

/** Smoothstep-interpolated value noise on the integer lattice (prototype valueNoise). */
function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = coordRand2(seed, xi, yi);
  const b = coordRand2(seed, xi + 1, yi);
  const c = coordRand2(seed, xi, yi + 1);
  const d = coordRand2(seed, xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 4-octave fbm, amplitude ×0.5 / frequency ×2.1 per octave (prototype fbm). */
function fbm(seed: number, x: number, y: number): number {
  let s = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < 4; i++) {
    s += valueNoise(seed, x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return s / norm;
}

/** Heightmap column height — formula ported verbatim from the prototype. */
function heightAt(seed: number, x: number, z: number): number {
  const noiseSeed = (seed ^ SALT_HEIGHT) >>> 0;
  let h = 18 + fbm(noiseSeed, x * 0.045, z * 0.045) * 16 + fbm(noiseSeed, x * 0.13, z * 0.13) * 4;
  for (const cr of CRATERS) {
    const d = Math.hypot(x - cr.x, z - cr.z);
    if (d < cr.r) {
      const t = d / cr.r;
      h -= cr.d * (Math.cos(t * Math.PI) * 0.5 + 0.5); // bowl
      h += cr.d * 0.45 * Math.exp(-Math.pow((t - 0.95) * 5, 2)); // raised rim
    }
  }
  return Math.max(4, Math.round(h));
}

/**
 * Generate the full M0 world. Pure: same seed ⇒ byte-identical voxel data
 * (snapshot-tested, TECH_SPEC §6).
 */
export function generateWorld(seed: number): VoxelWorld {
  const world = new VoxelWorld(PROTOTYPE_DIMS);
  const oreSeed = (seed ^ SALT_ORE) >>> 0;
  const clusterSeed = (seed ^ SALT_CLUSTER) >>> 0;

  for (let x = 0; x < world.sizeX; x++) {
    for (let z = 0; z < world.sizeZ; z++) {
      const h = heightAt(seed, x, z);
      const icy = h <= 15; // lowlands / crater floors freeze over
      for (let y = 0; y <= h; y++) {
        let id: BlockId;
        if (y === h) id = icy ? BlockId.Ice : BlockId.Regolith;
        else if (y >= h - 3) id = BlockId.Rock;
        else id = BlockId.Basalt;
        // underground crystal ore — only ever replaces rock (prototype quirk:
        // basalt never carries ore because the roll tests `id === 2`)
        if (id === BlockId.Rock && coordRand3(oreSeed, x, y, z) > 0.965) id = BlockId.Crystal;
        world.setBlock(x, y, z, id);
      }
      // surface crystal cluster on non-icy columns
      if (!icy && coordRand2(clusterSeed, x, z) > 0.993)
        world.setBlock(x, h + 1, z, BlockId.Crystal);
    }
  }
  return world;
}
