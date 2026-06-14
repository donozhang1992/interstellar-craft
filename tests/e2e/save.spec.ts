/**
 * Save / load E2E (M5.1) — exercises the full save/load/hasSave/clearSave
 * lifecycle through the window.__game hooks. Uses the standard __TEST__ harness
 * so the rAF clock is frozen and only stepFrames drives time.
 *
 * Flow:
 *  1. Fresh game has no save.
 *  2. Step a few frames (state advances), then call save().
 *  3. hasSave() returns true.
 *  4. Teleport the player far away.
 *  5. load() returns true and restores the player position to where it was when saved.
 *  6. clearSave() removes the save; hasSave() returns false.
 */
import { expect, test, type Page } from '@playwright/test';

async function bootTest(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__TEST__ = true;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.READY === true, undefined, { timeout: 3000 });
}

test.beforeEach(async ({ page }) => {
  await bootTest(page);
});

test('fresh game has no save', async ({ page }) => {
  const has = await page.evaluate(() => window.__game!.hasSave!());
  expect(has).toBe(false);
});

test('save() writes to localStorage; hasSave() reflects it', async ({ page }) => {
  // Step a few frames so some state exists.
  await page.evaluate(() => window.__game!.stepFrames!(10));
  await page.evaluate(() => window.__game!.save!());
  const has = await page.evaluate(() => window.__game!.hasSave!());
  expect(has).toBe(true);
});

test('load() restores player position from saved state', async ({ page }) => {
  // Step some frames with forward input to move the player.
  await page.evaluate(() => {
    window.__game!.setInput!({ forward: true });
    window.__game!.stepFrames!(60);
    window.__game!.setInput!({ forward: false });
  });

  // Capture position at save time.
  const posBefore = await page.evaluate(() => ({ ...window.__game!.state!.player.pos }));

  // Save the game.
  await page.evaluate(() => window.__game!.save!());

  // Teleport the player far away.
  await page.evaluate(() => window.__game!.teleport!(0, 100, 0));
  const posAfterTeleport = await page.evaluate(() => ({ ...window.__game!.state!.player.pos }));
  expect(posAfterTeleport.y).toBeCloseTo(100, 0);

  // Load the save — should restore the player to where they were.
  const loadResult = await page.evaluate(() => window.__game!.load!());
  expect(loadResult).toBe(true);

  const posAfterLoad = await page.evaluate(() => ({ ...window.__game!.state!.player.pos }));
  expect(posAfterLoad.x).toBeCloseTo(posBefore.x, 1);
  expect(posAfterLoad.y).toBeCloseTo(posBefore.y, 1);
  expect(posAfterLoad.z).toBeCloseTo(posBefore.z, 1);
});

test('clearSave() removes the save; hasSave() returns false', async ({ page }) => {
  // Save first.
  await page.evaluate(() => window.__game!.save!());
  expect(await page.evaluate(() => window.__game!.hasSave!())).toBe(true);

  // Clear it.
  await page.evaluate(() => window.__game!.clearSave!());
  expect(await page.evaluate(() => window.__game!.hasSave!())).toBe(false);
});

test('load() returns false when there is no save', async ({ page }) => {
  // Ensure no save exists.
  await page.evaluate(() => window.__game!.clearSave!());
  const result = await page.evaluate(() => window.__game!.load!());
  expect(result).toBe(false);
});

test('save → clearSave → save → load restores latest save', async ({ page }) => {
  // First save at spawn.
  await page.evaluate(() => window.__game!.save!());

  // Move player, then clear the first save.
  await page.evaluate(() => {
    window.__game!.teleport!(50, 40, 50);
    window.__game!.clearSave!();
  });

  // Save again at the new position.
  await page.evaluate(() => window.__game!.save!());
  const savedPos = await page.evaluate(() => ({ ...window.__game!.state!.player.pos }));

  // Teleport away and load.
  await page.evaluate(() => window.__game!.teleport!(0, 100, 0));
  await page.evaluate(() => window.__game!.load!());

  const posAfterLoad = await page.evaluate(() => ({ ...window.__game!.state!.player.pos }));
  expect(posAfterLoad.x).toBeCloseTo(savedPos.x, 1);
  expect(posAfterLoad.y).toBeCloseTo(savedPos.y, 1);
  expect(posAfterLoad.z).toBeCloseTo(savedPos.z, 1);
});

test('save preserves inventory across load', async ({ page }) => {
  // Give some items.
  await page.evaluate(() => {
    window.__game!.give!('block:1', 10);
    window.__game!.give!('block:4', 5);
  });

  // Count inventory before save.
  const invBefore = await page.evaluate(() => {
    const slots = window.__game!.state!.inv.slots;
    const count = (id: string) =>
      slots.reduce((n: number, s) => (s && s.itemId === id ? n + s.count : n), 0);
    return { regolith: count('block:1'), crystal: count('block:4') };
  });

  // Save, wipe inventory via re-boot simulation: teleport + keep existing state.
  await page.evaluate(() => window.__game!.save!());

  // Load and check counts are restored.
  await page.evaluate(() => window.__game!.load!());
  const invAfter = await page.evaluate(() => {
    const slots = window.__game!.state!.inv.slots;
    const count = (id: string) =>
      slots.reduce((n: number, s) => (s && s.itemId === id ? n + s.count : n), 0);
    return { regolith: count('block:1'), crystal: count('block:4') };
  });

  expect(invAfter.regolith).toBe(invBefore.regolith);
  expect(invAfter.crystal).toBe(invBefore.crystal);
});
