/**
 * AABB player-vs-voxel collision — M0 parity port of prototype/index.html
 * `collides()` and the per-axis move/rollback loop inside `movePlayer()`.
 * Pure logic: no three.js, no DOM, no randomness (TECH_SPEC §2).
 *
 * Ported VERBATIM, quirks included:
 *  - the body is feet-anchored: `pos` is the feet center; the box spans
 *    [pos − hw, pos + hw] on x/z and [pos.y, pos.y + height] on y;
 *  - the voxel overlap test floors BOTH corners inclusively — the prototype
 *    has NO epsilon anywhere in its collision code;
 *  - axis resolution order is x → y → z; a colliding axis move is rolled back
 *    to the pre-move coordinate (rollback, not clamp-to-face);
 *  - y-snap quirk: on a y collision, `vel.y` is zeroed BEFORE the snap test
 *    `vel.y <= 0 ? Math.round(pos.y) : pos.y`, so the round branch ALWAYS
 *    runs — a ceiling bump also snaps the player to the nearest integer y
 *    (rolled back again if the rounded spot collides). The approved game feel
 *    was tuned with this behavior; do not "fix" it (AGENT_RULES §5).
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Minimal world surface the physics needs — VoxelWorld satisfies it structurally. */
export interface SolidQuery {
  isSolid(x: number, y: number, z: number): boolean;
}

/** Mutable kinematic state shared by the player (and later entities). */
export interface KinematicBody {
  pos: Vec3;
  vel: Vec3;
  onGround: boolean;
}

const AXES: readonly ['x', 'y', 'z'] = ['x', 'y', 'z'];

/**
 * True if the feet-anchored AABB at `pos` overlaps any solid voxel.
 * Port of prototype `collides(pos)` (hw = player.w / 2, height = player.h).
 */
export function collidesAt(
  world: SolidQuery,
  pos: Vec3,
  halfWidth: number,
  height: number,
): boolean {
  const x0 = Math.floor(pos.x - halfWidth);
  const x1 = Math.floor(pos.x + halfWidth);
  const y0 = Math.floor(pos.y);
  const y1 = Math.floor(pos.y + height);
  const z0 = Math.floor(pos.z - halfWidth);
  const z1 = Math.floor(pos.z + halfWidth);
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) if (world.isSolid(x, y, z)) return true;
  return false;
}

/**
 * Integrate `body.vel` over `dt` with per-axis collision rollback.
 * Port of the prototype's `for (const axis of ['x','y','z'])` loop —
 * clears `onGround` first; only a downward y collision re-grounds the body.
 */
export function resolveMovement(
  world: SolidQuery,
  body: KinematicBody,
  dt: number,
  halfWidth: number,
  height: number,
): void {
  body.onGround = false;
  for (const axis of AXES) {
    const old = body.pos[axis];
    body.pos[axis] += body.vel[axis] * dt;
    if (collidesAt(world, body.pos, halfWidth, height)) {
      if (axis === 'y') {
        if (body.vel.y < 0) body.onGround = true;
        body.vel.y = 0;
      }
      body.pos[axis] = old;
      // 贴墙微调 — landing/wall-hug smoothing snap (see y-snap quirk above:
      // vel.y is already 0 here, so the round branch always runs on y hits)
      if (axis === 'y') {
        body.pos.y = body.vel[axis] <= 0 ? Math.round(body.pos.y) : body.pos.y;
        if (collidesAt(world, body.pos, halfWidth, height)) body.pos.y = old;
      }
    }
  }
}
