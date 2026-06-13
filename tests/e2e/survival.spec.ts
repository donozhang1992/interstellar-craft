/**
 * Survival glue E2E (M2.3) — drives the survival loop through the TECH_SPEC §3
 * hooks (`window.__game`) only: `__TEST__` disables the rAF clock so
 * `stepFrames(n)` is the sole clock (NO waitForTimeout). Survival advances once
 * per fixed step inside stepSim, so every assertion below is a pure function of
 * the steps taken (GAME_DESIGN §12 canonical rates).
 *
 * Spawn (seed 0x7e): world-centre column (48,48), surface y=30 ⇒ spawn pos y=32.
 * O2_SAFE_RADIUS = 4 around spawn refills O₂; teleporting away (and above the
 * deep threshold y=28) drains at the surface rate; below y<28 at the deep rate.
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

/**
 * Park the player away from the pod (so no refill) and on the SURFACE (y ≥ 28 so
 * the surface drain rate applies), in fly mode hovering so they don't fall and
 * accrue fall damage or land near a different column. Returns nothing.
 */
async function parkSurfaceAwayFromPod(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window.__game!;
    g.teleport!(20.5, 40, 20.5, 0, 0); // far from spawn (48,48); above y=28
    g.setInput!({ toggleFly: true }); // fly so we hover (no fall, no landing)
    g.stepFrames!(1);
  });
}

test('O₂ drains at the surface rate away from the pod', async ({ page }) => {
  await parkSurfaceAwayFromPod(page);
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const o2Before = g.survival!().o2;
    g.stepFrames!(60); // 1 s
    return { o2Before, o2After: g.survival!().o2 };
  });
  // O2_SURFACE = 0.25/s ⇒ ~0.25 lost over the 60-step second.
  expect(res.o2Before - res.o2After).toBeCloseTo(0.25, 3);
});

test('O₂ drains faster when deep (y < 28)', async ({ page }) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    // Carve a pocket far from the pod, deep, and hover there in fly mode.
    g.teleport!(20.5, 15, 20.5, 0, 0); // y=15 < 28 ⇒ deep
    g.setInput!({ toggleFly: true });
    g.stepFrames!(1);
    const o2Before = g.survival!().o2;
    g.stepFrames!(60); // 1 s
    return { o2Before, o2After: g.survival!().o2 };
  });
  // O2_DEEP = 0.6/s ⇒ ~0.6 lost over the 60-step second (vs 0.25 at surface).
  expect(res.o2Before - res.o2After).toBeCloseTo(0.6, 3);
});

test('O₂ refills when near the pod (spawn)', async ({ page }) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    g.setStat!('o2', 50); // start half-empty
    g.teleport!(48.5, 32, 48.5, 0, 0); // at spawn (within O2_SAFE_RADIUS)
    g.setInput!({ toggleFly: true }); // hover at the pod
    g.stepFrames!(1);
    const o2Before = g.survival!().o2;
    g.stepFrames!(60); // 1 s
    return { o2Before, o2After: g.survival!().o2 };
  });
  expect(res.o2Before).toBeGreaterThan(49); // started ~50, ticked up near the pod
  // O2_POD_REFILL = 20/s ⇒ +~20 over the 60-step second (refill, not drain).
  expect(res.o2After).toBeGreaterThan(res.o2Before + 15);
});

test('HP drains while O₂ is 0; the player dies and respawns at the pod with full stats and a cache', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    // Give a stackable so the death drop produces a non-empty cache.
    g.give!('block:1', 10); // regolith ×10 ⇒ drops floor(10/2) = 5
    g.teleport!(20.5, 40, 20.5, 0, 0); // away from pod so O₂ stays 0
    g.setInput!({ toggleFly: true });
    g.stepFrames!(1);
    const deathPos = { ...g.state!.player.pos };

    g.setStat!('o2', 0);
    g.setStat!('hp', 4); // HP_O2ZERO = 4/s ⇒ dead after ~1 s
    const hpBefore = g.survival!().hp;
    g.stepFrames!(30); // 0.5 s — HP should be draining, not yet dead
    const hpMid = g.survival!().hp;
    g.stepFrames!(60); // another 1 s — crosses 0 ⇒ death + respawn

    const p = g.state!.player.pos;
    const s = g.survival!();
    const caches = g.caches!();
    return {
      hpBefore,
      hpMid,
      hpAfter: s.hp,
      o2After: s.o2,
      energyAfter: s.energy,
      atSpawn: Math.hypot(p.x - 48.5, p.z - 48.5) < 0.001,
      cacheCount: caches.length,
      cacheItems: caches.map((c) => c.items),
      cacheNearDeath:
        caches.length > 0 &&
        Math.hypot(caches[0]!.pos.x - deathPos.x, caches[0]!.pos.z - deathPos.z) < 0.001,
    };
  });
  expect(res.hpBefore).toBe(4);
  expect(res.hpMid).toBeLessThan(4); // draining
  expect(res.hpMid).toBeGreaterThan(0); // not dead at 0.5 s
  // Respawned: full stats at the pod.
  expect(res.hpAfter).toBe(100);
  expect(res.o2After).toBe(100);
  expect(res.energyAfter).toBe(100);
  expect(res.atSpawn).toBe(true);
  // A recoverable cache exists at the death position.
  expect(res.cacheCount).toBe(1);
  expect(res.cacheNearDeath).toBe(true);
  expect(res.cacheItems[0]).toContainEqual({ itemId: 'block:1', count: 5 });
});

test('walking within PICKUP_RADIUS of a death cache recovers its items', async ({ page }) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const count = (id: string) =>
      g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);
    g.give!('block:1', 10);
    g.teleport!(20.5, 40, 20.5, 0, 0);
    g.setInput!({ toggleFly: true });
    g.stepFrames!(1);
    const deathPos = { ...g.state!.player.pos };

    // Kill the player (away from pod): drops 5 regolith into a cache, respawns at pod.
    g.setStat!('o2', 0);
    g.setStat!('hp', 1);
    g.stepFrames!(60);
    const regolithAfterDeath = count('block:1'); // kept 5
    const cacheBefore = g.caches!().length;

    // Walk back to the death position (fly there) — within PICKUP_RADIUS the
    // cache returns its items on the very step we arrive.
    g.teleport!(deathPos.x, deathPos.y, deathPos.z, 0, 0);
    g.setInput!({ toggleFly: true }); // already flying from before? toggle keeps hover; ensure no fall
    g.stepFrames!(2);
    return {
      regolithAfterDeath,
      cacheBefore,
      regolithRecovered: count('block:1'),
      cacheAfter: g.caches!().length,
    };
  });
  expect(res.regolithAfterDeath).toBe(5); // kept half
  expect(res.cacheBefore).toBe(1);
  expect(res.regolithRecovered).toBe(10); // 5 kept + 5 recovered
  expect(res.cacheAfter).toBe(0); // emptied cache removed
});

test('fall damage applies on a scripted drop beyond the safe threshold', async ({ page }) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const world = g.state!.world;
    // Build a solid floor platform far from the pod and drop onto it from a
    // SURVIVABLE height. Floor at y=20; drop the feet from y=30 ⇒ ~10 blocks
    // fallen ⇒ (10−3)*8 = 56 dmg, survivable from 100 (a 19-block fall would be
    // fatal and trigger a respawn, masking the damage — hence the tuned height).
    const fx = 20;
    const fz = 20;
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) world.setBlock(fx + dx, 20, fz + dz, 2);
    for (let y = 21; y <= 40; y++)
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) world.setBlock(fx + dx, y, fz + dz, 0);

    g.teleport!(fx + 0.5, 30, fz + 0.5, 0, 0); // NOT flying — gravity drops them
    g.setStat!('hp', 100);
    const hpBefore = g.survival!().hp;
    g.stepFrames!(180); // 3 s — fall ~10 blocks and settle in low gravity
    const p = g.state!.player.pos;
    return { hpBefore, hpAfter: g.survival!().hp, landedY: p.y, onGround: g.state!.player.onGround };
  });
  expect(res.onGround).toBe(true); // landed
  expect(res.landedY).toBeCloseTo(21, 0); // on top of the y=20 floor
  // Fell ~10 blocks over the safe 3 ⇒ noticeable, non-fatal HP loss.
  expect(res.hpAfter).toBeLessThan(res.hpBefore);
  expect(res.hpAfter).toBeGreaterThan(0); // survived (not respawned)
  expect(res.hpBefore - res.hpAfter).toBeGreaterThan(30);
});

test('energy gate: at 0 energy a Mk2 drill mines at hand speed (slower)', async ({ page }) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const world = g.state!.world;
    // Surface regolith target under the feet, looking straight down.
    let h = 0;
    for (let y = world.sizeY - 1; y >= 0; y--) {
      if (world.getBlock(48, y, 48) !== 0) {
        h = y;
        break;
      }
    }
    world.setBlock(48, h, 48, 1); // regolith
    g.give!('drill_mk2', 1); // → slot 4 (after starter kit)
    g.teleport!(48.5, h + 1, 48.5, 0, -1.55);
    g.stepFrames!(5);
    g.setInput!({ slot: 4 }); // select the Mk2 drill

    // With FULL energy: regolith 0.6 s ÷ Mk2 ×4 = 9 steps.
    g.setStat!('energy', 100);
    g.setInput!({ mine: true });
    g.stepFrames!(9);
    const fastBroke = world.getBlock(48, h, 48) === 0;
    g.setInput!({ mine: false });

    // Reset the same block, now with ZERO energy ⇒ gate falls back to hand ×1
    // (36 steps): after only 9 steps it must NOT have broken.
    world.setBlock(48, h, 48, 1);
    g.setStat!('energy', 0);
    g.stepFrames!(2); // let the gate read energy=0 (one-step lag)
    g.setInput!({ mine: true });
    g.stepFrames!(9);
    const slowStillThere = world.getBlock(48, h, 48) !== 0;
    g.setInput!({ mine: false });
    return { fastBroke, slowStillThere };
  });
  expect(res.fastBroke).toBe(true); // Mk2 at full energy: 9 steps
  expect(res.slowStillThere).toBe(true); // 0 energy ⇒ hand speed, not broken at 9
});

test('O₂ canister use restores +40 and consumes one from the inventory', async ({ page }) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const count = (id: string) =>
      g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);
    g.give!('o2_canister', 2);
    g.setStat!('o2', 30);
    const before = { o2: g.survival!().o2, canisters: count('o2_canister') };
    const used = g.useCanister!();
    return { used, before, after: { o2: g.survival!().o2, canisters: count('o2_canister') } };
  });
  expect(res.used).toBe(true);
  expect(res.before.o2).toBeCloseTo(30, 1);
  expect(res.before.canisters).toBe(2);
  expect(res.after.o2).toBeCloseTo(70, 1); // +40
  expect(res.after.canisters).toBe(1); // consumed one
});

test('flare use places a 60 s emissive lamp marker and consumes one flare', async ({ page }) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const world = g.state!.world;
    const count = (id: string) =>
      g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);
    g.give!('flare', 1);
    // Stand in a cleared cell (fly-hover) so the feet voxel is air.
    g.teleport!(20.5, 20.5, 20.5, 0, 0);
    world.setBlock(20, 20, 20, 0); // ensure the feet voxel is empty
    g.setInput!({ toggleFly: true });
    g.stepFrames!(1);
    const placed = g.useFlare!();
    const blockAfter = placed ? world.getBlock(placed.x, placed.y, placed.z) : -1;
    return { placed: !!placed, blockAfter, flaresLeft: count('flare') };
  });
  expect(res.placed).toBe(true);
  expect(res.blockAfter).toBe(6); // BlockId.Lamp = 6 (emissive)
  expect(res.flaresLeft).toBe(0);
});
