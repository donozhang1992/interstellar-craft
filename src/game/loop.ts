/**
 * Main game loop — fixed-dt accumulator (TECH_SPEC §2: dt = 1/60 always) over
 * the prototype's per-frame work order:
 *
 *   rAF: acc += min(delta, 0.05)            (prototype's dt clamp)
 *        while (acc >= 1/60) stepSim(1/60)
 *        render once
 *
 * One simulation step (M1.4) = consume input → hold-to-mine step (raycast the
 * crosshair, advance the core mining state machine; on completion remove the
 * voxel + apply the §4 drop) → queued place clicks (consume 1 block item from
 * the active hotbar slot) → stepPlayer → HUD transient timers. Rendering a
 * frame = rebuild dirty chunks → sync camera → raycast highlight →
 * blackHole.update(camera) (cheap; the expensive renderRT ran once at boot) →
 * renderer.render → HUD refresh.
 *
 * PAUSE (M1.4 decision): while the inventory/crafting overlay is open,
 * `paused` is true — the rAF loop keeps RENDERING but advances no simulation
 * (its accumulator is drained so unpausing never bursts), and `stepFrames`
 * also refuses to step (uniform semantics: an E2E that opens the overlay can
 * assert the sim is frozen). `renderOnce` still works while paused.
 *
 * TECH_SPEC §3: when `window.__TEST__` is set the rAF loop advances NOTHING —
 * stepFrames(n) is the only clock (n fixed steps, then one render).
 */
import { PHYS, stepPlayer, type PlayerState } from '../core/player/movement';
import type { VoxelWorld } from '../core/world/voxelWorld';
import { activeItem, type Inventory } from '../core/player/inventory';
import { getItem } from '../core/items/catalog';
import { createMiningState, stepMining, applyMiningDrop } from '../core/mining/progress';
import type { MiningTier } from '../core/mining/model';
import { placeBlock, raycastFromPlayer } from './edits';
import type { GameScene } from './scene';
import type { InputController } from './input';
import type { Hud } from './hud';

export class Game {
  private accumulator = 0;
  private last = 0;
  /** True while the inventory/crafting overlay is open (sim frozen). */
  paused = false;
  private readonly mining = createMiningState();
  private miningProgress = 0;

  constructor(
    readonly world: VoxelWorld,
    readonly player: PlayerState,
    readonly inv: Inventory,
    readonly scene: GameScene,
    readonly input: InputController,
    readonly hud: Hud,
  ) {}

  /** Active hotbar item's tool tier; 'hand' when it is no tool (CP decision). */
  private activeToolTier(): MiningTier {
    const s = activeItem(this.inv);
    if (!s) return 'hand';
    const def = getItem(s.itemId);
    return def.kind === 'tool' && def.toolTier !== undefined ? def.toolTier : 'hand';
  }

  /** Advance the simulation one fixed step (edits first, then movement). */
  stepSim(dt: number): void {
    const step = this.input.consumeStep();

    // ── Hold-to-mine (GAME_DESIGN §4): re-raycast every held step; the core
    // state machine owns restart-on-target-change / release semantics. ──────
    let targetKey: string | null = null;
    let targetBlockId = 0;
    let hit = null;
    if (step.mineHeld) {
      hit = raycastFromPlayer(this.world, this.player);
      if (hit) {
        const { x, y, z } = hit.hit;
        targetKey = `${x},${y},${z}`;
        targetBlockId = this.world.getBlock(x, y, z);
      }
    }
    const mined = stepMining(this.mining, {
      targetKey,
      targetBlockId,
      toolTier: this.activeToolTier(),
      dt,
    });
    this.miningProgress = mined.progress;
    if (mined.completed && hit) {
      const { x, y, z } = hit.hit;
      this.world.setBlock(x, y, z, 0);
      this.scene.worldMeshes.markDirtyAt(x, y, z);
      // Full inventory: the block still breaks, the drop is LOST (CP decision).
      const drop = applyMiningDrop(this.inv, targetBlockId);
      if (drop.overflow > 0) this.hud.toast('INVENTORY FULL');
      else if (drop.dropped !== null) this.hud.pickup(drop.dropped);
    }
    if (mined.refused) this.hud.toast('TOOL TOO WEAK');

    // ── Place from inventory: active slot must hold a block item; success
    // consumes exactly 1 from THAT slot. Tools/empty/insufficient → no-op. ──
    for (let i = 0; i < step.placeClicks; i++) {
      const s = activeItem(this.inv);
      if (!s) continue;
      const def = getItem(s.itemId);
      if (def.kind !== 'block' || def.blockId === undefined) continue;
      const edited = placeBlock(this.world, this.player, def.blockId);
      if (edited) {
        s.count--;
        if (s.count === 0) this.inv.slots[this.inv.activeHotbarSlot] = null;
        this.scene.worldMeshes.markDirtyAt(edited.x, edited.y, edited.z);
      }
    }

    stepPlayer(this.player, this.world, step.move, dt);
    this.hud.stepTimers();
  }

  /** Render one frame from current state (also the __game.renderOnce hook). */
  renderFrame(): void {
    this.scene.worldMeshes.rebuildDirty();
    this.scene.syncCamera(this.player);
    this.scene.updateHighlight(raycastFromPlayer(this.world, this.player));
    this.scene.blackHole.update(this.scene.camera);
    this.scene.render();
    this.hud.setProgress(this.miningProgress);
    this.hud.refresh();
  }

  /**
   * Test hook: advance n fixed steps synchronously, then render once (§3).
   * Respects `paused` — with the overlay open the n steps are no-ops.
   */
  stepFrames(n: number): void {
    for (let i = 0; i < n; i++) if (!this.paused) this.stepSim(PHYS.FIXED_DT);
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
      if (this.paused) {
        this.accumulator = 0; // drained: unpausing must not burst-step
        this.renderFrame(); // keep rendering (overlay sits over a live frame)
        return;
      }
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
