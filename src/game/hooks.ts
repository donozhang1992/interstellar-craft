/**
 * Test hooks — TECH_SPEC §3 `window.__game`, installed only in dev/test builds
 * (`import.meta.env.DEV || VITE_TEST_HOOKS=1`). Playwright drives the game
 * exclusively through these + real key events.
 *
 * M1 scope notes:
 *  - `give(itemId, count)` (TECH_SPEC §3) is live: adds to the REAL player
 *    inventory via the core fill rules, returns the overflow (0 = all fit).
 *    Unknown item ids throw RangeError (loud test failures, no silent no-op).
 *  - `craft(recipeId)` crafts atomically at the M1 free-crafting chapter
 *    (chapters.ts UNLOCKED_CHAPTER = 5); returns the core craft() boolean.
 *  - `setQuest(chapterId, stepId)` is still NOT exposed (M3 quest engine).
 *  - `setInput` semantics: `toggleFly` / `place: true` queue exactly one
 *    action consumed by the next stepped frame; `mine` and the movement
 *    booleans are HELD until overwritten (mine = LMB hold-to-mine);
 *    `slot` selects a hotbar slot 0–7 immediately.
 *  - `stepFrames` respects the crafting-overlay pause (loop.ts): with the
 *    overlay open the steps are no-ops (the sim is frozen) but it still
 *    renders once.
 */
import type { PlayerState } from '../core/player/movement';
import type { VoxelWorld } from '../core/world/voxelWorld';
import { give, type Inventory } from '../core/player/inventory';
import { isItemId } from '../core/items/catalog';
import { craft } from '../core/crafting/craft';
import { isRecipeId } from '../core/crafting/recipes';
import { UNLOCKED_CHAPTER } from './chapters';
import type { InputPartial } from './input';
import type { Game } from './loop';

export interface GameHooks {
  READY: boolean;
  state?: {
    player: PlayerState;
    world: VoxelWorld;
    /** Live player inventory (40 slots; 0–7 = hotbar). */
    inv: Inventory;
  };
  /** Advance n fixed 1/60 s steps synchronously, then render once. */
  stepFrames?(n: number): void;
  /** Hold/queue inputs programmatically (see edge semantics above). */
  setInput?(partial: InputPartial): void;
  /** Set player position (+ optional view angles), zeroing velocity. */
  teleport?(x: number, y: number, z: number, yaw?: number, pitch?: number): void;
  /** Add items to the live inventory (TECH_SPEC §3). Returns the overflow. */
  give?(itemId: string, count: number): number;
  /** Atomic craft at the M1 free-crafting chapter. Returns success. */
  craft?(recipeId: string): boolean;
  /** Single deterministic render of current state (no rAF, no sim step). */
  renderOnce?(): void;
  /** Draw calls of the most recent render (`renderer.info.render.calls`) — M0.5 perf probe. */
  drawCalls?(): number;
}

export function installHooks(game: Game): GameHooks {
  const hooks: GameHooks = {
    READY: false,
    state: { player: game.player, world: game.world, inv: game.inv },
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
    give: (itemId: string, count: number) => {
      if (!isItemId(itemId)) throw new RangeError(`give: unknown item id: ${itemId}`);
      return give(game.inv, itemId, count);
    },
    craft: (recipeId: string) => {
      if (!isRecipeId(recipeId)) throw new RangeError(`craft: unknown recipe id: ${recipeId}`);
      return craft(game.inv, recipeId, UNLOCKED_CHAPTER);
    },
    renderOnce: () => game.renderFrame(),
    drawCalls: () => game.scene.renderer.info.render.calls,
  };
  window.__game = hooks;
  return hooks;
}
