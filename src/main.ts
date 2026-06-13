/**
 * Boot — assemble the game (M1.4):
 * worldgen → spawn → inventory (+ sandbox starter kit) → scene → HUD → input →
 * crafting overlay → one expensive black-hole RT pass → first render → test
 * hooks → READY → rAF loop.
 */
import { createPlayer } from './core/player/movement';
import { generateWorld } from './core/world/worldgen';
import { createInventory, give, HOTBAR_SLOTS } from './core/player/inventory';
import { Game } from './game/loop';
import { Hud } from './game/hud';
import { InputController } from './game/input';
import { InventoryCraftOverlay } from './game/overlayUI';
import { createGameScene } from './game/scene';
import { findSpawn } from './game/spawn';
import { installHooks } from './game/hooks';
import { DecodeOverlay } from './game/decodeUI';
import { createObserverJelly } from './render/observerJelly';

/** World seed — 0x7e is the snapshot-pinned terrain (ROADMAP M0.2a contract). */
const WORLD_SEED = 0x7e;

const app = document.getElementById('app');
if (!app) throw new Error('missing #app mount point');

const world = generateWorld(WORLD_SEED);
const player = createPlayer(findSpawn(world)); // prototype: heightAt centre + 2

// TODO(M3): M1 SANDBOX STARTER KIT (control-plane decision) — until the quest
// engine grants gear, a new game starts with a drill and the ore/hull stock
// that worldgen only provides from M2 on. Hand-tier blocks are mined normally.
const inv = createInventory();
give(inv, 'drill_mk1', 1); // → hotbar slot 0
give(inv, 'block:7', 8); // iron ore → slot 1
give(inv, 'block:8', 8); // copper ore → slot 2
give(inv, 'block:9', 4); // hull → slot 3

// DEV-ONLY test aid — load `/?testcave` to carve a lit chamber directly under the
// spawn column so digging straight down (~10 blocks) reveals the cave + lamp glow.
// Gated by env.DEV AND the query flag, so the default seed-0x7e world (and every
// unit/e2e/visual baseline, none of which set the flag) is byte-for-byte unchanged.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('testcave')) {
  const CX = 48;
  const CZ = 48;
  for (let x = CX - 4; x <= CX + 4; x++)
    for (let z = CZ - 4; z <= CZ + 4; z++)
      for (let y = 15; y <= 20; y++) world.setBlock(x, y, z, 0); // 9×9×6 air room
  // Glowing floor tiles (lamp id 6) on a grid + crystal(4) pillars to mine-test.
  for (let dx = -3; dx <= 3; dx += 3)
    for (let dz = -3; dz <= 3; dz += 3) world.setBlock(CX + dx, 14, CZ + dz, 6);
  world.setBlock(CX - 2, 15, CZ - 2, 4); // crystal pillar
  world.setBlock(CX + 2, 15, CZ + 2, 4); // crystal pillar
  world.setBlock(CX - 2, 15, CZ + 2, 6); // lamp pillar
  world.setBlock(CX + 2, 15, CZ - 2, 6); // lamp pillar
}

const scene = createGameScene(world, app);

/** Resolve a `{row, fill}` stat bar from its DOM ids, or null if markup absent. */
function statBar(rowId: string, fillId: string): { row: HTMLElement; fill: HTMLElement } | null {
  const row = document.getElementById(rowId);
  const fill = document.getElementById(fillId);
  return row && fill ? { row, fill } : null;
}

const hud = new Hud(inv, {
  hotbar: document.getElementById('hotbar') ?? document.createElement('div'),
  info: document.getElementById('info'),
  itemName: document.getElementById('itemname'),
  toast: document.getElementById('toast'),
  progress: document.getElementById('mineprog'),
  progressFill: document.getElementById('mineprog-fill'),
  hpBar: statBar('stat-hp', 'stat-hp-fill'),
  o2Bar: statBar('stat-o2', 'stat-o2-fill'),
  energyBar: statBar('stat-energy', 'stat-energy-fill'),
  objective: document.getElementById('objective'),
  subtitle: document.getElementById('subtitle'),
});
const input = new InputController(
  player,
  (i) => hud.selectSlot(i),
  HOTBAR_SLOTS,
  () => inv.activeHotbarSlot,
);
input.attach({
  canvas: scene.renderer.domElement,
  overlay: document.getElementById('overlay'),
});

const game = new Game(world, player, inv, scene, input, hud);

// Observer Jelly (GAME_DESIGN §8) — a diegetic floating guide. Added ONLY outside
// the visual-baseline harness (__TEST__): it is a moving emissive scene object, so
// adding it under __TEST__ would change the byte-identical world/sky baselines. In
// real play it bobs near spawn (ch1) and drifts up to the antenna-hill height once
// ch2 begins. Pure visual; driven off the loop's per-frame updater at fixed dt.
if (!window.__TEST__) {
  const jelly = createObserverJelly(player.pos.x + 3, player.pos.y + 2, player.pos.z - 3);
  scene.scene.add(jelly.group);
  game.onRender = (dt) => {
    // ch1: hover near the pod; ch2+: lift toward a "raise the mast" beacon point.
    const ch2 = game.quest.state.chapter >= 2;
    jelly.setTarget(player.pos.x + 3, ch2 ? player.pos.y + 8 : player.pos.y + 2, player.pos.z - 3);
    jelly.update(dt);
  };
}

// Decode panel (M3.3 ch2 step2) — wired before the key handler so [P] / the
// antenna [E] can open it. Suppressed while any other overlay is open.
const decodeRoot = document.getElementById('decode');
const decodeOverlay =
  decodeRoot &&
  document.getElementById('decode-target') &&
  document.getElementById('decode-panel') &&
  document.getElementById('decode-progress') &&
  document.getElementById('decode-submit')
    ? new DecodeOverlay(game, input, {
        root: decodeRoot,
        target: document.getElementById('decode-target')!,
        panel: document.getElementById('decode-panel')!,
        progress: document.getElementById('decode-progress')!,
        submit: document.getElementById('decode-submit') as HTMLButtonElement,
      })
    : null;
decodeOverlay?.attach();

// M2.3 consumable use keys (documented in survival.ts): C = O₂ canister (+40),
// G = flare (place a 60 s emissive lamp marker at the feet). M3.3 quest keys:
// E = salvage the crash pod (ch1) / open decode at the antenna (ch2); P = open
// the decode panel directly. Suppressed while an overlay is open. Edge-triggered.
addEventListener('keydown', (e) => {
  if (input.uiOpen || e.repeat) return;
  if (e.code === 'KeyC') {
    game.survival.useCanister();
  } else if (e.code === 'KeyG') {
    const placed = game.survival.useFlare();
    if (placed) scene.worldMeshes.markDirtyAt(placed.x, placed.y, placed.z);
  } else if (e.code === 'KeyE') {
    // ch1: salvage the pod within reach; ch2+: if the antenna is up, open decode.
    const salvaged = game.salvagePod();
    if (!salvaged && game.quest.state.flags.antennaBuilt) decodeOverlay?.open();
  } else if (e.code === 'KeyP') {
    decodeOverlay?.open();
  }
});

const craftRoot = document.getElementById('invcraft');
const craftGrid = document.getElementById('invgrid');
const craftRecipes = document.getElementById('recipes');
if (craftRoot && craftGrid && craftRecipes) {
  new InventoryCraftOverlay(inv, game, input, {
    root: craftRoot,
    grid: craftGrid,
    recipes: craftRecipes,
  }).attach();
}

// Gargantua: orient billboard at the spawn camera and raymarch the offscreen RT
// ONCE (ROADMAP M0.3b contract — renderRT is expensive; the disk stays static
// in M0, only the cheap update(camera) runs per frame).
scene.syncCamera(player);
scene.blackHole.update(scene.camera);
scene.blackHole.renderRT();

game.renderFrame(); // first render — READY gates on this (TECH_SPEC §3)

if (import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === '1') {
  installHooks(game).READY = true;
}
window.READY = true;

game.start();
