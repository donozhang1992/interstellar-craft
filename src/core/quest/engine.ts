/**
 * Quest engine — GAME_DESIGN §3a (canonical model). A pure linear state machine
 * over the CHAPTERS table (chapters.ts). NO three.js, NO DOM, NO Math.random:
 * predicates are pure functions of a read-only QuestContext, advance() is
 * deterministic and idempotent. Style matches core/player/inventory.ts — plain
 * functions that mutate the state object; same inputs ⇒ identical state.
 *
 * The game layer (M3.3) owns the bridge: each tick it builds a QuestContext from
 * real events (raising flags / bumping counters on the QuestState via the helpers
 * here, then mirroring them into the ctx) and calls advance(). The engine never
 * reads the world directly — it only reads the ctx the game layer supplies.
 */
import type { Inventory } from '../player/inventory';
import { CHAPTERS } from './chapters';

/** Persistent quest progress. `chapter` is 1-based; `step` indexes into the */
/** current chapter's step list (0-based). `step === chapter-length` means the */
/** chapter is exhausted; combined with the final chapter that means complete. */
export interface QuestState {
  chapter: number;
  step: number;
  flags: Record<string, boolean>;
  counters: Record<string, number>;
  /** Unlock ids accumulated from completed steps, in completion order, deduped. */
  unlocked: string[];
}

/**
 * Read-only view the game layer supplies to predicates each tick. `flags` and
 * `counters` are the game-layer's mirror of real events; `inv` is included for
 * future chapters' has-checks (ch1/ch2 use only flags/counters per §3a). Predicates
 * MUST treat this as read-only.
 */
export interface QuestContext {
  flags: Record<string, boolean>;
  counters: Record<string, number>;
  inv: Inventory;
}

/** One quest beat: an English HUD objective + a pure completion predicate. */
export interface QuestStep {
  id: string;
  objective: string;
  predicate(ctx: QuestContext): boolean;
  /** Ids unlocked when this step completes (workbench, scanner, …). */
  unlocks?: string[];
}

/** HUD string shown once every chapter/step is done. */
const COMPLETE_OBJECTIVE = 'All objectives complete';

/** Fresh state: chapter 1, step 0, nothing raised, nothing unlocked. */
export function createQuestState(): QuestState {
  return {
    chapter: 1,
    step: 0,
    flags: {},
    counters: {},
    unlocked: [],
  };
}

/** The active step, or null when the quest is complete. */
export function currentStep(state: QuestState): QuestStep | null {
  const steps = CHAPTERS[state.chapter - 1];
  if (!steps) return null;
  return steps[state.step] ?? null;
}

/** The active step's objective, or the completion sentinel when finished. */
export function currentObjective(state: QuestState): string {
  return currentStep(state)?.objective ?? COMPLETE_OBJECTIVE;
}

/** True once the final chapter's steps are all done. */
export function isComplete(state: QuestState): boolean {
  return state.chapter > CHAPTERS.length || currentStep(state) === null;
}

/** Game-layer convenience: set a flag true (mutates state). */
export function raiseFlag(state: QuestState, flag: string): void {
  state.flags[flag] = true;
}

/** Game-layer convenience: add `n` (default 1) to a counter (mutates state). */
export function addCounter(state: QuestState, key: string, n: number = 1): void {
  state.counters[key] = (state.counters[key] ?? 0) + n;
}

/** Push an unlock id, skipping duplicates. Returns whether it was new. */
function recordUnlock(state: QuestState, id: string): boolean {
  if (state.unlocked.includes(id)) return false;
  state.unlocked.push(id);
  return true;
}

/**
 * Walk forward through every step whose predicate(ctx) is currently true:
 * record its unlocks, then move to the next step — rolling into the next
 * chapter's step 0 at a chapter boundary, and stopping at the final chapter's
 * end. Never skips a step whose predicate is false (an earlier false predicate
 * blocks all later ones). Deterministic and idempotent: re-calling with an
 * unsatisfied current predicate is a no-op.
 *
 * Returns { advanced, newlyUnlocked } — `newlyUnlocked` lists unlock ids that
 * crossed from locked→unlocked in THIS call (deduped against prior unlocks), so
 * the game layer can fire one-shot grant/HUD effects.
 */
export function advance(
  state: QuestState,
  ctx: QuestContext,
): { advanced: boolean; newlyUnlocked: string[] } {
  const newlyUnlocked: string[] = [];
  let advanced = false;

  // Bounded by total step count — each iteration consumes one step.
  for (;;) {
    const step = currentStep(state);
    if (!step) break; // quest complete — nothing left to satisfy.
    if (!step.predicate(ctx)) break; // current beat unsatisfied — stop here.

    for (const id of step.unlocks ?? []) {
      if (recordUnlock(state, id)) newlyUnlocked.push(id);
    }
    advanced = true;

    // Move to the next step, rolling into the next chapter when exhausted.
    // currentStep() was non-null above, so this chapter's step list exists.
    state.step += 1;
    const steps = CHAPTERS[state.chapter - 1] ?? [];
    if (state.step >= steps.length) {
      if (state.chapter < CHAPTERS.length) {
        state.chapter += 1;
        state.step = 0;
      } else {
        // Final chapter exhausted: leave step at length as the "complete" marker.
        break;
      }
    }
  }

  return { advanced, newlyUnlocked };
}
