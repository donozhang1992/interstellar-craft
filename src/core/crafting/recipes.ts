/**
 * Recipe table — GAME_DESIGN §5 (CANONICAL recipe list), unlock chapters from
 * §3 ("Unlocks" column) plus the explicit per-row notes in §4 ("craftable
 * chN+") and §7 ("Magnet Glove craftable ch3").
 *
 * ID-mapping decisions (documented per recipe below):
 *  - §5 names raw resources by ore/block name; those map to the placeable
 *    block items of the catalog: "iron" = 'block:7' (iron_ore), "copper" =
 *    'block:8', "hull" = 'block:9', "crystal" = 'block:4', "ice" = 'block:5',
 *    "basalt" = 'block:3', "lamp" = 'block:6', "glass" = 'block:10'.
 *  - "glass" and "lamp" have no separate material item — their recipes OUTPUT
 *    the block items 'block:10' / 'block:6' directly.
 *  - fusion_igniter consumes the beacon-core BLOCK item 'block:12' (the same
 *    item the beacon_core recipe outputs).
 *  - §5 gives no output counts → every recipe outputs exactly 1 (flagged to
 *    control plane as an open question).
 *  - Chapter fallback: a recipe not named by §3/§4/§7 and without a crystal
 *    input defaults to chapter 1 (drill_mk2, solar_panel, o2_canister, flare).
 *
 * Pure data + lookup helpers; crafting logic lives in ./craft.ts.
 */
import type { ItemId } from '../items/catalog';

/** Story chapters (GAME_DESIGN §3). */
export type Chapter = 1 | 2 | 3 | 4 | 5;

/** One side of a recipe: an item id and how many. */
export interface RecipeIO {
  readonly itemId: ItemId;
  readonly count: number;
}

export interface Recipe {
  readonly id: string;
  readonly output: RecipeIO;
  readonly inputs: readonly RecipeIO[];
  /** First chapter (inclusive) in which this recipe can be crafted. */
  readonly unlockChapter: Chapter;
}

export const RECIPES = {
  // ── Tools (§5) ───────────────────────────────────────────────────────────
  /** §5: Drill Mk1 (3 hull + 2 iron). §3 ch1 unlocks "Workbench, Drill Mk1". */
  drill_mk1: {
    id: 'drill_mk1',
    output: { itemId: 'drill_mk1', count: 1 },
    inputs: [
      { itemId: 'block:9', count: 3 },
      { itemId: 'block:7', count: 2 },
    ],
    unlockChapter: 1,
  },
  /** §5: Drill Mk2 (1 Mk1 + 4 iron + 2 copper). Unlisted in §3 → default ch1. */
  drill_mk2: {
    id: 'drill_mk2',
    output: { itemId: 'drill_mk2', count: 1 },
    inputs: [
      { itemId: 'drill_mk1', count: 1 },
      { itemId: 'block:7', count: 4 },
      { itemId: 'block:8', count: 2 },
    ],
    unlockChapter: 1,
  },
  /** §5: Plasma Drill (1 Mk2 + 6 crystal + 2 copper). Crystal input → §3 ch3 "crystal recipes". */
  plasma_drill: {
    id: 'plasma_drill',
    output: { itemId: 'plasma_drill', count: 1 },
    inputs: [
      { itemId: 'drill_mk2', count: 1 },
      { itemId: 'block:4', count: 6 },
      { itemId: 'block:8', count: 2 },
    ],
    unlockChapter: 3,
  },
  // ── Equipment (§5/§7) ────────────────────────────────────────────────────
  /** §5: Scanner (2 copper + 1 glass + 1 crystal). §3 ch2 unlocks "Scanner" explicitly. */
  scanner: {
    id: 'scanner',
    output: { itemId: 'scanner', count: 1 },
    inputs: [
      { itemId: 'block:8', count: 2 },
      { itemId: 'block:10', count: 1 },
      { itemId: 'block:4', count: 1 },
    ],
    unlockChapter: 2,
  },
  /** §5: Jump Pack (4 hull + 3 copper + 2 crystal). §3 ch3 unlocks "Jump pack". */
  jump_pack: {
    id: 'jump_pack',
    output: { itemId: 'jump_pack', count: 1 },
    inputs: [
      { itemId: 'block:9', count: 4 },
      { itemId: 'block:8', count: 3 },
      { itemId: 'block:4', count: 2 },
    ],
    unlockChapter: 3,
  },
  /** §5: Magnet Glove (2 iron + 3 copper). §7: "craftable ch3". */
  magnet_glove: {
    id: 'magnet_glove',
    output: { itemId: 'magnet_glove', count: 1 },
    inputs: [
      { itemId: 'block:7', count: 2 },
      { itemId: 'block:8', count: 3 },
    ],
    unlockChapter: 3,
  },
  /** §5: Solar Panel (3 glass + 2 copper + 1 iron). Unlisted in §3 → default ch1. */
  solar_panel: {
    id: 'solar_panel',
    output: { itemId: 'solar_panel', count: 1 },
    inputs: [
      { itemId: 'block:10', count: 3 },
      { itemId: 'block:8', count: 2 },
      { itemId: 'block:7', count: 1 },
    ],
    unlockChapter: 1,
  },
  // ── Consumables (§5) ─────────────────────────────────────────────────────
  /** §5: O₂ Canister (2 ice + 1 iron). Unlisted in §3 → default ch1. */
  o2_canister: {
    id: 'o2_canister',
    output: { itemId: 'o2_canister', count: 1 },
    inputs: [
      { itemId: 'block:5', count: 2 },
      { itemId: 'block:7', count: 1 },
    ],
    unlockChapter: 1,
  },
  /** §5: Flare (1 lamp + 1 copper). Lamp input is the block item, not crystal → default ch1. */
  flare: {
    id: 'flare',
    output: { itemId: 'flare', count: 1 },
    inputs: [
      { itemId: 'block:6', count: 1 },
      { itemId: 'block:8', count: 1 },
    ],
    unlockChapter: 1,
  },
  // ── Materials (§5) ───────────────────────────────────────────────────────
  /** §5: Iron Plate (2 iron_ore). Basic material → ch1. */
  iron_plate: {
    id: 'iron_plate',
    output: { itemId: 'iron_plate', count: 1 },
    inputs: [{ itemId: 'block:7', count: 2 }],
    unlockChapter: 1,
  },
  /** §5: Glass (2 ice, Workbench "smelt"). Outputs the glass BLOCK item → ch1. */
  glass: {
    id: 'glass',
    output: { itemId: 'block:10', count: 1 },
    inputs: [{ itemId: 'block:5', count: 2 }],
    unlockChapter: 1,
  },
  /** §5: Hull Plate (2 iron_plate + 1 basalt). Basic material → ch1. */
  hull_plate: {
    id: 'hull_plate',
    output: { itemId: 'hull_plate', count: 1 },
    inputs: [
      { itemId: 'iron_plate', count: 2 },
      { itemId: 'block:3', count: 1 },
    ],
    unlockChapter: 1,
  },
  /** §5: Lamp (2 crystal + 1 copper). Outputs the lamp BLOCK item; crystal input → ch3. */
  lamp: {
    id: 'lamp',
    output: { itemId: 'block:6', count: 1 },
    inputs: [
      { itemId: 'block:4', count: 2 },
      { itemId: 'block:8', count: 1 },
    ],
    unlockChapter: 3,
  },
  // ── Quest (§5) ───────────────────────────────────────────────────────────
  /** §5: Antenna Block (2 iron_plate + 1 copper) → block 11. §4: "craftable ch2+". */
  antenna: {
    id: 'antenna',
    output: { itemId: 'block:11', count: 1 },
    inputs: [
      { itemId: 'iron_plate', count: 2 },
      { itemId: 'block:8', count: 1 },
    ],
    unlockChapter: 2,
  },
  /** §5: Beacon Core (4 iron_plate + 4 crystal) → block 12. §4: "craftable ch4+". */
  beacon_core: {
    id: 'beacon_core',
    output: { itemId: 'block:12', count: 1 },
    inputs: [
      { itemId: 'iron_plate', count: 4 },
      { itemId: 'block:4', count: 4 },
    ],
    unlockChapter: 4,
  },
  /** §5: Launchpad Block (2 hull + 2 basalt) → block 13. §4: "craftable ch4+". */
  launchpad: {
    id: 'launchpad',
    output: { itemId: 'block:13', count: 1 },
    inputs: [
      { itemId: 'block:9', count: 2 },
      { itemId: 'block:3', count: 2 },
    ],
    unlockChapter: 4,
  },
  /** §5: Fusion Igniter (2 beacon_core + 4 crystal + 2 copper). §3 ch4 unlocks "Fusion igniter". */
  fusion_igniter: {
    id: 'fusion_igniter',
    output: { itemId: 'fusion_igniter', count: 1 },
    inputs: [
      { itemId: 'block:12', count: 2 },
      { itemId: 'block:4', count: 4 },
      { itemId: 'block:8', count: 2 },
    ],
    unlockChapter: 4,
  },
} as const satisfies Record<string, Recipe>;

/** Every valid recipe id (compile-time union of the table keys). */
export type RecipeId = keyof typeof RECIPES;

/** Runtime guard for strings from saves/UI. */
export function isRecipeId(id: string): id is RecipeId {
  return Object.prototype.hasOwnProperty.call(RECIPES, id);
}

/** Look up a recipe; throws RangeError on an unknown id. */
export function getRecipe(id: RecipeId): Recipe {
  const recipe = (RECIPES as Record<string, Recipe>)[id];
  if (recipe === undefined) throw new RangeError(`unknown recipe id: ${id}`);
  return recipe;
}
