/**
 * Boot — assemble the game (M1.4):
 * worldgen → spawn → inventory (+ sandbox starter kit) → scene → HUD → input →
 * crafting overlay → one expensive black-hole RT pass → first render → test
 * hooks → READY → rAF loop.
 */
import { createPlayer } from './core/player/movement';
import { generateWorld } from './core/world/worldgen';
import type { VoxelWorld } from './core/world/voxelWorld';
import { createInventory, give, HOTBAR_SLOTS } from './core/player/inventory';
import { Game } from './game/loop';
import { Hud } from './game/hud';
import { InputController } from './game/input';
import { InventoryCraftOverlay } from './game/overlayUI';
import { createGameScene } from './game/scene';
import { findSpawn } from './game/spawn';
import { installHooks } from './game/hooks';
import { DecodeOverlay } from './game/decodeUI';
import { BeaconBlueprint } from './game/beaconBlueprint';
import { createObserverJelly } from './render/observerJelly';
import { createCrystalBeetle } from './render/crystalBeetle';
import { createBeetle, stepBeetle } from './core/entity/beetle';
import { createWreckedDrone } from './render/wreckedDrone';
import { createEndingCinematic } from './render/ending';
import { AudioManager } from './game/audio';

/** World seed — 0x7e is the snapshot-pinned terrain (ROADMAP M0.2a contract). */
const WORLD_SEED = 0x7e;

/** O₂ low-warning threshold (matches the HUD's O2_LOW, GAME_DESIGN §10/§11). */
const O2_LOW_WARN = 25;

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

// Audio (M5.3, GAME_DESIGN §11) — procedurally synthesized SFX, no asset bytes.
// The AudioManager is a NO-OP under __TEST__ (never builds an AudioContext), so
// e2e/visual baselines stay deterministic + silent. It is muted/uninitialized
// until the first user gesture (autoplay policy) — see the gesture listener below.
// Discrete cues route through game.onCue (mine/place/chime); the ending cue fires
// off the ignite path; the O₂ heartbeat + ambient drone are driven per frame.
const audio = new AudioManager();
game.onCue = (name) => audio.play(name);

// Observer Jelly (GAME_DESIGN §8) — a diegetic floating guide. Added ONLY outside
// the visual-baseline harness (__TEST__): it is a moving emissive scene object, so
// adding it under __TEST__ would change the byte-identical world/sky baselines. In
// real play it bobs near spawn (ch1) and drifts up to the antenna-hill height once
// ch2 begins. Pure visual; driven off the loop's per-frame updater at fixed dt.
if (!window.__TEST__) {
  const jelly = createObserverJelly(player.pos.x + 3, player.pos.y + 2, player.pos.z - 3);
  scene.scene.add(jelly.group);

  // Crystal Beetles (GAME_DESIGN §3e/§8) — a few wander cave floors and flee the
  // player; cornered they shed 1 crystal shard. Added ONLY outside __TEST__ (like
  // the jelly) so the byte-identical world/sky baselines never see these moving
  // emissive objects. The pure core (entity/beetle.ts) owns the behavior; the
  // render shell reads beetle.pos. Driven once per fixed sim step via game.onStep
  // (deterministic), with the per-frame pulse on game.onRender.
  const beetleSpots = findCaveFloorSpots(world, 3);
  const beetles = beetleSpots.map((s, i) => {
    const core = createBeetle([s.x + 0.5, s.y, s.z + 0.5], 0x7e * 131 + i * 977);
    const view = createCrystalBeetle(core.pos[0], core.pos[1], core.pos[2]);
    scene.scene.add(view.group);
    return { core, view };
  });

  // Wrecked Drone (GAME_DESIGN §3e/§8) — the core state lives on the game (repair
  // + follow is hook-testable in loop.ts); here we only add the render view and
  // sync it from game.drone. Repaired via [R] (or [E] within reach) below. The
  // companion PointLight is added only here, outside __TEST__, so baselines stay
  // byte-identical and the r160 point-light budget (5–60) is untouched.
  const droneView = createWreckedDrone(game.drone.pos[0], game.drone.pos[1], game.drone.pos[2]);
  scene.scene.add(droneView.group);

  game.onStep = (dt) => {
    const p = player.pos;
    const ctx = {
      playerPos: [p.x, p.y, p.z] as [number, number, number],
      isSolid: (x: number, y: number, z: number): boolean => world.isSolid(x, y, z),
    };
    for (const b of beetles) {
      const { didShed } = stepBeetle(b.core, ctx, dt);
      if (didShed) {
        give(inv, 'block:4', 1); // crystal shard == crystal (integration contract)
        hud.pickup('block:4');
      }
    }
  };

  game.onRender = (dt) => {
    // M5.3 audio per-frame: ambient drone runs whenever audio is live; the O₂
    // low-warning heartbeat loops while O₂ < 25 and stops once it recovers. Both
    // are no-ops until the first gesture resumes the context (and under __TEST__,
    // where this onRender is never installed at all).
    if (audio.initialized) {
      audio.startDrone();
      if (game.survival.state.o2 < O2_LOW_WARN) audio.startHeartbeat();
      else audio.stopHeartbeat();
    }
    // ch1: hover near the pod; ch2+: lift toward a "raise the mast" beacon point.
    const ch2 = game.quest.state.chapter >= 2;
    jelly.setTarget(player.pos.x + 3, ch2 ? player.pos.y + 8 : player.pos.y + 2, player.pos.z - 3);
    jelly.update(dt);
    for (const b of beetles) {
      b.view.syncTo(b.core.pos[0], b.core.pos[1], b.core.pos[2]);
      b.view.setShed(b.core.shed);
      b.view.update(dt);
    }
    droneView.syncTo(game.drone.pos[0], game.drone.pos[1], game.drone.pos[2]);
    droneView.setRepaired(game.drone.repaired);
    droneView.update(dt);
  };
}

/**
 * Deterministically pick up to `n` cave-floor cells (air with a solid floor just
 * below, in the deep crystal band y<20, §9) for entity spawns. Scans the fixed
 * seed-0x7e world in a stable order so the spots are reproducible run to run.
 * Returns the FLOOR-standing air cell (the entity sits on the solid below it).
 */
function findCaveFloorSpots(w: VoxelWorld, n: number): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let y = 6; y < 20 && out.length < n; y++) {
    for (let x = 2; x < w.sizeX - 2 && out.length < n; x += 7) {
      for (let z = 2; z < w.sizeZ - 2 && out.length < n; z += 7) {
        // Air cell with headroom and a solid floor below = a stand-able spot.
        if (w.getBlock(x, y, z) === 0 && w.getBlock(x, y + 1, z) === 0 && w.isSolid(x, y - 1, z)) {
          out.push({ x, y, z });
        }
      }
    }
  }
  return out;
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

// Beacon blueprint panel (M4.3b ch4) — a passive build hint that auto-shows during
// ch4 and toggles with [B]. Wired here so the [B] key handler below can reach it,
// and refreshed each rendered frame (game.onBlueprint) to track the quest chapter.
const beaconBlueprintRoot = document.getElementById('beacon-blueprint');
const beaconBlueprint = beaconBlueprintRoot
  ? new BeaconBlueprint(game.quest, beaconBlueprintRoot)
  : null;
if (beaconBlueprint) game.onBlueprint = () => beaconBlueprint.refresh();

// Ending cinematic (M4.3b §3f) — a short, skippable, deterministic in-engine beat
// (the alien on the green world receiving the signal). Installed only outside
// __TEST__ (it owns its own offscreen scene/overlay); under __TEST__ the e2e drives
// it through the hooks installed below. Fired off the beacon ignition.
const endingRoot = document.getElementById('ending');
const ending = endingRoot ? createEndingCinematic(scene.renderer, endingRoot) : null;
if (ending) {
  game.onIgnite = () => ending.play();
}

// M2.3 consumable use keys (documented in survival.ts): C = O₂ canister (+40),
// G = flare (place a 60 s emissive lamp marker at the feet). M3.3 quest keys:
// E = salvage the crash pod (ch1) / repair the wrecked drone in reach (M4.3a) /
// charge+ignite the beacon (ch5) / open decode at the antenna (ch2); R = repair
// the wrecked drone (M4.3a §3e); P = open the decode panel directly; B = toggle
// the beacon blueprint (ch4). Suppressed while an overlay is open. Edge-triggered.
addEventListener('keydown', (e) => {
  // The ending cinematic swallows any key as a SKIP while it is playing.
  if (ending?.isPlaying) {
    ending.skip();
    return;
  }
  if (input.uiOpen || e.repeat) return;
  if (e.code === 'KeyC') {
    game.survival.useCanister();
  } else if (e.code === 'KeyG') {
    const placed = game.survival.useFlare();
    if (placed) scene.worldMeshes.markDirtyAt(placed.x, placed.y, placed.z);
  } else if (e.code === 'KeyR') {
    // Repair the wrecked drone when in reach (2 copper + 1 crystal).
    if (game.repairWreckedDrone()) hud.toast('DRONE ONLINE');
  } else if (e.code === 'KeyE') {
    // ch1: salvage the pod within reach; else repair the drone in reach; else
    // (ch5) charge/ignite the beacon in reach; else (ch2+) open decode.
    const salvaged = game.salvagePod();
    if (salvaged) return;
    if (game.repairWreckedDrone()) {
      hud.toast('DRONE ONLINE');
      return;
    }
    // ch5 First Contact: ignite once charged, else insert crystal (GAME_DESIGN §3d).
    if (game.igniteBeacon()) {
      hud.toast('IGNITION');
      return;
    }
    if (game.chargeBeacon()) {
      hud.toast(`BEACON ${game.beaconCharge()}/8`);
      return;
    }
    if (game.quest.state.flags.antennaBuilt) decodeOverlay?.open();
  } else if (e.code === 'KeyB') {
    // ch4: toggle the beacon blueprint panel (passive build hint).
    beaconBlueprint?.toggle();
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
  const hooks = installHooks(game);
  // M4.3b ending-cinematic hooks (installed here so the e2e can trigger/inspect/
  // skip the ending deterministically). The controller renders a single stepped
  // representative frame under __TEST__ (createEndingCinematic), so the ending
  // baseline is reproducible. With no #ending DOM these stay no-ops.
  hooks.playEnding = () => ending?.play();
  hooks.skipEnding = () => ending?.skip();
  hooks.ending = () => (ending ? { active: ending.isPlaying, done: ending.isDone } : null);
  hooks.READY = true;
}
window.READY = true;

game.start();
