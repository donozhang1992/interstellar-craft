/**
 * M0.5 visual regression baselines (TEST_STRATEGY §4, L3 evidence layer).
 *
 * Determinism contract:
 *  - seed 0x7e (the game's pinned default — ROADMAP M0.2a terrain hash 55922fda);
 *  - `window.__TEST__` set before load, so the rAF loop never advances anything:
 *    every shot is `teleport(...)` → optional scripted edits via `stepFrames` →
 *    `renderOnce()` → screenshot. No wall-clock anywhere.
 *  - title overlay dismissed via the DOM (`display:none`) — pointer lock is not
 *    available headless, and the overlay's only game effect is requesting lock;
 *  - the HUD is fully deterministic (static info line, inventory-driven
 *    hotbar; every transient element — toasts, item name, mining progress —
 *    is timed in SIM STEPS, not wall-clock), so shots include it un-masked;
 *  - baselines are 1280×720 PNGs in tests/visual/__baselines__/ (config
 *    `snapshotPathTemplate`), gate `maxDiffPixelRatio: 0.005` (config-wide).
 *
 * Pose constants (world is 96×81×96, seed 0x7e; spawn column (48,48) surface
 * y=30 → spawn pos y=32; craters at (30,62) r13 and (70,26) r9; surface
 * crystal blocks at (45,32,37) and (51,32,36); eye height 1.62):
 */
import { expect, test, type Page } from '@playwright/test';

interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

const POSES = {
  /** a. The exact view a new player gets: spawn position + default view angles. */
  spawnVista: { x: 48.5, y: 32, z: 48.5, yaw: 2.45, pitch: -0.05 },
  /** b. Facing BH_DIR (0.55,0.42,-0.72)n → yaw −0.6524; pitch 0.30 keeps the
   *  horizon terrain as a silhouette at the bottom of the 72° fov. */
  gargantua: { x: 48.5, y: 32, z: 48.5, yaw: -0.6524, pitch: 0.3 },
  /** c. Standing on the east rim crest of crater 1 (centre 30,62 r13; floor
   *  y≈22 at x≈30; rim crest y=28 at x≈41), looking west (-x) across the bowl
   *  at a shallow down-angle for vertex-AO detail on the stepped walls. */
  craterRim: { x: 41.5, y: 30, z: 62.5, yaw: 1.5708, pitch: -0.35 },
  /** d. Surface crystal at (51,32,36) five blocks ahead (yaw 0 faces -z),
   *  second crystal (45,32,37) in frame left; emissive glow vs dark terrain. */
  crystal: { x: 51.5, y: 33, z: 41.5, yaw: 0, pitch: -0.37 },
  /** e/f. HUD composite: sky-dominant view so crosshair + hotbar read clearly. */
  hud: { x: 48.5, y: 32, z: 48.5, yaw: 2.45, pitch: 0.9 },
  /** g. Looking straight down (pitch clamp −1.55) at the spawn column; mining
   *  removes the surface block at (48,30,48) — reach is 4.6 < 7. */
  mine: { x: 48.5, y: 33, z: 48.5, yaw: 0, pitch: -1.55 },
  /** h. One block higher so the placed block (48,31,48) doesn't intersect the
   *  player; M1: hotbar slot 3 = starter-kit Hull ×4 (block id 9). */
  place: { x: 48.5, y: 34, z: 48.5, yaw: 0, pitch: -1.55 },
  /** i. Fly-height shot above the plain south of crater 1, facing -z (yaw 0)
   *  and pitched steeply down so the whole bowl reads as a depression. */
  aerial: { x: 30.5, y: 58, z: 82.5, yaw: 0, pitch: -0.9 },
  /** l. Anti-BH view: yaw −0.6524 + π ≈ 2.4892 faces directly away from
   *  BH_DIR, pitch 0.25 lifts the eye so starfield + nebulae fill the frame
   *  over a thin terrain horizon — pins sky rendering with no Gargantua
   *  billboard in shot. */
  deepSpace: { x: 48.5, y: 32, z: 48.5, yaw: 2.4892, pitch: 0.25 },
} satisfies Record<string, Pose>;

/** Boot the game with the rAF clock disabled and the title overlay hidden. */
async function bootVisual(page: Page): Promise<void> {
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

/** Teleport to a pose and render exactly one deterministic frame. */
async function shoot(page: Page, pose: Pose): Promise<void> {
  await page.evaluate((p) => {
    const g = window.__game!;
    g.teleport!(p.x, p.y, p.z, p.yaw, p.pitch);
    g.renderOnce!();
  }, pose);
}

test.describe('game page (seed 0x7e, hooks-driven)', () => {
  test.beforeEach(async ({ page }) => {
    await bootVisual(page);
  });

  test('a. spawn vista — the new-player view', async ({ page }) => {
    await shoot(page, POSES.spawnVista);
    await expect(page).toHaveScreenshot('spawn-vista.png');
  });

  test('b. Gargantua framing over the horizon', async ({ page }) => {
    await shoot(page, POSES.gargantua);
    await expect(page).toHaveScreenshot('gargantua-framing.png');
  });

  test('c. crater rim — low-angle terrain AO detail', async ({ page }) => {
    await shoot(page, POSES.craterRim);
    await expect(page).toHaveScreenshot('crater-rim-ao.png');
  });

  test('d. crystal cluster with emissive glow', async ({ page }) => {
    await shoot(page, POSES.crystal);
    await expect(page).toHaveScreenshot('crystal-cluster.png');
  });

  test('e/f. HUD composite — slot 1 active, then slot 4', async ({ page }) => {
    await shoot(page, POSES.hud);
    await expect(page).toHaveScreenshot('hud-slot1.png');
    await page.evaluate(() => {
      window.__game!.setInput!({ slot: 3 }); // hotbar slot 4 = starter-kit Hull
      window.__game!.renderOnce!();
    });
    await expect(page).toHaveScreenshot('hud-slot4.png');
  });

  test('g. after-mine — surface block hold-mined away and remeshed', async ({ page }) => {
    await page.evaluate((p) => {
      const g = window.__game!;
      g.teleport!(p.x, p.y, p.z, p.yaw, p.pitch);
      // Fly-hover so 36 held steps don't drift the camera; empty slot 5 = hand.
      g.setInput!({ toggleFly: true, slot: 4 });
      g.stepFrames!(1);
      g.setInput!({ mine: true }); // GAME_DESIGN §4: regolith 0.6 s ÷ hand ×1 = 36 steps
      g.stepFrames!(36); // completes on step 36; remesh on render
      g.setInput!({ mine: false });
      g.renderOnce!();
    }, POSES.mine);
    await expect(page).toHaveScreenshot('after-mine.png');
  });

  test('h. after-place — starter-kit hull placed on the targeted face', async ({ page }) => {
    await page.evaluate((p) => {
      const g = window.__game!;
      g.teleport!(p.x, p.y, p.z, p.yaw, p.pitch);
      g.setInput!({ slot: 3, place: true }); // slot 4 = Hull ×4 (block id 9), consumes 1
      g.stepFrames!(2);
      g.renderOnce!();
    }, POSES.place);
    await expect(page).toHaveScreenshot('after-place.png');
  });

  test('i. aerial view down into the craters', async ({ page }) => {
    await shoot(page, POSES.aerial);
    await expect(page).toHaveScreenshot('aerial-craters.png');
  });

  test('l. deep-space horizon — sky/nebulae away from Gargantua', async ({ page }) => {
    await shoot(page, POSES.deepSpace);
    await expect(page).toHaveScreenshot('deep-space-horizon.png');
  });
});

test.describe('static demo pages (render once, READY-gated)', () => {
  test('j. demo/blackhole.html — trailer-pipeline reference look', async ({ page }) => {
    await page.goto('/demo/blackhole.html');
    await page.waitForFunction(() => window.READY === true, undefined, { timeout: 10_000 });
    await expect(page).toHaveScreenshot('demo-blackhole.png');
  });

  test('k. demo/mesher.html — full-world mesh + AO', async ({ page }) => {
    await page.goto('/demo/mesher.html');
    await page.waitForFunction(() => window.READY === true, undefined, { timeout: 10_000 });
    await expect(page).toHaveScreenshot('demo-mesher.png');
  });
});
