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
import type { SurvivalDrillTier } from '../core/player/stats';
import { give } from '../core/player/inventory';
import { validateAntenna } from '../core/quest/antenna';
import { Survival } from './survival';
import { placeBlock, raycastFromPlayer } from './edits';
import {
  QuestBridge,
  COUNTER_MOVE,
  COUNTER_MINED_REGOLITH,
  COUNTER_PLACED,
  FLAG_SALVAGED,
  FLAG_ANTENNA_BUILT,
} from './quest';
import type { GameScene } from './scene';
import type { InputController } from './input';
import type { Hud } from './hud';

/** Regolith block id (GAME_DESIGN §4) — mining one to completion feeds ch1. */
const REGOLITH_ID = 1;

/** Max distance (blocks) from the crash pod for the [E] salvage interaction. */
export const POD_SALVAGE_REACH = 5;

export class Game {
  private accumulator = 0;
  private last = 0;
  /** True while the inventory/crafting overlay is open (sim frozen). */
  paused = false;
  private readonly mining = createMiningState();
  private miningProgress = 0;

  readonly survival: Survival;
  readonly quest: QuestBridge;
  /** Crash-pod marker cell (= spawn column feet); the [E] salvage anchor. */
  readonly podPos: { x: number; y: number; z: number };
  /** Optional per-rendered-frame visual updater (Observer Jelly bob/homing). */
  onRender: ((dtSeconds: number) => void) | null = null;

  constructor(
    readonly world: VoxelWorld,
    readonly player: PlayerState,
    readonly inv: Inventory,
    readonly scene: GameScene,
    readonly input: InputController,
    readonly hud: Hud,
  ) {
    this.survival = new Survival(player, inv, world);
    this.podPos = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
    this.quest = new QuestBridge(inv, {
      grant: (itemId, count) => {
        give(this.inv, itemId as never, count);
      },
      onUnlock: (id) => {
        this.hud.toast(id === 'workbench' ? 'WORKBENCH UNLOCKED' : 'SCANNER UNLOCKED');
      },
      onTransition: (objective) => {
        this.hud.setObjective(objective);
        this.hud.showSubtitle(objective);
      },
    });
    this.hud.setObjective(this.quest.objective());
  }

  /**
   * [E] interaction: salvage the crash pod when the player is within reach of the
   * pod marker. Raises the ch1 `salvaged` flag (advance fires the workbench unlock
   * + grant on the next step). Idempotent. Returns whether it fired this call.
   */
  salvagePod(): boolean {
    const dx = this.player.pos.x - this.podPos.x;
    const dy = this.player.pos.y - this.podPos.y;
    const dz = this.player.pos.z - this.podPos.z;
    if (dx * dx + dy * dy + dz * dz > POD_SALVAGE_REACH * POD_SALVAGE_REACH) return false;
    if (this.quest.state.flags[FLAG_SALVAGED]) return false;
    this.quest.raiseFlag(FLAG_SALVAGED);
    return true;
  }

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

    // Energy gate (M2.1 contract, game layer): with energy exhausted the drill
    // falls back to hand-tier mining. Read the survival state from the PREVIOUS
    // step (stepSurvival runs after movement below), so the gate reacts one step
    // after energy hits 0 — fine at 60 Hz, and keeps a single read point.
    const equippedTier = this.activeToolTier();
    const energyEmpty = this.survival.energyEmpty();
    const effectiveTier: MiningTier = energyEmpty ? 'hand' : equippedTier;

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
      toolTier: effectiveTier,
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
      // ch1 `mine` beat: a regolith(1) block mined to completion (GAME_DESIGN §3b).
      if (targetBlockId === REGOLITH_ID) this.quest.addCounter(COUNTER_MINED_REGOLITH);
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
        // ch1 `place` beat (any block, GAME_DESIGN §3b).
        this.quest.addCounter(COUNTER_PLACED);
        // ch2 `antenna` beat: re-check the structural validator after every
        // placement; once a valid 3-stack-on-4-mast exists, raise the flag.
        if (!this.quest.state.flags[FLAG_ANTENNA_BUILT] && validateAntenna(this.world)) {
          this.quest.raiseFlag(FLAG_ANTENNA_BUILT);
        }
      }
    }

    stepPlayer(this.player, this.world, step.move, dt);

    // ── Survival (M2.3): one stepSurvival after movement so fall damage reads
    // the post-resolve onGround/pos. `mining` for energy drain = a held mine
    // that actually advanced this step (mined.progress moves only when not
    // refused / on a real target). Jump-pack thrust is not wired (no jump_pack
    // placement/own path yet — see survival.ts) so jumpPackWanted is false. ──
    const miningThisStep = step.mineHeld && hit !== null && !mined.refused;
    const cleared = this.survival.step(
      {
        mining: miningThisStep,
        drillTier: equippedTier as SurvivalDrillTier,
        jumpPackWanted: false,
      },
      dt,
    );
    for (const c of cleared) this.scene.worldMeshes.markDirtyAt(c.x, c.y, c.z);

    // ── Quest (M3.3): ch1 `move` beat — count a tick for every stepped frame
    // a directional key is held (GAME_DESIGN §3b "held movement"). Then advance
    // the engine once over the mirrored flags/counters + live inventory. ──────
    const { forward, back, left, right } = step.move;
    if (forward || back || left || right) this.quest.addCounter(COUNTER_MOVE);
    this.quest.step();

    this.hud.stepTimers();
  }

  /** Render one frame from current state (also the __game.renderOnce hook). */
  renderFrame(): void {
    this.scene.worldMeshes.rebuildDirty();
    this.scene.syncCamera(this.player);
    this.scene.updateHighlight(raycastFromPlayer(this.world, this.player));
    // Scanner ore highlight (ch2 unlock): enable + refresh near the player once
    // the quest grants it. Disabled (invisible) until then — no render change.
    if (this.quest.scannerUnlocked) {
      this.scene.scannerHighlight.setEnabled(true);
      const p = this.player.pos;
      this.scene.scannerHighlight.refresh(this.world, p.x, p.y, p.z);
    }
    this.scene.blackHole.update(this.scene.camera);
    // Visual-only per-frame updater (Observer Jelly). Fixed dt so it stays
    // deterministic under stepFrames (one render = one fixed tick of drift).
    this.onRender?.(PHYS.FIXED_DT);
    this.scene.render();
    this.hud.setProgress(this.miningProgress);
    this.hud.setSurvival(this.survival.state);
    this.hud.setObjective(this.quest.objective()); // §10 top-right, live each frame
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
