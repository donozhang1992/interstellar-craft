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
  /** o. (M2.4) Cave interior — deep inside the seed-0x7e worm-carver network
   *  at an open pocket (feet (87,7,63): floor basalt y=6, air y=7–9, ceiling
   *  y=10), eye-y 8.62 ≪ DIM_TOP 20 so scene.ts cave-dim has faded the fill
   *  lights to ~the 0.18 floor — the rock reads dark and the emissive
   *  lamp(6)/crystal(4) blocks the carver exposed pop out. yaw 1.178 faces the
   *  richest cluster (2 lamps / 8 crystals scanned in a forward cone), pitch
   *  −0.20 tips slightly down for stepped-wall AO. Pins the M2 cave-lighting
   *  look (ROADMAP M2 exit "cave visual baseline"; GAME_DESIGN §9 caves /
   *  §6 cave dim). */
  caveInterior: { x: 87.5, y: 7, z: 63.5, yaw: 1.178, pitch: -0.2 },
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

  /** o. (M2.4) Cave interior — the M2 cave-lighting look. shoot() teleports the
   *  camera into the deep worm-carver pocket and renderOnce() runs syncCamera,
   *  which applies scene.ts cave-dim (eye-y 8.62 ≪ DIM_TOP 20 ⇒ fill lights at
   *  the 0.18 floor). The frame is fully deterministic (seed 0x7e terrain + pure
   *  camera-y dim), so it baselines like every other visual shot. Pins ROADMAP
   *  M2 exit criterion "cave visual baseline": dark rock with emissive
   *  lamp(6)/crystal(4) blocks the carver exposed. */
  test('o. cave interior — deep worm-carver pocket, cave-dim + emissive blocks', async ({
    page,
  }) => {
    await shoot(page, POSES.caveInterior);
    await expect(page).toHaveScreenshot('cave-interior.png');
  });

  /** m. (M1.5) Crafting overlay — ROADMAP M1 exit criterion "HUD visual
   *  baselines" / TEST_STRATEGY §4 shot list "crafting UI". Tab toggles the
   *  overlay anywhere (overlayUI.ts attach()); opening pauses the sim, so the
   *  canvas keeps the deterministic HUD-pose frame under it. Starter-kit grid
   *  (drill/iron/copper/hull in the hotbar row) + all 17 §5 recipes with
   *  have/need coloring and CRAFT gating. */
  test('m. crafting overlay — starter-kit grid + recipe list (sim paused)', async ({ page }) => {
    await shoot(page, POSES.hud);
    await page.keyboard.press('Tab'); // real key event, DOM-only side effects
    await expect(page.locator('#invcraft')).toHaveClass(/open/);
    await expect(page.locator('#recipes .recipe')).toHaveCount(17); // rendered before shot
    await expect(page).toHaveScreenshot('crafting-overlay.png');
  });

  /** n. (M1.5) Mining progress mid-hold — ROADMAP M1 exit criterion "HUD
   *  visual baselines". Same pose/fly-hover recipe as shot g; GAME_DESIGN §4:
   *  regolith 0.6 s ÷ hand ×1 = 36 steps, so 18 held steps = exactly 50%
   *  progress (18 × (1/60) ÷ 0.6 = 0.5). stepFrames renders once at the end,
   *  so the shot pins the half-full #mineprog bar + the target highlight,
   *  with the block still intact. */
  test('n. mining progress — regolith hand-mine held 18/36 steps', async ({ page }) => {
    await page.evaluate((p) => {
      const g = window.__game!;
      g.teleport!(p.x, p.y, p.z, p.yaw, p.pitch);
      // Fly-hover so the held steps don't drift the camera; empty slot 5 = hand.
      g.setInput!({ toggleFly: true, slot: 4 });
      g.stepFrames!(1);
      g.setInput!({ mine: true });
      g.stepFrames!(18); // 50% of the 36-step hand time — bar mid-fill
    }, POSES.mine);
    await expect(page).toHaveScreenshot('mining-progress.png');
  });

  /** q. (M3.4) Objective HUD line — ROADMAP M3 exit criterion "objective HUD …
   *  baseline". The top-right #objective line (GAME_DESIGN §10) at a fixed pose
   *  in a known state. On a fresh boot the quest is ch1 step 1, so the line reads
   *  "Move with WASD" deterministically (no flags/counters touched). The HUD pose
   *  is sky-dominant so the objective text reads clearly against the starfield;
   *  the line is pure DOM (static until a stepped event advances it), so the shot
   *  baselines like every other HUD element. Pins the objective HUD rendering. */
  test('q. objective HUD — top-right objective line at the ch1 boot state', async ({ page }) => {
    await shoot(page, POSES.hud);
    // Boot state: no quest events fired, so the objective line is the ch1 opener.
    await expect(page.locator('#objective')).toHaveText('Move with WASD');
    await expect(page).toHaveScreenshot('objective-hud.png');
  });

  /** p. (M3.3) Decode panel overlay — ch2 step2 (GAME_DESIGN §3c). Fast-forward
   *  the quest to the decode step via hooks, open the panel with [P] (pauses the
   *  sim like the crafting overlay), and fill the cross glyph's centre column on
   *  the editable panel so the shot pins the target/panel grids, the n/3 progress
   *  line and SUBMIT. The frame under the overlay is the deterministic HUD pose;
   *  the panel is pure DOM so it baselines like the crafting overlay. */
  test('p. decode panel — target + editable glyph grids (sim paused)', async ({ page }) => {
    await shoot(page, POSES.hud);
    await page.evaluate(() => {
      const g = window.__game!;
      g.addCounter!('moveTicks', 30);
      g.addCounter!('mined:regolith', 10);
      g.addCounter!('placed', 5);
      g.setFlag!('salvaged');
      g.setFlag!('antennaBuilt');
      g.stepFrames!(1); // engine now on the decode step
    });
    await page.keyboard.press('KeyP');
    await expect(page.locator('#decode')).toHaveClass(/open/);
    // Fill the cross glyph's centre column (cells 1,4,7) on the editable panel.
    for (const c of [1, 4, 7]) await page.locator(`#decode-panel .cell[data-cell="${c}"]`).click();
    await expect(page).toHaveScreenshot('decode-panel.png');
  });

  /** r. (M4.3b) Ending cinematic — the sequel-hook framing (alien on the green
   *  world, amber eyes) ported from the trailer (§3f). Deterministic under
   *  __TEST__: createEndingCinematic.play() renders ONE representative still
   *  (t = T_REPRESENTATIVE, stepped — no wall-clock) into the shared renderer and
   *  opens the letterboxed #ending caption overlay; nothing renders the game scene
   *  after, so the canvas holds the alien frame. Pins the ending look + the
   *  sequel-hook caption band. */
  test('r. ending cinematic — alien-world sequel-hook still (amber eyes)', async ({ page }) => {
    await page.evaluate(() => {
      const g = window.__game!;
      // Fire the ending directly via the hook (no need to play through ch5 here —
      // the cinematic frame is independent of the quest state). play() renders the
      // representative still under __TEST__ and opens the caption overlay.
      g.playEnding!();
    });
    await expect(page.locator('#ending')).toHaveClass(/open/);
    await expect(page).toHaveScreenshot('ending-sequel-hook.png');
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
