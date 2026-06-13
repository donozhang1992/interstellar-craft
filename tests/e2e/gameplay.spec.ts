/**
 * Gameplay E2E — drives the game exclusively through the TECH_SPEC §3 hooks
 * (`window.__game`) + real key events. `__TEST__` is set before load so the
 * rAF loop never advances the simulation: `stepFrames(n)` is the only clock
 * (no waitForTimeout anywhere). Headless-safe: look direction comes from
 * `teleport(yaw, pitch)`, never from pointer lock / real mouse movement.
 *
 * M1.4 REWRITE (designed behavior change, NOT test weakening): GAME_DESIGN §4
 * replaced the M0 prototype's instant-click mining with continuous
 * hold-to-mine — mining time = hardness / tool multiplier (hand ×1, Mk1 ×2),
 * a block below its min tool refuses to start — and placing now consumes the
 * active hotbar slot of the real 40-slot inventory.
 *
 * Sandbox starter kit (TODO(M3), control-plane decision): slot 0 drill_mk1,
 * slot 1 iron ore ×8, slot 2 copper ore ×8, slot 3 hull ×4, slots 4–7 empty.
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

/**
 * Page-side setup for mining tests: force the surface block of the spawn
 * column to `blockId`, stand the player on it looking straight down (the
 * raycast hits the block under the feet — a stable "48,h,48" target key),
 * and settle 5 frames. Returns h.
 */
function pageSetupMineTarget(blockId: number): number {
  const world = window.__game!.state!.world;
  let h = 0;
  for (let y = world.sizeY - 1; y >= 0; y--) {
    if (world.getBlock(48, y, 48) !== 0) {
      h = y;
      break;
    }
  }
  world.setBlock(48, h, 48, blockId);
  const g = window.__game!;
  g.teleport!(48.5, h + 1, 48.5, 0, -1.55); // feet on the target block
  g.stepFrames!(5); // settle onto the ground, nothing held
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
      hasState: !!g.state?.player && !!g.state?.world && !!g.state?.inv,
      fns: ['stepFrames', 'setInput', 'teleport', 'renderOnce', 'give', 'craft'].map(
        (k) => typeof g[k as keyof typeof g],
      ),
    };
  });
  expect(hooks.ready).toBe(true);
  expect(hooks.hasState).toBe(true);
  expect(hooks.fns).toEqual([
    'function',
    'function',
    'function',
    'function',
    'function',
    'function',
  ]);
});

test('starter kit (TODO(M3) sandbox): drill + ores + hull in hotbar order', async ({ page }) => {
  const slots = await page.evaluate(() => window.__game!.state!.inv.slots.slice(0, 5));
  expect(slots[0]).toEqual({ itemId: 'drill_mk1', count: 1 });
  expect(slots[1]).toEqual({ itemId: 'block:7', count: 8 });
  expect(slots[2]).toEqual({ itemId: 'block:8', count: 8 });
  expect(slots[3]).toEqual({ itemId: 'block:9', count: 4 });
  expect(slots[4]).toBeNull();
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

// GAME_DESIGN §4: regolith hardness 0.6 s by hand → at dt = 1/60 a fresh hold
// completes exactly on step 36 (core contract: the first held tick counts).
test('hold-to-mine: regolith by hand breaks on step 36, drop enters inventory', async ({
  page,
}) => {
  const h = await page.evaluate(pageSetupMineTarget, 1);
  const res = await page.evaluate((hh) => {
    const g = window.__game!;
    const world = g.state!.world;
    const count = (id: string) =>
      g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);
    g.setInput!({ slot: 4 }); // empty slot ⇒ 'hand' tier (slot 0 is the drill)
    const before = count('block:1');
    g.setInput!({ mine: true }); // LMB hold begins
    g.stepFrames!(35);
    const at35 = world.getBlock(48, hh, 48);
    g.stepFrames!(1);
    const at36 = world.getBlock(48, hh, 48);
    g.setInput!({ mine: false });
    g.renderOnce!(); // remesh path after the voxel edit must not throw
    return { at35, at36, gained: count('block:1') - before };
  }, h);
  expect(res.at35).toBe(1); // §4: not broken one step early
  expect(res.at36).toBe(0); // §4: 0.6 s / (×1 hand) = 36 steps
  expect(res.gained).toBe(1); // §4 drops: itself
});

// GAME_DESIGN §4: basalt min tool = Mk1 — a hand hold REFUSES (progress never
// starts), the block survives any hold length.
test('hold-to-mine: basalt by hand is refused (min tool Mk1)', async ({ page }) => {
  const h = await page.evaluate(pageSetupMineTarget, 3);
  const res = await page.evaluate((hh) => {
    const g = window.__game!;
    g.setInput!({ slot: 4 }); // empty slot ⇒ 'hand'
    g.setInput!({ mine: true });
    g.stepFrames!(120); // 2 s held — far beyond basalt's 1.5 s hardness
    g.setInput!({ mine: false });
    const count = (id: string) =>
      g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);
    return { block: g.state!.world.getBlock(48, hh, 48), gained: count('block:3') };
  }, h);
  expect(res.block).toBe(3); // still basalt
  expect(res.gained).toBe(0);
});

// GAME_DESIGN §4: basalt 1.5 s ÷ Drill Mk1 ×2 = 0.75 s = 45 steps.
test('hold-to-mine: give drill_mk1, select it — basalt mines in 45 steps', async ({ page }) => {
  const h = await page.evaluate(pageSetupMineTarget, 3);
  const res = await page.evaluate((hh) => {
    const g = window.__game!;
    const overflow = g.give!('drill_mk1', 1); // → first empty slot (4)
    g.setInput!({ slot: 4 });
    g.setInput!({ mine: true });
    g.stepFrames!(44);
    const at44 = g.state!.world.getBlock(48, hh, 48);
    g.stepFrames!(1);
    const at45 = g.state!.world.getBlock(48, hh, 48);
    g.setInput!({ mine: false });
    const count = (id: string) =>
      g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);
    return { overflow, slot4: g.state!.inv.slots[4], at44, at45, gained: count('block:3') };
  }, h);
  expect(res.overflow).toBe(0);
  expect(res.slot4).toEqual({ itemId: 'drill_mk1', count: 1 });
  expect(res.at44).toBe(3);
  expect(res.at45).toBe(0); // §4: 1.5 / ×2 = 0.75 s = 45 steps
  expect(res.gained).toBe(1);
});

// GAME_DESIGN §4/§12 + M1.4: placing consumes 1 from the active hotbar slot;
// an empty slot and a tool slot are no-ops.
test('placing consumes the active slot; empty and tool slots are no-ops', async ({ page }) => {
  const h = await page.evaluate(pageSurfaceHeight);
  const res = await page.evaluate((hh) => {
    const g = window.__game!;
    const world = g.state!.world;
    g.teleport!(48.5, hh + 4, 48.5, 0, -1.55); // high enough to not overlap target
    const before = world.getBlock(48, hh + 1, 48);
    g.setInput!({ slot: 3 }); // starter kit hull ×4 (block:9 → block id 9)
    g.setInput!({ place: true });
    g.stepFrames!(2);
    const placed = world.getBlock(48, hh + 1, 48);
    const hullLeft = g.state!.inv.slots[3];
    // empty slot → no-op
    g.setInput!({ slot: 5, place: true });
    g.stepFrames!(2);
    const afterEmpty = world.getBlock(48, hh + 2, 48);
    // tool slot → no-op (tools cannot be placed)
    g.setInput!({ slot: 0, place: true });
    g.stepFrames!(2);
    const afterTool = world.getBlock(48, hh + 2, 48);
    return { before, placed, hullLeft, afterEmpty, afterTool };
  }, h);
  expect(res.before).toBe(0);
  expect(res.placed).toBe(9); // hull block placed
  expect(res.hullLeft).toEqual({ itemId: 'block:9', count: 3 }); // 4 − 1
  expect(res.afterEmpty).toBe(0);
  expect(res.afterTool).toBe(0);
});

// GAME_DESIGN §5: Iron Plate = 2 iron_ore. Crafting is atomic on the live
// inventory (free crafting until the M3 quest engine — CP decision).
test('craft flow: give 2 iron ore, craft iron_plate, inventory updated', async ({ page }) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const count = (id: string) =>
      g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);
    g.give!('block:7', 2);
    const ironBefore = count('block:7'); // starter 8 + 2
    const ok = g.craft!('iron_plate');
    return {
      ok,
      ironBefore,
      ironAfter: count('block:7'),
      plates: count('iron_plate'),
    };
  });
  expect(res.ironBefore).toBe(10);
  expect(res.ok).toBe(true);
  expect(res.ironAfter).toBe(8); // §5: consumed 2 iron_ore
  expect(res.plates).toBe(1);
});

test('Tab opens the inventory/crafting overlay, pauses the sim; Esc closes', async ({ page }) => {
  const h = await page.evaluate(pageSetupCorridor);
  await page.evaluate((hh) => {
    const g = window.__game!;
    g.teleport!(48.5, hh + 1, 48.5, 0, 0);
    g.stepFrames!(5);
  }, h);

  await page.keyboard.press('Tab');
  await expect(page.locator('#invcraft')).toHaveClass(/open/);
  await expect(page.locator('#invgrid .inv-cell')).toHaveCount(40);
  await expect(page.locator('#invgrid .inv-cell.hot')).toHaveCount(8); // hotbar row
  await expect(page.locator('#recipes .recipe')).toHaveCount(17); // every §5 recipe at ch5
  // CRAFT gating: iron_plate craftable from the starter kit, plasma_drill not.
  await expect(page.locator('.recipe[data-recipe="iron_plate"] .craft-btn')).toBeEnabled();
  await expect(page.locator('.recipe[data-recipe="plasma_drill"] .craft-btn')).toBeDisabled();

  // Sim is PAUSED while open: held input + stepFrames must not move the player.
  const paused = await page.evaluate(() => {
    const g = window.__game!;
    const z0 = g.state!.player.pos.z;
    g.setInput!({ forward: true });
    g.stepFrames!(60);
    g.setInput!({ forward: false });
    return Math.abs(g.state!.player.pos.z - z0);
  });
  expect(paused).toBe(0);

  await page.keyboard.press('Escape');
  await expect(page.locator('#invcraft')).not.toHaveClass(/open/);
  // …and the sim resumes after closing.
  const moved = await page.evaluate(() => {
    const g = window.__game!;
    const z0 = g.state!.player.pos.z;
    g.setInput!({ forward: true });
    g.stepFrames!(30);
    g.setInput!({ forward: false });
    return g.state!.player.pos.z - z0;
  });
  expect(moved).toBeLessThan(-1);
});

test('opening Tab hides the title screen instead of popping it over crafting (regression)', async ({
  page,
}) => {
  // Bug: opening the crafting overlay called exitPointerLock, and the unlock
  // handler re-revealed the #overlay title screen — which sits ABOVE #invcraft
  // (z-index 20 vs 15) — making the crafting UI visible-but-unclickable. The fix
  // keeps the title hidden whenever the crafting overlay is open.
  await page.evaluate(pageSetupCorridor);
  // Headless never pointer-locks, so the title screen is showing at boot.
  await expect(page.locator('#overlay')).not.toHaveClass(/hidden/);

  await page.keyboard.press('Tab');
  await expect(page.locator('#invcraft')).toHaveClass(/open/);
  await expect(page.locator('#overlay')).toHaveClass(/hidden/); // title hidden ⇒ crafting reachable

  await page.keyboard.press('Tab'); // closes cleanly
  await expect(page.locator('#invcraft')).not.toHaveClass(/open/);
});

test('overlay CRAFT button crafts and updates the grid live', async ({ page }) => {
  // Headless has no pointer lock, so the title overlay never auto-hides and
  // would swallow the button click — dismiss it via the DOM (same as the
  // visual suite's bootVisual; its only game effect is requesting lock).
  await page.evaluate(() => {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.style.display = 'none';
  });
  await page.keyboard.press('Tab');
  await expect(page.locator('#invcraft')).toHaveClass(/open/);
  // Starter kit: 8 iron ore in cell 1 → craft Iron Plate (2 iron_ore, §5).
  await page.locator('.recipe[data-recipe="iron_plate"] .craft-btn').click();
  const inv = await page.evaluate(() => ({
    iron: window.__game!.state!.inv.slots[1],
    plates: window
      .__game!.state!.inv.slots.filter((s) => s?.itemId === 'iron_plate')
      .map((s) => s!.count),
  }));
  expect(inv.iron).toEqual({ itemId: 'block:7', count: 6 });
  expect(inv.plates).toEqual([1]);
  // Grid re-rendered live: iron ore cell badge now shows 6.
  await expect(page.locator('#invgrid .inv-cell[data-slot="1"] .count')).toHaveText('6');
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

test('digit keys select hotbar slots 1–8 in the HUD', async ({ page }) => {
  await expect(page.locator('#hotbar .slot')).toHaveCount(8); // GAME_DESIGN §12
  await expect(page.locator('#hotbar .slot').nth(0)).toHaveClass(/active/);
  await page.keyboard.press('Digit4');
  await expect(page.locator('#hotbar .slot').nth(3)).toHaveClass(/active/);
  await expect(page.locator('#hotbar .slot').nth(0)).not.toHaveClass(/active/);
  await page.keyboard.press('Digit8');
  await expect(page.locator('#hotbar .slot').nth(7)).toHaveClass(/active/);
  await expect(page.locator('#hotbar .slot').nth(3)).not.toHaveClass(/active/);
});

test('hotbar shows starter-kit count badges from the live inventory', async ({ page }) => {
  await expect(page.locator('#hotbar .slot').nth(1).locator('.count')).toHaveText('8');
  await expect(page.locator('#hotbar .slot').nth(3).locator('.count')).toHaveText('4');
  await expect(page.locator('#hotbar .slot').nth(0).locator('.count')).toHaveCount(0); // tools: no badge
  await expect(page.locator('#hotbar .slot').nth(4).locator('.count')).toHaveCount(0); // empty
});
