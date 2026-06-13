/**
 * Chapter / step table — GAME_DESIGN §3b (ch1 Crash Site) + §3c (ch2 The Signal)
 * + §3d (ch3 Deep Veins, ch4 The Beacon, ch5 First Contact). The objective strings
 * + thresholds + unlocks here are CANONICAL and frozen by a contract test
 * (tests/unit/quest/chapters.test.ts); changing any of them requires an accompanying
 * GAME_DESIGN edit in the same commit.
 *
 * Predicates are pure functions of QuestContext and read ONLY flags/counters (no inv
 * use). DECOUPLING (M3.2/M3.3, M4.3): predicates NEVER call structural validators —
 * the decode/antenna validators (src/core/quest/decode.ts / antenna.ts) and the
 * beacon validator (src/core/quest/beacon.ts, parallel M4 work) are wired by the
 * game layer, which mirrors their results into flags/counters. Specifically the game
 * layer sets `flags.antennaBuilt`, `flags.beaconValid`, `flags.salvaged`,
 * `flags.ignited` and bumps `counters.puzzlesSolved`, `counters.caveDepthReached`,
 * `counters['collected:crystal']`, `counters.beaconCharge`. The engine just reads
 * those — chapters.ts imports nothing but the engine's types.
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

/**
 * Chapter 3 — Deep Veins: dive into the caves, gather crystal under O₂ pressure.
 * `descend` uses a COUNTER (caveDepthReached >= 1) rather than a flag purely for
 * engine uniformity with the other depth/collection beats — the game layer sets the
 * counter to 1 on first deep entry (feet y < 20, §3d). 0 means "not yet descended".
 */
const CHAPTER_3: QuestStep[] = [
  {
    id: 'descend',
    objective: 'Descend into the caves',
    predicate: (ctx) => counter(ctx, 'caveDepthReached') >= 1,
  },
  {
    id: 'harvest',
    objective: 'Collect 12 crystal',
    predicate: (ctx) => counter(ctx, 'collected:crystal') >= 12,
    unlocks: ['jump_pack'],
  },
];

/**
 * Chapter 4 — The Beacon: assemble the launchpad → 6 beacon-core mast → antenna cap.
 * The predicate reads ONLY `flags.beaconValid`; the game layer (M4.3) runs
 * validateBeacon(world) and mirrors the result into that flag. chapters.ts must not
 * import the validator (decoupling).
 */
const CHAPTER_4: QuestStep[] = [
  {
    id: 'beacon',
    objective: 'Build the beacon (launchpad → 6 beacon-core mast → antenna cap)',
    predicate: (ctx) => ctx.flags.beaconValid === true,
    unlocks: ['fusion_igniter'],
  },
];

/**
 * Chapter 5 — First Contact: charge the beacon with crystal, then ignite to launch.
 * `charge` counts inserted crystal (beaconCharge >= 8); `ignite` is the final [E]
 * interaction once charged. Completing `ignite` unlocks free mode (ending cinematic
 * is played by the game layer off this unlock, §3d/§3f).
 */
const CHAPTER_5: QuestStep[] = [
  {
    id: 'charge',
    objective: 'Charge the beacon (insert 8 crystal)',
    predicate: (ctx) => counter(ctx, 'beaconCharge') >= 8,
  },
  {
    id: 'ignite',
    objective: 'Ignite [E]',
    predicate: (ctx) => ctx.flags.ignited === true,
    unlocks: ['free_mode'],
  },
];

/** All chapters, index 0 = chapter 1. */
export const CHAPTERS: QuestStep[][] = [CHAPTER_1, CHAPTER_2, CHAPTER_3, CHAPTER_4, CHAPTER_5];

/** Number of chapters defined in the quest (5 after M4). */
export const CHAPTER_COUNT = CHAPTERS.length;
