/**
 * Pause menu + settings E2E tests (M5.2)
 *
 * Covers:
 *  - pause/resume/isPaused hooks on window.__game
 *  - Pause menu DOM visible/hidden correctly
 *  - Settings panel: volume, mouseSens, renderScale persisted in localStorage
 *  - Settings loaded on startup from localStorage
 *  - Settings hooks: getSettings(), applySettings()
 *
 * Uses the __TEST__ harness so rAF clock is frozen; only stepFrames drives time.
 * No waitForTimeout -- all assertions are hook-driven or DOM state checks.
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

// Pause toggle

test('isPaused() returns false at start', async ({ page }) => {
  const paused = await page.evaluate(() => window.__game!.isPaused!());
  expect(paused).toBe(false);
});

test('pause() pauses the game; isPaused() returns true', async ({ page }) => {
  await page.evaluate(() => window.__game!.pause!());
  const paused = await page.evaluate(() => window.__game!.isPaused!());
  expect(paused).toBe(true);
});

test('resume() unpauses the game; isPaused() returns false', async ({ page }) => {
  await page.evaluate(() => window.__game!.pause!());
  await page.evaluate(() => window.__game!.resume!());
  const paused = await page.evaluate(() => window.__game!.isPaused!());
  expect(paused).toBe(false);
});

test('stepFrames frozen while paused (sim does not advance)', async ({ page }) => {
  await page.evaluate(() => {
    window.__game!.setInput!({ forward: true });
    window.__game!.stepFrames!(30);
    window.__game!.setInput!({ forward: false });
  });
  const posBefore = await page.evaluate(() => ({ ...window.__game!.state!.player.pos }));

  await page.evaluate(() => {
    window.__game!.pause!();
    window.__game!.setInput!({ forward: true });
    window.__game!.stepFrames!(30);
    window.__game!.setInput!({ forward: false });
  });
  const posAfter = await page.evaluate(() => ({ ...window.__game!.state!.player.pos }));

  expect(posAfter.x).toBeCloseTo(posBefore.x, 3);
  expect(posAfter.y).toBeCloseTo(posBefore.y, 3);
  expect(posAfter.z).toBeCloseTo(posBefore.z, 3);
});

test('after resume() stepFrames advances sim again', async ({ page }) => {
  await page.evaluate(() => window.__game!.pause!());
  await page.evaluate(() => window.__game!.resume!());

  const posBefore = await page.evaluate(() => ({ ...window.__game!.state!.player.pos }));
  await page.evaluate(() => {
    window.__game!.setInput!({ forward: true });
    window.__game!.stepFrames!(30);
    window.__game!.setInput!({ forward: false });
  });
  const posAfter = await page.evaluate(() => ({ ...window.__game!.state!.player.pos }));

  expect(posAfter.z).not.toBeCloseTo(posBefore.z, 1);
});

// Pause menu DOM

test('#pause element exists in the DOM', async ({ page }) => {
  const exists = await page.evaluate(() => !!document.getElementById('pause'));
  expect(exists).toBe(true);
});

test('#pause is hidden at start', async ({ page }) => {
  const hasOpen = await page.evaluate(() => {
    const el = document.getElementById('pause');
    return el ? el.classList.contains('open') : false;
  });
  expect(hasOpen).toBe(false);
});

test('#pause shows when game is paused via hook', async ({ page }) => {
  await page.evaluate(() => window.__game!.pause!());
  const hasOpen = await page.evaluate(() => {
    const el = document.getElementById('pause');
    return el ? el.classList.contains('open') : false;
  });
  expect(hasOpen).toBe(true);
});

test('#pause hides when game is resumed via hook', async ({ page }) => {
  await page.evaluate(() => window.__game!.pause!());
  await page.evaluate(() => window.__game!.resume!());
  const hasOpen = await page.evaluate(() => {
    const el = document.getElementById('pause');
    return el ? el.classList.contains('open') : false;
  });
  expect(hasOpen).toBe(false);
});

// Settings persistence

test('getSettings() returns defaults on first load', async ({ page }) => {
  const settings = await page.evaluate(() => window.__game!.getSettings!());
  expect(settings).toMatchObject({
    volume: expect.any(Number),
    mouseSens: expect.any(Number),
    renderScale: expect.any(Number),
  });
  expect(settings.mouseSens).toBeCloseTo(1.0, 2);
  expect(settings.renderScale).toBeCloseTo(1.0, 2);
});

test('applySettings() changes settings and getSettings() reflects them', async ({ page }) => {
  await page.evaluate(() =>
    window.__game!.applySettings!({ volume: 0.5, mouseSens: 1.5, renderScale: 0.75 }),
  );
  const settings = await page.evaluate(() => window.__game!.getSettings!());
  expect(settings.volume).toBeCloseTo(0.5, 2);
  expect(settings.mouseSens).toBeCloseTo(1.5, 2);
  expect(settings.renderScale).toBeCloseTo(0.75, 2);
});

test('applySettings() persists to localStorage key ic-settings-v1', async ({ page }) => {
  await page.evaluate(() =>
    window.__game!.applySettings!({ volume: 0.3, mouseSens: 2.0, renderScale: 0.5 }),
  );
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('ic-settings-v1');
    return raw
      ? (JSON.parse(raw) as { volume: number; mouseSens: number; renderScale: number })
      : null;
  });
  expect(stored).not.toBeNull();
  expect(stored!.volume).toBeCloseTo(0.3, 2);
  expect(stored!.mouseSens).toBeCloseTo(2.0, 2);
  expect(stored!.renderScale).toBeCloseTo(0.5, 2);
});

test('settings are loaded from localStorage on startup', async ({ page }) => {
  const page2 = await page.context().newPage();
  await page2.addInitScript(() => {
    window.__TEST__ = true;
    localStorage.setItem(
      'ic-settings-v1',
      JSON.stringify({ volume: 0.6, mouseSens: 2.5, renderScale: 0.75 }),
    );
  });
  await page2.goto('/');
  await page2.waitForFunction(() => window.READY === true, undefined, { timeout: 3000 });

  const settings = await page2.evaluate(() => window.__game!.getSettings!());
  expect(settings.volume).toBeCloseTo(0.6, 2);
  expect(settings.mouseSens).toBeCloseTo(2.5, 2);
  expect(settings.renderScale).toBeCloseTo(0.75, 2);
  await page2.close();
});
