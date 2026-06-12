/**
 * Hold-to-mine progress state machine — GAME_DESIGN §4 (continuous
 * hold-to-mine replaces the M0 prototype's instant click).
 *
 * Pure and deterministic in the core/player style: plain functions mutating a
 * plain state object, fixed-dt stepping, no clock, no randomness. The M1.4
 * glue layer owns picking the target (raycast → a stable `targetKey` such as
 * "x,y,z") and calls `stepMining` once per fixed tick; on `completed` it
 * removes the block from the world and calls `applyMiningDrop`.
 *
 * Semantics (decisions documented for the control plane):
 *  - Progress accumulates dt / miningTime only while held on the SAME
 *    targetKey; a different key restarts at 0 AND counts the current step
 *    (so a fresh hold of regolith/hand completes on step 36 at dt = 1/60).
 *  - `targetKey: null` (button released / no block in range) resets to 0.
 *  - Reaching 1.0 (within 1e-9, absorbing float accumulation error) reports
 *    `completed: true` exactly once, then the state resets to idle; leftover
 *    dt past 1.0 is discarded, never carried into the next block.
 *  - A gated block (tier < minTool) or invalid block id refuses: progress
 *    stays 0 and `refused: true` is reported each held step.
 */
import { miningTime } from './model';
import type { MiningTier } from './model';
import { BLOCKS } from '../world/blocks';
import type { BlockDef } from '../world/blocks';
import { blockItemId } from '../items/catalog';
import type { ItemId } from '../items/catalog';
import { give } from '../player/inventory';
import type { Inventory } from '../player/inventory';

/** Float-accumulation tolerance: 36 × (1/60)/0.6 must count as 1.0. */
const PROGRESS_EPSILON = 1e-9;

export interface MiningState {
  /** Key of the block currently being mined, or null when idle. */
  targetKey: string | null;
  /** Accumulated fraction 0..1 of the current target's mining time. */
  progress: number;
}

/** A fresh, idle mining state. */
export function createMiningState(): MiningState {
  return { targetKey: null, progress: 0 };
}

export interface MiningStepInput {
  /** Stable id of the aimed-at block (e.g. "x,y,z"), or null when released. */
  targetKey: string | null;
  /** Block id at the target (read by the glue layer from the world). */
  targetBlockId: number;
  /** The player's current best/equipped tier ('hand' when no drill). */
  toolTier: MiningTier;
  /** Fixed timestep, seconds (1/60 in-game). Must be finite and >= 0. */
  dt: number;
}

export interface MiningStepResult {
  /** True exactly once, on the step that reaches the full mining time. */
  completed: boolean;
  /** True while holding a block the tier cannot mine (progress pinned 0). */
  refused: boolean;
  /** Progress after this step, 0..1 (0 again on the completing step). */
  progress: number;
}

/**
 * Advance the hold-to-mine state by one fixed tick. Mutates `state`; returns
 * what happened this step. Same inputs ⇒ identical trajectories.
 */
export function stepMining(state: MiningState, input: MiningStepInput): MiningStepResult {
  const { targetKey, targetBlockId, toolTier, dt } = input;
  if (!Number.isFinite(dt) || dt < 0) {
    throw new RangeError(`stepMining: dt must be finite and >= 0, got ${dt}`);
  }

  // Released / nothing aimed at → idle.
  if (targetKey === null) {
    state.targetKey = null;
    state.progress = 0;
    return { completed: false, refused: false, progress: 0 };
  }

  const time = miningTime(targetBlockId, toolTier);

  // Gated (tier < minTool) or invalid block: hold refuses, progress pinned 0.
  if (time === null) {
    state.targetKey = targetKey;
    state.progress = 0;
    return { completed: false, refused: true, progress: 0 };
  }

  // New target (or first hold after idle/completion): restart, then count
  // this step — a fresh hold's first tick already mines.
  if (targetKey !== state.targetKey) {
    state.targetKey = targetKey;
    state.progress = 0;
  }

  state.progress += dt / time;
  if (state.progress >= 1 - PROGRESS_EPSILON) {
    // Completed: fire once, drop back to idle (leftover dt discarded).
    state.targetKey = null;
    state.progress = 0;
    return { completed: true, refused: false, progress: 0 };
  }
  return { completed: false, refused: false, progress: state.progress };
}

export interface MiningDropResult {
  /** Item the block yields, or null when it drops nothing (glass breaks). */
  dropped: ItemId | null;
  /** Of the yielded item, how many did not fit (0 | 1). Overflow is LOST. */
  overflow: number;
}

/**
 * Give the player a mined block's drop (GAME_DESIGN §4 "Drops" column):
 * `block:<dropId>` for self-dropping blocks, nothing for glass.
 *
 * DECISION (flag for control plane): on a full inventory the block still
 * breaks and the drop is lost (`overflow: 1`) — there is no ground-item
 * entity in the design. Alternative (refuse to complete the mine) is listed
 * under OPEN QUESTIONS. Throws RangeError on a non-§4 block id.
 */
export function applyMiningDrop(inv: Inventory, blockId: number): MiningDropResult {
  const def = (BLOCKS as Partial<Record<number, BlockDef>>)[blockId];
  if (def === undefined) {
    throw new RangeError(`applyMiningDrop: not a mineable block id: ${blockId}`);
  }
  if (def.drops === null) return { dropped: null, overflow: 0 };
  const itemId = blockItemId(def.drops);
  const overflow = give(inv, itemId, 1);
  return { dropped: itemId, overflow };
}
