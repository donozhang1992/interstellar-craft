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
import { SURVIVAL, type SurvivalState } from '../core/player/stats';
import type { QuestState } from '../core/quest/engine';
import type { DeathCache } from './survival';
import { UNLOCKED_CHAPTER } from './chapters';
import type { InputPartial } from './input';
import type { Game } from './loop';
import { isSaveError } from '../core/save/serialize';
import {
  gameSave,
  gameLoad,
  hasSave as hasSaveFn,
  clearSave as clearSaveFn,
  exportSaveFile,
} from './saveService';

/** Which survival stat `setStat` targets. */
export type SurvivalStat = 'hp' | 'o2' | 'energy';

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
  /** Live survival state (hp/o2/energy). NOTE: respawn REPLACES the object — read fresh. */
  survival?(): SurvivalState;
  /** Force a stat to an exact value (clamped 0..max). Test helper (M2.4 death loop). */
  setStat?(stat: SurvivalStat, value: number): void;
  /** Subtract n HP (clamped ≥ 0). Convenience over setStat for damage scripts. */
  damage?(n: number): void;
  /** The recoverable death-drop caches (M2.3 §12 ④). Live array reference. */
  caches?(): DeathCache[];
  /** Use one O₂ canister (+40, clamped); returns whether one was consumed. */
  useCanister?(): boolean;
  /** Place a flare (60 s emissive marker at the feet); returns the voxel or null. */
  useFlare?(): { x: number; y: number; z: number } | null;
  /** Live quest state (chapter/step/flags/counters/unlocked). M3.3 — read fresh. */
  quest?(): QuestState;
  /** Current quest objective HUD string (currentObjective). M3.3. */
  questObjective?(): string;
  /** Raise a quest flag from a test (salvaged/antennaBuilt/…). M3.4 driver. */
  setFlag?(name: string): void;
  /** Add n (default 1) to a quest counter from a test. M3.4 driver. */
  addCounter?(key: string, n?: number): void;
  /** Wrecked-drone state (pos + repaired). M4.3a — read fresh each call. */
  drone?(): { pos: [number, number, number]; repaired: boolean };
  /** Attempt to repair the wrecked drone in reach (2 copper + 1 crystal). M4.3a. */
  repairDrone?(): boolean;
  /** ch5 [E] charge: insert 1 crystal into the beacon in reach. Returns success. M4.3b. */
  chargeBeacon?(): boolean;
  /** ch5 [E] ignite: ignite the fully-charged beacon in reach. Returns success. M4.3b. */
  igniteBeacon?(): boolean;
  /** Current beacon charge 0..8 (ctx.counters.beaconCharge). M4.3b. */
  beaconCharge?(): number;
  /** True once ch5 free_mode unlocked (creative kit + flight blessing). M4.3b. */
  freeMode?(): boolean;
  /** Manually fire the ending cinematic (skip-testing) — installed by main.ts. M4.3b. */
  playEnding?(): void;
  /** Ending-sequence state, or null if the controller is not installed. M4.3b. */
  ending?(): { active: boolean; done: boolean } | null;
  /** Skip/dismiss the ending cinematic if playing — installed by main.ts. M4.3b. */
  skipEnding?(): void;
  // M5.1 save hooks
  /** Serialize game state and write to localStorage. */
  save?(): void;
  /** Load from localStorage and restore state. Returns false if no save or error. */
  load?(): boolean;
  /** True if localStorage has a save. */
  hasSave?(): boolean;
  /** Remove the localStorage save. */
  clearSave?(): void;
  /** Download the save as a JSON file. */
  exportSave?(): void;
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
    survival: () => game.survival.state,
    setStat: (stat: SurvivalStat, value: number) => {
      const max =
        stat === 'hp' ? SURVIVAL.HP_MAX : stat === 'o2' ? SURVIVAL.O2_MAX : SURVIVAL.ENERGY_MAX;
      game.survival.state[stat] = Math.max(0, Math.min(max, value));
    },
    damage: (n: number) => {
      game.survival.state.hp = Math.max(0, game.survival.state.hp - n);
    },
    caches: () => game.survival.caches,
    useCanister: () => game.survival.useCanister(),
    useFlare: () => game.survival.useFlare(),
    quest: () => game.quest.state,
    questObjective: () => game.quest.objective(),
    setFlag: (name: string) => game.quest.raiseFlag(name),
    addCounter: (key: string, n = 1) => game.quest.addCounter(key, n),
    drone: () => ({
      pos: [...game.drone.pos] as [number, number, number],
      repaired: game.drone.repaired,
    }),
    repairDrone: () => game.repairWreckedDrone(),
    chargeBeacon: () => game.chargeBeacon(),
    igniteBeacon: () => game.igniteBeacon(),
    beaconCharge: () => game.beaconCharge(),
    freeMode: () => game.freeMode,
    // playEnding / ending / skipEnding are installed by main.ts (outside __TEST__)
    // when the ending controller exists; left undefined under the baseline harness.
    // M5.1 save hooks
    save: () => gameSave(game),
    load: () => {
      const result = gameLoad();
      if (isSaveError(result)) return false;
      game.load(result);
      return true;
    },
    hasSave: () => hasSaveFn(),
    clearSave: () => clearSaveFn(),
    exportSave: () => exportSaveFile(game),
  };
  window.__game = hooks;
  return hooks;
}
