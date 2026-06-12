/**
 * Boot — assemble the M0 game (prototype/index.html parity):
 * worldgen → spawn → scene → HUD → input → one expensive black-hole RT pass →
 * first render → test hooks → READY → rAF loop.
 */
import { createPlayer } from './core/player/movement';
import { generateWorld } from './core/world/worldgen';
import { Game } from './game/loop';
import { Hud, HOTBAR } from './game/hud';
import { InputController } from './game/input';
import { createGameScene } from './game/scene';
import { findSpawn } from './game/spawn';
import { installHooks } from './game/hooks';

/** World seed — 0x7e is the snapshot-pinned terrain (ROADMAP M0.2a contract). */
const WORLD_SEED = 0x7e;

const app = document.getElementById('app');
if (!app) throw new Error('missing #app mount point');

const world = generateWorld(WORLD_SEED);
const player = createPlayer(findSpawn(world)); // prototype: heightAt centre + 2
const scene = createGameScene(world, app);

const hud = new Hud(
  document.getElementById('hotbar') ?? document.createElement('div'),
  document.getElementById('info'),
);
const input = new InputController(
  player,
  (i) => hud.selectSlot(i),
  HOTBAR.length,
  () => hud.slotIndex,
);
input.attach({
  canvas: scene.renderer.domElement,
  overlay: document.getElementById('overlay'),
});

const game = new Game(world, player, scene, input, hud);

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
