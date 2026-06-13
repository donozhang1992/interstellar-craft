/**
 * World generation — M2 rework over the M0 surface baseline (TECH_SPEC §6,
 * GAME_DESIGN §6/§9).
 *
 * Surface baseline (UNCHANGED, M0 parity port of prototype/index.html):
 *   h(x,z) = max(4, round(18 + fbm(x·.045, z·.045)·16 + fbm(x·.13, z·.13)·4 + craters))
 *   two fixed craters (cos bowl + Gaussian rim), ice surface when h <= 15,
 *   strata: surface regolith/ice → 3 rock layers → basalt,
 *   surface crystal clusters at h+1 on non-icy columns (roll > 0.993).
 *
 * M2 additions (post-strata passes, in order):
 *   1. caves   — 3 seeded worm-carvers (len 180–260, radius 2–3, descending to
 *                ~y=8) carve solid voxels to air, skipping the spawn pod column.
 *   2. ores    — iron_ore (id 7) at y<24 (~3% of eligible solid), copper_ore
 *                (id 8) at y<28 (~2.5%); replace solid blocks only, never air.
 *   3. crystal — clusters at y<20 on solid voxels adjacent to carved cave air,
 *                so spelunking finds them (surface clusters from M0 kept).
 *   4. lamp    — ~8% of cave-ceiling blocks (solid with air directly below,
 *                y<28) become lamp (id 6) — natural cave lighting.
 *   5. pod     — flatten/cap a 6×6 platform at the world-centre spawn and refill
 *                any cave air in that column, so findSpawn always lands solid.
 *
 * All randomness flows through mulberry32 (TECH_SPEC §2), keyed by (seed,
 * channel salt, integer lattice coordinates), so the same seed yields a
 * byte-identical world (snapshot-tested).
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
const SALT_CLUSTER = 0x5eedc0de;
const SALT_CAVE = 0xca5e1234;
const SALT_IRON = 0x12047203;
const SALT_COPPER = 0xc0997e12;
const SALT_GEM = 0x9e0de51a;
const SALT_LAMP = 0x1a3b9c0d;

/** Spawn pod platform: a solid 6×6 cap at the world-centre column. */
const POD_HALF = 3; // 6×6 footprint centred on (sizeX/2, sizeZ/2)

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
 * True for columns inside the reserved spawn pod footprint. Caves must never
 * carve here so findSpawn always lands on a solid, supported block.
 */
function isPodColumn(world: VoxelWorld, x: number, z: number): boolean {
  const cx = Math.floor(world.sizeX / 2);
  const cz = Math.floor(world.sizeZ / 2);
  return Math.abs(x - cx) <= POD_HALF && Math.abs(z - cz) <= POD_HALF;
}

/** Lay down the M0 surface baseline (heightmap + strata + surface crystal). */
function generateSurface(world: VoxelWorld, seed: number): void {
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
        world.setBlock(x, y, z, id);
      }
      // surface crystal cluster on non-icy columns (M0 quirk preserved)
      if (!icy && coordRand2(clusterSeed, x, z) > 0.993)
        world.setBlock(x, h + 1, z, BlockId.Crystal);
    }
  }
}

/**
 * Carve 3 seeded worm tunnels through the strata to air (id 0). Each starts at a
 * deterministic underground point, takes 180–260 steps, drifts/descends toward
 * y≈8, and removes solid voxels within a radius of 2–3. The spawn pod footprint
 * is never carved.
 */
function carveCaves(world: VoxelWorld, seed: number): void {
  const caveSeed = (seed ^ SALT_CAVE) >>> 0;
  const rng = mulberry32(caveSeed);
  const TAU = Math.PI * 2;

  for (let w = 0; w < 3; w++) {
    // Seeded start point in the underground band, away from world edges.
    let px = 12 + rng() * (world.sizeX - 24);
    let pz = 12 + rng() * (world.sizeZ - 24);
    let py = 24 + rng() * 14; // start in the strata, descend from there
    let yaw = rng() * TAU;
    let pitch = -0.15 - rng() * 0.25; // generally descending
    const steps = 180 + Math.floor(rng() * 81); // 180–260

    for (let s = 0; s < steps; s++) {
      // Meander: wander the heading a little each step.
      yaw += (rng() - 0.5) * 0.5;
      pitch += (rng() - 0.5) * 0.18;
      // Bias the descent so the worm reaches the deep cave floor (~y=8).
      if (py > 10) pitch -= 0.01;
      pitch = Math.max(-0.8, Math.min(0.3, pitch));

      const ch = Math.cos(pitch);
      px += Math.cos(yaw) * ch;
      pz += Math.sin(yaw) * ch;
      py += Math.sin(pitch);
      if (py < 8) py = 8; // floor of the cave network

      const radius = 2 + rng(); // 2–3
      const r = Math.ceil(radius);
      const cx = Math.round(px);
      const cy = Math.round(py);
      const cz = Math.round(pz);

      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++)
          for (let dz = -r; dz <= r; dz++) {
            if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
            const x = cx + dx;
            const y = cy + dy;
            const z = cz + dz;
            if (y <= 1 || y >= world.sizeY) continue; // keep a basalt floor
            if (isPodColumn(world, x, z)) continue; // protect the spawn pod
            if (world.getBlock(x, y, z) !== BlockId.Air) world.setBlock(x, y, z, BlockId.Air);
          }
    }
  }
}

/**
 * Replace eligible solid voxels with iron/copper ore. Iron (id 7) fills ~3% of
 * solid blocks at y<24, copper (id 8) ~2.5% at y<28. Never touches air (so
 * caves stay open) and only the stone family (rock/basalt).
 */
function placeOres(world: VoxelWorld, seed: number): void {
  const ironSeed = (seed ^ SALT_IRON) >>> 0;
  const copperSeed = (seed ^ SALT_COPPER) >>> 0;
  for (let x = 0; x < world.sizeX; x++) {
    for (let z = 0; z < world.sizeZ; z++) {
      for (let y = 0; y < 28; y++) {
        const id = world.getBlock(x, y, z);
        if (id !== BlockId.Rock && id !== BlockId.Basalt) continue; // ore in stone only
        if (y < 24 && coordRand3(ironSeed, x, y, z) < 0.03) {
          world.setBlock(x, y, z, BlockId.IronOre);
        } else if (coordRand3(copperSeed, x, y, z) < 0.025) {
          world.setBlock(x, y, z, BlockId.CopperOre);
        }
      }
    }
  }
}

/** True if any of the 6 axis neighbours of (x,y,z) is carved cave air. */
function adjacentToCaveAir(world: VoxelWorld, x: number, y: number, z: number): boolean {
  return (
    world.getBlock(x + 1, y, z) === BlockId.Air ||
    world.getBlock(x - 1, y, z) === BlockId.Air ||
    world.getBlock(x, y + 1, z) === BlockId.Air ||
    world.getBlock(x, y - 1, z) === BlockId.Air ||
    world.getBlock(x, y, z + 1) === BlockId.Air ||
    world.getBlock(x, y, z - 1) === BlockId.Air
  );
}

/**
 * Crystal clusters (id 4) at y<20 on solid voxels that touch carved cave air, so
 * they're discovered by spelunking. Replaces stone-family blocks only.
 */
function placeCaveCrystal(world: VoxelWorld, seed: number): void {
  const gemSeed = (seed ^ SALT_GEM) >>> 0;
  for (let x = 0; x < world.sizeX; x++) {
    for (let z = 0; z < world.sizeZ; z++) {
      for (let y = 2; y < 20; y++) {
        const id = world.getBlock(x, y, z);
        if (id !== BlockId.Rock && id !== BlockId.Basalt) continue;
        if (!adjacentToCaveAir(world, x, y, z)) continue;
        if (coordRand3(gemSeed, x, y, z) < 0.18) world.setBlock(x, y, z, BlockId.Crystal);
      }
    }
  }
}

/**
 * Lamp/glowstone (id 6) on ~8% of cave-ceiling blocks: a solid voxel at y<28
 * with carved cave air directly below it. Natural cave lighting.
 */
function placeCaveLamps(world: VoxelWorld, seed: number): void {
  const lampSeed = (seed ^ SALT_LAMP) >>> 0;
  for (let x = 0; x < world.sizeX; x++) {
    for (let z = 0; z < world.sizeZ; z++) {
      for (let y = 2; y < 28; y++) {
        const id = world.getBlock(x, y, z);
        if (id === BlockId.Air) continue;
        if (world.getBlock(x, y - 1, z) !== BlockId.Air) continue; // need a ceiling
        if (coordRand3(lampSeed, x, y, z) < 0.08) world.setBlock(x, y, z, BlockId.Lamp);
      }
    }
  }
}

/**
 * Reserve the spawn pod: refill any cave air in the 6×6 centre footprint up to
 * the heightmap surface with basalt (solid support), keep the surface block, and
 * clear standing room above. Guarantees findSpawn lands on a solid, supported
 * block with the player's 2-block volume free above it.
 */
function buildPodPlatform(world: VoxelWorld, seed: number): void {
  const cx = Math.floor(world.sizeX / 2);
  const cz = Math.floor(world.sizeZ / 2);
  for (let x = cx - POD_HALF; x <= cx + POD_HALF; x++) {
    for (let z = cz - POD_HALF; z <= cz + POD_HALF; z++) {
      const h = heightAt(seed, x, z);
      // Refill any air below the surface with basalt so the column is solid.
      for (let y = 0; y <= h; y++) {
        if (world.getBlock(x, y, z) === BlockId.Air) world.setBlock(x, y, z, BlockId.Basalt);
      }
      // Clear standing room above the surface (drop any surface crystal cluster).
      for (let y = h + 1; y < world.sizeY; y++) {
        if (world.getBlock(x, y, z) !== BlockId.Air) world.setBlock(x, y, z, BlockId.Air);
      }
    }
  }
}

/**
 * Generate the full world. Pure: same seed ⇒ byte-identical voxel data
 * (snapshot-tested, TECH_SPEC §6). Passes run in a fixed order so the seeded
 * draws stay decorrelated and deterministic.
 */
export function generateWorld(seed: number): VoxelWorld {
  const world = new VoxelWorld(PROTOTYPE_DIMS);
  generateSurface(world, seed);
  carveCaves(world, seed);
  placeOres(world, seed);
  placeCaveCrystal(world, seed);
  placeCaveLamps(world, seed);
  buildPodPlatform(world, seed);
  return world;
}
