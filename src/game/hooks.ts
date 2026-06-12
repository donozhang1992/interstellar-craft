/**
 * Test hooks — TECH_SPEC §3 `window.__game`, installed only in dev/test builds
 * (`import.meta.env.DEV || VITE_TEST_HOOKS=1`). Playwright drives the game
 * exclusively through these + real key events.
 *
 * M0 scope notes:
 *  - `give(itemId, count)` and `setQuest(chapterId, stepId)` are NOT exposed —
 *    there is no inventory or quest system in M0 (they land in M1/M3).
 *  - `setInput` edge semantics: `toggleFly` / `mine` / `place: true` queue
 *    exactly one action consumed by the next stepped frame; movement booleans
 *    are held until overwritten; `slot` selects a hotbar slot immediately.
 */
import type { PlayerState } from '../core/player/movement';
import type { VoxelWorld } from '../core/world/voxelWorld';
import type { InputPartial } from './input';
import type { Game } from './loop';

export interface GameHooks {
  READY: boolean;
  state?: {
    player: PlayerState;
    world: VoxelWorld;
  };
  /** Advance n fixed 1/60 s steps synchronously, then render once. */
  stepFrames?(n: number): void;
  /** Hold/queue inputs programmatically (see edge semantics above). */
  setInput?(partial: InputPartial): void;
  /** Set player position (+ optional view angles), zeroing velocity. */
  teleport?(x: number, y: number, z: number, yaw?: number, pitch?: number): void;
  /** Single deterministic render of current state (no rAF, no sim step). */
  renderOnce?(): void;
}

export function installHooks(game: Game): GameHooks {
  const hooks: GameHooks = {
    READY: false,
    state: { player: game.player, world: game.world },
    stepFrames: (n: number) => game.stepFrames(n),
    setInput: (partial: InputPartial) => game.input.setInput(partial),
    teleport: (x: number, y: number, z: number, yaw?: number, pitch?: number) => {
      const p = game.player;
      p.pos = { x, y, z };
      p.vel = { x: 0, y: 0, z: 0 };
      p.onGround = false;
      if (yaw !== undefined) p.yaw = yaw;
      if (pitch !== undefined) p.pitch = pitch;
    },
    renderOnce: () => game.renderFrame(),
  };
  window.__game = hooks;
  return hooks;
}
