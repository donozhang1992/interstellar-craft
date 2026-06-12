// Spec: GAME_DESIGN §12 (HOTBAR = 8 slots, STACK_MAX = 64) + M1.1 brief.
// Layout decision (documented in src/core/player/inventory.ts): ONE 40-slot
// array; slots 0..7 are the hotbar, 8..39 the general inventory.
import { describe, expect, it } from 'vitest';
import {
  activeItem,
  count,
  createInventory,
  give,
  GENERAL_SLOTS,
  has,
  HOTBAR_SLOTS,
  INVENTORY_SLOTS,
  moveSlot,
  setActiveSlot,
  take,
} from '../../../src/core/player/inventory';
import type { Inventory } from '../../../src/core/player/inventory';

describe('createInventory', () => {
  it('has 8 hotbar + 32 general = 40 empty slots, active slot 0', () => {
    expect(HOTBAR_SLOTS).toBe(8); // GAME_DESIGN §12 HOTBAR
    expect(GENERAL_SLOTS).toBe(32);
    expect(INVENTORY_SLOTS).toBe(40);
    const inv = createInventory();
    expect(inv.slots).toHaveLength(40);
    expect(inv.slots.every((s) => s === null)).toBe(true);
    expect(inv.activeHotbarSlot).toBe(0);
  });
});

describe('give', () => {
  it('fills the first empty slot (hotbar first) and returns 0 overflow', () => {
    const inv = createInventory();
    expect(give(inv, 'block:1', 10)).toBe(0);
    expect(inv.slots[0]).toEqual({ itemId: 'block:1', count: 10 });
    expect(inv.slots[1]).toBeNull();
  });

  it('tops up existing stacks BEFORE opening empty slots', () => {
    const inv = createInventory();
    give(inv, 'block:1', 60);
    inv.slots[5] = { itemId: 'block:1', count: 10 };
    // slot 0 has 60/64, slot 5 has 10/64 → 20 fills 0→64, 5→26; no new slot.
    expect(give(inv, 'block:1', 20)).toBe(0);
    expect(inv.slots[0]).toEqual({ itemId: 'block:1', count: 64 });
    expect(inv.slots[5]).toEqual({ itemId: 'block:1', count: 26 });
    expect(inv.slots[1]).toBeNull();
  });

  it('splits across multiple new slots respecting stackMax 64', () => {
    const inv = createInventory();
    expect(give(inv, 'iron_plate', 130)).toBe(0);
    expect(inv.slots[0]).toEqual({ itemId: 'iron_plate', count: 64 });
    expect(inv.slots[1]).toEqual({ itemId: 'iron_plate', count: 64 });
    expect(inv.slots[2]).toEqual({ itemId: 'iron_plate', count: 2 });
  });

  it('returns the overflow when the inventory is full', () => {
    const inv = createInventory();
    expect(give(inv, 'block:2', 40 * 64)).toBe(0); // exactly fills all 40 slots
    expect(give(inv, 'block:2', 5)).toBe(5); // nothing fits
    expect(give(inv, 'block:3', 1)).toBe(1); // different item, still full
    expect(count(inv, 'block:2')).toBe(40 * 64);
  });

  it('partially fits: gives what it can, returns the rest', () => {
    const inv = createInventory();
    give(inv, 'block:2', 39 * 64); // one slot left
    expect(give(inv, 'block:2', 100)).toBe(36); // 64 fit, 36 overflow
    expect(count(inv, 'block:2')).toBe(40 * 64);
  });

  it('tools never stack: each copy takes its own slot', () => {
    const inv = createInventory();
    expect(give(inv, 'drill_mk1', 3)).toBe(0);
    expect(inv.slots[0]).toEqual({ itemId: 'drill_mk1', count: 1 });
    expect(inv.slots[1]).toEqual({ itemId: 'drill_mk1', count: 1 });
    expect(inv.slots[2]).toEqual({ itemId: 'drill_mk1', count: 1 });
    // an existing tool slot is never topped up
    expect(give(inv, 'drill_mk1', 1)).toBe(0);
    expect(inv.slots[3]).toEqual({ itemId: 'drill_mk1', count: 1 });
  });

  it('rejects zero/negative/non-integer counts with RangeError (documented choice)', () => {
    const inv = createInventory();
    expect(() => give(inv, 'block:1', 0)).toThrow(RangeError);
    expect(() => give(inv, 'block:1', -3)).toThrow(RangeError);
    expect(() => give(inv, 'block:1', 1.5)).toThrow(RangeError);
    expect(inv.slots.every((s) => s === null)).toBe(true); // untouched
  });
});

describe('take', () => {
  it('takes across multiple stacks and returns the taken count', () => {
    const inv = createInventory();
    give(inv, 'block:5', 64 + 64 + 10); // three stacks: 64, 64, 10
    expect(take(inv, 'block:5', 70)).toBe(70);
    expect(count(inv, 'block:5')).toBe(68);
  });

  it('consumes from the HIGHEST slot index first (hotbar emptied last)', () => {
    const inv = createInventory();
    inv.slots[0] = { itemId: 'block:1', count: 30 };
    inv.slots[20] = { itemId: 'block:1', count: 30 };
    take(inv, 'block:1', 35);
    expect(inv.slots[20]).toBeNull(); // general stack drained first
    expect(inv.slots[0]).toEqual({ itemId: 'block:1', count: 25 });
  });

  it('returns only what was available and clears emptied slots', () => {
    const inv = createInventory();
    give(inv, 'flare', 5);
    expect(take(inv, 'flare', 9)).toBe(5);
    expect(count(inv, 'flare')).toBe(0);
    expect(inv.slots[0]).toBeNull();
  });

  it('returns 0 for an item not present', () => {
    const inv = createInventory();
    expect(take(inv, 'scanner', 1)).toBe(0);
  });

  it('rejects zero/negative/non-integer counts with RangeError', () => {
    const inv = createInventory();
    expect(() => take(inv, 'block:1', 0)).toThrow(RangeError);
    expect(() => take(inv, 'block:1', -1)).toThrow(RangeError);
    expect(() => take(inv, 'block:1', 0.5)).toThrow(RangeError);
  });
});

describe('count / has consistency', () => {
  it('count sums every stack; has(n) ⇔ count >= n; has defaults to 1', () => {
    const inv = createInventory();
    expect(count(inv, 'block:9')).toBe(0);
    expect(has(inv, 'block:9')).toBe(false);
    give(inv, 'block:9', 70); // 64 + 6 across two slots
    expect(count(inv, 'block:9')).toBe(70);
    expect(has(inv, 'block:9')).toBe(true);
    expect(has(inv, 'block:9', 70)).toBe(true);
    expect(has(inv, 'block:9', 71)).toBe(false);
    take(inv, 'block:9', 70);
    expect(count(inv, 'block:9')).toBe(0);
    expect(has(inv, 'block:9')).toBe(false);
  });
});

describe('moveSlot', () => {
  function invWith(slots: Record<number, { itemId: string; count: number }>): Inventory {
    const inv = createInventory();
    for (const [i, s] of Object.entries(slots))
      inv.slots[Number(i)] = s as Inventory['slots'][number];
    return inv;
  }

  it('moves a stack into an empty slot', () => {
    const inv = invWith({ 3: { itemId: 'block:1', count: 12 } });
    moveSlot(inv, 3, 10);
    expect(inv.slots[3]).toBeNull();
    expect(inv.slots[10]).toEqual({ itemId: 'block:1', count: 12 });
  });

  it('merges same-item stacks up to stackMax, leftover stays in `from`', () => {
    const inv = invWith({
      0: { itemId: 'block:2', count: 40 },
      9: { itemId: 'block:2', count: 50 },
    });
    moveSlot(inv, 0, 9); // 50 + 14 = 64, 26 left behind
    expect(inv.slots[9]).toEqual({ itemId: 'block:2', count: 64 });
    expect(inv.slots[0]).toEqual({ itemId: 'block:2', count: 26 });
  });

  it('merges fully when everything fits (from becomes empty)', () => {
    const inv = invWith({
      0: { itemId: 'block:2', count: 10 },
      9: { itemId: 'block:2', count: 20 },
    });
    moveSlot(inv, 0, 9);
    expect(inv.slots[9]).toEqual({ itemId: 'block:2', count: 30 });
    expect(inv.slots[0]).toBeNull();
  });

  it('swaps different items', () => {
    const inv = invWith({
      1: { itemId: 'block:1', count: 5 },
      2: { itemId: 'drill_mk1', count: 1 },
    });
    moveSlot(inv, 1, 2);
    expect(inv.slots[1]).toEqual({ itemId: 'drill_mk1', count: 1 });
    expect(inv.slots[2]).toEqual({ itemId: 'block:1', count: 5 });
  });

  it('swaps same-item stacks when the target is already full (no merge possible)', () => {
    const inv = invWith({
      0: { itemId: 'block:2', count: 7 },
      1: { itemId: 'block:2', count: 64 },
    });
    moveSlot(inv, 0, 1);
    expect(inv.slots[0]).toEqual({ itemId: 'block:2', count: 64 });
    expect(inv.slots[1]).toEqual({ itemId: 'block:2', count: 7 });
  });

  it('two identical tools swap instead of merging (stackMax 1)', () => {
    const inv = invWith({
      0: { itemId: 'drill_mk2', count: 1 },
      5: { itemId: 'drill_mk2', count: 1 },
    });
    moveSlot(inv, 0, 5);
    expect(inv.slots[0]).toEqual({ itemId: 'drill_mk2', count: 1 });
    expect(inv.slots[5]).toEqual({ itemId: 'drill_mk2', count: 1 });
  });

  it('from === to is a no-op; out-of-range indices throw RangeError', () => {
    const inv = invWith({ 0: { itemId: 'block:1', count: 5 } });
    moveSlot(inv, 0, 0);
    expect(inv.slots[0]).toEqual({ itemId: 'block:1', count: 5 });
    expect(() => moveSlot(inv, -1, 0)).toThrow(RangeError);
    expect(() => moveSlot(inv, 0, 40)).toThrow(RangeError);
    expect(() => moveSlot(inv, 0.5, 1)).toThrow(RangeError);
  });
});

describe('hotbar / activeItem', () => {
  it('activeItem returns the stack in the active hotbar slot (or null)', () => {
    const inv = createInventory();
    expect(activeItem(inv)).toBeNull();
    give(inv, 'block:6', 4); // lands in slot 0
    expect(activeItem(inv)).toEqual({ itemId: 'block:6', count: 4 });
    setActiveSlot(inv, 7);
    expect(inv.activeHotbarSlot).toBe(7);
    expect(activeItem(inv)).toBeNull();
    inv.slots[7] = { itemId: 'scanner', count: 1 };
    expect(activeItem(inv)).toEqual({ itemId: 'scanner', count: 1 });
  });

  it('setActiveSlot rejects slots outside 0..7', () => {
    const inv = createInventory();
    expect(() => setActiveSlot(inv, 8)).toThrow(RangeError);
    expect(() => setActiveSlot(inv, -1)).toThrow(RangeError);
    expect(() => setActiveSlot(inv, 1.5)).toThrow(RangeError);
    expect(inv.activeHotbarSlot).toBe(0);
  });

  it('general slots (8..39) are NOT reachable as active slots', () => {
    const inv = createInventory();
    expect(() => setActiveSlot(inv, HOTBAR_SLOTS)).toThrow(RangeError);
  });
});
