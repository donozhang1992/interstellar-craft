/**
 * M1.5 capstone craft-and-use E2E (ROADMAP M1 exit criterion "E2E craft-and-use
 * flow"; TEST_STRATEGY §3 scenario "craft Drill … mines basalt faster").
 *
 * ONE scenario covering the whole core loop with the starter kit only:
 *   gate (hand cannot mine basalt) → craft the tool that opens the gate
 *   (drill_mk2 from starter-kit drill_mk1 + ores) → equip it from the hotbar →
 *   mine the basalt at the §4-exact step count → the drop lands in the
 *   inventory → place that very block back into the world.
 *
 * Every assertion goes through the TECH_SPEC §3 hooks; `stepFrames(n)` is the
 * only clock (`__TEST__` set before load, no waitForTimeout). Look direction
 * comes from `teleport(yaw, pitch)` — headless-safe, no pointer lock.
 *
 * Mining-step arithmetic (GAME_DESIGN §4 + core/mining/progress.ts):
 *   basalt hardness 1.5 s, Drill Mk2 ×4 ⇒ 0.375 s = 22.5 steps at dt = 1/60.
 *   The state machine counts the FIRST held tick (progress += dt/time each
 *   step, completes when ≥ 1), so after n steps progress = n/22.5: step 22 →
 *   0.9777… (intact), step 23 → 1.0222… (broken). ceil(22.5) = 23.
 */
import { expect, test, type Page } from '@playwright/test';

/** Boot with the rAF clock disabled; READY must arrive in < 3 s (TECH_SPEC §5). */
async function bootTest(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__TEST__ = true;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.READY === true, undefined, { timeout: 3000 });
}

/**
 * Page-side setup (same recipe as gameplay.spec.ts): force the spawn-column
 * surface block (48, h, 48) to basalt (id 3), stand the player on it looking
 * straight down — a stable raycast target — and settle 5 frames. Returns h.
 */
function pageSetupBasaltTarget(): number {
  const world = window.__game!.state!.world;
  let h = 0;
  for (let y = world.sizeY - 1; y >= 0; y--) {
    if (world.getBlock(48, y, 48) !== 0) {
      h = y;
      break;
    }
  }
  world.setBlock(48, h, 48, 3); // GAME_DESIGN §4: basalt, min tool Mk1
  const g = window.__game!;
  g.teleport!(48.5, h + 1, 48.5, 0, -1.55); // feet on the target block
  g.stepFrames!(5); // settle onto the ground, nothing held
  return h;
}

test('capstone craft-and-use: hand gated → craft drill_mk2 → mine basalt → place the drop', async ({
  page,
}) => {
  await bootTest(page);
  const h = await page.evaluate(pageSetupBasaltTarget);

  // ── 1. Gate: bare hand cannot mine basalt (GAME_DESIGN §4 min tool Mk1).
  // Starter kit has drill_mk1 in slot 0, so "hand" = selecting an EMPTY slot
  // (slots 4–7 are empty; loop.ts: a non-tool active slot mines at 'hand').
  const gated = await page.evaluate((hh) => {
    const g = window.__game!;
    const count = (id: string) =>
      g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);
    g.setInput!({ slot: 4 }); // empty hotbar slot ⇒ 'hand' tier
    g.setInput!({ mine: true }); // LMB hold begins
    g.stepFrames!(60); // 1 s held — twice basalt's would-be 0.75 s Mk1 time
    g.setInput!({ mine: false });
    return { block: g.state!.world.getBlock(48, hh, 48), basalt: count('block:3') };
  }, h);
  expect(gated.block).toBe(3); // intact: §4 "progress refuses to start"
  expect(gated.basalt).toBe(0); // nothing dropped

  // ── 2. Open the path: craft drill_mk2 (GAME_DESIGN §5: 1 Mk1 + 4 iron +
  // 2 copper) — everything comes from the starter kit (drill_mk1 ×1,
  // iron ore ×8, copper ore ×8), no give() needed for the loop itself.
  const crafted = await page.evaluate(() => {
    const g = window.__game!;
    const count = (id: string) =>
      g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);
    const ok = g.craft!('drill_mk2');
    return {
      ok,
      mk1: count('drill_mk1'),
      iron: count('block:7'),
      copper: count('block:8'),
      mk2Slot: g.state!.inv.slots.findIndex((s) => s?.itemId === 'drill_mk2'),
    };
  });
  expect(crafted.ok).toBe(true);
  expect(crafted.mk1).toBe(0); // §5: the Mk1 is consumed
  expect(crafted.iron).toBe(4); // 8 − 4
  expect(crafted.copper).toBe(6); // 8 − 2
  // The freed slot 0 is the first empty slot, so the Mk2 lands in the hotbar.
  expect(crafted.mk2Slot).toBeGreaterThanOrEqual(0);
  expect(crafted.mk2Slot).toBeLessThan(8);

  // ── 3. Equip the crafted drill from its hotbar slot and mine the basalt:
  // 1.5 s ÷ ×4 = 0.375 s = 22.5 steps ⇒ intact at 22, breaks on step 23
  // (first-tick-counts semantics, see header).
  const mined = await page.evaluate(
    ({ hh, slot }) => {
      const g = window.__game!;
      const count = (id: string) =>
        g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);
      g.setInput!({ slot });
      g.setInput!({ mine: true });
      g.stepFrames!(22);
      const at22 = g.state!.world.getBlock(48, hh, 48);
      g.stepFrames!(1);
      const at23 = g.state!.world.getBlock(48, hh, 48);
      g.setInput!({ mine: false });
      g.renderOnce!(); // remesh path after the voxel edit must not throw
      return {
        at22,
        at23,
        basalt: count('block:3'),
        basaltSlot: g.state!.inv.slots.findIndex((s) => s?.itemId === 'block:3'),
      };
    },
    { hh: h, slot: crafted.mk2Slot },
  );
  expect(mined.at22).toBe(3); // §4: not broken one step early
  expect(mined.at23).toBe(0); // §4: ceil(22.5) = 23 steps with Mk2
  expect(mined.basalt).toBe(1); // §4 drops: itself → 'block:3' in inventory
  expect(mined.basaltSlot).toBeGreaterThanOrEqual(0);
  expect(mined.basaltSlot).toBeLessThan(8); // first empty slot ⇒ hotbar

  // ── 4. Use the drop: select its hotbar slot and place it back into the
  // world (M1.4: placing consumes 1 from the active slot). The mined cell
  // (48, h, 48) is air; looking straight down the ray hits (48, h−1, 48) and
  // places on its top face — i.e. exactly where the basalt was mined from.
  const placed = await page.evaluate(
    ({ hh, slot }) => {
      const g = window.__game!;
      g.teleport!(48.5, hh + 3, 48.5, 0, -1.55); // clear of the place target
      g.setInput!({ slot });
      g.setInput!({ place: true }); // queues exactly one place click
      g.stepFrames!(2);
      return {
        world: g.state!.world.getBlock(48, hh, 48),
        slotAfter: g.state!.inv.slots[slot],
      };
    },
    { hh: h, slot: mined.basaltSlot },
  );
  expect(placed.world).toBe(3); // the mined basalt is back in the world
  expect(placed.slotAfter).toBeNull(); // its single-count stack is consumed
});
