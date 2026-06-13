/**
 * Death drop + respawn — GAME_DESIGN §6 (Death: respawn at pod, drop 50% of each
 * stack at death point) + §12 (DEATH_DROP = 50% of each stack, recoverable cache).
 *
 * PURE: `computeDeathDrop` only READS the inventory — it never mutates it. The
 * game layer orchestrates the actual death sequence:
 *   isDead(survival) → computeDeathDrop(inv) → for each drop call
 *   take(inv, itemId, count) to remove it → spawn a single recoverable cache at
 *   the death position holding `drops` → reset player to pod + respawnState().
 *
 * DECISIONS (control plane to confirm — see report):
 *  - ROUNDING: floor(count / 2). So 7 → drop 3 / keep 4; 1 → drop 0 / keep 1.
 *    Floor (vs round) keeps the death penalty from ever exceeding half and makes
 *    a single item always survivable.
 *  - TOOLS / EQUIPMENT (stackMax 1): KEPT, never dropped. Dropping a unique tool
 *    into a recoverable-but-loseable cache is punishing and breaks progression
 *    gating (you could lose your only Mk2 to a bad fall). Only stackable
 *    materials/blocks/consumables are split. (§ALT: drop the whole tool — offered
 *    in the brief; rejected for the reason above.)
 */
import { getItem } from '../items/catalog';
import type { ItemId } from '../items/catalog';
import type { Inventory } from './inventory';
import { createSurvivalState } from './stats';
import type { SurvivalState } from './stats';

/** One (item, count) line in a death cache or kept set. */
export interface DropEntry {
  itemId: ItemId;
  count: number;
}

export interface DeathDrop {
  /** Goes into the recoverable cache at the death position. */
  drops: DropEntry[];
  /** Stays on the player through respawn. */
  kept: DropEntry[];
}

/**
 * Compute the recoverable cache (`drops`) and the retained items (`kept`) for a
 * death, WITHOUT mutating `inv`. One entry per non-empty slot, preserving slot
 * order. Stackables split floor(count/2) to drops; tools/equipment (stackMax 1)
 * stay entirely in `kept`. Zero-count results are omitted (a count-1 stack drops
 * nothing, so it produces only a `kept` entry).
 */
export function computeDeathDrop(inv: Inventory): DeathDrop {
  const drops: DropEntry[] = [];
  const kept: DropEntry[] = [];

  for (const slot of inv.slots) {
    if (slot === null) continue;
    const stackMax = getItem(slot.itemId).stackMax;
    if (stackMax <= 1) {
      // Tool / equipment: kept whole.
      kept.push({ itemId: slot.itemId, count: slot.count });
      continue;
    }
    const drop = Math.floor(slot.count / 2);
    const keep = slot.count - drop;
    if (drop > 0) drops.push({ itemId: slot.itemId, count: drop });
    if (keep > 0) kept.push({ itemId: slot.itemId, count: keep });
  }

  return { drops, kept };
}

/**
 * The stats a player respawns with: full HP/O₂/Energy (§6 respawn at pod).
 * Returns a fresh object. Respawn values do not depend on the pre-death state,
 * so this takes no argument; the game layer simply replaces its SurvivalState
 * with the result. Position reset is the game layer's job.
 */
export function respawnState(): SurvivalState {
  return createSurvivalState();
}
