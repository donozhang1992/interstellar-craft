// Spec: TECH_SPEC §2 (src/core/physics: AABB collision) — M0 parity port of
// prototype/index.html `collides()` + the per-axis move/rollback loop inside
// `movePlayer()`.
//
// Documented port semantics (prototype parity — quirks preserved on purpose):
//  - the player AABB is feet-anchored: pos is the FEET center, the box spans
//    [pos - hw, pos + hw] on x/z and [pos.y, pos.y + height] on y;
//  - voxel overlap test is `Math.floor` over both corners INCLUSIVE — there is
//    NO epsilon anywhere in the prototype's collision code;
//  - axis resolution order is x → y → z; a colliding axis move is rolled back
//    to the pre-move coordinate (no clamping to the block face);
//  - y-axis quirk: after a y collision `vel.y` is zeroed FIRST, so the snap
//    line `pos.y = vel.y <= 0 ? Math.round(pos.y) : pos.y` ALWAYS rounds —
//    even on a ceiling bump, the player snaps to the nearest integer y
//    (rolled back again if the rounded spot collides). Ported verbatim.
import { describe, expect, it } from 'vitest';
import { collidesAt, resolveMovement } from '../../../src/core/physics/aabb';
import type { KinematicBody } from '../../../src/core/physics/aabb';
import { BlockId } from '../../../src/core/world/blocks';
import { VoxelWorld } from '../../../src/core/world/voxelWorld';

const DIMS = { sizeX: 32, sizeY: 32, sizeZ: 32 };
const DT = 1 / 60;
const HW = 0.3; // prototype player.w / 2
const H = 1.8; // prototype player.h

function worldWith(...blocks: [number, number, number][]): VoxelWorld {
  const w = new VoxelWorld(DIMS);
  for (const [x, y, z] of blocks) w.setBlock(x, y, z, BlockId.Rock);
  return w;
}

function body(x: number, y: number, z: number, vx = 0, vy = 0, vz = 0): KinematicBody {
  return { pos: { x, y, z }, vel: { x: vx, y: vy, z: vz }, onGround: false };
}

describe('collidesAt (prototype collides())', () => {
  it('is free in an empty world', () => {
    expect(collidesAt(new VoxelWorld(DIMS), { x: 5.5, y: 5, z: 5.5 }, HW, H)).toBe(false);
  });

  it('detects a solid voxel overlapping the feet', () => {
    const w = worldWith([5, 5, 5]);
    expect(collidesAt(w, { x: 5.5, y: 5.5, z: 5.5 }, HW, H)).toBe(true);
  });

  it('detects a solid voxel overlapping only the head (pos.y + height, inclusive)', () => {
    const w = worldWith([5, 7, 5]);
    // feet at 5.3 → head top at 7.1 → floor(7.1) = 7 overlaps the block
    expect(collidesAt(w, { x: 5.5, y: 5.3, z: 5.5 }, HW, H)).toBe(true);
    // feet at 5.0 → head top at 6.8 → no overlap with y=7
    expect(collidesAt(w, { x: 5.5, y: 5.0, z: 5.5 }, HW, H)).toBe(false);
  });

  it('half-extent edges are inclusive via floor (x + hw exactly on a face collides)', () => {
    const w = worldWith([7, 5, 5]);
    // x = 6.7 → x + 0.3 = 7.0 → floor = 7 → collides (no epsilon in the prototype)
    expect(collidesAt(w, { x: 6.7, y: 5, z: 5.5 }, HW, H)).toBe(true);
    expect(collidesAt(w, { x: 6.69, y: 5, z: 5.5 }, HW, H)).toBe(false);
  });
});

describe('resolveMovement (prototype per-axis move + rollback)', () => {
  it('falling onto ground zeroes vy, sets onGround, and snaps feet to integer y', () => {
    const w = worldWith([5, 4, 5]); // ground block: top face at y = 5
    const b = body(5.5, 5.05, 5.5, 0, -6, 0); // moving down 0.1/step → 4.95 (inside ground)
    resolveMovement(w, b, DT, HW, H);
    expect(b.onGround).toBe(true);
    expect(b.vel.y).toBe(0);
    expect(b.pos.y).toBe(5); // Math.round snap quirk
  });

  it('walking into a wall rolls x back to the pre-move coordinate (no face clamp)', () => {
    const w = worldWith([7, 5, 5], [7, 6, 5]); // wall column at x=7 covering player height
    const b = body(6.65, 5, 5.5, 5, 0, 0); // next step would put x+hw past 7.0
    resolveMovement(w, b, DT, HW, H);
    expect(b.pos.x).toBe(6.65); // rolled back, NOT clamped to 6.7
    expect(b.onGround).toBe(false); // x collisions never set onGround
  });

  it('ceiling bump zeroes upward velocity (and snaps down to integer y — quirk)', () => {
    const w = worldWith([5, 8, 5]); // ceiling: bottom face at y = 8
    const b = body(5.5, 6.15, 5.5, 0, 5, 0); // head at 7.95, moving up
    resolveMovement(w, b, DT, HW, H);
    expect(b.vel.y).toBe(0);
    // quirk: vel.y is zeroed before the snap test, so the <= 0 branch always
    // rounds — the bump teleports the player DOWN to y = 6. Preserved verbatim.
    expect(b.pos.y).toBe(6);
    expect(b.onGround).toBe(false); // only downward y collisions ground the player
  });

  it('rolls the snap back when the rounded y also collides (overlap-start edge case)', () => {
    // head already inside block (5,7,5); round(5.7) = 6 lands inside (5,6,5)
    const w = worldWith([5, 7, 5], [5, 6, 5]);
    const b = body(5.5, 5.7, 5.5, 0, 5, 0);
    resolveMovement(w, b, DT, HW, H);
    expect(b.vel.y).toBe(0);
    expect(b.pos.y).toBe(5.7); // round(5.7) = 6 collides → revert to the pre-move y
  });

  it('diagonal move into a corner resolves both axes without tunneling', () => {
    // inside corner: blocks at (7, *, 6) and (6, *, 7); player in cell (6, 6)
    const w = worldWith([7, 5, 6], [7, 6, 6], [6, 5, 7], [6, 6, 7]);
    const b = body(6.65, 5, 6.65, 5, 0, 5);
    for (let i = 0; i < 20; i++) resolveMovement(w, b, DT, HW, H);
    // both axes are blocked independently; the player never enters either block
    expect(b.pos.x).toBe(6.65);
    expect(b.pos.z).toBe(6.65);
    expect(collidesAt(w, b.pos, HW, H)).toBe(false);
  });

  it('repeated wall pushes never tunnel through at walk speed', () => {
    const w = worldWith([7, 5, 5], [7, 6, 5]);
    const b = body(5.5, 5, 5.5, 5, 0, 0);
    for (let i = 0; i < 120; i++) resolveMovement(w, b, DT, HW, H);
    // stops within one sub-step of the face (no epsilon: x + hw < 7.0 strictly)
    expect(b.pos.x).toBeLessThan(6.7);
    expect(b.pos.x).toBeGreaterThan(6.7 - 5 * DT);
  });
});
