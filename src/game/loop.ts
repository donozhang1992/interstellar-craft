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
import { validateBeacon } from '../core/quest/beacon';
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
  COUNTER_BEACON_CHARGE,
  FLAG_SALVAGED,
  FLAG_ANTENNA_BUILT,
  FLAG_BEACON_VALID,
  FLAG_IGNITED,
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

/** Max XZ distance (blocks) from the beacon column for the ch5 [E] charge/ignite. */
export const BEACON_INTERACT_REACH = 6;
/** Crystal block id (GAME_DESIGN §4) consumed per beacon-charge insert (ch5). */
const CRYSTAL_ITEM = 'block:4';
/** ch5 charge cap (GAME_DESIGN §3d): 8 crystal fully charges the beacon. */
export const BEACON_CHARGE_MAX = 8;

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
  /**
   * The (x,z) column of the valid beacon, recorded when ch4 `beaconValid` first
   * latches. The ch5 charge/ignite [E] interactions require the player to be
   * within BEACON_INTERACT_REACH of this column. Null until a beacon is built.
   */
  beaconPos: { x: number; z: number } | null = null;

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
  /**
   * True once ch5 free_mode unlocked: creative-style play (flight via the prototype
   * KeyF toggle — already ungated — plus the "all blocks" creative kit). Read by
   * the HUD / tests; flipped by enableFreeMode() off the free_mode unlock.
   */
  freeMode = false;
  /**
   * One-shot game-layer hook fired the instant the beacon ignites (ch5). main.ts
   * installs it (outside __TEST__) to play the ending cinematic; left null under
   * __TEST__ so the visual baselines never animate. Called exactly once.
   */
  onIgnite: (() => void) | null = null;
  /** Optional per-rendered-frame visual updater (Observer Jelly bob/homing). */
  onRender: ((dtSeconds: number) => void) | null = null;
  /**
   * Optional discrete sound-cue sink (M5.3). Fired at gameplay seams (mining
   * completion → 'mine', block place → 'place', quest unlock → 'chime'). main.ts
   * installs it (outside __TEST__) to drive the AudioManager; left null under
   * __TEST__ so the audio graph never spins up in headless. Pure event, no clock.
   */
  onCue: ((name: 'mine' | 'place' | 'chime') => void) | null = null;
  /**
   * Optional per-rendered-frame DOM hint refresher (M4.3b beacon blueprint panel).
   * Pure DOM, no clock — installed only outside __TEST__ (main.ts) so the visual
   * baselines, which never reach ch4, render byte-identically without it.
   */
  onBlueprint: (() => void) | null = null;
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
        const TOASTS: Record<string, string> = {
          workbench: 'WORKBENCH UNLOCKED',
          scanner: 'SCANNER UNLOCKED',
          fusion_igniter: 'FUSION IGNITER UNLOCKED',
          free_mode: 'FREE MODE UNLOCKED',
        };
        this.hud.toast(TOASTS[id] ?? `${id.toUpperCase()} UNLOCKED`);
        this.onCue?.('chime'); // M5.3 quest-complete / unlock chime
        // ch5 free_mode (M4.3b): formally bless free-mode flight (the prototype
        // fly toggle is already ungated, GAME_DESIGN §7 "Flight Core") and grant
        // a creative kit of every placeable block ("all blocks"). The ending
        // cinematic itself is played by the game layer (main.ts) off `ignited`.
        if (id === 'free_mode') this.enableFreeMode();
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

  /** True when the player is within XZ reach of the recorded beacon column. */
  private nearBeacon(): boolean {
    if (!this.beaconPos) return false;
    const dx = this.player.pos.x - (this.beaconPos.x + 0.5);
    const dz = this.player.pos.z - (this.beaconPos.z + 0.5);
    return dx * dx + dz * dz <= BEACON_INTERACT_REACH * BEACON_INTERACT_REACH;
  }

  /** Beacon charge so far (0..BEACON_CHARGE_MAX) — for the HUD / tests. */
  beaconCharge(): number {
    return this.quest.state.counters[COUNTER_BEACON_CHARGE] ?? 0;
  }

  /**
   * ch5 `charge` interaction ([E] at the beacon): if a valid beacon exists, the
   * player is in reach, the charge is below the cap, and the inventory holds at
   * least 1 crystal(4), consume exactly 1 crystal and bump `beaconCharge`.
   * Returns true only on the call that actually inserts (so the caller can cue).
   */
  chargeBeacon(): boolean {
    if (!this.quest.state.flags[FLAG_BEACON_VALID]) return false;
    if (!this.nearBeacon()) return false;
    if (this.beaconCharge() >= BEACON_CHARGE_MAX) return false;
    if (take(this.inv, CRYSTAL_ITEM as never, 1) !== 1) return false;
    this.quest.addCounter(COUNTER_BEACON_CHARGE);
    return true;
  }

  /**
   * ch5 `ignite` interaction ([E] once charged): if the beacon is fully charged
   * (>= BEACON_CHARGE_MAX) and the player is in reach, raise the `ignited` flag.
   * Idempotent. Returns true only on the call that actually ignites.
   */
  igniteBeacon(): boolean {
    if (this.quest.state.flags[FLAG_IGNITED]) return false;
    if (!this.quest.state.flags[FLAG_BEACON_VALID]) return false;
    if (!this.nearBeacon()) return false;
    if (this.beaconCharge() < BEACON_CHARGE_MAX) return false;
    this.quest.raiseFlag(FLAG_IGNITED);
    // Fire the ending-cinematic hook immediately (main.ts installs it outside
    // __TEST__). The free_mode unlock + enableFreeMode() follow on the next
    // quest step() (advance over the satisfied `ignite` predicate).
    this.onIgnite?.();
    return true;
  }

  /**
   * Free-mode enable (ch5 free_mode unlock, GAME_DESIGN §3f/§7). Idempotent:
   * flips `freeMode` and grants the creative "all blocks" kit (1× of every
   * placeable block id 1..13) once. Flight is the prototype KeyF toggle, already
   * ungated, so there is nothing to unblock there — free-mode just blesses it.
   */
  enableFreeMode(): void {
    if (this.freeMode) return;
    this.freeMode = true;
    for (let id = 1; id <= 13; id++) give(this.inv, `block:${id}` as never, 1);
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

    const equippedTier = this.activeToolTier();
    const energyEmpty = this.survival.energyEmpty();
    const effectiveTier: MiningTier = energyEmpty ? 'hand' : equippedTier;

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
      this.onCue?.('mine');
      this.world.setBlock(x, y, z, 0);
      this.scene.worldMeshes.markDirtyAt(x, y, z);
      const drop = applyMiningDrop(this.inv, targetBlockId);
      if (drop.overflow > 0) this.hud.toast('INVENTORY FULL');
      else if (drop.dropped !== null) this.hud.pickup(drop.dropped);
      if (targetBlockId === REGOLITH_ID) this.quest.addCounter(COUNTER_MINED_REGOLITH);
      if (targetBlockId === CRYSTAL_ID && drop.overflow === 0 && drop.dropped !== null) {
        this.quest.addCounter(COUNTER_COLLECTED_CRYSTAL);
      }
    }
    if (mined.refused) this.hud.toast('TOOL TOO WEAK');

    for (let i = 0; i < step.placeClicks; i++) {
      const s = activeItem(this.inv);
      if (!s) continue;
      const def = getItem(s.itemId);
      if (def.kind !== 'block' || def.blockId === undefined) continue;
      const edited = placeBlock(this.world, this.player, def.blockId);
      if (edited) {
        this.onCue?.('place');
        s.count--;
        if (s.count === 0) this.inv.slots[this.inv.activeHotbarSlot] = null;
        this.scene.worldMeshes.markDirtyAt(edited.x, edited.y, edited.z);
        this.quest.addCounter(COUNTER_PLACED);
        if (!this.quest.state.flags[FLAG_ANTENNA_BUILT] && validateAntenna(this.world)) {
          this.quest.raiseFlag(FLAG_ANTENNA_BUILT);
        }
        // ch4 `beacon` beat (M4.3b): re-check the beacon validator after every
        // placement; once a valid launchpad->6-core->antenna assembly exists,
        // raise the flag + record the beacon column for the ch5 [E] interaction.
        if (!this.quest.state.flags[FLAG_BEACON_VALID] && validateBeacon(this.world)) {
          this.quest.raiseFlag(FLAG_BEACON_VALID);
          this.beaconPos = { x: edited.x, z: edited.z };
        }
      }
    }

    const ownsJumpPack = has(this.inv, JUMP_PACK_ID);
    const wantsHover = ownsJumpPack && !!step.move.jump && !this.player.onGround;
    const hoverActive =
      wantsHover && !this.survival.energyEmpty() && this.hoverUsed < JUMP_PACK_HOVER_SECONDS;
    const yBeforeMove = this.player.pos.y;

    stepPlayer(this.player, this.world, step.move, dt);

    if (hoverActive && !this.player.onGround) {
      this.player.pos.y = yBeforeMove;
      this.player.vel.y = 0;
      this.hoverUsed += dt;
    }
    if (this.player.onGround) this.hoverUsed = 0;

    if (!this.caveDepthReached && this.player.pos.y < CAVE_DEPTH_Y) {
      this.caveDepthReached = true;
      this.quest.addCounter(COUNTER_CAVE_DEPTH);
    }

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

    const { forward, back, left, right } = step.move;
    if (forward || back || left || right) this.quest.addCounter(COUNTER_MOVE);
    this.quest.step();

    stepDrone(this.drone, [this.player.pos.x, this.player.pos.y, this.player.pos.z], dt);

    this.onStep?.(dt);

    this.hud.stepTimers();
  }

  /** Render one frame from current state (also the __game.renderOnce hook). */
  renderFrame(): void {
    this.scene.worldMeshes.rebuildDirty();
    this.scene.syncCamera(this.player);
    this.scene.updateHighlight(raycastFromPlayer(this.world, this.player));
    if (this.quest.scannerUnlocked) {
      this.scene.scannerHighlight.setEnabled(true);
      const p = this.player.pos;
      this.scene.scannerHighlight.refresh(this.world, p.x, p.y, p.z);
    }
    this.scene.blackHole.update(this.scene.camera);
    this.onRender?.(PHYS.FIXED_DT);
    this.scene.render();
    this.hud.setProgress(this.miningProgress);
    this.hud.setSurvival(this.survival.state);
    this.hud.setObjective(this.quest.objective());
    this.hud.refresh();
    // Beacon blueprint DOM hint (M4.3b ch4) — pure DOM, tracks the quest chapter.
    this.onBlueprint?.();
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
      const delta = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      if (window.__TEST__) return;
      if (this.paused) {
        this.accumulator = 0;
        this.renderFrame();
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
