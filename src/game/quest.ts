/**
 * Quest bridge (M3.3) — the game-layer wiring between the pure-core quest engine
 * (`src/core/quest/engine.ts` + `chapters.ts`) and live gameplay.
 *
 * The engine is a pure linear state machine that reads a read-only QuestContext
 * each tick (GAME_DESIGN §3a). This class OWNS the single QuestState, raises
 * flags / bumps counters from real gameplay events (movement, mining, placement,
 * pod salvage, antenna build, decode solves), builds the ctx each fixed step,
 * and calls `advance`. On `newlyUnlocked` it fires one-shot effects:
 *  - `workbench` (ch1 salvage) → small material grant + flag (the M3 decision
 *    keeps the M1 starter kit, so this is flavor + a bonus, not a gear gate);
 *  - `scanner` (ch2 decode) → flips the scanner-unlocked flag (drives the
 *    optional ore-highlight effect).
 *
 * Determinism: nothing here touches the clock. `step()` runs once per fixed sim
 * step; every counter/flag/transition is a pure function of stepped events, so
 * under `__TEST__` the quest state after `stepFrames(n)` is reproducible. The
 * subtitle band timer (subtitle.ts) is likewise driven by stepped frames.
 *
 * Effects (grants, scanner flag, subtitle beats) are delivered to the game layer
 * through an injected QuestEffects sink so this module stays free of three.js/DOM.
 */
import {
  advance,
  createQuestState,
  currentObjective,
  currentStep,
  isComplete,
  raiseFlag,
  addCounter,
  type QuestState,
} from '../core/quest/engine';
import type { Inventory } from '../core/player/inventory';

/** One-shot side-effects the quest bridge fires; the game layer supplies the sink. */
export interface QuestEffects {
  /** Grant items to the inventory (ch1 salvage bonus). */
  grant(itemId: string, count: number): void;
  /** Fired when an unlock id first crosses locked→unlocked (workbench, scanner). */
  onUnlock(id: string): void;
  /** Fired on every chapter/step transition with the NEW objective string. */
  onTransition(objective: string): void;
}

/** Counter keys raised from gameplay (frozen by chapters.ts predicates). */
export const COUNTER_MOVE = 'moveTicks';
export const COUNTER_MINED_REGOLITH = 'mined:regolith';
export const COUNTER_PLACED = 'placed';
export const COUNTER_PUZZLES = 'puzzlesSolved';

/** Flags raised from gameplay (frozen by chapters.ts predicates). */
export const FLAG_SALVAGED = 'salvaged';
export const FLAG_ANTENNA_BUILT = 'antennaBuilt';

/** ch1 salvage grant (M3 decision: flavor bonus atop the kept starter kit). */
const SALVAGE_GRANT: ReadonlyArray<readonly [string, number]> = [
  ['block:9', 2], // 2 hull plates pried from the wreck
];

export class QuestBridge {
  readonly state: QuestState = createQuestState();
  /** True once ch1 salvage unlocked the workbench (flavor gate for M3.4). */
  workbenchUnlocked = false;
  /** True once ch2 decode unlocked the scanner (drives the ore highlight). */
  scannerUnlocked = false;
  /** Last objective string pushed through onTransition (dedup transitions). */
  private lastObjective: string;

  constructor(
    private readonly inv: Inventory,
    private readonly effects: QuestEffects,
  ) {
    this.lastObjective = currentObjective(this.state);
    // Emit the opening beat so the subtitle band shows ch1 step 1 from boot.
    this.effects.onTransition(this.lastObjective);
  }

  /** The live objective HUD string (top-right line, GAME_DESIGN §10). */
  objective(): string {
    return currentObjective(this.state);
  }

  /** True once every chapter/step is done. */
  complete(): boolean {
    return isComplete(this.state);
  }

  /** Game-event → counter. Mirrors into ctx on the next step(). */
  addCounter(key: string, n = 1): void {
    addCounter(this.state, key, n);
  }

  /** Game-event → flag. Mirrors into ctx on the next step(). */
  raiseFlag(flag: string): void {
    raiseFlag(this.state, flag);
  }

  /**
   * Advance the engine one fixed step: build ctx from the mirrored flags/counters
   * + the LIVE inventory, call advance(), then fire one-shot effects for anything
   * newly unlocked and emit a transition when the objective changed.
   */
  step(): void {
    const { newlyUnlocked } = advance(this.state, {
      flags: this.state.flags,
      counters: this.state.counters,
      inv: this.inv,
    });
    for (const id of newlyUnlocked) this.fireUnlock(id);
    const obj = currentObjective(this.state);
    if (obj !== this.lastObjective) {
      this.lastObjective = obj;
      this.effects.onTransition(obj);
    }
  }

  /** One-shot unlock effect dispatch (workbench grant, scanner flag). */
  private fireUnlock(id: string): void {
    if (id === 'workbench') {
      this.workbenchUnlocked = true;
      for (const [itemId, count] of SALVAGE_GRANT) this.effects.grant(itemId, count);
    } else if (id === 'scanner') {
      this.scannerUnlocked = true;
    }
    this.effects.onUnlock(id);
  }

  /** The active step id (or null when complete) — for the game layer / tests. */
  currentStepId(): string | null {
    return currentStep(this.state)?.id ?? null;
  }

  /**
   * The decode glyph index the player is currently solving (0..GLYPH_COUNT-1) =
   * the count of pulses already solved. The decode UI shows GLYPHS[this], and a
   * solve bumps `puzzlesSolved` (which is both the progress and the next index).
   */
  decodeGlyphIndex(): number {
    return this.state.counters[COUNTER_PUZZLES] ?? 0;
  }

  /** Mark the current decode pulse solved (ch2 step2). */
  solvePulse(): void {
    addCounter(this.state, COUNTER_PUZZLES);
  }
}
