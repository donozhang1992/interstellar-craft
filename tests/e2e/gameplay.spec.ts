/**
 * M0.4 gameplay E2E — drives the game exclusively through the TECH_SPEC §3
 * hooks (`window.__game`) + real key events. `__TEST__` is set before load so
 * the rAF loop never advances the simulation: `stepFrames(n)` is the only
 * clock (no waitForTimeout anywhere). Headless-safe: look direction comes from
 * `teleport(yaw, pitch)`, never from pointer lock / real mouse movement.
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

/** Page-side: surface height of the world-centre column (48, 48). */
function pageSurfaceHeight(): number {
  const world = window.__game!.state!.world;
  for (let y = world.sizeY - 1; y >= 0; y--) {
    if (world.getBlock(48, y, 48) !== 0) return y;
  }
  return 0;
}

/**
 * Page-side setup for movement tests: carve a flat corridor along x = 48,
 * z ∈ [38, 48] (rock floor at y = h, cleared air above) so walking is
 * deterministic regardless of terrain bumps. Edits write straight into the
 * core world (test setup — TECH_SPEC §3 allows state writes). Returns h.
 */
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

test('boots READY with full test hooks in under 3 s', async ({ page }) => {
  const hooks = await page.evaluate(() => {
    const g = window.__game!;
    return {
      ready: g.READY,
      hasState: !!g.state?.player && !!g.state?.world,
      fns: ['stepFrames', 'setInput', 'teleport', 'renderOnce'].map(
        (k) => typeof g[k as keyof typeof g],
      ),
    };
  });
  expect(hooks.ready).toBe(true);
  expect(hooks.hasState).toBe(true);
  expect(hooks.fns).toEqual(['function', 'function', 'function', 'function']);
});

test('walking forward for 60 stepped frames moves the player along facing', async ({ page }) => {
  const h = await page.evaluate(pageSetupCorridor);
  const res = await page.evaluate((hh) => {
    const g = window.__game!;
    g.teleport!(48.5, hh + 1, 48.5, 0, 0); // yaw 0 faces -z
    g.stepFrames!(5); // settle onto the floor
    const z0 = g.state!.player.pos.z;
    const x0 = g.state!.player.pos.x;
    g.setInput!({ forward: true });
    g.stepFrames!(60); // 1 s at walk speed 5 m/s
    g.setInput!({ forward: false });
    const p = g.state!.player.pos;
    return { dz: p.z - z0, dx: p.x - x0 };
  }, h);
  expect(res.dz).toBeLessThan(-3); // moved toward -z (facing direction)
  expect(Math.abs(res.dx)).toBeLessThan(0.01); // no sideways drift
});

test('jump rises then returns to the ground', async ({ page }) => {
  const h = await page.evaluate(pageSetupCorridor);
  const res = await page.evaluate((hh) => {
    const g = window.__game!;
    g.teleport!(48.5, hh + 1, 48.5, 0, 0);
    g.stepFrames!(5);
    const y0 = g.state!.player.pos.y;
    g.setInput!({ jump: true });
    g.stepFrames!(5);
    const yMid = g.state!.player.pos.y;
    g.setInput!({ jump: false });
    g.stepFrames!(120); // full low-gravity arc is ~66 frames
    return { y0, yMid, yEnd: g.state!.player.pos.y, onGround: g.state!.player.onGround };
  }, h);
  expect(res.yMid).toBeGreaterThan(res.y0 + 0.2);
  expect(Math.abs(res.yEnd - res.y0)).toBeLessThan(0.01);
  expect(res.onGround).toBe(true);
});

test('mining the block under the crosshair clears it and remeshes', async ({ page }) => {
  const h = await page.evaluate(pageSurfaceHeight);
  const res = await page.evaluate((hh) => {
    const g = window.__game!;
    const world = g.state!.world;
    g.teleport!(48.5, hh + 3, 48.5, 0, -1.55); // look straight down (pitch clamp)
    const before = world.getBlock(48, hh, 48);
    g.setInput!({ mine: true });
    g.stepFrames!(2); // edit applies on the first step, remesh on render
    g.renderOnce!(); // extra render: remesh path must not throw
    return { before, after: world.getBlock(48, hh, 48) };
  }, h);
  expect(res.before).toBeGreaterThan(0);
  expect(res.after).toBe(0);
});

test('placing the hotbar selection builds onto the targeted face', async ({ page }) => {
  const h = await page.evaluate(pageSurfaceHeight);
  const res = await page.evaluate((hh) => {
    const g = window.__game!;
    const world = g.state!.world;
    g.teleport!(48.5, hh + 4, 48.5, 0, -1.55); // high enough to not overlap target
    const before = world.getBlock(48, hh + 1, 48);
    g.setInput!({ slot: 2 }); // hotbar slot 3 = Basalt (block id 3)
    g.setInput!({ place: true });
    g.stepFrames!(2);
    return { before, after: world.getBlock(48, hh + 1, 48) };
  }, h);
  expect(res.before).toBe(0);
  expect(res.after).toBe(3);
});

test('fly toggle disables gravity and Space ascends', async ({ page }) => {
  const h = await page.evaluate(pageSetupCorridor);
  const res = await page.evaluate((hh) => {
    const g = window.__game!;
    g.teleport!(48.5, hh + 1, 48.5, 0, 0);
    g.stepFrames!(5);
    g.setInput!({ toggleFly: true });
    g.stepFrames!(1);
    const flying = g.state!.player.flying;
    const y0 = g.state!.player.pos.y;
    g.setInput!({ jump: true }); // Space = ascend in fly mode
    g.stepFrames!(30);
    const yUp = g.state!.player.pos.y;
    g.setInput!({ jump: false });
    g.stepFrames!(30); // gravity off: must hover, not fall
    return { flying, y0, yUp, yHover: g.state!.player.pos.y };
  }, h);
  expect(res.flying).toBe(true);
  expect(res.yUp).toBeGreaterThan(res.y0 + 3);
  expect(Math.abs(res.yHover - res.yUp)).toBeLessThan(1e-9);
});

test('real key events: KeyW walks, KeyF fly toggle is edge-triggered', async ({ page }) => {
  const h = await page.evaluate(pageSetupCorridor);
  await page.evaluate((hh) => {
    const g = window.__game!;
    g.teleport!(48.5, hh + 1, 48.5, 0, 0);
    g.stepFrames!(5);
  }, h);

  const z0 = await page.evaluate(() => window.__game!.state!.player.pos.z);
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.__game!.stepFrames!(30));
  await page.keyboard.up('KeyW');
  const z1 = await page.evaluate(() => window.__game!.state!.player.pos.z);
  expect(z1).toBeLessThan(z0 - 1); // 0.5 s walk ≈ 2.5 m toward -z

  await page.keyboard.press('KeyF');
  const flyOn = await page.evaluate(() => {
    window.__game!.stepFrames!(1);
    return window.__game!.state!.player.flying;
  });
  expect(flyOn).toBe(true);

  await page.keyboard.press('KeyF');
  const flyOff = await page.evaluate(() => {
    window.__game!.stepFrames!(1);
    return window.__game!.state!.player.flying;
  });
  expect(flyOff).toBe(false);
});

test('digit keys select hotbar slots in the HUD', async ({ page }) => {
  await expect(page.locator('#hotbar .slot').nth(0)).toHaveClass(/active/);
  await page.keyboard.press('Digit4');
  await expect(page.locator('#hotbar .slot').nth(3)).toHaveClass(/active/);
  await expect(page.locator('#hotbar .slot').nth(0)).not.toHaveClass(/active/);
});
