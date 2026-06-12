/**
 * Crafting logic — GAME_DESIGN §5: Workbench recipe-list crafting ("click to
 * craft if ingredients present"), recipes unlock by chapter (§3).
 *
 * ATOMICITY: `craft` either applies the WHOLE recipe or changes nothing.
 * The output-fits check is stacking-aware and runs AFTER the inputs are
 * (virtually) consumed, so a slot freed by consuming an input counts as room
 * for the output — matching the real Workbench interaction order. This is
 * implemented by simulating take+give on a deep copy of the slots and only
 * committing the copy on full success; the inventory object (and its `slots`
 * array identity) is never replaced, only slot contents are written back.
 *
 * Pure core code: no three.js, no DOM, no clock, no randomness.
 */
import { give, take } from '../player/inventory';
import type { Inventory, ItemStack } from '../player/inventory';
import { getRecipe, RECIPES } from './recipes';
import type { Chapter, Recipe, RecipeId } from './recipes';

/** Chapters are 1..5 (GAME_DESIGN §3); reject anything else loudly. */
function assertChapter(ch: number): void {
  if (!Number.isInteger(ch) || ch < 1 || ch > 5) {
    throw new RangeError(`unlockedChapter must be an integer in [1, 5], got ${ch}`);
  }
}

/** Recipes in §5 table order — single source for availableRecipes order. */
const RECIPE_LIST: readonly Recipe[] = Object.values(RECIPES);

/**
 * Simulate the full craft on a deep copy of the slots.
 * Returns the resulting slot array on success, or null when the recipe
 * cannot be applied (missing inputs or output does not fit).
 */
function simulate(inv: Inventory, recipe: Recipe): (ItemStack | null)[] | null {
  const copy: Inventory = {
    slots: inv.slots.map((s) => (s ? { itemId: s.itemId, count: s.count } : null)),
    activeHotbarSlot: inv.activeHotbarSlot,
  };
  // Consume inputs first (frees slots for the output).
  for (const inp of recipe.inputs) {
    if (take(copy, inp.itemId, inp.count) !== inp.count) return null;
  }
  // Then the output must fit completely (stacking-aware via give()).
  if (give(copy, recipe.output.itemId, recipe.output.count) !== 0) return null;
  return copy.slots;
}

/**
 * True when `recipeId` is unlocked at `unlockedChapter`, all inputs are
 * present, and the output fits after consuming them. Never mutates `inv`.
 */
export function canCraft(inv: Inventory, recipeId: RecipeId, unlockedChapter: Chapter): boolean {
  assertChapter(unlockedChapter);
  const recipe = getRecipe(recipeId);
  if (unlockedChapter < recipe.unlockChapter) return false;
  return simulate(inv, recipe) !== null;
}

/**
 * Atomically craft `recipeId`: take all inputs, give the output. Returns
 * true on success; on any failure (locked chapter, missing inputs, output
 * would not fit) returns false WITHOUT consuming anything.
 */
export function craft(inv: Inventory, recipeId: RecipeId, unlockedChapter: Chapter): boolean {
  assertChapter(unlockedChapter);
  const recipe = getRecipe(recipeId);
  if (unlockedChapter < recipe.unlockChapter) return false;
  const result = simulate(inv, recipe);
  if (result === null) return false;
  for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = result[i] ?? null;
  return true;
}

/**
 * All recipes unlocked at `unlockedChapter`, in §5 table order (the
 * Workbench UI lists them in this order regardless of craftability).
 */
export function availableRecipes(unlockedChapter: Chapter): Recipe[] {
  assertChapter(unlockedChapter);
  return RECIPE_LIST.filter((r) => r.unlockChapter <= unlockedChapter);
}
