// Spec: GAME_DESIGN §5 (Workbench recipe-list crafting: "click to craft if
// ingredients present", recipes unlock by chapter) + M1 exit criterion
// "every §5 recipe unit-tested".
//
// Table-driven over EVERY recipe: exact inputs succeed and are consumed
// exactly; one-short fails untouched; chapter gating; plus atomicity when the
// output cannot fit, consumption across fragmented stacks, and
// availableRecipes filtering.
import { describe, expect, it } from 'vitest';
import { availableRecipes, canCraft, craft } from '../../../src/core/crafting/craft';
import { getRecipe, RECIPES } from '../../../src/core/crafting/recipes';
import type { Chapter, RecipeId } from '../../../src/core/crafting/recipes';
import { getItem } from '../../../src/core/items/catalog';
import type { ItemId } from '../../../src/core/items/catalog';
import { count, createInventory, give, INVENTORY_SLOTS } from '../../../src/core/player/inventory';
import type { Inventory } from '../../../src/core/player/inventory';

const ALL_RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];

/** Fresh inventory holding exactly the recipe's inputs, nothing else. */
function invWithExactInputs(recipeId: RecipeId): Inventory {
  const inv = createInventory();
  for (const inp of getRecipe(recipeId).inputs) {
    expect(give(inv, inp.itemId, inp.count)).toBe(0);
  }
  return inv;
}

/** Deep snapshot of the slot array for unchanged-inventory assertions. */
function snapshot(inv: Inventory): (null | { itemId: ItemId; count: number })[] {
  return inv.slots.map((s) => (s ? { itemId: s.itemId, count: s.count } : null));
}

describe('craft() over every §5 recipe (table-driven)', () => {
  for (const id of ALL_RECIPE_IDS) {
    const recipe = getRecipe(id);
    const ch = recipe.unlockChapter;

    it(`${id}: exact inputs → success, inputs consumed exactly, output added`, () => {
      const inv = invWithExactInputs(id);
      expect(canCraft(inv, id, ch)).toBe(true);
      expect(craft(inv, id, ch)).toBe(true);
      for (const inp of recipe.inputs) {
        // No recipe outputs one of its own inputs, so every input must hit 0.
        expect(inp.itemId).not.toBe(recipe.output.itemId);
        expect(count(inv, inp.itemId)).toBe(0);
      }
      expect(count(inv, recipe.output.itemId)).toBe(recipe.output.count);
      // Nothing else materialized: only the output remains.
      const occupied = inv.slots.filter((s) => s !== null);
      expect(occupied).toEqual([{ itemId: recipe.output.itemId, count: recipe.output.count }]);
    });

    for (const short of recipe.inputs) {
      it(`${id}: one ${short.itemId} short → fail, inventory unchanged`, () => {
        const inv = createInventory();
        for (const inp of recipe.inputs) {
          const n = inp.itemId === short.itemId ? inp.count - 1 : inp.count;
          if (n > 0) expect(give(inv, inp.itemId, n)).toBe(0);
        }
        const before = snapshot(inv);
        expect(canCraft(inv, id, ch)).toBe(false);
        expect(craft(inv, id, ch)).toBe(false);
        expect(snapshot(inv)).toEqual(before);
        expect(count(inv, recipe.output.itemId)).toBe(0);
      });
    }

    if (ch > 1) {
      it(`${id}: chapter ${ch - 1} too low → fail, inventory unchanged`, () => {
        const inv = invWithExactInputs(id);
        const before = snapshot(inv);
        const low = (ch - 1) as Chapter;
        expect(canCraft(inv, id, low)).toBe(false);
        expect(craft(inv, id, low)).toBe(false);
        expect(snapshot(inv)).toEqual(before);
      });
    }

    it(`${id}: unlocked at exactly chapter ${ch} and still at chapter 5`, () => {
      expect(canCraft(invWithExactInputs(id), id, ch)).toBe(true);
      expect(canCraft(invWithExactInputs(id), id, 5)).toBe(true);
    });
  }
});

describe('craft() atomicity when the output cannot fit', () => {
  it('tool output (stackMax 1) with no empty slot → fail, inputs NOT consumed', () => {
    // drill_mk1 = 3 hull + 2 iron. Inputs sit inside big stacks that do NOT
    // empty when consumed, every other slot is junk → no room for the drill.
    const inv = createInventory();
    expect(give(inv, 'block:9', 64)).toBe(0); // hull, slot 0
    expect(give(inv, 'block:7', 64)).toBe(0); // iron, slot 1
    for (let i = 2; i < INVENTORY_SLOTS; i++) inv.slots[i] = { itemId: 'block:1', count: 64 };
    const before = snapshot(inv);

    expect(canCraft(inv, 'drill_mk1', 1)).toBe(false);
    expect(craft(inv, 'drill_mk1', 1)).toBe(false);
    expect(snapshot(inv)).toEqual(before);
    expect(count(inv, 'block:9')).toBe(64);
    expect(count(inv, 'block:7')).toBe(64);
    expect(count(inv, 'drill_mk1')).toBe(0);
  });

  it('stackable output with all stacks full and no empty slot → fail, untouched', () => {
    // o2_canister = 2 ice + 1 iron; an existing FULL canister stack cannot
    // absorb the output.
    const inv = createInventory();
    expect(give(inv, 'block:5', 64)).toBe(0); // ice
    expect(give(inv, 'block:7', 64)).toBe(0); // iron
    expect(give(inv, 'o2_canister', 64)).toBe(0); // full stack
    for (let i = 3; i < INVENTORY_SLOTS; i++) inv.slots[i] = { itemId: 'block:2', count: 64 };
    const before = snapshot(inv);

    expect(canCraft(inv, 'o2_canister', 1)).toBe(false);
    expect(craft(inv, 'o2_canister', 1)).toBe(false);
    expect(snapshot(inv)).toEqual(before);
  });

  it('stackable output tops up an existing partial stack even when full otherwise', () => {
    const inv = createInventory();
    expect(give(inv, 'block:5', 64)).toBe(0);
    expect(give(inv, 'block:7', 64)).toBe(0);
    expect(give(inv, 'o2_canister', 63)).toBe(0); // room for exactly one more
    for (let i = 3; i < INVENTORY_SLOTS; i++) inv.slots[i] = { itemId: 'block:2', count: 64 };

    expect(canCraft(inv, 'o2_canister', 1)).toBe(true);
    expect(craft(inv, 'o2_canister', 1)).toBe(true);
    expect(count(inv, 'o2_canister')).toBe(64);
    expect(count(inv, 'block:5')).toBe(62);
    expect(count(inv, 'block:7')).toBe(63);
  });

  it('output fits in a slot FREED by consuming the inputs (stacking-aware order)', () => {
    // iron_plate = 2 iron_ore. The whole inventory is full, but the iron
    // stack empties when consumed, freeing the slot for the plate.
    const inv = createInventory();
    expect(give(inv, 'block:7', 2)).toBe(0); // exactly the input, slot 0
    for (let i = 1; i < INVENTORY_SLOTS; i++) inv.slots[i] = { itemId: 'block:2', count: 64 };

    expect(canCraft(inv, 'iron_plate', 1)).toBe(true);
    expect(craft(inv, 'iron_plate', 1)).toBe(true);
    expect(count(inv, 'block:7')).toBe(0);
    expect(count(inv, 'iron_plate')).toBe(1);
  });

  it('canCraft itself never mutates the inventory', () => {
    const inv = invWithExactInputs('drill_mk1');
    const before = snapshot(inv);
    expect(canCraft(inv, 'drill_mk1', 1)).toBe(true);
    expect(snapshot(inv)).toEqual(before);
  });
});

describe('craft() consumption across fragmented stacks', () => {
  it('drains an input split over multiple non-adjacent slots', () => {
    // drill_mk2 = 1 drill_mk1 + 4 iron + 2 copper; iron fragmented 2+1+1.
    const inv = createInventory();
    inv.slots[0] = { itemId: 'block:7', count: 2 };
    inv.slots[3] = { itemId: 'drill_mk1', count: 1 };
    inv.slots[9] = { itemId: 'block:7', count: 1 };
    inv.slots[12] = { itemId: 'block:8', count: 2 };
    inv.slots[39] = { itemId: 'block:7', count: 1 };

    expect(canCraft(inv, 'drill_mk2', 1)).toBe(true);
    expect(craft(inv, 'drill_mk2', 1)).toBe(true);
    expect(count(inv, 'block:7')).toBe(0);
    expect(count(inv, 'block:8')).toBe(0);
    expect(count(inv, 'drill_mk1')).toBe(0);
    expect(count(inv, 'drill_mk2')).toBe(1);
  });

  it('takes only the required amount, leaving surplus across stacks', () => {
    // hull_plate = 2 iron_plate + 1 basalt; surplus of both inputs.
    const inv = createInventory();
    inv.slots[1] = { itemId: 'iron_plate', count: 1 };
    inv.slots[8] = { itemId: 'iron_plate', count: 2 };
    inv.slots[20] = { itemId: 'block:3', count: 5 };

    expect(craft(inv, 'hull_plate', 1)).toBe(true);
    expect(count(inv, 'iron_plate')).toBe(1);
    expect(count(inv, 'block:3')).toBe(4);
    expect(count(inv, 'hull_plate')).toBe(1);
  });
});

describe('availableRecipes()', () => {
  const idsAt = (ch: Chapter) => availableRecipes(ch).map((r) => r.id);

  it('chapter 1: exactly the ch1 recipes', () => {
    expect(idsAt(1).sort()).toEqual(
      [
        'drill_mk1',
        'drill_mk2',
        'solar_panel',
        'o2_canister',
        'flare',
        'iron_plate',
        'glass',
        'hull_plate',
      ].sort(),
    );
  });

  it('chapter 2 adds scanner + antenna', () => {
    expect(idsAt(2).sort()).toEqual([...idsAt(1), 'scanner', 'antenna'].sort());
  });

  it('chapter 3 adds the crystal recipes (plasma_drill, jump_pack, magnet_glove, lamp)', () => {
    expect(idsAt(3).sort()).toEqual(
      [...idsAt(2), 'plasma_drill', 'jump_pack', 'magnet_glove', 'lamp'].sort(),
    );
  });

  it('chapter 4 adds beacon parts + fusion igniter; chapter 5 adds nothing new', () => {
    expect(idsAt(4).sort()).toEqual(
      [...idsAt(3), 'beacon_core', 'launchpad', 'fusion_igniter'].sort(),
    );
    expect(idsAt(5).sort()).toEqual(idsAt(4).sort());
    expect(idsAt(5)).toHaveLength(Object.keys(RECIPES).length);
  });

  it('is monotone: every recipe appears exactly from its unlockChapter on', () => {
    for (const r of Object.values(RECIPES)) {
      for (const ch of [1, 2, 3, 4, 5] as const) {
        expect(idsAt(ch).includes(r.id)).toBe(ch >= r.unlockChapter);
      }
    }
  });

  it('returns recipes in stable table order', () => {
    expect(idsAt(5)).toEqual(Object.keys(RECIPES));
  });
});

describe('input validation', () => {
  it('rejects non-chapter numbers loudly', () => {
    const inv = invWithExactInputs('iron_plate');
    for (const bad of [0, 6, 1.5, NaN, -1]) {
      expect(() => canCraft(inv, 'iron_plate', bad as Chapter)).toThrow(RangeError);
      expect(() => craft(inv, 'iron_plate', bad as Chapter)).toThrow(RangeError);
      expect(() => availableRecipes(bad as Chapter)).toThrow(RangeError);
    }
  });

  it('throws RangeError on unknown recipe ids', () => {
    const inv = createInventory();
    expect(() => canCraft(inv, 'warp_drive' as RecipeId, 1)).toThrow(RangeError);
    expect(() => craft(inv, 'warp_drive' as RecipeId, 1)).toThrow(RangeError);
  });
});

describe('sanity: outputs honor catalog stackMax in the success path', () => {
  it('crafting two drills lands them in two separate slots', () => {
    const inv = createInventory();
    expect(give(inv, 'block:9', 6)).toBe(0);
    expect(give(inv, 'block:7', 4)).toBe(0);
    expect(craft(inv, 'drill_mk1', 1)).toBe(true);
    expect(craft(inv, 'drill_mk1', 1)).toBe(true);
    expect(getItem('drill_mk1').stackMax).toBe(1);
    const drillSlots = inv.slots.filter((s) => s?.itemId === 'drill_mk1');
    expect(drillSlots).toEqual([
      { itemId: 'drill_mk1', count: 1 },
      { itemId: 'drill_mk1', count: 1 },
    ]);
  });
});
