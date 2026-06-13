/**
 * Chapter / step table — GAME_DESIGN §3b (ch1 Crash Site) + §3c (ch2 The Signal).
 * The objective strings + thresholds + unlocks here are CANONICAL and frozen by a
 * contract test (tests/unit/quest/chapters.test.ts); changing any of them requires
 * an accompanying GAME_DESIGN edit in the same commit.
 *
 * Predicates are pure functions of QuestContext and read ONLY flags/counters for
 * ch1/ch2 (no inv use yet). DECOUPLING (M3.2/M3.3): ch2 predicates do NOT call the
 * decode/antenna structural validators — those live in src/core/quest/decode.ts /
 * antenna.ts (parallel M3.2 work) and are wired by the game layer (M3.3), which
 * sets `flags.antennaBuilt` and `counters.puzzlesSolved` from their results. The
 * engine just reads those.
 */
import type { QuestContext, QuestStep } from './engine';

/** Read a counter as 0 when absent. */
function counter(ctx: QuestContext, key: string): number {
  return ctx.counters[key] ?? 0;
}

/** Chapter 1 — Crash Site: the guided tutorial beats. */
const CHAPTER_1: QuestStep[] = [
  {
    id: 'move',
    objective: 'Move with WASD',
    predicate: (ctx) => counter(ctx, 'moveTicks') >= 30,
  },
  {
    id: 'mine',
    objective: 'Mine 10 regolith',
    predicate: (ctx) => counter(ctx, 'mined:regolith') >= 10,
  },
  {
    id: 'place',
    objective: 'Place 5 blocks',
    predicate: (ctx) => counter(ctx, 'placed') >= 5,
  },
  {
    id: 'salvage',
    objective: 'Salvage the crash pod [E]',
    predicate: (ctx) => ctx.flags.salvaged === true,
    unlocks: ['workbench'],
  },
];

/** Chapter 2 — The Signal: build the antenna, decode the pulses. */
const CHAPTER_2: QuestStep[] = [
  {
    id: 'antenna',
    objective: 'Raise the antenna (3 antenna blocks atop a 4-high mast)',
    predicate: (ctx) => ctx.flags.antennaBuilt === true,
  },
  {
    id: 'decode',
    objective: 'Decode the 3 pulses',
    predicate: (ctx) => counter(ctx, 'puzzlesSolved') >= 3,
    unlocks: ['scanner'],
  },
];

/** All chapters, index 0 = chapter 1. */
export const CHAPTERS: QuestStep[][] = [CHAPTER_1, CHAPTER_2];

/** Number of chapters defined in the M3 quest (currently 2). */
export const CHAPTER_COUNT = CHAPTERS.length;
