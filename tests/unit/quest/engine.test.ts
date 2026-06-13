// Spec: GAME_DESIGN §3a (quest engine model — canonical) + §3b/§3c steps + M3.1 brief.
// The engine is a pure linear state machine over CHAPTERS (chapters.ts). Predicates
// read a read-only QuestContext { flags, counters, inv }; advance() walks every step
// whose predicate is satisfied, recording unlocks, deterministic + idempotent.
import { describe, expect, it } from 'vitest';
import { createInventory } from '../../../src/core/player/inventory';
import type { Inventory } from '../../../src/core/player/inventory';
import {
  addCounter,
  advance,
  createQuestState,
  currentObjective,
  currentStep,
  isComplete,
  raiseFlag,
} from '../../../src/core/quest/engine';
import type { QuestContext, QuestState } from '../../../src/core/quest/engine';
import { CHAPTER_COUNT, CHAPTERS } from '../../../src/core/quest/chapters';

/** A context whose predicates all evaluate false (fresh flags/counters). */
function emptyCtx(inv: Inventory = createInventory()): QuestContext {
  return { flags: {}, counters: {}, inv };
}

/** Mirror a state's flags/counters into a fresh context the predicates read. */
function ctxFromState(state: QuestState): QuestContext {
  return { flags: { ...state.flags }, counters: { ...state.counters }, inv: createInventory() };
}

describe('createQuestState', () => {
  it('starts at chapter 1, step 0, empty everything', () => {
    const s = createQuestState();
    expect(s.chapter).toBe(1);
    expect(s.step).toBe(0);
    expect(s.flags).toEqual({});
    expect(s.counters).toEqual({});
    expect(s.unlocked).toEqual([]);
  });

  it('returns independent fresh objects each call', () => {
    const a = createQuestState();
    const b = createQuestState();
    a.flags.x = true;
    a.counters.y = 5;
    a.unlocked.push('z');
    expect(b.flags).toEqual({});
    expect(b.counters).toEqual({});
    expect(b.unlocked).toEqual([]);
  });
});

describe('currentStep / currentObjective', () => {
  it('reports the active step at the start', () => {
    const s = createQuestState();
    const step = currentStep(s);
    expect(step?.id).toBe('move');
    expect(currentObjective(s)).toBe('Move with WASD');
  });

  it('reports a "complete" sentinel when the quest is finished', () => {
    const s = createQuestState();
    s.chapter = CHAPTER_COUNT;
    s.step = CHAPTERS[CHAPTER_COUNT - 1]!.length; // one past the last step
    expect(currentStep(s)).toBeNull();
    expect(isComplete(s)).toBe(true);
    expect(typeof currentObjective(s)).toBe('string');
    expect(currentObjective(s).length).toBeGreaterThan(0);
  });
});

describe('raiseFlag / addCounter helpers', () => {
  it('raiseFlag sets a flag true', () => {
    const s = createQuestState();
    raiseFlag(s, 'salvaged');
    expect(s.flags.salvaged).toBe(true);
  });

  it('addCounter defaults to +1 and accumulates', () => {
    const s = createQuestState();
    addCounter(s, 'placed');
    addCounter(s, 'placed', 4);
    expect(s.counters.placed).toBe(5);
  });
});

describe('advance — gating', () => {
  it('does not advance while the current predicate is false', () => {
    const s = createQuestState();
    const r = advance(s, emptyCtx());
    expect(r.advanced).toBe(false);
    expect(r.newlyUnlocked).toEqual([]);
    expect(s.step).toBe(0);
    expect(s.chapter).toBe(1);
  });

  it('advances exactly one step when only the current predicate is satisfied', () => {
    const s = createQuestState();
    const ctx = emptyCtx();
    ctx.counters.moveTicks = 30; // step 0 (move) satisfied; step 1 (mine) not
    const r = advance(s, ctx);
    expect(r.advanced).toBe(true);
    expect(s.step).toBe(1);
    expect(currentStep(s)?.id).toBe('mine');
  });

  it('is idempotent: a second advance with an unsatisfied predicate is a no-op', () => {
    const s = createQuestState();
    const ctx = emptyCtx();
    ctx.counters.moveTicks = 30;
    advance(s, ctx);
    const r2 = advance(s, ctx);
    expect(r2.advanced).toBe(false);
    expect(s.step).toBe(1);
  });

  it('does not skip an earlier unsatisfied step even if a later predicate is true', () => {
    const s = createQuestState();
    const ctx = emptyCtx();
    // step 0 (move) NOT satisfied, but step 2 (place) IS — must not jump.
    ctx.counters.placed = 99;
    const r = advance(s, ctx);
    expect(r.advanced).toBe(false);
    expect(s.step).toBe(0);
  });

  it('walks multiple consecutive satisfied steps in one call', () => {
    const s = createQuestState();
    const ctx = emptyCtx();
    ctx.counters.moveTicks = 30;
    ctx.counters['mined:regolith'] = 10;
    const r = advance(s, ctx);
    expect(r.advanced).toBe(true);
    expect(s.step).toBe(2); // move + mine done, sitting on place
    expect(currentStep(s)?.id).toBe('place');
  });
});

describe('advance — unlocks', () => {
  it('records a step unlock when it completes', () => {
    const s = createQuestState();
    // Satisfy all of ch1 so salvage (unlocks workbench) fires.
    const ctx: QuestContext = {
      flags: { salvaged: true },
      counters: { moveTicks: 30, 'mined:regolith': 10, placed: 5 },
      inv: createInventory(),
    };
    const r = advance(s, ctx);
    expect(r.newlyUnlocked).toContain('workbench');
    expect(s.unlocked).toContain('workbench');
  });

  it('does not duplicate an unlock across repeated advance calls', () => {
    const s = createQuestState();
    const ctx: QuestContext = {
      flags: { salvaged: true, antennaBuilt: true },
      counters: { moveTicks: 30, 'mined:regolith': 10, placed: 5, puzzlesSolved: 3 },
      inv: createInventory(),
    };
    advance(s, ctx);
    advance(s, ctx); // run again — should add nothing new
    const workbenchCount = s.unlocked.filter((u) => u === 'workbench').length;
    const scannerCount = s.unlocked.filter((u) => u === 'scanner').length;
    expect(workbenchCount).toBe(1);
    expect(scannerCount).toBe(1);
  });

  it('newlyUnlocked is empty on a no-op advance', () => {
    const s = createQuestState();
    const r = advance(s, emptyCtx());
    expect(r.newlyUnlocked).toEqual([]);
  });
});

describe('advance — chapter rollover', () => {
  it('rolls from the last ch1 step into ch2 step 0', () => {
    const s = createQuestState();
    const ctx: QuestContext = {
      flags: { salvaged: true },
      counters: { moveTicks: 30, 'mined:regolith': 10, placed: 5 },
      inv: createInventory(),
    };
    advance(s, ctx);
    expect(s.chapter).toBe(2);
    expect(s.step).toBe(0);
    expect(currentStep(s)?.id).toBe('antenna');
    expect(isComplete(s)).toBe(false);
  });

  it('completing the final chapter sets isComplete and stops', () => {
    const s = createQuestState();
    // Satisfy every chapter's steps at once (ch1→ch5); advance consumes the
    // whole satisfied prefix in a single call and parks at the end of ch5.
    const ctx: QuestContext = {
      flags: { salvaged: true, antennaBuilt: true, beaconValid: true, ignited: true },
      counters: {
        moveTicks: 30,
        'mined:regolith': 10,
        placed: 5,
        puzzlesSolved: 3,
        caveDepthReached: 1,
        'collected:crystal': 12,
        beaconCharge: 8,
      },
      inv: createInventory(),
    };
    advance(s, ctx);
    expect(isComplete(s)).toBe(true);
    expect(s.chapter).toBe(CHAPTER_COUNT);
    expect(s.step).toBe(CHAPTERS[CHAPTER_COUNT - 1]!.length);
    // Idempotent at the end: advancing again does nothing.
    const r = advance(s, ctx);
    expect(r.advanced).toBe(false);
    expect(r.newlyUnlocked).toEqual([]);
  });
});

describe('full scripted playthrough ch1 → ch5', () => {
  it('progresses beat by beat as flags/counters are raised in order', () => {
    const s = createQuestState();

    // Nothing raised yet.
    expect(advance(s, ctxFromState(s)).advanced).toBe(false);
    expect(currentStep(s)?.id).toBe('move');

    // Beat 1: move.
    addCounter(s, 'moveTicks', 30);
    advance(s, ctxFromState(s));
    expect(currentStep(s)?.id).toBe('mine');

    // Beat 2: mine 10 regolith.
    addCounter(s, 'mined:regolith', 10);
    advance(s, ctxFromState(s));
    expect(currentStep(s)?.id).toBe('place');

    // Beat 3: place 5 blocks.
    addCounter(s, 'placed', 5);
    advance(s, ctxFromState(s));
    expect(currentStep(s)?.id).toBe('salvage');

    // Beat 4: salvage pod → rolls into ch2.
    raiseFlag(s, 'salvaged');
    const r4 = advance(s, ctxFromState(s));
    expect(r4.newlyUnlocked).toContain('workbench');
    expect(s.chapter).toBe(2);
    expect(currentStep(s)?.id).toBe('antenna');

    // Beat 5: antenna.
    raiseFlag(s, 'antennaBuilt');
    advance(s, ctxFromState(s));
    expect(currentStep(s)?.id).toBe('decode');

    // Beat 6: decode 3 pulses → rolls into ch3.
    addCounter(s, 'puzzlesSolved', 3);
    const r6 = advance(s, ctxFromState(s));
    expect(r6.newlyUnlocked).toContain('scanner');
    expect(s.chapter).toBe(3);
    expect(currentStep(s)?.id).toBe('descend');

    // Beat 7: descend into the caves.
    addCounter(s, 'caveDepthReached', 1);
    advance(s, ctxFromState(s));
    expect(currentStep(s)?.id).toBe('harvest');

    // Beat 8: collect 12 crystal → unlocks jump pack, rolls into ch4.
    addCounter(s, 'collected:crystal', 12);
    const r8 = advance(s, ctxFromState(s));
    expect(r8.newlyUnlocked).toContain('jump_pack');
    expect(s.chapter).toBe(4);
    expect(currentStep(s)?.id).toBe('beacon');

    // Beat 9: build the beacon → unlocks fusion igniter, rolls into ch5.
    raiseFlag(s, 'beaconValid');
    const r9 = advance(s, ctxFromState(s));
    expect(r9.newlyUnlocked).toContain('fusion_igniter');
    expect(s.chapter).toBe(5);
    expect(currentStep(s)?.id).toBe('charge');

    // Beat 10: charge with 8 crystal.
    addCounter(s, 'beaconCharge', 8);
    advance(s, ctxFromState(s));
    expect(currentStep(s)?.id).toBe('ignite');

    // Beat 11: ignite → ending, free mode unlocked, quest complete.
    raiseFlag(s, 'ignited');
    const r11 = advance(s, ctxFromState(s));
    expect(r11.newlyUnlocked).toContain('free_mode');
    expect(isComplete(s)).toBe(true);
  });
});
