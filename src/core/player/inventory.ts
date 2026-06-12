/**
 * Player inventory — GAME_DESIGN §12 (HOTBAR = 8 slots, STACK_MAX = 64).
 *
 * LAYOUT DECISION: one flat 40-slot array. Slots 0..7 ARE the hotbar,
 * slots 8..39 the general inventory. One array keeps give/take/moveSlot
 * uniform (no cross-container transfer API needed) and makes "hotbar fills
 * first" fall out of plain index order.
 *
 * Style matches core/player/movement.ts: plain pure functions that mutate
 * the state object, no clock, no randomness — same calls ⇒ identical state.
 * Count arguments must be positive integers; anything else throws RangeError
 * (fail fast on programmer error rather than silently no-op'ing).
 */
import { getItem } from '../items/catalog';
import type { ItemId } from '../items/catalog';

/** GAME_DESIGN §12: HOTBAR = 8 slots (indices 0..7 of the slot array). */
export const HOTBAR_SLOTS = 8;
/** General (backpack) slots, indices 8..39. */
export const GENERAL_SLOTS = 32;
/** Total slot count of the single flat array. */
export const INVENTORY_SLOTS = HOTBAR_SLOTS + GENERAL_SLOTS;

export interface ItemStack {
  itemId: ItemId;
  /** 1..stackMax(itemId); a slot with count 0 is removed (set to null). */
  count: number;
}

export interface Inventory {
  /** Length INVENTORY_SLOTS; null = empty. 0..7 hotbar, 8..39 general. */
  slots: (ItemStack | null)[];
  /** Selected hotbar index, 0..HOTBAR_SLOTS-1. */
  activeHotbarSlot: number;
}

/** A fresh, empty inventory with hotbar slot 0 selected. */
export function createInventory(): Inventory {
  return {
    slots: Array.from({ length: INVENTORY_SLOTS }, () => null),
    activeHotbarSlot: 0,
  };
}

/** Counts must be positive integers — reject 0/negative/fractional loudly. */
function assertPositiveCount(n: number, op: string): void {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`${op}: count must be a positive integer, got ${n}`);
  }
}

function assertSlotIndex(i: number, op: string): void {
  if (!Number.isInteger(i) || i < 0 || i >= INVENTORY_SLOTS) {
    throw new RangeError(`${op}: slot index out of range [0, ${INVENTORY_SLOTS}): ${i}`);
  }
}

/**
 * Add `count` of `itemId`. Fill order: existing same-item stacks with room
 * (lowest index first), then empty slots — so the hotbar fills before the
 * backpack. Returns the OVERFLOW (0 when everything fit). Tools/equipment
 * (stackMax 1) never top up an existing slot.
 */
export function give(inv: Inventory, itemId: ItemId, count: number): number {
  assertPositiveCount(count, 'give');
  const stackMax = getItem(itemId).stackMax;
  let remaining = count;

  // Pass 1: top up existing stacks.
  for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
    const s = inv.slots[i];
    if (s && s.itemId === itemId && s.count < stackMax) {
      const add = Math.min(stackMax - s.count, remaining);
      s.count += add;
      remaining -= add;
    }
  }
  // Pass 2: open new stacks in empty slots.
  for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
    if (inv.slots[i] === null) {
      const add = Math.min(stackMax, remaining);
      inv.slots[i] = { itemId, count: add };
      remaining -= add;
    }
  }
  return remaining;
}

/**
 * Remove up to `count` of `itemId`, draining the HIGHEST slot index first
 * (backpack before hotbar, so crafting/consumption empties the hotbar last).
 * Returns how many were actually taken (≤ count). Emptied slots become null.
 */
export function take(inv: Inventory, itemId: ItemId, count: number): number {
  assertPositiveCount(count, 'take');
  let remaining = count;
  for (let i = inv.slots.length - 1; i >= 0 && remaining > 0; i--) {
    const s = inv.slots[i];
    if (s && s.itemId === itemId) {
      const sub = Math.min(s.count, remaining);
      s.count -= sub;
      remaining -= sub;
      if (s.count === 0) inv.slots[i] = null;
    }
  }
  return count - remaining;
}

/** Total of `itemId` across all slots. */
export function count(inv: Inventory, itemId: ItemId): number {
  let total = 0;
  for (const s of inv.slots) if (s && s.itemId === itemId) total += s.count;
  return total;
}

/** True when at least `n` (default 1) of `itemId` are held. */
export function has(inv: Inventory, itemId: ItemId, n: number = 1): boolean {
  return count(inv, itemId) >= n;
}

/**
 * Player-driven slot move (drag/drop), merge-or-swap semantics:
 *  - same item AND the target has room → merge up to stackMax, leftover
 *    stays in `from`;
 *  - otherwise (different items, full target, stackMax-1 tools, empty from)
 *    → plain swap (moving into an empty slot is a swap with null).
 * `from === to` is a no-op; out-of-range indices throw RangeError.
 */
export function moveSlot(inv: Inventory, from: number, to: number): void {
  assertSlotIndex(from, 'moveSlot');
  assertSlotIndex(to, 'moveSlot');
  if (from === to) return;
  const a = inv.slots[from] ?? null;
  const b = inv.slots[to] ?? null;

  if (a && b && a.itemId === b.itemId) {
    const stackMax = getItem(a.itemId).stackMax;
    if (b.count < stackMax) {
      const transfer = Math.min(a.count, stackMax - b.count);
      b.count += transfer;
      a.count -= transfer;
      if (a.count === 0) inv.slots[from] = null;
      return;
    }
    // fall through: target full → swap
  }
  inv.slots[from] = b;
  inv.slots[to] = a;
}

/** Select a hotbar slot (0..HOTBAR_SLOTS-1 only). */
export function setActiveSlot(inv: Inventory, slot: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= HOTBAR_SLOTS) {
    throw new RangeError(`setActiveSlot: hotbar index out of range [0, ${HOTBAR_SLOTS}): ${slot}`);
  }
  inv.activeHotbarSlot = slot;
}

/** The stack under the active hotbar slot, or null when it is empty. */
export function activeItem(inv: Inventory): ItemStack | null {
  return inv.slots[inv.activeHotbarSlot] ?? null;
}
