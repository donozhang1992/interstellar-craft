/**
 * Chapter 3 + entities E2E (M4.3a) — drives the ch3 glue through real gameplay +
 * the M4.3a hooks, with `__TEST__` set so `stepFrames(n)` is the only clock (no
 * waitForTimeout). Covers the four M4.3a deliverables:
 *  - ch3 `descend`: feet y < 20 (a teleport into the deep band) sets
 *    caveDepthReached = 1 → at ch3 step1 the objective advances to harvest;
 *  - ch3 `harvest`: collecting 12 crystal (real crystal-mine increments the
 *    counter; topped up via the counter hook) advances harvest → ch4;
 *  - jump pack: owning jump_pack + holding Space airborne HOLDS altitude while
 *    energy drains, then FALLS once energy is empty;
 *  - wrecked drone: repair consumes EXACTLY 2 copper + 1 crystal, then the drone
 *    eases toward the player (follows).
 *
 * Note the entity RENDER objects (beetle/drone sprites) are gated outside
 * __TEST__ to protect the visual baselines; the drone CORE (repair + follow)
 * lives on the game and is exercised here through the drone()/repairDrone() hooks.
 */
import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** In-page test helper installed by bootTest — fast-forwards to ch3 step1. */
    __advanceToCh3?: () => void;
  }
}

async function bootTest(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__TEST__ = true;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.READY === true, undefined, { timeout: 3000 });
  // Install an in-page helper that fast-forwards the quest engine to the start of
  // ch3 (step1 `descend`). Defined on window so each page.evaluate can call it
  // (top-level spec functions are not serialized into the browser context).
  await page.evaluate(() => {
    window.__advanceToCh3 = () => {
      const g = window.__game!;
      g.addCounter!('moveTicks', 30);
      g.addCounter!('mined:regolith', 10);
      g.addCounter!('placed', 5);
      g.setFlag!('salvaged'); // ch1 done → ch2
      g.setFlag!('antennaBuilt');
      g.addCounter!('puzzlesSolved', 3); // ch2 done → ch3
      g.stepFrames!(1);
    };
  });
}

test.beforeEach(async ({ page }) => {
  await bootTest(page);
});

test('ch3 descend: dropping below y=20 sets caveDepthReached and advances the objective', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    window.__advanceToCh3!();
    const onDescend = g.questObjective!();
    const before = g.quest!().counters.caveDepthReached ?? 0;

    // Teleport the feet into the deep band (y < 20). One stepped frame runs the
    // loop's deep-entry latch + advance() over the satisfied `descend` predicate.
    g.teleport!(48.5, 12, 48.5, 0, 0);
    g.stepFrames!(1);

    return {
      onDescend,
      before,
      caveDepthReached: g.quest!().counters.caveDepthReached,
      objective: g.questObjective!(),
    };
  }, undefined);
  expect(res.onDescend).toBe('Descend into the caves');
  expect(res.before).toBe(0);
  expect(res.caveDepthReached).toBe(1); // latched to exactly 1
  expect(res.objective).toBe('Collect 12 crystal'); // ch3 step2
});

test('ch3 descend latch is one-shot: re-surfacing + re-descending never re-bumps it', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    window.__advanceToCh3!();
    g.teleport!(48.5, 12, 48.5, 0, 0); // deep
    g.stepFrames!(1);
    g.teleport!(48.5, 40, 48.5, 0, 0); // back up
    g.stepFrames!(1);
    g.teleport!(48.5, 10, 48.5, 0, 0); // deep again
    g.stepFrames!(1);
    return { caveDepthReached: g.quest!().counters.caveDepthReached };
  });
  expect(res.caveDepthReached).toBe(1); // still exactly 1, not 2
});

test('ch3 harvest: mining crystal increments the counter; 12 crystal advances to ch4', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const world = g.state!.world;
    window.__advanceToCh3!();
    // Satisfy descend so the engine sits on the `harvest` step.
    g.addCounter!('caveDepthReached', 1);
    g.stepFrames!(1);
    const onHarvest = g.questObjective!();

    // REAL mine one crystal to prove the loop increments collected:crystal. Reuse
    // the mineCaveResources verified clean-hit target: worldgen crystal(4) at
    // (4,7,5), stand (4,7,6) yaw 0 pitch -0.9, drill_mk2 (3.5/4 = 53 steps).
    g.give!('drill_mk2', 1);
    let drillSlot = -1;
    const slots = g.state!.inv.slots;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] && slots[i]!.itemId === 'drill_mk2') {
        drillSlot = i;
        break;
      }
    }
    const crystalBlock = world.getBlock(4, 7, 5); // confirm the worldgen crystal is there
    g.teleport!(4.5, 7, 6.5, 0.0, -0.9);
    g.setInput!({ toggleFly: true, slot: drillSlot }); // fly-hover, no fall
    g.stepFrames!(1);
    const beforeCollected = g.quest!().counters['collected:crystal'] ?? 0;
    g.setInput!({ mine: true });
    g.stepFrames!(70); // > 53 → breaks
    g.setInput!({ mine: false });
    g.stepFrames!(1);
    const afterOneMine = g.quest!().counters['collected:crystal'] ?? 0;
    const blockAfter = world.getBlock(4, 7, 5);

    // Top the rest up via the counter hook (same path the loop uses) to reach 12.
    const remaining = 12 - afterOneMine;
    if (remaining > 0) g.addCounter!('collected:crystal', remaining);
    g.stepFrames!(1); // advance over collected:crystal >= 12 → jump_pack unlock + ch4

    return {
      onHarvest,
      crystalBlock,
      blockAfter,
      beforeCollected,
      afterOneMine,
      collected: g.quest!().counters['collected:crystal'],
      chapter: g.quest!().chapter,
      objective: g.questObjective!(),
      unlocked: g.quest!().unlocked,
    };
  });
  expect(res.onHarvest).toBe('Collect 12 crystal');
  expect(res.crystalBlock).toBe(4); // worldgen placed the crystal at (4,7,5)
  expect(res.blockAfter).toBe(0); // mined away to air
  expect(res.beforeCollected).toBe(0);
  expect(res.afterOneMine).toBe(1); // the real crystal mine credited exactly one
  expect(res.collected).toBeGreaterThanOrEqual(12);
  expect(res.unlocked).toContain('jump_pack');
  expect(res.chapter).toBe(4); // ch3 done → rolled into ch4
  expect(res.objective).toBe('Build the beacon (launchpad → 6 beacon-core mast → antenna cap)');
});

test('jump pack: owning it + holding Space airborne holds altitude while energy drains', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    g.give!('jump_pack', 1); // own the pack (equipment)
    // Hover high in open air so there is nothing to land on (terrain top ~32).
    g.teleport!(48.5, 60, 48.5, 0, 0);
    g.setInput!({ jump: true }); // hold Space
    g.stepFrames!(1); // settle (still airborne, hover begins)

    const yStart = g.state!.player.pos.y;
    const eStart = g.survival!().energy;
    g.stepFrames!(60); // ~1 s of hover (within the 2 s budget, energy > 0)
    const yHeld = g.state!.player.pos.y;
    const eHeld = g.survival!().energy;

    return { yStart, eStart, yHeld, eHeld };
  });
  // Altitude held (no meaningful fall) while hovering.
  expect(Math.abs(res.yHeld - res.yStart)).toBeLessThan(0.05);
  // Energy drained at ENERGY_JUMPPACK 8/s → ~8 over 1 s.
  expect(res.eHeld).toBeLessThan(res.eStart);
  expect(res.eStart - res.eHeld).toBeGreaterThan(6); // ≈ 8, generous lower bound
});

test('jump pack: with energy empty the hover stops and the player falls', async ({ page }) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    g.give!('jump_pack', 1);
    g.teleport!(48.5, 60, 48.5, 0, 0);
    g.setStat!('energy', 0); // empty → the energy gate vetoes the hover
    g.setInput!({ jump: true }); // still holding Space
    g.stepFrames!(1);
    const yStart = g.state!.player.pos.y;
    g.stepFrames!(30); // half a second of free fall
    const yAfter = g.state!.player.pos.y;
    return { yStart, yAfter, energy: g.survival!().energy };
  });
  expect(res.energy).toBe(0);
  expect(res.yAfter).toBeLessThan(res.yStart - 0.5); // fell appreciably
});

test('jump pack: not owned ⇒ holding Space airborne does NOT hover (normal fall)', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    // No jump_pack given. Full energy. Hold Space midair.
    g.teleport!(48.5, 60, 48.5, 0, 0);
    g.setInput!({ jump: true });
    g.stepFrames!(1);
    const yStart = g.state!.player.pos.y;
    g.stepFrames!(30);
    const yAfter = g.state!.player.pos.y;
    return { yStart, yAfter };
  });
  expect(res.yAfter).toBeLessThan(res.yStart - 0.5); // fell — no pack, no hover
});

test('wrecked drone: repair consumes exactly 2 copper + 1 crystal, then it follows', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const count = (id: string) =>
      g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);

    // Stand on the drone (spawned at spawn + (2,0,0)) so the reach check passes.
    const d0 = g.drone!();
    g.teleport!(d0.pos[0], d0.pos[1], d0.pos[2], 0, 0);

    // Short stock first: only 1 copper → repair must FAIL and consume NOTHING.
    g.give!('block:8', 1); // 1 copper
    const copperBeforeFail = count('block:8');
    const failed = g.repairDrone!();
    const copperAfterFail = count('block:8');
    const repairedAfterFail = g.drone!().repaired;

    // Now stock the full cost (need 2 copper + 1 crystal total).
    g.give!('block:8', 1); // → 2 copper
    g.give!('block:4', 1); // 1 crystal
    const copperBefore = count('block:8');
    const crystalBefore = count('block:4');
    const ok = g.repairDrone!();
    const copperAfter = count('block:8');
    const crystalAfter = count('block:4');
    const repaired = g.drone!().repaired;

    // Idempotent: a second repair consumes nothing more.
    g.give!('block:8', 2);
    g.give!('block:4', 1);
    const copperBeforeIdem = count('block:8');
    const okAgain = g.repairDrone!();
    const copperAfterIdem = count('block:8');

    // Follow: move the player away and step — the drone eases toward the player.
    const droneBefore = g.drone!().pos;
    g.teleport!(d0.pos[0] + 10, d0.pos[1], d0.pos[2], 0, 0);
    const px = g.state!.player.pos.x;
    const distBefore = Math.abs(px - droneBefore[0]);
    g.stepFrames!(30); // half a second of eased homing
    const droneAfter = g.drone!().pos;
    const distAfter = Math.abs(px - droneAfter[0]);

    return {
      failed,
      copperBeforeFail,
      copperAfterFail,
      repairedAfterFail,
      ok,
      copperBefore,
      copperAfter,
      crystalBefore,
      crystalAfter,
      repaired,
      okAgain,
      copperBeforeIdem,
      copperAfterIdem,
      distBefore,
      distAfter,
    };
  });
  // Short stock → atomic failure, nothing consumed.
  expect(res.failed).toBe(false);
  expect(res.copperAfterFail).toBe(res.copperBeforeFail);
  expect(res.repairedAfterFail).toBe(false);
  // Full stock → repaired, consuming EXACTLY 2 copper + 1 crystal.
  expect(res.ok).toBe(true);
  expect(res.repaired).toBe(true);
  expect(res.copperBefore - res.copperAfter).toBe(2);
  expect(res.crystalBefore - res.crystalAfter).toBe(1);
  // Idempotent: repairing again is a no-op that consumes nothing.
  expect(res.okAgain).toBe(false);
  expect(res.copperAfterIdem).toBe(res.copperBeforeIdem);
  // Follows: after moving away, the drone closed the gap toward the player.
  expect(res.distAfter).toBeLessThan(res.distBefore);
});
