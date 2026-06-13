/**
 * Capstone ch1 → ch2 playthrough (M3.4 closeout — ROADMAP M3 exit criterion
 * "E2E ch1→ch2 playthrough"). ONE cohesive end-to-end arc, distinct from
 * quest.spec.ts's per-beat unit-y checks: from a FRESH boot it drives the whole
 * story through real mechanics where practical and only carries forward the state
 * each beat actually produced — no `addCounter`/`setFlag` shortcuts for the beats
 * under test. The chain is the assertion: if any beat fails to fire from its real
 * event the objective never advances and the next beat's setup is unreachable.
 *
 * Real-mechanic coverage (GAME_DESIGN §3b/§3c):
 *  - ch1 move   — HELD forward input for ≥30 fixed steps raises moveTicks;
 *  - ch1 mine   — real hold-mine of 10 regolith blocks (hand, 0.6 s = 36 steps);
 *  - ch1 place  — 5 real block placements (place edge + raycast face);
 *  - ch1 salvage— the real [E] key within POD_SALVAGE_REACH of the spawn pod;
 *  - ch2 antenna— a real antenna placement that completes a valid 4-mast;
 *  - ch2 decode — the decode panel DOM: click the 3 glyphs + real SUBMIT clicks.
 *
 * Exit assertions: isComplete / "All objectives complete" HUD line, BOTH unlocks
 * (workbench + scanner) recorded once each, and conservation — the salvage grant
 * lands exactly once (no double-grant across the run) and puzzlesSolved == 3.
 *
 * Clock: `__TEST__` set so the rAF loop is frozen; `stepFrames(n)` is the only
 * clock and every overlay wait is a DOM-class assertion. NO waitForTimeout.
 */
import { expect, test, type Page } from '@playwright/test';

/** Boot with the rAF clock disabled and the title overlay hidden (DOM only, as
 *  the visual + quest suites do — headless never pointer-locks, so the overlay's
 *  only game effect is requesting lock and it would otherwise swallow panel clicks). */
async function bootTest(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__TEST__ = true;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.READY === true, undefined, { timeout: 3000 });
  await page.evaluate(() => {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.style.display = 'none';
  });
}

/** The 3 canonical decode glyphs (decode.ts GLYPHS), row-major flat boolean[9]. */
const GLYPHS = [
  [false, true, false, true, true, true, false, true, false], // 0 cross
  [true, false, false, false, true, false, false, false, true], // 1 diagonal
  [true, true, true, true, false, true, true, true, true], // 2 ring
] as const;

test('capstone: a fresh boot is driven the whole way through ch1 → ch2 by real mechanics', async ({
  page,
}) => {
  await bootTest(page);

  // ── Fresh boot: ch1 step 1, nothing raised. ──────────────────────────────
  const boot = await page.evaluate(() => {
    const g = window.__game!;
    const q = g.quest!();
    return {
      objective: g.questObjective!(),
      hud: document.getElementById('objective')!.textContent,
      chapter: q.chapter,
      step: q.step,
      unlocked: [...q.unlocked],
    };
  });
  expect(boot.objective).toBe('Move with WASD');
  expect(boot.hud).toBe('Move with WASD');
  expect(boot.chapter).toBe(1);
  expect(boot.step).toBe(0);
  expect(boot.unlocked).toEqual([]);

  // ── ch1 move: HOLD forward for 30 fixed steps (real moveTicks). ──────────
  // Carve a flat rock pad at the spawn column so held movement doesn't fall.
  const move = await page.evaluate(() => {
    const g = window.__game!;
    const world = g.state!.world;
    let h = 0;
    for (let y = world.sizeY - 1; y >= 0; y--) {
      if (world.getBlock(48, y, 48) !== 0) {
        h = y;
        break;
      }
    }
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        world.setBlock(48 + dx, h, 48 + dz, 2);
        for (let y = h + 1; y <= h + 4; y++) world.setBlock(48 + dx, y, 48 + dz, 0);
      }
    g.teleport!(48.5, h + 1, 48.5, 0, 0);
    g.stepFrames!(5); // settle onto the pad
    g.setInput!({ forward: true });
    g.stepFrames!(30); // ≥30 held movement ticks
    g.setInput!({ forward: false });
    g.stepFrames!(1); // advance() over the satisfied move predicate
    return { objective: g.questObjective!(), moveTicks: g.quest!().counters.moveTicks };
  });
  expect(move.moveTicks).toBeGreaterThanOrEqual(30);
  expect(move.objective).toBe('Mine 10 regolith');

  // ── ch1 mine: REAL hold-mine of 10 regolith (hand tier, 0.6 s = 36 steps). ─
  const mine = await page.evaluate(() => {
    const g = window.__game!;
    const world = g.state!.world;
    g.setInput!({ slot: 4 }); // empty slot ⇒ hand tier
    let h = 0;
    for (let y = world.sizeY - 1; y >= 0; y--) {
      if (world.getBlock(48, y, 48) !== 0) {
        h = y;
        break;
      }
    }
    for (let i = 0; i < 10; i++) {
      world.setBlock(48, h, 48, 1); // regolith on top of the column
      g.teleport!(48.5, h + 1, 48.5, 0, -1.55); // stand on it, look straight down
      g.stepFrames!(3); // settle
      g.setInput!({ mine: true });
      g.stepFrames!(36); // breaks on step 36 (hand × regolith)
      g.setInput!({ mine: false });
      g.stepFrames!(1);
      h -= 1; // next target is one block lower
    }
    return {
      objective: g.questObjective!(),
      mined: g.quest!().counters['mined:regolith'],
    };
  });
  expect(mine.mined).toBeGreaterThanOrEqual(10);
  expect(mine.objective).toBe('Place 5 blocks');

  // ── ch1 place: 5 REAL placements (place edge + raycast face). ────────────
  const place = await page.evaluate(() => {
    const g = window.__game!;
    const world = g.state!.world;
    let h = 0;
    for (let y = world.sizeY - 1; y >= 0; y--) {
      if (world.getBlock(48, y, 48) !== 0) {
        h = y;
        break;
      }
    }
    g.give!('block:9', 8); // hull blocks to place
    g.setInput!({ toggleFly: true });
    g.stepFrames!(1);
    let placed = 0;
    for (let i = 0; i < 5; i++) {
      g.teleport!(48.5, h + 4, 48.5, 0, -1.55); // hover, look down at the column top
      g.stepFrames!(1);
      const hullSlot = g.state!.inv.slots.findIndex((s) => s && s.itemId === 'block:9');
      g.setInput!({ slot: hullSlot, place: true });
      g.stepFrames!(2);
      if (world.getBlock(48, h + 1, 48) === 9) {
        placed++;
        world.setBlock(48, h + 1, 48, 0); // clear for the next placement
      }
    }
    return {
      objective: g.questObjective!(),
      placed: g.quest!().counters.placed,
      attempted: placed,
    };
  });
  expect(place.attempted).toBe(5); // every placement actually landed
  expect(place.placed).toBeGreaterThanOrEqual(5);
  expect(place.objective).toBe('Salvage the crash pod [E]');

  // ── ch1 salvage: the REAL [E] key within reach of the spawn pod. ─────────
  // The pod marker == the player's spawn position (loop.ts podPos). Mining dug
  // the spawn column down, so return TO the pod marker to be within reach (the
  // [E] check is 3D distance ≤ POD_SALVAGE_REACH of podPos, not onGround-gated).
  const preSalvage = await page.evaluate(() => {
    const g = window.__game!;
    const sp = g.state!.player.spawn; // = podPos (captured at construction)
    // Stay in fly (from the place beat) so the player holds exactly at the pod
    // marker; teleport zeroes velocity, so a render-only step keeps it put.
    g.teleport!(sp.x, sp.y, sp.z, 0, 0); // exactly at the pod marker → within reach
    g.stepFrames!(1);
    return {
      chapter: g.quest!().chapter,
      salvaged: g.quest!().flags.salvaged ?? false,
      hull: g
        .state!.inv.slots.filter((s) => s && s.itemId === 'block:9')
        .reduce((n, s) => n + s!.count, 0),
    };
  });
  expect(preSalvage.chapter).toBe(1);
  expect(preSalvage.salvaged).toBe(false);

  await page.keyboard.press('KeyE'); // real salvage interaction
  const salvage = await page.evaluate(() => {
    const g = window.__game!;
    g.stepFrames!(1); // advance() fires the salvage step + workbench unlock + grant
    const q = g.quest!();
    return {
      salvaged: q.flags.salvaged,
      chapter: q.chapter,
      objective: g.questObjective!(),
      unlocked: [...q.unlocked],
      hud: document.getElementById('objective')!.textContent,
      hull: g
        .state!.inv.slots.filter((s) => s && s.itemId === 'block:9')
        .reduce((n, s) => n + s!.count, 0),
    };
  });
  expect(salvage.salvaged).toBe(true);
  expect(salvage.chapter).toBe(2);
  expect(salvage.objective).toBe('Raise the antenna (3 antenna blocks atop a 4-high mast)');
  expect(salvage.hud).toBe('Raise the antenna (3 antenna blocks atop a 4-high mast)');
  expect(salvage.unlocked).toContain('workbench');
  // Conservation: the salvage grant (2 hull) landed exactly once.
  expect(salvage.hull).toBe(preSalvage.hull + 2);

  // ── ch2 antenna: a REAL placement that completes a valid 4-high mast. ────
  const antenna = await page.evaluate(() => {
    const g = window.__game!;
    const world = g.state!.world;
    const cx = 60;
    const cz = 60;
    for (let y = 0; y < world.sizeY; y++) world.setBlock(cx, y, cz, 0); // clear column
    const base = 30;
    for (let i = 0; i < 4; i++) world.setBlock(cx, base + i, cz, 9); // 4-high solid mast
    world.setBlock(cx, base + 4, cz, 11); // antenna 1
    world.setBlock(cx, base + 5, cz, 11); // antenna 2 (top of the prebuilt stack)
    const beforeFlag = g.quest!().flags.antennaBuilt ?? false;

    g.give!('block:11', 1);
    g.setInput!({ toggleFly: true });
    g.stepFrames!(1);
    g.teleport!(cx + 0.5, base + 9, cz + 0.5, 0, -1.55); // hover above, look down
    g.stepFrames!(1);
    const antennaSlot = g.state!.inv.slots.findIndex((s) => s && s.itemId === 'block:11');
    g.setInput!({ slot: antennaSlot, place: true });
    g.stepFrames!(2);
    const placedTop = world.getBlock(cx, base + 6, cz); // the 3rd antenna
    g.stepFrames!(1); // advance() over antennaBuilt
    return {
      beforeFlag,
      placedTop,
      antennaBuilt: g.quest!().flags.antennaBuilt,
      objective: g.questObjective!(),
    };
  });
  expect(antenna.beforeFlag).toBe(false);
  expect(antenna.placedTop).toBe(11); // the 3rd antenna landed from a real place
  expect(antenna.antennaBuilt).toBe(true);
  expect(antenna.objective).toBe('Decode the 3 pulses');

  // ── ch2 decode: solve all 3 glyphs through the panel DOM + real SUBMIT. ──
  await page.keyboard.press('KeyP'); // open the decode panel
  await expect(page.locator('#decode')).toHaveClass(/open/);

  for (let gi = 0; gi < 3; gi++) {
    // The panel re-targets to the current glyph after each solve.
    await expect(page.locator('#decode-progress')).toHaveText(`${gi} / 3 DECODED`);
    const glyph = GLYPHS[gi]!;
    for (let c = 0; c < 9; c++) {
      if (glyph[c]) await page.locator(`#decode-panel .cell[data-cell="${c}"]`).click();
    }
    await page.locator('#decode-submit').click();
  }

  const done = await page.evaluate(() => {
    const g = window.__game!;
    g.stepFrames!(1); // advance() over puzzlesSolved >= 3 → scanner unlock + complete
    const q = g.quest!();
    return {
      puzzles: q.counters.puzzlesSolved,
      unlocked: [...q.unlocked],
      objective: g.questObjective!(),
      hud: document.getElementById('objective')!.textContent,
      chapter: q.chapter,
      decodeOpen: document.getElementById('decode')!.classList.contains('open'),
      step: q.step,
      // count each unlock to prove no double-grant across the whole run.
      workbenchCount: q.unlocked.filter((u) => u === 'workbench').length,
      scannerCount: q.unlocked.filter((u) => u === 'scanner').length,
    };
  });
  expect(done.puzzles).toBe(3);
  expect(done.decodeOpen).toBe(false); // panel auto-closed after the 3rd solve
  expect(done.unlocked).toContain('workbench');
  expect(done.unlocked).toContain('scanner');
  // No-double-grant: each unlock recorded exactly once across the full arc.
  expect(done.workbenchCount).toBe(1);
  expect(done.scannerCount).toBe(1);
  // ch2 done: scanner unlocked and the quest rolls into ch3 (M4 added ch3-5, so
  // ch2 is no longer the final chapter). This spec verifies the ch1→ch2 arc; the
  // full ch1→ch5 run is covered by the M4.4 closeout. Objective advances to ch3.
  expect(done.objective).toBe('Descend into the caves');
  expect(done.hud).toBe('Descend into the caves');
  expect(done.chapter).toBe(3);
  expect(done.step).toBe(0); // ch3 step 0 (descend)
});
