// Spec: TECH_SPEC §2 (src/core/player: movement integration, fixed dt = 1/60) —
// M0 parity port of prototype/index.html `movePlayer()` semantics:
//  - DIRECT velocity (no acceleration/friction): horizontal vel is set every
//    step from the normalized input direction × speed (5 walk / 8.5 sprint /
//    14 fly), so releasing keys stops instantly;
//  - gravity -9.5 (low-gravity planet), jump velocity 5.2 only when onGround;
//  - fly mode: gravity skipped, vel.y set directly to ±10 (Space/Ctrl), toggle
//    flips the flag and zeroes ALL velocity (prototype KeyF keydown), landing
//    does NOT exit fly mode;
//  - world-bottom safety: pos.y < -30 → teleport to spawn, velocity zeroed.
import { describe, expect, it } from 'vitest';
import { PHYS, createPlayer, stepPlayer } from '../../../src/core/player/movement';
import type { MoveInput, PlayerState } from '../../../src/core/player/movement';
import { BlockId } from '../../../src/core/world/blocks';
import { VoxelWorld } from '../../../src/core/world/voxelWorld';

const DIMS = { sizeX: 32, sizeY: 32, sizeZ: 32 };
const DT = 1 / 60;
const YAW_PLUS_X = -Math.PI / 2; // forward ≈ +x (move dir = (-sin yaw, -cos yaw))

/** Flat floor: top face at y = 5 everywhere. */
function flatWorld(): VoxelWorld {
  const w = new VoxelWorld(DIMS);
  for (let x = 0; x < DIMS.sizeX; x++)
    for (let z = 0; z < DIMS.sizeZ; z++) w.setBlock(x, 4, z, BlockId.Basalt);
  return w;
}

function groundedPlayer(world: VoxelWorld, yaw = YAW_PLUS_X): PlayerState {
  const p = createPlayer({ x: 8.5, y: 5, z: 8.5 }, yaw, 0);
  stepPlayer(p, world, {}, DT); // one settle step → onGround
  return p;
}

function step(p: PlayerState, w: VoxelWorld, input: MoveInput, n = 1): void {
  for (let i = 0; i < n; i++) stepPlayer(p, w, input, DT);
}

describe('PHYS constants (prototype parity — GAME_DESIGN §12 lands in M2)', () => {
  it('matches the prototype exactly', () => {
    expect(PHYS.GRAVITY).toBe(-9.5);
    expect(PHYS.JUMP_VELOCITY).toBe(5.2);
    expect(PHYS.WALK_SPEED).toBe(5);
    expect(PHYS.SPRINT_SPEED).toBe(8.5);
    expect(PHYS.FLY_SPEED).toBe(14);
    expect(PHYS.FLY_VERTICAL_SPEED).toBe(10);
    expect(PHYS.PLAYER_WIDTH).toBe(0.6);
    expect(PHYS.PLAYER_HEIGHT).toBe(1.8);
    expect(PHYS.EYE_HEIGHT).toBe(1.62);
    expect(PHYS.WORLD_BOTTOM_Y).toBe(-30);
  });
});

describe('gravity & landing', () => {
  it('falls under gravity and lands: vy zeroes, onGround true, feet at integer y', () => {
    const w = flatWorld();
    const p = createPlayer({ x: 8.5, y: 7, z: 8.5 });
    expect(p.onGround).toBe(false);
    step(p, w, {}, 240); // 4 s — plenty to land from 2 blocks up
    expect(p.onGround).toBe(true);
    expect(p.vel.y).toBe(0);
    expect(p.pos.y).toBe(5); // prototype Math.round landing snap
  });

  it('accumulates gravity exactly (vel.y += GRAVITY * dt per step)', () => {
    const w = new VoxelWorld(DIMS); // empty: free fall
    const p = createPlayer({ x: 8.5, y: 20, z: 8.5 });
    step(p, w, {}, 3);
    expect(p.vel.y).toBeCloseTo(3 * PHYS.GRAVITY * DT, 12);
  });
});

describe('walking', () => {
  it('walks at 5 m/s in the yaw direction with direct velocity', () => {
    const w = flatWorld();
    const p = groundedPlayer(w);
    const x0 = p.pos.x;
    step(p, w, { forward: true });
    expect(p.vel.x).toBeCloseTo(PHYS.WALK_SPEED, 12);
    expect(p.pos.x - x0).toBeCloseTo(PHYS.WALK_SPEED * DT, 12);
  });

  it('sprints at 8.5 m/s', () => {
    const w = flatWorld();
    const p = groundedPlayer(w);
    step(p, w, { forward: true, sprint: true });
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeCloseTo(PHYS.SPRINT_SPEED, 12);
  });

  it('normalizes diagonal input (forward+right is still 5 m/s)', () => {
    const w = flatWorld();
    const p = groundedPlayer(w);
    step(p, w, { forward: true, right: true });
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeCloseTo(PHYS.WALK_SPEED, 12);
  });

  it('back/left/right map to the prototype directions (yaw-relative strafe)', () => {
    // yaw = 0: forward = (−sin, −cos) = (0, −1); right = (cos, −sin) = (1, 0)
    const w = new VoxelWorld(DIMS);
    const mk = (): PlayerState => {
      const p = createPlayer({ x: 8.5, y: 10, z: 8.5 }, 0, 0);
      p.flying = true; // isolate horizontal velocity from gravity
      return p;
    };
    const cases: [MoveInput, number, number][] = [
      [{ forward: true }, 0, -1],
      [{ back: true }, 0, 1],
      [{ left: true }, -1, 0],
      [{ right: true }, 1, 0],
    ];
    for (const [input, dx, dz] of cases) {
      const p = mk();
      step(p, w, input);
      expect(p.vel.x).toBeCloseTo(dx * PHYS.FLY_SPEED, 12);
      expect(p.vel.z).toBeCloseTo(dz * PHYS.FLY_SPEED, 12);
    }
    // opposing keys cancel: forward+back yields zero horizontal velocity
    const p = mk();
    step(p, w, { forward: true, back: true });
    expect(p.vel.x).toBe(0);
    expect(p.vel.z).toBe(0);
  });

  it('stops instantly when keys are released (no friction/inertia — prototype)', () => {
    const w = flatWorld();
    const p = groundedPlayer(w);
    step(p, w, { forward: true }, 5);
    const x = p.pos.x;
    step(p, w, {}, 5);
    expect(p.vel.x).toBe(0);
    expect(p.pos.x).toBe(x);
  });

  it('cannot pass through a wall: x stops short of the face and stays there', () => {
    const w = flatWorld();
    for (let y = 5; y <= 7; y++)
      for (let z = 0; z < DIMS.sizeZ; z++) w.setBlock(12, y, z, BlockId.Rock);
    const p = groundedPlayer(w); // at x = 8.5, walking toward +x
    step(p, w, { forward: true }, 300); // 5 s — far more than needed to reach x=12
    // no epsilon in the prototype: blocked when x + hw would reach 12.0
    const face = 12 - PHYS.PLAYER_WIDTH / 2;
    expect(p.pos.x).toBeLessThan(face);
    expect(p.pos.x).toBeGreaterThan(face - PHYS.WALK_SPEED * DT);
    const stuck = p.pos.x;
    step(p, w, { forward: true }, 60);
    expect(p.pos.x).toBe(stuck);
  });
});

describe('jumping', () => {
  it('jumps only when grounded: vy = 5.2 exactly (set after gravity)', () => {
    const w = flatWorld();
    const p = groundedPlayer(w);
    step(p, w, { jump: true });
    expect(p.vel.y).toBe(PHYS.JUMP_VELOCITY);
    expect(p.onGround).toBe(false);
  });

  it('rejects a double jump: held/re-pressed jump mid-air only accumulates gravity', () => {
    const w = flatWorld();
    const p = groundedPlayer(w);
    step(p, w, { jump: true });
    step(p, w, { jump: true }); // held — prototype: Space && !onGround → no jump
    expect(p.vel.y).toBeCloseTo(PHYS.JUMP_VELOCITY + PHYS.GRAVITY * DT, 12);
    step(p, w, {}, 10);
    step(p, w, { jump: true }); // re-pressed mid-air
    expect(p.vel.y).toBeCloseTo(PHYS.JUMP_VELOCITY + 12 * PHYS.GRAVITY * DT, 12);
  });

  it('jump clears a 1-block step (low gravity: apex > 1 m)', () => {
    const w = flatWorld();
    const p = groundedPlayer(w);
    let apex = p.pos.y;
    step(p, w, { jump: true });
    for (let i = 0; i < 120; i++) {
      step(p, w, {});
      apex = Math.max(apex, p.pos.y);
    }
    expect(apex - 5).toBeGreaterThan(1); // 5.2²/(2·9.5) ≈ 1.42 m
    expect(p.onGround).toBe(true); // and lands again
  });
});

describe('fly mode', () => {
  it('toggle flips flying and zeroes all velocity (prototype KeyF)', () => {
    const w = new VoxelWorld(DIMS);
    const p = createPlayer({ x: 8.5, y: 10, z: 8.5 });
    step(p, w, {}, 5); // build up some fall speed
    expect(p.vel.y).toBeLessThan(0);
    step(p, w, { toggleFly: true });
    expect(p.flying).toBe(true);
    // velocity was zeroed at toggle; fly mode then holds vy at 0 (no keys)
    expect(p.vel.y).toBe(0);
  });

  it('ignores gravity: hovers indefinitely', () => {
    const w = new VoxelWorld(DIMS);
    const p = createPlayer({ x: 8.5, y: 10, z: 8.5 });
    p.flying = true;
    step(p, w, {}, 300);
    expect(p.pos.y).toBe(10);
    expect(p.vel.y).toBe(0);
  });

  it('vertical control: Space ascends at +10, Ctrl descends at -10, both cancel', () => {
    const w = new VoxelWorld(DIMS);
    const p = createPlayer({ x: 8.5, y: 10, z: 8.5 });
    p.flying = true;
    step(p, w, { jump: true });
    expect(p.pos.y).toBeCloseTo(10 + PHYS.FLY_VERTICAL_SPEED * DT, 12);
    step(p, w, { descend: true });
    expect(p.pos.y).toBeCloseTo(10, 12);
    step(p, w, { jump: true, descend: true });
    expect(p.pos.y).toBeCloseTo(10, 12); // 10 + (-10) = 0, prototype sums both
  });

  it('flies horizontally at 14 m/s', () => {
    const w = new VoxelWorld(DIMS);
    const p = createPlayer({ x: 8.5, y: 10, z: 8.5 }, YAW_PLUS_X, 0);
    p.flying = true;
    step(p, w, { forward: true });
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeCloseTo(PHYS.FLY_SPEED, 12);
  });

  it('descending into the ground stops the player but KEEPS fly mode (prototype)', () => {
    const w = flatWorld();
    const p = createPlayer({ x: 8.5, y: 6, z: 8.5 });
    p.flying = true;
    step(p, w, { descend: true }, 60);
    expect(p.flying).toBe(true); // landing never exits fly — only KeyF does
    expect(p.pos.y).toBe(5); // collision rollback + round snap
    expect(p.onGround).toBe(true); // quirk: downward fly collision grounds too
  });

  it('toggling fly off mid-air resumes gravity the same step', () => {
    const w = new VoxelWorld(DIMS);
    const p = createPlayer({ x: 8.5, y: 10, z: 8.5 });
    p.flying = true;
    step(p, w, { toggleFly: true });
    expect(p.flying).toBe(false);
    expect(p.vel.y).toBeCloseTo(PHYS.GRAVITY * DT, 12); // gravity applied post-toggle
  });
});

describe('world-bottom safety', () => {
  it('teleports back to spawn with zeroed velocity when y < -30', () => {
    const w = new VoxelWorld(DIMS);
    const spawn = { x: 8.5, y: 12, z: 8.5 };
    const p = createPlayer(spawn);
    p.pos.y = -31;
    p.vel.y = -20;
    step(p, w, {});
    expect(p.pos).toEqual(spawn);
    expect(p.vel).toEqual({ x: 0, y: 0, z: 0 });
    expect(p.pos).not.toBe(p.spawn); // teleport copies — spawn is never aliased
  });
});

describe('player factory', () => {
  it('uses the prototype default view angles (yaw 2.45, pitch -0.05)', () => {
    const p = createPlayer({ x: 0, y: 0, z: 0 });
    expect(p.yaw).toBe(2.45);
    expect(p.pitch).toBe(-0.05);
    expect(p.flying).toBe(false);
    expect(p.onGround).toBe(false);
  });
});
