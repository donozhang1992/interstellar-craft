/**
 * Main game loop — fixed-dt accumulator (TECH_SPEC §2: dt = 1/60 always) over
 * the prototype's per-frame work order:
 *
 *   rAF: acc += min(delta, 0.05)            (prototype's dt clamp)
 *        while (acc >= 1/60) stepSim(1/60)
 *        render once
 *
 * One simulation step = consume input → apply queued mine/place edits
 * (prototype runs these at mousedown time, i.e. before the next movePlayer) →
 * stepPlayer. Rendering a frame = rebuild dirty chunks (prototype loop start)
 * → sync camera → raycast highlight → blackHole.update(camera) (cheap; the
 * expensive renderRT ran once at boot) → renderer.render.
 *
 * TECH_SPEC §3: when `window.__TEST__` is set the rAF loop advances NOTHING —
 * stepFrames(n) is the only clock (n fixed steps, then one render).
 */
import { PHYS, stepPlayer, type PlayerState } from '../core/player/movement';
import type { VoxelWorld } from '../core/world/voxelWorld';
import { mineBlock, placeBlock, raycastFromPlayer } from './edits';
import type { GameScene } from './scene';
import type { InputController } from './input';
import type { Hud } from './hud';

export class Game {
  private accumulator = 0;
  private last = 0;

  constructor(
    readonly world: VoxelWorld,
    readonly player: PlayerState,
    readonly scene: GameScene,
    readonly input: InputController,
    readonly hud: Hud,
  ) {}

  /** Advance the simulation one fixed step (edits first, then movement). */
  stepSim(dt: number): void {
    const step = this.input.consumeStep();
    for (let i = 0; i < step.mineClicks; i++) {
      const edited = mineBlock(this.world, this.player);
      if (edited) this.scene.worldMeshes.markDirtyAt(edited.x, edited.y, edited.z);
    }
    for (let i = 0; i < step.placeClicks; i++) {
      const edited = placeBlock(this.world, this.player, this.hud.selectedBlock);
      if (edited) this.scene.worldMeshes.markDirtyAt(edited.x, edited.y, edited.z);
    }
    stepPlayer(this.player, this.world, step.move, dt);
  }

  /** Render one frame from current state (also the __game.renderOnce hook). */
  renderFrame(): void {
    this.scene.worldMeshes.rebuildDirty();
    this.scene.syncCamera(this.player);
    this.scene.updateHighlight(raycastFromPlayer(this.world, this.player));
    this.scene.blackHole.update(this.scene.camera);
    this.scene.render();
  }

  /** Test hook: advance n fixed steps synchronously, then render once (§3). */
  stepFrames(n: number): void {
    for (let i = 0; i < n; i++) this.stepSim(PHYS.FIXED_DT);
    this.renderFrame();
  }

  /** Start the rAF loop. */
  start(): void {
    this.last = performance.now();
    const frame = (now: number): void => {
      requestAnimationFrame(frame);
      const delta = Math.min((now - this.last) / 1000, 0.05); // prototype clamp
      this.last = now;
      if (window.__TEST__) return; // §3: stepFrames is the only clock in tests
      this.accumulator += delta;
      while (this.accumulator >= PHYS.FIXED_DT) {
        this.stepSim(PHYS.FIXED_DT);
        this.accumulator -= PHYS.FIXED_DT;
      }
      this.renderFrame();
    };
    requestAnimationFrame(frame);
  }
}
