// Determinism contract (TECH_SPEC §2): same seed + same input sequence ⇒
// identical trajectory, fixed dt = 1/60. stepPlayer mutates the player only —
// no clock, no Math.random — so two cold runs must agree bit-for-bit, and the
// 6-decimal snapshot pins the trajectory across refactors.
import { describe, expect, it } from 'vitest';
import { PHYS, createPlayer, stepPlayer } from '../../../src/core/player/movement';
import type { MoveInput, PlayerState } from '../../../src/core/player/movement';
import { generateWorld } from '../../../src/core/world/worldgen';
import type { VoxelWorld } from '../../../src/core/world/voxelWorld';

const DT = 1 / 60;
const SEED = 0x7e;

// Probed flat ground on seed 0x7e: columns (x=36..42, z=40) all top out at
// y=30 (surface at 31); the path then steps down to 29 around x=41.
const SPAWN = { x: 36.5, y: 31, z: 40.5 };
const YAW_PLUS_X = -Math.PI / 2; // forward ≈ +x

/** Scripted 120-step input: walk 60 steps, jump at step 30, then stop. */
function scriptedInput(i: number): MoveInput {
  return i < 60 ? { forward: true, jump: i === 30 } : {};
}

function topSolidY(w: VoxelWorld, x: number, z: number): number {
  for (let y = w.sizeY - 1; y >= 0; y--) if (w.isSolid(x, y, z)) return y;
  return -1;
}

function runScript(): { world: VoxelWorld; player: PlayerState } {
  const world = generateWorld(SEED);
  const player = createPlayer(SPAWN, YAW_PLUS_X, 0);
  for (let i = 0; i < 120; i++) stepPlayer(player, world, scriptedInput(i), DT);
  return { world, player };
}

describe('trajectory determinism (seed 0x7e, 120 scripted steps)', () => {
  it('spawn area assumption holds: flat ground at y=30 under the walk path', () => {
    const world = generateWorld(SEED);
    for (let x = 36; x <= 40; x++) expect(topSolidY(world, x, 40)).toBe(30);
  });

  it('the scripted jump actually fires (grounded at step 30, leaves with vy = 5.2)', () => {
    const world = generateWorld(SEED);
    const player = createPlayer(SPAWN, YAW_PLUS_X, 0);
    for (let i = 0; i < 30; i++) stepPlayer(player, world, scriptedInput(i), DT);
    expect(player.onGround).toBe(true);
    stepPlayer(player, world, scriptedInput(30), DT);
    expect(player.vel.y).toBe(PHYS.JUMP_VELOCITY);
  });

  it('two cold runs produce bit-identical state', () => {
    const a = runScript().player;
    const b = runScript().player;
    expect(a.pos).toEqual(b.pos); // full float precision
    expect(a.vel).toEqual(b.vel);
    expect(a.onGround).toBe(b.onGround);
  });

  it('final position matches the pinned snapshot to 6 decimals', () => {
    const { player } = runScript();
    expect(player.onGround).toBe(true); // landed and at rest by step 120
    expect({
      x: player.pos.x.toFixed(6),
      y: player.pos.y.toFixed(6),
      z: player.pos.z.toFixed(6),
    }).toMatchSnapshot();
  });
});
