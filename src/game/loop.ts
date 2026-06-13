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
import { activeItem, has, type Inventory } from '../core/player/inventory';
import { getItem } from '../core/items/catalog';
import { createMiningState, stepMining, applyMiningDrop } from '../core/mining/progress';
import type { MiningTier } from '../core/mining/model';
import type { SurvivalDrillTier } from '../core/player/stats';
import { give } from '../core/player/inventory';
import { validateAntenna } from '../core/quest/antenna';
import { Survival } from './survival';
import {
  createDrone,
  repairDrone,
  stepDrone,
  type Drone,
  type DroneInventory,
} from '../core/entity/drone';
import { take, count as invCount } from '../core/player/inventory';
import { placeBlock, raycastFromPlayer } from './edits';
import {
  QuestBridge,
  COUNTER_MOVE,
  COUNTER_MINED_REGOLITH,
  COUNTER_PLACED,
  COUNTER_CAVE_DEPTH,
  COUNTER_COLLECTED_CRYSTAL,
  FLAG_SALVAGED,
  FLAG_ANTENNA_BUILT,
} from './quest';
import type { GameScene } from './scene';
import type { InputController } from './input';
import type { Hud } from './hud';

/** Regolith block id (GAME_DESIGN §4) — mining one to completion feeds ch1. */
const REGOLITH_ID = 1;
/** Crystal block id (GAME_DESIGN §4) — mining one to inventory feeds ch3 harvest. */
const CRYSTAL_ID = 4;
/** ch3 `descend` depth gate (§3d): feet y strictly below this = "deep". */
const CAVE_DEPTH_Y = 20;

/** Max distance (blocks) from the crash pod for the [E] salvage interaction. */
export const POD_SALVAGE_REACH = 5;

/** Jump Pack item id (GAME_DESIGN §5 equipment) — owning it enables the hover. */
const JUMP_PACK_ID = 'jump_pack';

/** Max distance (blocks) from the wrecked drone for the [R]/[E] repair interaction. */
export const DRONE_REPAIR_REACH = 4;
/**
 * Max continuous hover time per airborne stint (GAME_DESIGN §7: "hold-jump hover
 * ≤ 2 s"). The budget refills only on landing — you cannot chain two full hovers
 * without touching ground.
 */
export const JUMP_PACK_HOVER_SECONDS = 2;

export class Game {
  private accumulator = 0;
  private last = 0;
  /** True while the inventory/crafting overlay is open (sim frozen). */
  paused = false;
  private readonly mining = createMiningState();
  private miningProgress = 0;
  /** ch3 `descend` latch: raised once feet y first drops below CAVE_DEPTH_Y. */
  private caveDepthReached = false;
  /** Jump-pack hover seconds consumed in the CURRENT airborne stint (refills on land). */
  private hoverUsed = 0;

  readonly survival: Survival;
  readonly quest: QuestBridge;
  /** Crash-pod marker cell (= spawn column feet); the [E] salvage anchor. */
  readonly podPos: { x: number; y: number; z: number };
  /**
   * Wrecked Drone (GAME_DESIGN §3e/§8) — core state lives in the game layer (so
   * repair/follow is hook-testable); the render view (main.ts, outside __TEST__)
   * reads `drone.pos` / `drone.repaired`. Spawned a few blocks from the pod; once
   * repaired (2 copper + 1 crystal) it eases after the player as a mobile light.
   */
  readonly drone: Drone;
  /** Optional per-rendered-frame visual updater (Observer Jelly bob/homing). */
  onRender: ((dtSeconds: number) => void) | null = null;
  /**
   * Optional per-fixed-sim-step updater (M4.3a entities — beetle/drone behavior).
   * Runs once per stepSim at the fixed dt, so entity motion stays deterministic
   * under stepFrames. Installed only outside __TEST__ (see main.ts) to keep the
   * visual baselines byte-identical.
   */
  onStep: ((dtSeconds: number) => void) | null = null;

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
    // Wrecked drone husk a few blocks from the pod (within easy [R]/[E] reach).
    this.drone = createDrone([player.pos.x + 2, player.pos.y, player.pos.z]);
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

  /** Minimal has/take adapter over the player inventory for repairDrone (atomic). */
  private droneInv(): DroneInventory {
    return {
      has: (itemId, n) => invCount(this.inv, itemId as never) >= n,
      take: (itemId, n) => take(this.inv, itemId as never, n),
    };
  }

  /**
   * [R]/[E] interaction (GAME_DESIGN §3e/§8): repair the wrecked drone when the
   * player is within DRONE_REPAIR_REACH of it. Delegates to the pure-core
   * repairDrone (atomic: 2 copper + 1 crystal checked-then-consumed, idempotent
   * once repaired). Returns true only on the call that actually repairs it (so the
   * caller can toast / play a cue); out-of-reach or short-stock returns false and
   * consumes nothing.
   */
  repairWreckedDrone(): boolean {
    if (this.drone.repaired) return false;
    const dx = this.player.pos.x - this.drone.pos[0];
    const dy = this.player.pos.y - this.drone.pos[1];
    const dz = this.player.pos.z - this.drone.pos[2];
    if (dx * dx + dy * dy + dz * dz > DRONE_REPAIR_REACH * DRONE_REPAIR_REACH) return false;
    return repairDrone(this.drone, this.droneInv());
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
      // ch3 `harvest` beat: a crystal(4) mined INTO the inventory (GAME_DESIGN §3d).
      // Only count the drop that actually landed (overflow ⇒ lost ⇒ no credit).
      if (targetBlockId === CRYSTAL_ID && drop.overflow === 0 && drop.dropped !== null) {
        this.quest.addCounter(COUNTER_COLLECTED_CRYSTAL);
      }
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

    // ── Jump pack (GAME_DESIGN §7 / §12, M4.3a). The player HOVERS when they
    // OWN a jump_pack, HOLD Space, are AIRBORNE (not a grounded jump), have
    // energy (> 0), and still have hover budget (≤ JUMP_PACK_HOVER_SECONDS this
    // airborne stint). Hover = hold altitude (counter gravity): we capture the
    // pre-move feet-y and, after the core resolves the step, pin y back + zero
    // the vertical velocity so the player neither rises nor falls. The energy
    // drain is the survival layer's job (jumpPackWanted ⇒ ENERGY_JUMPPACK/s with
    // its own energy>0 veto, §12), so this is purely the physics half. ──────────
    const ownsJumpPack = has(this.inv, JUMP_PACK_ID);
    const wantsHover = ownsJumpPack && !!step.move.jump && !this.player.onGround;
    const hoverActive =
      wantsHover && !this.survival.energyEmpty() && this.hoverUsed < JUMP_PACK_HOVER_SECONDS;
    const yBeforeMove = this.player.pos.y;

    stepPlayer(this.player, this.world, step.move, dt);

    if (hoverActive && !this.player.onGround) {
      // Hold altitude: undo the gravity descent this step (collision-safe — the
      // pre-move y was a valid standing/airborne cell), and kill vertical drift.
      this.player.pos.y = yBeforeMove;
      this.player.vel.y = 0;
      this.hoverUsed += dt;
    }
    // Refill the hover budget the moment the player is back on the ground.
    if (this.player.onGround) this.hoverUsed = 0;

    // ── ch3 `descend` beat (GAME_DESIGN §3d): the first fixed step the resolved
    // feet-y drops below CAVE_DEPTH_Y, set caveDepthReached = 1 (a latch — the
    // counter is one-shot, so re-surfacing/re-descending never bumps it again). ─
    if (!this.caveDepthReached && this.player.pos.y < CAVE_DEPTH_Y) {
      this.caveDepthReached = true;
      this.quest.addCounter(COUNTER_CAVE_DEPTH);
    }

    // ── Survival (M2.3): one stepSurvival after movement so fall damage reads
    // the post-resolve onGround/pos. `mining` for energy drain = a held mine
    // that actually advanced this step (mined.progress moves only when not
    // refused / on a real target). `jumpPackWanted` = hover physics fired this
    // step (M4.3a) → the survival layer drains ENERGY_JUMPPACK (§12), gated on
    // energy>0 internally, so the drain and the physics stay in lockstep. ──────
    const miningThisStep = step.mineHeld && hit !== null && !mined.refused;
    const cleared = this.survival.step(
      {
        mining: miningThisStep,
        drillTier: equippedTier as SurvivalDrillTier,
        jumpPackWanted: hoverActive,
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

    // ── Wrecked Drone follow (M4.3a): once repaired, ease after the player as a
    // mobile light. No-op while wrecked (stepDrone early-returns), so this is safe
    // every step and is part of the always-present sim (hook-testable). ──────────
    stepDrone(this.drone, [this.player.pos.x, this.player.pos.y, this.player.pos.z], dt);

    // ── Entities (M4.3a): drive beetle behavior + sync entity render views once
    // per fixed step at the fixed dt (deterministic under stepFrames). Installed
    // only outside __TEST__ (main.ts), so the visual-baseline harness never runs
    // it (the beetle render objects exist only there). ──────────────────────────
    this.onStep?.(dt);

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
