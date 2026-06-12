/**
 * Player movement integration — M0 parity port of prototype/index.html
 * `movePlayer(dt)` + the player object + the KeyF fly toggle.
 * Pure logic, fixed dt = 1/60 assumed by the game loop (TECH_SPEC §2):
 * same input sequence ⇒ identical trajectory (snapshot-tested).
 *
 * Prototype semantics preserved exactly:
 *  - DIRECT velocity control, no acceleration/friction: horizontal velocity is
 *    overwritten every step from the normalized input direction × speed;
 *  - move direction comes from yaw only (pitch is view-only);
 *  - gravity is applied BEFORE the jump check, so a jump leaves with vy = 5.2
 *    exactly; jumping requires onGround;
 *  - fly mode skips gravity and sets vy directly to (+10 Space) + (−10 Ctrl);
 *    the toggle flips the flag and zeroes ALL velocity (prototype KeyF
 *    keydown); landing never exits fly mode — only the toggle does;
 *  - world-bottom safety: pos.y < −30 after integration → teleport to spawn
 *    with zeroed velocity (prototype "掉出世界传送回来").
 */
import { collidesAt, resolveMovement } from '../physics/aabb';
import type { SolidQuery, Vec3 } from '../physics/aabb';

export type { SolidQuery, Vec3 };
export { collidesAt };

/**
 * ALL movement constants, verbatim from prototype/index.html (M0 = prototype
 * parity). The GAME_DESIGN §12 numbers replace these in M2 — do NOT mix them
 * in early.
 */
export const PHYS = {
  /** m/s² — 低重力星球 (low-gravity planet). Prototype `GRAVITY`. */
  GRAVITY: -9.5,
  /** m/s upward, applied only when onGround. Prototype `JUMP`. */
  JUMP_VELOCITY: 5.2,
  /** m/s, default ground speed. */
  WALK_SPEED: 5,
  /** m/s while Shift is held. */
  SPRINT_SPEED: 8.5,
  /** m/s horizontal in fly mode. */
  FLY_SPEED: 14,
  /** m/s vertical in fly mode (Space = +, Ctrl = −; they sum). */
  FLY_VERTICAL_SPEED: 10,
  /** Player AABB footprint (prototype `player.w`). */
  PLAYER_WIDTH: 0.6,
  /** Player AABB height (prototype `player.h`). */
  PLAYER_HEIGHT: 1.8,
  /** Camera eye height above the feet (prototype `player.eye`). */
  EYE_HEIGHT: 1.62,
  /** Falling below this y teleports the player back to spawn. */
  WORLD_BOTTOM_Y: -30,
  /** Prototype initial view angles. */
  DEFAULT_YAW: 2.45,
  DEFAULT_PITCH: -0.05,
  /** Fixed simulation step (TECH_SPEC §2) — the dt every test assumes. */
  FIXED_DT: 1 / 60,
} as const;

export interface PlayerState {
  /** Feet-center position (the AABB is feet-anchored, see physics/aabb.ts). */
  pos: Vec3;
  vel: Vec3;
  /** View angles; only yaw drives the move direction (prototype). */
  yaw: number;
  pitch: number;
  onGround: boolean;
  flying: boolean;
  /** World-bottom respawn point (prototype re-derives it from the heightmap). */
  spawn: Vec3;
}

/** One step's held inputs. `toggleFly` is EDGE-triggered (prototype KeyF keydown). */
export interface MoveInput {
  forward?: boolean;
  back?: boolean;
  left?: boolean;
  right?: boolean;
  /** Space: jump when grounded, ascend in fly mode. */
  jump?: boolean;
  /** Ctrl: descend in fly mode (no effect when walking). */
  descend?: boolean;
  /** Shift: sprint (walking only — fly speed is fixed). */
  sprint?: boolean;
  /** Flip fly mode and zero all velocity. Send only on the key-DOWN edge. */
  toggleFly?: boolean;
}

/** Build a fresh player at `spawn` (copied, never aliased). */
export function createPlayer(
  spawn: Vec3,
  yaw: number = PHYS.DEFAULT_YAW,
  pitch: number = PHYS.DEFAULT_PITCH,
): PlayerState {
  return {
    pos: { ...spawn },
    vel: { x: 0, y: 0, z: 0 },
    yaw,
    pitch,
    onGround: false,
    flying: false,
    spawn: { ...spawn },
  };
}

/**
 * Advance the player one fixed step. Mutates `player` only; pure otherwise
 * (no clock, no randomness) — same inputs ⇒ identical trajectory.
 */
export function stepPlayer(
  player: PlayerState,
  world: SolidQuery,
  input: MoveInput,
  dt: number,
): void {
  // KeyF toggle (prototype handles this on keydown, before the next movePlayer)
  if (input.toggleFly) {
    player.flying = !player.flying;
    player.vel.x = 0;
    player.vel.y = 0;
    player.vel.z = 0;
  }

  const speed = player.flying ? PHYS.FLY_SPEED : input.sprint ? PHYS.SPRINT_SPEED : PHYS.WALK_SPEED;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  let fx = 0;
  let fz = 0;
  if (input.forward) {
    fx -= sin;
    fz -= cos;
  }
  if (input.back) {
    fx += sin;
    fz += cos;
  }
  if (input.left) {
    fx -= cos;
    fz += sin;
  }
  if (input.right) {
    fx += cos;
    fz -= sin;
  }
  const len = Math.hypot(fx, fz) || 1;
  player.vel.x = (fx / len) * speed;
  player.vel.z = (fz / len) * speed;

  if (player.flying) {
    player.vel.y =
      (input.jump ? PHYS.FLY_VERTICAL_SPEED : 0) + (input.descend ? -PHYS.FLY_VERTICAL_SPEED : 0);
  } else {
    player.vel.y += PHYS.GRAVITY * dt;
    if (input.jump && player.onGround) {
      player.vel.y = PHYS.JUMP_VELOCITY;
      player.onGround = false;
    }
  }

  resolveMovement(world, player, dt, PHYS.PLAYER_WIDTH / 2, PHYS.PLAYER_HEIGHT);

  // 掉出世界传送回来 — fell out of the world: teleport back to spawn
  if (player.pos.y < PHYS.WORLD_BOTTOM_Y) {
    player.pos = { ...player.spawn };
    player.vel = { x: 0, y: 0, z: 0 };
  }
}
