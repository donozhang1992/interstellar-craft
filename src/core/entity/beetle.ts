/**
 * Crystal Beetle — pure-state behavior (GAME_DESIGN §3e / §8). No render, no DOM,
 * no three.js, no Math.random: all randomness comes from a seeded mulberry32
 * stream carried inside the beetle, so (same seed + same per-step inputs) ⇒
 * identical trajectory. The render layer (M4.3) reads `pos` for the sprite and
 * `didShed` (returned by stepBeetle) to spawn the crystal-shard drop.
 *
 * WORLD-DECOUPLED: stepBeetle takes a BeetleContext carrying the player position
 * and an `isSolid(x, y, z)` probe, so this module never imports VoxelWorld. The
 * game layer passes `(x, y, z) => world.isSolid(x, y, z)`.
 *
 * Behavior:
 *  - WANDER: drift along a seeded heading on the XZ plane at WANDER_SPEED; the
 *    heading is re-rolled every WANDER_REROLL_S seconds (seeded).
 *  - FLEE: when the player is within BEETLE_FLEE_RADIUS (XZ distance), move
 *    directly away at FLEE_SPEED, overriding wander.
 *  - SHED: if the player is within BEETLE_CORNER_RADIUS AND the beetle cannot
 *    step away (the flee target cell, and every horizontal neighbour, is solid),
 *    it is cornered → sheds 1 crystal shard. Latched: `shed` flips true once and
 *    stepBeetle returns `didShed: true` only on that transition.
 *
 * Movement is collision-aware on XZ: a horizontal move into a solid cell is
 * cancelled (per-axis), so the beetle never tunnels into walls. Y is left to the
 * game layer (cave floor); this core keeps the beetle's own Y constant.
 */
import { mulberry32 } from '../rng';

export type Vec3 = [number, number, number];

/** XZ distance at/under which the beetle flees the player. */
export const BEETLE_FLEE_RADIUS = 6;
/** XZ distance at/under which a beetle that cannot escape is "cornered". */
export const BEETLE_CORNER_RADIUS = 1.5;
/** Wander speed (m/s). */
export const WANDER_SPEED = 1.2;
/** Flee speed (m/s) — faster than wandering. */
export const FLEE_SPEED = 3.0;
/** Seconds between seeded heading re-rolls while wandering. */
export const WANDER_REROLL_S = 1.0;

export interface Beetle {
  pos: Vec3;
  /** Current wander heading on XZ (unit vector), re-rolled periodically. */
  heading: [number, number];
  /** Seconds until the next wander heading re-roll. */
  rerollIn: number;
  /** Seeded PRNG, advanced every step — the only randomness source. */
  rand: () => number;
  /** True once the beetle has shed its crystal shard (latched). */
  shed: boolean;
}

export interface BeetleContext {
  playerPos: Vec3;
  /** True iff the cell (x, y, z) is solid (blocks movement). */
  isSolid: (x: number, y: number, z: number) => boolean;
}

export interface BeetleStep {
  /** True ONLY on the step where the beetle transitions to shed (drop spawn). */
  didShed: boolean;
}

/** Roll a fresh unit heading on the XZ plane from the seeded stream. */
function rollHeading(rand: () => number): [number, number] {
  const a = rand() * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
}

/** Create a beetle at `pos` with a seeded behavior stream. */
export function createBeetle(pos: Vec3, seed: number): Beetle {
  const rand = mulberry32(seed);
  return {
    pos: [pos[0], pos[1], pos[2]],
    heading: rollHeading(rand),
    rerollIn: WANDER_REROLL_S,
    rand,
    shed: false,
  };
}

/** Floor a world coordinate to its voxel cell index. */
function cell(v: number): number {
  return Math.floor(v);
}

/**
 * Advance the beetle by `dt` seconds against `ctx`. Deterministic for a fixed
 * seed + identical per-step ctx sequence. Returns whether it shed this step.
 */
export function stepBeetle(beetle: Beetle, ctx: BeetleContext, dt: number): BeetleStep {
  const [px, , pz] = ctx.playerPos;
  const dx = beetle.pos[0] - px;
  const dz = beetle.pos[2] - pz;
  const distXZ = Math.hypot(dx, dz);

  let vx: number;
  let vz: number;

  if (distXZ <= BEETLE_FLEE_RADIUS && distXZ > 0) {
    // FLEE: unit vector pointing away from the player.
    const inv = 1 / distXZ;
    vx = dx * inv * FLEE_SPEED;
    vz = dz * inv * FLEE_SPEED;
  } else {
    // WANDER: drift along the current heading, re-rolling periodically.
    beetle.rerollIn -= dt;
    if (beetle.rerollIn <= 0) {
      beetle.heading = rollHeading(beetle.rand);
      beetle.rerollIn += WANDER_REROLL_S;
    }
    vx = beetle.heading[0] * WANDER_SPEED;
    vz = beetle.heading[1] * WANDER_SPEED;
  }

  const y = beetle.pos[1];
  // Per-axis collision-aware move: cancel an axis that would enter a solid cell.
  const nx = beetle.pos[0] + vx * dt;
  if (!ctx.isSolid(cell(nx), cell(y), cell(beetle.pos[2]))) {
    beetle.pos[0] = nx;
  }
  const nz = beetle.pos[2] + vz * dt;
  if (!ctx.isSolid(cell(beetle.pos[0]), cell(y), cell(nz))) {
    beetle.pos[2] = nz;
  }

  // CORNERED → shed once: player very close AND no free horizontal neighbour.
  if (!beetle.shed && distXZ <= BEETLE_CORNER_RADIUS) {
    if (isCornered(beetle, ctx)) {
      beetle.shed = true;
      return { didShed: true };
    }
  }
  return { didShed: false };
}

/** True iff all four horizontal neighbour cells are solid (no escape). */
function isCornered(beetle: Beetle, ctx: BeetleContext): boolean {
  const cx = cell(beetle.pos[0]);
  const cy = cell(beetle.pos[1]);
  const cz = cell(beetle.pos[2]);
  return (
    ctx.isSolid(cx + 1, cy, cz) &&
    ctx.isSolid(cx - 1, cy, cz) &&
    ctx.isSolid(cx, cy, cz + 1) &&
    ctx.isSolid(cx, cy, cz - 1)
  );
}
