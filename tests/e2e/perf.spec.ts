/**
 * M0.5 performance probes (TECH_SPEC §5 budgets, TEST_STRATEGY §7).
 *
 * Budgets (hard asserts — never weaken; if a budget fails, escalate with the
 * measured numbers instead):
 *  - average stepFrames(1) (one fixed sim step + one full render) < 16 ms,
 *    measured in-page with performance.now over 300 frames in 10 batches;
 *  - renderer draw calls at the spawn vista < 250 (`__game.drawCalls()` reads
 *    `renderer.info.render.calls` of the most recent render);
 *  - boot → READY < 3000 ms (in-page performance.now at the moment READY is
 *    first observed — same clock origin as navigation start).
 *
 * `__TEST__` is set before load so the rAF loop never competes with the
 * measured stepFrames calls (TECH_SPEC §3: stepFrames is the only clock).
 */
import { expect, test, type Page } from '@playwright/test';

async function bootTest(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__TEST__ = true;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.READY === true, undefined, { timeout: 3000 });
}

test('boot reaches READY in under 3000 ms (in-page clock)', async ({ page }) => {
  await page.addInitScript(() => {
    window.__TEST__ = true;
  });
  await page.goto('/');
  const readyMs = await page.waitForFunction(
    () => (window.READY === true ? performance.now() : false),
    undefined,
    { timeout: 3000 },
  );
  const ms = (await readyMs.jsonValue()) as number;
  console.log(`[perf] boot -> READY: ${ms.toFixed(0)} ms (budget 3000)`);
  expect(ms).toBeLessThan(3000);
});

test('average step+render frame cost < 16 ms over 300 frames', async ({ page }) => {
  await bootTest(page);
  const result = await page.evaluate(() => {
    const g = window.__game!;
    // Spawn pose; one warm-up render so shader compiles/uploads are excluded.
    g.renderOnce!();
    const batches: number[] = [];
    const BATCHES = 10;
    const PER_BATCH = 30;
    for (let b = 0; b < BATCHES; b++) {
      const t0 = performance.now();
      for (let i = 0; i < PER_BATCH; i++) g.stepFrames!(1);
      batches.push((performance.now() - t0) / PER_BATCH);
    }
    const avg = batches.reduce((s, v) => s + v, 0) / batches.length;
    return { avg, batches: batches.map((v) => +v.toFixed(2)) };
  });
  console.log(
    `[perf] avg step+render: ${result.avg.toFixed(2)} ms/frame (budget 16) — ` +
      `batch means: ${result.batches.join(', ')}`,
  );
  expect(result.avg).toBeLessThan(16);
});

test('draw calls at spawn vista < 250', async ({ page }) => {
  await bootTest(page);
  const calls = await page.evaluate(() => {
    const g = window.__game!;
    // Spawn vista = spawn position + default view angles (visual baseline a).
    g.teleport!(48.5, 32, 48.5, 2.45, -0.05);
    g.renderOnce!();
    return g.drawCalls!();
  });
  console.log(`[perf] draw calls at spawn vista: ${calls} (budget 250)`);
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThan(250);
});
