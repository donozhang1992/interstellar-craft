/**
 * Quest glue E2E (M3.3) — drives the quest engine through real gameplay + the
 * M3.3 hooks (`quest()`, `questObjective()`, `setFlag()`, `addCounter()`), with
 * `__TEST__` set so `stepFrames(n)` is the only clock (no waitForTimeout).
 *
 * Coverage:
 *  - ch1 beats fire from real events (held movement, regolith mine, placement);
 *  - pod [E] salvage completes ch1 -> ch2 (workbench unlock + objective swap);
 *  - antenna validateAntenna() sets the flag after a real placement;
 *  - the decode panel solves the 3 glyphs -> ch2 complete + scanner unlock;
 *  - the objective HUD line tracks the live objective.
 */
import { expect, test, type Page } from '@playwright/test';

async function bootTest(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__TEST__ = true;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.READY === true, undefined, { timeout: 3000 });
  // Headless never pointer-locks; dismiss the title overlay (DOM only) so the
  // decode overlay's clicks are not swallowed (same as the visual suite).
  await page.evaluate(() => {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.style.display = 'none';
  });
}

/** Carve a flat rock corridor along x=48, z∈[38,48] (gameplay.spec pattern). */
function pageSetupCorridor(): number {
  const world = window.__game!.state!.world;
  let h = 0;
  for (let y = world.sizeY - 1; y >= 0; y--) {
    if (world.getBlock(48, y, 48) !== 0) {
      h = y;
      break;
    }
  }
  for (let z = 38; z <= 48; z++) {
    world.setBlock(48, h, z, 2);
    for (let y = h + 1; y <= h + 6; y++) world.setBlock(48, y, z, 0);
  }
  return h;
}

test.beforeEach(async ({ page }) => {
  await bootTest(page);
});

test('boot: ch1 step 1 objective + fresh quest state are exposed via hooks', async ({ page }) => {
  const q = await page.evaluate(() => {
    const g = window.__game!;
    return {
      objective: g.questObjective!(),
      chapter: g.quest!().chapter,
      step: g.quest!().step,
      hudText: document.getElementById('objective')!.textContent,
    };
  });
  expect(q.objective).toBe('Move with WASD');
  expect(q.chapter).toBe(1);
  expect(q.step).toBe(0);
  expect(q.hudText).toBe('Move with WASD');
});

test('ch1 move beat: holding a direction 30 steps advances move -> mine', async ({ page }) => {
  const h = await page.evaluate(pageSetupCorridor);
  const res = await page.evaluate((hh) => {
    const g = window.__game!;
    g.teleport!(48.5, hh + 1, 48.5, 0, 0);
    g.stepFrames!(5); // settle
    g.setInput!({ forward: true });
    g.stepFrames!(30); // 30 held movement ticks (>= threshold)
    g.setInput!({ forward: false });
    g.stepFrames!(1); // one more step to run advance() over the satisfied predicate
    return { objective: g.questObjective!(), moveTicks: g.quest!().counters.moveTicks };
  }, h);
  expect(res.moveTicks).toBeGreaterThanOrEqual(30);
  expect(res.objective).toBe('Mine 10 regolith');
});

test('ch1 mine beat: mining 10 regolith advances mine -> place', async ({ page }) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const world = g.state!.world;
    // Satisfy the move beat directly so the engine is on the `mine` step.
    g.addCounter!('moveTicks', 30);
    g.stepFrames!(1);
    let h = 0;
    for (let y = world.sizeY - 1; y >= 0; y--) {
      if (world.getBlock(48, y, 48) !== 0) {
        h = y;
        break;
      }
    }
    g.setInput!({ slot: 4 }); // empty slot => hand tier
    // Mine 10 regolith blocks: stack 10 regolith at the spawn column top and
    // hand-mine each (0.6 s / hand = 36 steps).
    for (let i = 0; i < 10; i++) {
      world.setBlock(48, h, 48, 1); // regolith
      g.teleport!(48.5, h + 1, 48.5, 0, -1.55); // stand on it, look down
      g.stepFrames!(3); // settle
      g.setInput!({ mine: true });
      g.stepFrames!(36); // breaks on step 36
      g.setInput!({ mine: false });
      g.stepFrames!(1);
      h -= 1; // next block is one lower (we mined the top)
    }
    return { objective: g.questObjective!(), mined: g.quest!().counters['mined:regolith'] };
  });
  expect(res.mined).toBeGreaterThanOrEqual(10);
  expect(res.objective).toBe('Place 5 blocks');
});

test('ch1 place beat: placing 5 blocks advances place -> salvage', async ({ page }) => {
  const h = await page.evaluate(pageSetupCorridor);
  const res = await page.evaluate((hh) => {
    const g = window.__game!;
    g.addCounter!('moveTicks', 30);
    g.addCounter!('mined:regolith', 10);
    g.stepFrames!(1); // engine now on the `place` step
    g.give!('block:9', 8); // hull blocks to place
    // Place 5 blocks: look down from a hover, place onto the column repeatedly,
    // mining each away between placements so the target face stays reachable.
    g.setInput!({ toggleFly: true });
    g.stepFrames!(1);
    let placed = 0;
    for (let i = 0; i < 5; i++) {
      g.teleport!(48.5, hh + 4, 48.5, 0, -1.55);
      g.stepFrames!(1);
      // hull is the active slot? select the hull slot explicitly.
      const slots = g.state!.inv.slots;
      const hullSlot = slots.findIndex((s) => s && s.itemId === 'block:9');
      g.setInput!({ slot: hullSlot, place: true });
      g.stepFrames!(2);
      if (g.state!.world.getBlock(48, hh + 1, 48) === 9) {
        placed++;
        g.state!.world.setBlock(48, hh + 1, 48, 0); // clear for the next placement
      }
    }
    return {
      objective: g.questObjective!(),
      placed: g.quest!().counters.placed,
      attempted: placed,
    };
  }, h);
  expect(res.placed).toBeGreaterThanOrEqual(5);
  expect(res.objective).toBe('Salvage the crash pod [E]');
});

test('ch1 salvage [E]: within reach completes ch1 -> ch2 + unlocks workbench', async ({ page }) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    // Fast-forward ch1's first three beats.
    g.addCounter!('moveTicks', 30);
    g.addCounter!('mined:regolith', 10);
    g.addCounter!('placed', 5);
    g.stepFrames!(1);
    const beforeObjective = g.questObjective!();
    // Stand at the pod marker (= spawn pos) and press E.
    const pod = g.quest!(); // ensure quest object live
    void pod;
    const before = { chapter: g.quest!().chapter, salvaged: g.quest!().flags.salvaged };
    return { beforeObjective, before };
  });
  expect(res.beforeObjective).toBe('Salvage the crash pod [E]');
  expect(res.before.chapter).toBe(1);

  // Press the real E key while standing on the pod (spawn position by default).
  await page.keyboard.press('KeyE');
  const after = await page.evaluate(() => {
    const g = window.__game!;
    g.stepFrames!(1); // advance() fires the salvage step + workbench unlock
    return {
      salvaged: g.quest!().flags.salvaged,
      chapter: g.quest!().chapter,
      objective: g.questObjective!(),
      unlocked: g.quest!().unlocked,
    };
  });
  expect(after.salvaged).toBe(true);
  expect(after.chapter).toBe(2);
  expect(after.objective).toBe('Raise the antenna (3 antenna blocks atop a 4-high mast)');
  expect(after.unlocked).toContain('workbench');
});

test('ch2 antenna: a real placement that completes a valid mast sets antennaBuilt', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const world = g.state!.world;
    // Advance to ch2 step1.
    g.addCounter!('moveTicks', 30);
    g.addCounter!('mined:regolith', 10);
    g.addCounter!('placed', 5);
    g.setFlag!('salvaged');
    g.stepFrames!(1);
    const onAntennaStep = g.questObjective!();

    // Build the mast at an isolated column: 4 solid mast blocks (hull id 9) +
    // 2 antenna blocks pre-placed, then PLACE the 3rd antenna via the loop so
    // validateAntenna() runs on a real placement (not a direct world write).
    const cx = 60;
    const cz = 60;
    for (let y = 0; y < world.sizeY; y++) world.setBlock(cx, y, cz, 0); // clear column
    const base = 30;
    for (let i = 0; i < 4; i++) world.setBlock(cx, base + i, cz, 9); // 4-high mast
    world.setBlock(cx, base + 4, cz, 11); // antenna 1
    world.setBlock(cx, base + 5, cz, 11); // antenna 2 (top of the pre-built stack)
    const beforeFlag = g.quest!().flags.antennaBuilt ?? false;

    // Place the 3rd antenna (id 11) onto the top face of antenna-2 by hovering
    // above the mast and looking straight down — the raycast hits antenna-2's
    // top face, so the placed cell is (cx, base+6, cz) (loop runs validateAntenna).
    g.give!('block:11', 1);
    g.setInput!({ toggleFly: true });
    g.stepFrames!(1);
    g.teleport!(cx + 0.5, base + 9, cz + 0.5, 0, -1.55); // hover above, look down
    g.stepFrames!(1);
    const antennaSlot = g.state!.inv.slots.findIndex((s) => s && s.itemId === 'block:11');
    g.setInput!({ slot: antennaSlot, place: true });
    g.stepFrames!(2);
    const placedTop = world.getBlock(cx, base + 6, cz);
    g.stepFrames!(1); // advance over antennaBuilt
    return {
      onAntennaStep,
      beforeFlag,
      placedTop,
      antennaBuilt: g.quest!().flags.antennaBuilt,
      objective: g.questObjective!(),
    };
  });
  expect(res.onAntennaStep).toBe('Raise the antenna (3 antenna blocks atop a 4-high mast)');
  expect(res.beforeFlag).toBe(false);
  expect(res.placedTop).toBe(11); // the 3rd antenna landed
  expect(res.antennaBuilt).toBe(true);
  expect(res.objective).toBe('Decode the 3 pulses');
});

test('ch2 decode: solving the 3 glyphs completes ch2 + unlocks scanner', async ({ page }) => {
  // Advance to ch2 step2 (decode).
  await page.evaluate(() => {
    const g = window.__game!;
    g.addCounter!('moveTicks', 30);
    g.addCounter!('mined:regolith', 10);
    g.addCounter!('placed', 5);
    g.setFlag!('salvaged');
    g.setFlag!('antennaBuilt');
    g.stepFrames!(1);
  });
  expect(await page.evaluate(() => window.__game!.questObjective!())).toBe('Decode the 3 pulses');

  // The 3 canonical glyphs (decode.ts GLYPHS), row-major.
  const GLYPHS = [
    [false, true, false, true, true, true, false, true, false], // cross
    [true, false, false, false, true, false, false, false, true], // diagonal
    [true, true, true, true, false, true, true, true, true], // ring
  ];

  // Open the panel with P, then solve each glyph by clicking the matching cells.
  await page.keyboard.press('KeyP');
  await expect(page.locator('#decode')).toHaveClass(/open/);

  for (let gi = 0; gi < 3; gi++) {
    const glyph = GLYPHS[gi]!;
    // The panel re-targets to the current glyph after each solve.
    await expect(page.locator('#decode-progress')).toHaveText(`${gi} / 3 DECODED`);
    for (let c = 0; c < 9; c++) {
      if (glyph[c]) await page.locator(`#decode-panel .cell[data-cell="${c}"]`).click();
    }
    await page.locator('#decode-submit').click();
  }

  const res = await page.evaluate(() => {
    const g = window.__game!;
    g.stepFrames!(1); // advance over puzzlesSolved >= 3 -> scanner unlock
    return {
      puzzles: g.quest!().counters.puzzlesSolved,
      unlocked: g.quest!().unlocked,
      objective: g.questObjective!(),
      complete: g.quest!().chapter > 2,
      decodeOpen: document.getElementById('decode')!.classList.contains('open'),
    };
  });
  expect(res.puzzles).toBe(3);
  expect(res.unlocked).toContain('scanner');
  expect(res.complete).toBe(true); // ch2 done → rolled into ch3 (chapter > 2)
  expect(res.objective).toBe('Descend into the caves'); // ch3 step 1 (M4 added ch3-5)
  expect(res.decodeOpen).toBe(false); // closed after the 3rd solve
});
