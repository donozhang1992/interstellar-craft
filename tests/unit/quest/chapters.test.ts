// Spec: GAME_DESIGN §3b (ch1 steps) + §3c (ch2 steps) + §3d (ch3-5 steps). CONTRACT
// test — freezes the chapter/step ids, objective strings, thresholds, and unlocks as
// literals so the game-layer glue and the HUD can rely on exact values. Changing a
// value here means changing GAME_DESIGN in the same commit (per the doc's own rule).
import { describe, expect, it } from 'vitest';
import { createInventory } from '../../../src/core/player/inventory';
import type { QuestContext, QuestState } from '../../../src/core/quest/engine';
import { advance, createQuestState, isComplete } from '../../../src/core/quest/engine';
import { CHAPTER_COUNT, CHAPTERS } from '../../../src/core/quest/chapters';

function ctx(
  flags: Record<string, boolean> = {},
  counters: Record<string, number> = {},
): QuestContext {
  return { flags, counters, inv: createInventory() };
}

describe('CHAPTERS table shape', () => {
  it('exposes 5 chapters (index 0 = chapter 1)', () => {
    expect(CHAPTER_COUNT).toBe(5);
    expect(CHAPTERS.length).toBe(5);
  });

  it('chapter 1 has 4 steps in canonical order', () => {
    expect(CHAPTERS[0]!.map((s) => s.id)).toEqual(['move', 'mine', 'place', 'salvage']);
  });

  it('chapter 2 has 2 steps in canonical order', () => {
    expect(CHAPTERS[1]!.map((s) => s.id)).toEqual(['antenna', 'decode']);
  });

  it('chapter 3 has 2 steps in canonical order', () => {
    expect(CHAPTERS[2]!.map((s) => s.id)).toEqual(['descend', 'harvest']);
  });

  it('chapter 4 has 1 step in canonical order', () => {
    expect(CHAPTERS[3]!.map((s) => s.id)).toEqual(['beacon']);
  });

  it('chapter 5 has 2 steps in canonical order', () => {
    expect(CHAPTERS[4]!.map((s) => s.id)).toEqual(['charge', 'ignite']);
  });
});

describe('chapter 1 — Crash Site (frozen objectives + thresholds)', () => {
  const ch1 = CHAPTERS[0]!;
  const move = ch1[0]!;
  const mine = ch1[1]!;
  const place = ch1[2]!;
  const salvage = ch1[3]!;

  it('move: "Move with WASD", moveTicks >= 30', () => {
    expect(move.objective).toBe('Move with WASD');
    expect(move.predicate(ctx({}, { moveTicks: 29 }))).toBe(false);
    expect(move.predicate(ctx({}, { moveTicks: 30 }))).toBe(true);
    expect(move.predicate(ctx({}, { moveTicks: 31 }))).toBe(true);
    expect(move.predicate(ctx())).toBe(false); // missing counter
    expect(move.unlocks ?? []).toEqual([]);
  });

  it('mine: "Mine 10 regolith", mined:regolith >= 10', () => {
    expect(mine.objective).toBe('Mine 10 regolith');
    expect(mine.predicate(ctx({}, { 'mined:regolith': 9 }))).toBe(false);
    expect(mine.predicate(ctx({}, { 'mined:regolith': 10 }))).toBe(true);
    expect(mine.predicate(ctx())).toBe(false);
    expect(mine.unlocks ?? []).toEqual([]);
  });

  it('place: "Place 5 blocks", placed >= 5', () => {
    expect(place.objective).toBe('Place 5 blocks');
    expect(place.predicate(ctx({}, { placed: 4 }))).toBe(false);
    expect(place.predicate(ctx({}, { placed: 5 }))).toBe(true);
    expect(place.predicate(ctx())).toBe(false);
    expect(place.unlocks ?? []).toEqual([]);
  });

  it('salvage: "Salvage the crash pod [E]", flags.salvaged, unlocks workbench', () => {
    expect(salvage.objective).toBe('Salvage the crash pod [E]');
    expect(salvage.predicate(ctx({ salvaged: false }))).toBe(false);
    expect(salvage.predicate(ctx())).toBe(false);
    expect(salvage.predicate(ctx({ salvaged: true }))).toBe(true);
    expect(salvage.unlocks).toEqual(['workbench']);
  });
});

describe('chapter 2 — The Signal (frozen objectives + thresholds)', () => {
  const ch2 = CHAPTERS[1]!;
  const antenna = ch2[0]!;
  const decode = ch2[1]!;

  it('antenna: objective frozen, flags.antennaBuilt', () => {
    expect(antenna.objective).toBe('Raise the antenna (3 antenna blocks atop a 4-high mast)');
    expect(antenna.predicate(ctx({ antennaBuilt: false }))).toBe(false);
    expect(antenna.predicate(ctx())).toBe(false);
    expect(antenna.predicate(ctx({ antennaBuilt: true }))).toBe(true);
    expect(antenna.unlocks ?? []).toEqual([]);
  });

  it('decode: "Decode the 3 pulses", puzzlesSolved >= 3, unlocks scanner', () => {
    expect(decode.objective).toBe('Decode the 3 pulses');
    expect(decode.predicate(ctx({}, { puzzlesSolved: 2 }))).toBe(false);
    expect(decode.predicate(ctx({}, { puzzlesSolved: 3 }))).toBe(true);
    expect(decode.predicate(ctx())).toBe(false);
    expect(decode.unlocks).toEqual(['scanner']);
  });

  it('ch2 predicates read ONLY flags/counters, never inv (decouple from M3.2)', () => {
    // Decode must not depend on inventory — a fully empty inventory still solves
    // when the counter is set (the game layer sets it from M3.2 validators).
    expect(decode.predicate(ctx({}, { puzzlesSolved: 3 }))).toBe(true);
  });
});

describe('chapter 3 — Deep Veins (frozen objectives + thresholds)', () => {
  const ch3 = CHAPTERS[2]!;
  const descend = ch3[0]!;
  const harvest = ch3[1]!;

  it('descend: "Descend into the caves", caveDepthReached >= 1', () => {
    expect(descend.objective).toBe('Descend into the caves');
    expect(descend.predicate(ctx({}, { caveDepthReached: 0 }))).toBe(false);
    expect(descend.predicate(ctx({}, { caveDepthReached: 1 }))).toBe(true);
    expect(descend.predicate(ctx({}, { caveDepthReached: 2 }))).toBe(true);
    expect(descend.predicate(ctx())).toBe(false); // missing counter
    expect(descend.unlocks ?? []).toEqual([]);
  });

  it('harvest: "Collect 12 crystal", collected:crystal >= 12, unlocks jump_pack', () => {
    expect(harvest.objective).toBe('Collect 12 crystal');
    expect(harvest.predicate(ctx({}, { 'collected:crystal': 11 }))).toBe(false);
    expect(harvest.predicate(ctx({}, { 'collected:crystal': 12 }))).toBe(true);
    expect(harvest.predicate(ctx({}, { 'collected:crystal': 13 }))).toBe(true);
    expect(harvest.predicate(ctx())).toBe(false);
    expect(harvest.unlocks).toEqual(['jump_pack']);
  });
});

describe('chapter 4 — The Beacon (frozen objectives + thresholds)', () => {
  const ch4 = CHAPTERS[3]!;
  const beacon = ch4[0]!;

  it('beacon: objective frozen, flags.beaconValid, unlocks fusion_igniter', () => {
    expect(beacon.objective).toBe(
      'Build the beacon (launchpad → 6 beacon-core mast → antenna cap)',
    );
    expect(beacon.predicate(ctx({ beaconValid: false }))).toBe(false);
    expect(beacon.predicate(ctx())).toBe(false);
    expect(beacon.predicate(ctx({ beaconValid: true }))).toBe(true);
    expect(beacon.unlocks).toEqual(['fusion_igniter']);
  });

  it('beacon predicate reads ONLY the flag, never inv (decouple from validator)', () => {
    // The game layer (M4.3) runs validateBeacon(world) and sets the flag; the
    // predicate must not depend on inventory or import the validator.
    expect(beacon.predicate(ctx({ beaconValid: true }))).toBe(true);
  });
});

describe('chapter 5 — First Contact (frozen objectives + thresholds)', () => {
  const ch5 = CHAPTERS[4]!;
  const charge = ch5[0]!;
  const ignite = ch5[1]!;

  it('charge: "Charge the beacon (insert 8 crystal)", beaconCharge >= 8', () => {
    expect(charge.objective).toBe('Charge the beacon (insert 8 crystal)');
    expect(charge.predicate(ctx({}, { beaconCharge: 7 }))).toBe(false);
    expect(charge.predicate(ctx({}, { beaconCharge: 8 }))).toBe(true);
    expect(charge.predicate(ctx({}, { beaconCharge: 9 }))).toBe(true);
    expect(charge.predicate(ctx())).toBe(false);
    expect(charge.unlocks ?? []).toEqual([]);
  });

  it('ignite: "Ignite [E]", flags.ignited, unlocks free_mode', () => {
    expect(ignite.objective).toBe('Ignite [E]');
    expect(ignite.predicate(ctx({ ignited: false }))).toBe(false);
    expect(ignite.predicate(ctx())).toBe(false);
    expect(ignite.predicate(ctx({ ignited: true }))).toBe(true);
    expect(ignite.unlocks).toEqual(['free_mode']);
  });
});

describe('scripted ch1→ch5 walk (engine drives the full table)', () => {
  // Raise flags/counters in canonical order and assert each chapter/step
  // transition; the engine (engine.ts, UNCHANGED) must roll generically across
  // all 5 chapters and only report complete at the very end of ch5.
  function full(flags: Record<string, boolean>, counters: Record<string, number>) {
    return { flags, counters, inv: createInventory() };
  }

  it('walks every step in order, firing unlocks once, completing only at ch5 end', () => {
    const s: QuestState = createQuestState();
    const flags: Record<string, boolean> = {};
    const counters: Record<string, number> = {};

    expect(s.chapter).toBe(1);
    expect(s.step).toBe(0);
    expect(isComplete(s)).toBe(false);

    // — Chapter 1 —
    counters.moveTicks = 30;
    expect(advance(s, full(flags, counters))).toEqual({ advanced: true, newlyUnlocked: [] });
    expect([s.chapter, s.step]).toEqual([1, 1]);

    counters['mined:regolith'] = 10;
    advance(s, full(flags, counters));
    expect([s.chapter, s.step]).toEqual([1, 2]);

    counters.placed = 5;
    advance(s, full(flags, counters));
    expect([s.chapter, s.step]).toEqual([1, 3]);

    flags.salvaged = true;
    expect(advance(s, full(flags, counters))).toEqual({
      advanced: true,
      newlyUnlocked: ['workbench'],
    });
    // ch1 exhausted → rolled into ch2 step 0
    expect([s.chapter, s.step]).toEqual([2, 0]);

    // — Chapter 2 —
    flags.antennaBuilt = true;
    advance(s, full(flags, counters));
    expect([s.chapter, s.step]).toEqual([2, 1]);

    counters.puzzlesSolved = 3;
    expect(advance(s, full(flags, counters))).toEqual({
      advanced: true,
      newlyUnlocked: ['scanner'],
    });
    expect([s.chapter, s.step]).toEqual([3, 0]);

    // — Chapter 3 —
    counters.caveDepthReached = 1;
    advance(s, full(flags, counters));
    expect([s.chapter, s.step]).toEqual([3, 1]);

    counters['collected:crystal'] = 12;
    expect(advance(s, full(flags, counters))).toEqual({
      advanced: true,
      newlyUnlocked: ['jump_pack'],
    });
    expect([s.chapter, s.step]).toEqual([4, 0]);

    // — Chapter 4 —
    flags.beaconValid = true;
    expect(advance(s, full(flags, counters))).toEqual({
      advanced: true,
      newlyUnlocked: ['fusion_igniter'],
    });
    expect([s.chapter, s.step]).toEqual([5, 0]);
    expect(isComplete(s)).toBe(false);

    // — Chapter 5 —
    counters.beaconCharge = 8;
    advance(s, full(flags, counters));
    expect([s.chapter, s.step]).toEqual([5, 1]);
    expect(isComplete(s)).toBe(false);

    flags.ignited = true;
    expect(advance(s, full(flags, counters))).toEqual({
      advanced: true,
      newlyUnlocked: ['free_mode'],
    });
    // Final chapter exhausted: step parked at length, quest complete.
    expect(s.chapter).toBe(5);
    expect(s.step).toBe(CHAPTERS[4]!.length);
    expect(isComplete(s)).toBe(true);

    // No over-advance / no duplicate unlocks on re-call.
    expect(advance(s, full(flags, counters))).toEqual({ advanced: false, newlyUnlocked: [] });
    expect(s.unlocked).toEqual([
      'workbench',
      'scanner',
      'jump_pack',
      'fusion_igniter',
      'free_mode',
    ]);
  });

  it('an unsatisfied predicate mid-table blocks all later chapters', () => {
    // All flags/counters set EXCEPT the ch3 harvest threshold → engine stalls at
    // ch3 step 1 and never reaches ch4/ch5.
    const s: QuestState = createQuestState();
    const flags = {
      salvaged: true,
      antennaBuilt: true,
      beaconValid: true,
      ignited: true,
    };
    const counters: Record<string, number> = {
      moveTicks: 30,
      'mined:regolith': 10,
      placed: 5,
      puzzlesSolved: 3,
      caveDepthReached: 1,
      'collected:crystal': 11, // one short
      beaconCharge: 8,
    };
    advance(s, full(flags, counters));
    expect([s.chapter, s.step]).toEqual([3, 1]);
    expect(isComplete(s)).toBe(false);
    expect(s.unlocked).toEqual(['workbench', 'scanner']);
  });
});
