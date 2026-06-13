// Spec: GAME_DESIGN §3b (ch1 steps) + §3c (ch2 steps). CONTRACT test — freezes the
// chapter/step ids, objective strings, thresholds, and unlocks as literals so M3.3
// game-layer glue and the HUD can rely on exact values. Changing a value here means
// changing GAME_DESIGN in the same commit (per the doc's own rule).
import { describe, expect, it } from 'vitest';
import { createInventory } from '../../../src/core/player/inventory';
import type { QuestContext } from '../../../src/core/quest/engine';
import { CHAPTER_COUNT, CHAPTERS } from '../../../src/core/quest/chapters';

function ctx(
  flags: Record<string, boolean> = {},
  counters: Record<string, number> = {},
): QuestContext {
  return { flags, counters, inv: createInventory() };
}

describe('CHAPTERS table shape', () => {
  it('exposes chapter 1 and chapter 2 (index 0 = chapter 1)', () => {
    expect(CHAPTER_COUNT).toBe(2);
    expect(CHAPTERS.length).toBe(2);
  });

  it('chapter 1 has 4 steps in canonical order', () => {
    expect(CHAPTERS[0]!.map((s) => s.id)).toEqual(['move', 'mine', 'place', 'salvage']);
  });

  it('chapter 2 has 2 steps in canonical order', () => {
    expect(CHAPTERS[1]!.map((s) => s.id)).toEqual(['antenna', 'decode']);
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
