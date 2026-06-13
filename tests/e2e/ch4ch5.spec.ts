/**
 * Chapter 4 + Chapter 5 E2E (M4.3b) — drives the ch4→ch5 glue through real
 * gameplay + the M4.3b hooks, with `__TEST__` set so `stepFrames(n)` is the only
 * clock (no waitForTimeout). Covers the M4.3b deliverables:
 *  - ch4 `beacon`: a REAL placement that completes the launchpad→6-core→antenna
 *    assembly runs validateBeacon(world) → beaconValid flag → objective advances
 *    to ch5 `charge`; the loop also records the beacon column for [E] reach;
 *  - ch5 `charge`: 8 [E] crystal inserts (consuming 1 crystal each) drive
 *    beaconCharge 0→8 → objective advances to `ignite`; short-stock / out-of-reach
 *    inserts consume nothing;
 *  - ch5 `ignite`: [E] once charged raises `ignited` → ch5 completes → free_mode
 *    unlocks → freeMode() true + the all-blocks creative kit granted; flight (the
 *    prototype KeyF toggle) is available;
 *  - ending cinematic: ignition fires the ending controller (active), and it is
 *    skippable (any key / skipEnding hook) → returns to free-mode play.
 *
 * Determinism: every beat is hook + stepFrames driven; the ending renders a single
 * stepped representative still under __TEST__ (createEndingCinematic), so nothing
 * here touches the wall clock.
 */
import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** In-page helper installed by bootTest — fast-forwards the quest to ch4 step1. */
    __advanceToCh4?: () => void;
    /** In-page helper — builds a valid beacon at an isolated column; returns its (x,z). */
    __buildBeacon?: () => { x: number; z: number; placedCap: number };
  }
}

async function bootTest(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__TEST__ = true;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.READY === true, undefined, { timeout: 3000 });
  await page.evaluate(() => {
    // Fast-forward the quest engine to the start of ch4 (step1 `beacon`).
    window.__advanceToCh4 = () => {
      const g = window.__game!;
      g.addCounter!('moveTicks', 30);
      g.addCounter!('mined:regolith', 10);
      g.addCounter!('placed', 5);
      g.setFlag!('salvaged'); // ch1 done → ch2
      g.setFlag!('antennaBuilt');
      g.addCounter!('puzzlesSolved', 3); // ch2 done → ch3
      g.addCounter!('caveDepthReached', 1);
      g.addCounter!('collected:crystal', 12); // ch3 done → ch4
      g.stepFrames!(1);
    };

    // Build a valid beacon at an isolated column: pre-place the launchpad(13) on a
    // solid base + 6 beacon-core(12), then PLACE the antenna(11) cap via the loop so
    // validateBeacon() runs on a real placement (records the beacon column). Mirrors
    // the ch2 antenna e2e. Returns the beacon column + the placed-cap block id.
    window.__buildBeacon = () => {
      const g = window.__game!;
      const world = g.state!.world;
      const cx = 62;
      const cz = 62;
      for (let y = 0; y < world.sizeY; y++) world.setBlock(cx, y, cz, 0); // clear column
      const base = 30; // launchpad y; (cx, base-1, cz) is the solid ground below
      world.setBlock(cx, base - 1, cz, 9); // solid ground (hull) under the pad
      world.setBlock(cx, base, cz, 13); // launchpad
      for (let i = 1; i <= 6; i++) world.setBlock(cx, base + i, cz, 12); // 6 cores
      // antenna cap goes at base+7 — place it for real onto the top core's face.
      g.give!('block:11', 1);
      g.setInput!({ toggleFly: true });
      g.stepFrames!(1);
      g.teleport!(cx + 0.5, base + 11, cz + 0.5, 0, -1.55); // hover above, look down
      g.stepFrames!(1);
      const capSlot = g.state!.inv.slots.findIndex((s) => s && s.itemId === 'block:11');
      g.setInput!({ slot: capSlot, place: true });
      g.stepFrames!(2);
      const placedCap = world.getBlock(cx, base + 7, cz);
      g.stepFrames!(1); // advance over beaconValid
      return { x: cx, z: cz, placedCap };
    };
  });
}

test.beforeEach(async ({ page }) => {
  await bootTest(page);
});

test('ch4 beacon: a real placement that completes the assembly sets beaconValid + advances to ch5', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    window.__advanceToCh4!();
    const onBeaconStep = g.questObjective!();
    const beforeFlag = g.quest!().flags.beaconValid ?? false;

    const built = window.__buildBeacon!();

    return {
      onBeaconStep,
      beforeFlag,
      placedCap: built.placedCap,
      beaconValid: g.quest!().flags.beaconValid,
      objective: g.questObjective!(),
      chapter: g.quest!().chapter,
      unlocked: g.quest!().unlocked,
    };
  });
  expect(res.onBeaconStep).toBe('Build the beacon (launchpad → 6 beacon-core mast → antenna cap)');
  expect(res.beforeFlag).toBe(false);
  expect(res.placedCap).toBe(11); // the antenna cap landed on a real placement
  expect(res.beaconValid).toBe(true);
  expect(res.unlocked).toContain('fusion_igniter');
  expect(res.chapter).toBe(5); // ch4 done → rolled into ch5
  expect(res.objective).toBe('Charge the beacon (insert 8 crystal)');
});

test('ch5 charge: 8 [E] crystal inserts drive beaconCharge 0→8 and advance to ignite', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    window.__advanceToCh4!();
    const built = window.__buildBeacon!();

    // Stand the player next to the beacon column so the [E] reach check passes.
    g.teleport!(built.x + 1.5, 30, built.z + 1.5, 0, 0);
    g.stepFrames!(1);
    const onChargeStep = g.questObjective!();

    // Out-of-stock first: no crystal → an [E] charge must consume nothing + not bump.
    const chargedWithNoCrystal = g.chargeBeacon!();
    const chargeAfterEmpty = g.beaconCharge!();

    // Give exactly 8 crystal and insert all 8 via [E].
    g.give!('block:4', 8);
    const crystalBefore = g.state!.inv.slots.reduce(
      (n, s) => (s && s.itemId === 'block:4' ? n + s.count : n),
      0,
    );
    let inserts = 0;
    for (let i = 0; i < 8; i++) {
      if (g.chargeBeacon!()) inserts++;
      g.stepFrames!(1); // advance over the `charge` predicate as it crosses 8
    }
    const chargeAfter = g.beaconCharge!();
    const crystalAfter = g.state!.inv.slots.reduce(
      (n, s) => (s && s.itemId === 'block:4' ? n + s.count : n),
      0,
    );

    // A 9th insert is capped (no crystal consumed, charge stays 8).
    g.give!('block:4', 1);
    const cappedInsert = g.chargeBeacon!();
    g.stepFrames!(1);

    return {
      onChargeStep,
      chargedWithNoCrystal,
      chargeAfterEmpty,
      crystalBefore,
      inserts,
      chargeAfter,
      crystalAfter,
      cappedInsert,
      objective: g.questObjective!(),
    };
  });
  expect(res.onChargeStep).toBe('Charge the beacon (insert 8 crystal)');
  expect(res.chargedWithNoCrystal).toBe(false); // no crystal → no insert
  expect(res.chargeAfterEmpty).toBe(0);
  expect(res.crystalBefore).toBe(8);
  expect(res.inserts).toBe(8);
  expect(res.chargeAfter).toBe(8);
  expect(res.crystalAfter).toBe(0); // all 8 consumed
  expect(res.cappedInsert).toBe(false); // 9th insert capped, consumes nothing
  expect(res.objective).toBe('Ignite [E]');
});

test('ch5 ignite: [E] once charged completes ch5, unlocks free_mode + flight, fires the ending', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    window.__advanceToCh4!();
    const built = window.__buildBeacon!();
    g.teleport!(built.x + 1.5, 30, built.z + 1.5, 0, 0);
    g.stepFrames!(1);

    // Charge to 8 (give + insert), then sit on the `ignite` step.
    g.give!('block:4', 8);
    for (let i = 0; i < 8; i++) {
      g.chargeBeacon!();
      g.stepFrames!(1);
    }
    const onIgniteStep = g.questObjective!();
    const freeBefore = g.freeMode!();

    // Ignite via [E].
    const ignited = g.igniteBeacon!();
    g.stepFrames!(1); // advance over `ignite` → free_mode unlock + enableFreeMode()

    // Free-mode flight: the prototype KeyF toggle flips player.flying (always
    // available); prove it toggles so "flight is available" is verifiable. (The
    // build helper hovered, so capture the pre-toggle state and assert it flipped.)
    const flyBeforeToggle = g.state!.player.flying;
    g.setInput!({ toggleFly: true });
    g.stepFrames!(1);
    const flyToggled = g.state!.player.flying !== flyBeforeToggle;

    // The all-blocks creative kit: every placeable block id 1..13 is now in inv.
    const blockIds = new Set<string>(
      g
        .state!.inv.slots.filter(
          (s): s is NonNullable<typeof s> => !!s && s.itemId.startsWith('block:'),
        )
        .map((s) => s.itemId as string),
    );
    const hasAllBlocks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].every((id) =>
      blockIds.has(`block:${id}`),
    );

    return {
      onIgniteStep,
      freeBefore,
      ignited,
      ignitedFlag: g.quest!().flags.ignited,
      unlocked: g.quest!().unlocked,
      freeMode: g.freeMode!(),
      flyToggled,
      hasAllBlocks,
      complete: g.quest!().chapter,
      ending: g.ending!(),
    };
  });
  expect(res.onIgniteStep).toBe('Ignite [E]');
  expect(res.freeBefore).toBe(false);
  expect(res.ignited).toBe(true);
  expect(res.ignitedFlag).toBe(true);
  expect(res.unlocked).toContain('free_mode');
  expect(res.freeMode).toBe(true);
  expect(res.flyToggled).toBe(true); // free-mode flight (KeyF) engaged
  expect(res.hasAllBlocks).toBe(true); // creative all-blocks kit granted
  // The ending controller was triggered by ignition (active under __TEST__).
  expect(res.ending).not.toBeNull();
  expect(res.ending!.active).toBe(true);
});

test('ending cinematic: ignition triggers it and it is skippable back to play', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    window.__advanceToCh4!();
    const built = window.__buildBeacon!();
    g.teleport!(built.x + 1.5, 30, built.z + 1.5, 0, 0);
    g.stepFrames!(1);
    g.give!('block:4', 8);
    for (let i = 0; i < 8; i++) {
      g.chargeBeacon!();
      g.stepFrames!(1);
    }
    g.igniteBeacon!();
    g.stepFrames!(1);
    const duringPlay = g.ending!();

    // Skip it (the [E]/any-key handler routes to ending.skip() while playing).
    g.skipEnding!();
    const afterSkip = g.ending!();

    return { duringPlay, afterSkip };
  });
  expect(res.duringPlay).not.toBeNull();
  expect(res.duringPlay!.active).toBe(true); // playing right after ignition
  expect(res.afterSkip!.active).toBe(false); // skip returned to play
  expect(res.afterSkip!.done).toBe(true); // marked done after a skip
});
