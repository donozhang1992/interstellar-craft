// Spec: GAME_DESIGN §5 (recipe list — CANONICAL), §3 (chapter unlock column),
// §4 block notes ("craftable chN+") and §7 ("Magnet Glove craftable ch3").
//
// CONTRACT-FREEZE TEST: every §5 recipe's inputs, output, and unlock chapter
// are written out as literals below. If the recipe table drifts from
// GAME_DESIGN §5, this file goes red — update the design doc in the same PR
// or fix the table; never "sync" this test to the code.
import { describe, expect, it } from 'vitest';
import { getRecipe, isRecipeId, RECIPES } from '../../../src/core/crafting/recipes';
import type { Recipe } from '../../../src/core/crafting/recipes';
import { isItemId } from '../../../src/core/items/catalog';

/** GAME_DESIGN §5 verbatim, mapped to item ids (block inputs are 'block:<id>'). */
const EXPECTED: Recipe[] = [
  // ── Tools ────────────────────────────────────────────────────────────────
  {
    id: 'drill_mk1',
    output: { itemId: 'drill_mk1', count: 1 },
    inputs: [
      { itemId: 'block:9', count: 3 }, // hull
      { itemId: 'block:7', count: 2 }, // iron (iron_ore)
    ],
    unlockChapter: 1, // §3 ch1 unlocks "Workbench, Drill Mk1"
  },
  {
    id: 'drill_mk2',
    output: { itemId: 'drill_mk2', count: 1 },
    inputs: [
      { itemId: 'drill_mk1', count: 1 },
      { itemId: 'block:7', count: 4 }, // iron
      { itemId: 'block:8', count: 2 }, // copper
    ],
    unlockChapter: 1, // unlisted in §3 → default ch1
  },
  {
    id: 'plasma_drill',
    output: { itemId: 'plasma_drill', count: 1 },
    inputs: [
      { itemId: 'drill_mk2', count: 1 },
      { itemId: 'block:4', count: 6 }, // crystal
      { itemId: 'block:8', count: 2 }, // copper
    ],
    unlockChapter: 3, // §3 ch3 unlocks "crystal recipes"
  },
  // ── Equipment ────────────────────────────────────────────────────────────
  {
    id: 'scanner',
    output: { itemId: 'scanner', count: 1 },
    inputs: [
      { itemId: 'block:8', count: 2 }, // copper
      { itemId: 'block:10', count: 1 }, // glass
      { itemId: 'block:4', count: 1 }, // crystal
    ],
    unlockChapter: 2, // §3 ch2 unlocks "Scanner" (explicit; overrides crystal rule)
  },
  {
    id: 'jump_pack',
    output: { itemId: 'jump_pack', count: 1 },
    inputs: [
      { itemId: 'block:9', count: 4 }, // hull
      { itemId: 'block:8', count: 3 }, // copper
      { itemId: 'block:4', count: 2 }, // crystal
    ],
    unlockChapter: 3, // §3 ch3 unlocks "Jump pack"
  },
  {
    id: 'magnet_glove',
    output: { itemId: 'magnet_glove', count: 1 },
    inputs: [
      { itemId: 'block:7', count: 2 }, // iron
      { itemId: 'block:8', count: 3 }, // copper
    ],
    unlockChapter: 3, // §7: "Magnet Glove (craftable ch3, ...)"
  },
  {
    id: 'solar_panel',
    output: { itemId: 'solar_panel', count: 1 },
    inputs: [
      { itemId: 'block:10', count: 3 }, // glass
      { itemId: 'block:8', count: 2 }, // copper
      { itemId: 'block:7', count: 1 }, // iron
    ],
    unlockChapter: 1, // unlisted in §3 → default ch1
  },
  // ── Consumables ──────────────────────────────────────────────────────────
  {
    id: 'o2_canister',
    output: { itemId: 'o2_canister', count: 1 },
    inputs: [
      { itemId: 'block:5', count: 2 }, // ice
      { itemId: 'block:7', count: 1 }, // iron
    ],
    unlockChapter: 1, // unlisted in §3 → default ch1
  },
  {
    id: 'flare',
    output: { itemId: 'flare', count: 1 },
    inputs: [
      { itemId: 'block:6', count: 1 }, // lamp (block item input)
      { itemId: 'block:8', count: 1 }, // copper
    ],
    unlockChapter: 1, // unlisted in §3 → default ch1 (lamp input ≠ crystal input)
  },
  // ── Materials ────────────────────────────────────────────────────────────
  {
    id: 'iron_plate',
    output: { itemId: 'iron_plate', count: 1 },
    inputs: [{ itemId: 'block:7', count: 2 }], // 2 iron_ore
    unlockChapter: 1,
  },
  {
    id: 'glass',
    output: { itemId: 'block:10', count: 1 }, // glass is block 10 (no separate item)
    inputs: [{ itemId: 'block:5', count: 2 }], // 2 ice
    unlockChapter: 1,
  },
  {
    id: 'hull_plate',
    output: { itemId: 'hull_plate', count: 1 },
    inputs: [
      { itemId: 'iron_plate', count: 2 },
      { itemId: 'block:3', count: 1 }, // basalt
    ],
    unlockChapter: 1,
  },
  {
    id: 'lamp',
    output: { itemId: 'block:6', count: 1 }, // lamp is block 6 (no separate item)
    inputs: [
      { itemId: 'block:4', count: 2 }, // crystal
      { itemId: 'block:8', count: 1 }, // copper
    ],
    unlockChapter: 3, // crystal recipe → §3 ch3 "crystal recipes"
  },
  // ── Quest ────────────────────────────────────────────────────────────────
  {
    id: 'antenna',
    output: { itemId: 'block:11', count: 1 },
    inputs: [
      { itemId: 'iron_plate', count: 2 },
      { itemId: 'block:8', count: 1 }, // copper
    ],
    unlockChapter: 2, // §4 row 11: "quest block, craftable ch2+"
  },
  {
    id: 'beacon_core',
    output: { itemId: 'block:12', count: 1 },
    inputs: [
      { itemId: 'iron_plate', count: 4 },
      { itemId: 'block:4', count: 4 }, // crystal
    ],
    unlockChapter: 4, // §4 row 12: "quest block, craftable ch4+"
  },
  {
    id: 'launchpad',
    output: { itemId: 'block:13', count: 1 },
    inputs: [
      { itemId: 'block:9', count: 2 }, // hull
      { itemId: 'block:3', count: 2 }, // basalt
    ],
    unlockChapter: 4, // §4 row 13: "quest block, craftable ch4+"
  },
  {
    id: 'fusion_igniter',
    output: { itemId: 'fusion_igniter', count: 1 },
    inputs: [
      { itemId: 'block:12', count: 2 }, // beacon_core BLOCK item as input
      { itemId: 'block:4', count: 4 }, // crystal
      { itemId: 'block:8', count: 2 }, // copper
    ],
    unlockChapter: 4, // §3 ch4 unlocks "Fusion igniter"
  },
];

describe('recipe table (GAME_DESIGN §5 contract freeze)', () => {
  it('has exactly the 17 §5 recipes, no extras', () => {
    expect(Object.keys(RECIPES).sort()).toEqual(EXPECTED.map((r) => r.id).sort());
    // 3 tools + 4 equipment + 2 consumables + 4 materials + 4 quest (§5).
    expect(Object.keys(RECIPES)).toHaveLength(17);
  });

  for (const exp of EXPECTED) {
    it(`${exp.id}: exact inputs, output, and unlock chapter`, () => {
      const actual = getRecipe(exp.id as never);
      expect(actual.id).toBe(exp.id);
      expect(actual.output).toEqual(exp.output);
      // Order-insensitive but multiplicity-exact input comparison.
      const key = (x: { itemId: string; count: number }) => `${x.itemId}x${x.count}`;
      expect([...actual.inputs].map(key).sort()).toEqual(exp.inputs.map(key).sort());
      expect(actual.unlockChapter).toBe(exp.unlockChapter);
    });
  }

  it('every table key equals its entry id', () => {
    for (const [key, r] of Object.entries(RECIPES)) expect(r.id).toBe(key);
  });

  it('every input/output item id exists in the item catalog', () => {
    for (const r of Object.values(RECIPES)) {
      expect(isItemId(r.output.itemId)).toBe(true);
      for (const inp of r.inputs) expect(isItemId(inp.itemId)).toBe(true);
    }
  });

  it('all counts are positive integers and output counts are 1 (§5 is silent → 1)', () => {
    for (const r of Object.values(RECIPES)) {
      expect(r.output.count).toBe(1);
      for (const inp of r.inputs) {
        expect(Number.isInteger(inp.count)).toBe(true);
        expect(inp.count).toBeGreaterThan(0);
      }
    }
  });

  it('no recipe lists the same input item twice', () => {
    for (const r of Object.values(RECIPES)) {
      const ids = r.inputs.map((i) => i.itemId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('isRecipeId guards strings; getRecipe throws on unknown ids', () => {
    expect(isRecipeId('drill_mk1')).toBe(true);
    expect(isRecipeId('block:7')).toBe(false);
    expect(isRecipeId('')).toBe(false);
    expect(isRecipeId('__proto__')).toBe(false);
    expect(() => getRecipe('nope' as never)).toThrow(RangeError);
  });
});
