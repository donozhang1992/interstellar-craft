/**
 * Audio M5.3 E2E — verifies AudioManager behaviour under __TEST__ (headless,
 * no real AudioContext ever created). All assertions target the `window.__game`
 * hooks; no real audio device is needed — the manager is a no-op in test mode.
 *
 * Clock: `__TEST__` set so the rAF loop is frozen; `stepFrames(n)` is the only
 * clock. No waitForTimeout anywhere.
 */
import { expect, test, type Page } from '@playwright/test';

/** Boot with the rAF clock disabled. */
async function bootGame(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__TEST__ = true;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.READY === true, undefined, { timeout: 3000 });
}

test.describe('audio M5.3', () => {
  test('AudioManager reports test-mode under __TEST__', async ({ page }) => {
    await bootGame(page);
    const state = await page.evaluate(() => window.__game!.audio?.());
    expect(state?.ctxState).toBe('test');
    expect(state?.muted).toBe(true);
    expect(state?.drone).toBe(false);
    expect(state?.heartbeat).toBe(false);
  });

  test('muteAudio / setVolume hooks are no-ops under __TEST__ (no crash)', async ({ page }) => {
    await bootGame(page);
    await page.evaluate(() => {
      window.__game!.muteAudio?.(false);
      window.__game!.setVolume?.(0.5);
    });
    const state = await page.evaluate(() => window.__game!.audio?.());
    expect(state?.ctxState).toBe('test'); // still test-mode, no real ctx
  });

  test('mine event does not crash under __TEST__', async ({ page }) => {
    await bootGame(page);
    // Mine 1 block (hold mine for 120 steps — enough to complete any block)
    await page.evaluate(() => window.__game!.setInput?.({ mine: true }));
    await page.evaluate(() => window.__game!.stepFrames?.(120));
    await page.evaluate(() => window.__game!.setInput?.({ mine: false }));
    // Just verify no crash and audio is still in test mode
    const state = await page.evaluate(() => window.__game!.audio?.());
    expect(state?.ctxState).toBe('test');
  });

  test('place event does not crash under __TEST__', async ({ page }) => {
    await bootGame(page);
    // Give a block and place it
    await page.evaluate(() => window.__game!.give?.('block:2', 1));
    await page.evaluate(() => window.__game!.setInput?.({ place: true }));
    await page.evaluate(() => window.__game!.stepFrames?.(2));
    const state = await page.evaluate(() => window.__game!.audio?.());
    expect(state?.ctxState).toBe('test');
  });
});
