/**
 * Survival glue (M2.3) — composes the M2.1 pure core (core/player/stats.ts +
 * death.ts) into the playable game. The core only tracks the three numbers and
 * the death-drop split; everything world/inventory/equipment-coupled lives here
 * (the stats.ts INTEGRATION CONTRACT mandates this split).
 *
 * Per fixed step the game loop calls `step(...)` with the live derivation
 * inputs (player feet y, near-pod flag, mining + drill tier, jump-pack/solar
 * flags); this module derives `StepParams`, advances the core once, handles the
 * onGround false→true landing edge (fall damage from the tracked fall-start
 * height), and on death orchestrates compute-drop → take → cache → respawn.
 *
 * DECISIONS (control plane to confirm — see report / OBSERVATIONS):
 *  - SOLAR source = OWN, not place: owning ≥1 solar_panel sets solarInRange
 *    (§12 simplification ① — tidally locked, the accretion disk is always up, so
 *    "placed nearby in daylight" collapses to "you have a panel deployed"). No
 *    world entity for the panel in M2.3; placing one is deferred. Documented so
 *    M2.4 can tighten to a placed-panel proximity check if desired.
 *  - ENERGY GATING (game layer per M2.1 contract — core only tracks the number):
 *    energy === 0 ⇒ the active drill falls back to 'hand' mining tier (mining
 *    slows / may refuse) AND the jump pack cannot thrust. stepSurvival itself
 *    never knows about the gate; the loop reads `energyEmpty()` to pick the
 *    effective tool tier and to veto jumpPackActive.
 *  - O2 CANISTER = a discrete USE action (hook `useCanister()` / key 'C'): take
 *    one o2_canister from inv → o2 += 40 (clamped). No passive consumption.
 *  - FLARE = a discrete USE action (hook `useFlare()` / key 'G'): take one flare
 *    from inv → place a lamp-like emissive marker at the player's feet voxel and
 *    start a 60 s (FLARE_SECONDS) countdown; on expiry the marker voxel is
 *    cleared. MINIMAL: no light propagation — the lamp block is already emissive
 *    (blockTextures lamp(6)); the flare just reuses it for 60 s.
 *  - FALL-START tracking: the apex is captured the step the player leaves the
 *    ground (onGround true→false) as `fallStartY = max seen while airborne`, and
 *    blocksFallen = floor(fallStartY − landingY) on the landing edge. Using the
 *    airborne max (not just the leave-ground y) means a jump's rise doesn't get
 *    subtracted — a jump up 1.4 then down to start is ~0 net fall, harmless.
 */
import { PHYS, type PlayerState } from '../core/player/movement';
import {
  applyFallDamage,
  createSurvivalState,
  isDead,
  stepSurvival,
  SURVIVAL,
  type StepParams,
  type SurvivalDrillTier,
  type SurvivalState,
} from '../core/player/stats';
import { computeDeathDrop, respawnState } from '../core/player/death';
import { give, take, type Inventory, has } from '../core/player/inventory';
import type { Vec3 } from '../core/physics/aabb';
import type { VoxelWorld } from '../core/world/voxelWorld';
import { BlockId } from '../core/world/blocks';

/** §12 O2_SAFE_RADIUS — within this of spawn (the crash pod) O₂ refills. */
export const O2_SAFE_RADIUS = 4;
/** §12 PICKUP_RADIUS — walk within this of a death cache to recover it. */
export const PICKUP_RADIUS = 3;
/** §12 O2_CANISTER — O₂ a single canister restores. */
export const O2_CANISTER = 40;
/** §12 FLARE_SECONDS — a placed flare emits light for this long. */
export const FLARE_SECONDS = 60;

/** One recoverable death cache at a fixed position (§12 simplification ④). */
export interface DeathCache {
  pos: Vec3;
  items: { itemId: string; count: number }[];
}

/** A live flare: an emissive lamp voxel that auto-clears after a countdown. */
interface ActiveFlare {
  x: number;
  y: number;
  z: number;
  /** Sim steps remaining (1/60 s each); starts at FLARE_SECONDS * 60. */
  stepsLeft: number;
}

/** Inputs the loop supplies each step (already world/raycast-resolved). */
export interface SurvivalStepInputs {
  /** True while the player is actively mining this step. */
  mining: boolean;
  /** Tier of the equipped drill being used to mine (pre-energy-gate). */
  drillTier: SurvivalDrillTier;
  /** Player wants jump-pack thrust this step (pre-energy-gate). */
  jumpPackWanted: boolean;
}

function distXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Survival runtime — owns the SurvivalState, the death-cache list, the flare
 * markers, and the airborne fall-start tracker. Composed alongside PlayerState
 * + Inventory by the Game (loop.ts).
 */
export class Survival {
  state: SurvivalState = createSurvivalState();
  /** Recoverable death caches (§12 ④: one per death, at the death position). */
  readonly caches: DeathCache[] = [];

  private readonly flares: ActiveFlare[] = [];
  private wasOnGround = true;
  /** Highest feet-y seen since leaving the ground; null while grounded. */
  private fallStartY: number | null = null;

  constructor(
    private readonly player: PlayerState,
    private readonly inv: Inventory,
    private readonly world: VoxelWorld,
  ) {}

  /** True when energy is exhausted — the loop gates drill tier + jump pack on this. */
  energyEmpty(): boolean {
    return this.state.energy <= 0;
  }

  /** Owning a solar panel deploys it (§12 ① / decision: own-vs-place = own). */
  private solarInRange(): boolean {
    return has(this.inv, 'solar_panel');
  }

  private nearPod(): boolean {
    return distXZ(this.player.pos, this.player.spawn) <= O2_SAFE_RADIUS;
  }

  /**
   * Advance survival one fixed step. Derives StepParams (applying the game-layer
   * energy gate), advances the core, processes the landing edge for fall damage,
   * decrements flare timers, then orchestrates death if HP hit 0.
   */
  step(inputs: SurvivalStepInputs, dt: number): { x: number; y: number; z: number }[] {
    const empty = this.energyEmpty();
    // Energy gate (game layer — core never sees it): no energy ⇒ hand tier,
    // no jump-pack thrust. A mk2+ drill at 0 energy therefore costs nothing
    // more (it is mining as 'hand') and the pack draws nothing.
    const effectiveTier: SurvivalDrillTier = empty ? 'hand' : inputs.drillTier;
    const jumpPackActive = inputs.jumpPackWanted && !empty;

    const params: StepParams = {
      depthY: this.player.pos.y,
      nearPod: this.nearPod(),
      mining: inputs.mining,
      miningDrillTier: effectiveTier,
      jumpPackActive,
      solarInRange: this.solarInRange(),
    };
    stepSurvival(this.state, params, dt);

    this.trackFall();
    const expired = this.tickFlares(); // voxels cleared this step ⇒ remesh
    this.collectCaches();

    if (isDead(this.state)) this.die();
    return expired;
  }

  /** Landing-edge fall damage (§12 ⑤: vertical blocks fallen, apex → landing). */
  private trackFall(): void {
    const onGround = this.player.onGround;
    if (!onGround) {
      // Airborne: track the apex so a jump's rise isn't counted as a fall.
      this.fallStartY =
        this.fallStartY === null ? this.player.pos.y : Math.max(this.fallStartY, this.player.pos.y);
    } else if (!this.wasOnGround) {
      // Landing edge (false→true): apply damage for the descent below the apex.
      if (this.fallStartY !== null) {
        const blocksFallen = this.fallStartY - this.player.pos.y;
        if (blocksFallen > 0) applyFallDamage(this.state, blocksFallen);
      }
      this.fallStartY = null;
    }
    this.wasOnGround = onGround;
    // If isDead fires from a fatal fall, die() resets fall tracking via respawn.
  }

  /**
   * Decrement every active flare; clear the marker voxel when it expires.
   * Returns the voxels cleared this step so the loop can mark them dirty.
   */
  private tickFlares(): { x: number; y: number; z: number }[] {
    const cleared: { x: number; y: number; z: number }[] = [];
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i]!;
      f.stepsLeft--;
      if (f.stepsLeft <= 0) {
        // Only clear if it's still our lamp (player may have built over it).
        if (this.world.getBlock(f.x, f.y, f.z) === BlockId.Lamp) {
          this.world.setBlock(f.x, f.y, f.z, 0);
          cleared.push({ x: f.x, y: f.y, z: f.z });
        }
        this.flares.splice(i, 1);
      }
    }
    return cleared;
  }

  /** §6/§12 death: drop 50% of each stack into a recoverable cache, respawn at pod. */
  private die(): void {
    const deathPos: Vec3 = { ...this.player.pos };
    const { drops } = computeDeathDrop(this.inv);
    for (const d of drops) take(this.inv, d.itemId, d.count);
    if (drops.length > 0) {
      this.caches.push({ pos: deathPos, items: drops.map((d) => ({ ...d })) });
    }
    // Respawn at the pod with full stats and zeroed velocity.
    this.state = respawnState();
    this.player.pos = { ...this.player.spawn };
    this.player.vel = { x: 0, y: 0, z: 0 };
    this.player.onGround = false;
    this.wasOnGround = false;
    this.fallStartY = null;
  }

  /**
   * Recover any death caches within PICKUP_RADIUS of the player (give items
   * back; overflow stays in the cache). Empty caches are removed. Called each
   * step by the loop. Returns the number of items actually recovered.
   */
  collectCaches(): number {
    let recovered = 0;
    for (let i = this.caches.length - 1; i >= 0; i--) {
      const c = this.caches[i]!;
      if (distXZ(this.player.pos, c.pos) > PICKUP_RADIUS) continue;
      for (const item of c.items) {
        if (item.count <= 0) continue;
        const overflow = give(this.inv, item.itemId as Parameters<typeof give>[1], item.count);
        recovered += item.count - overflow;
        item.count = overflow; // overflow stays in the cache
      }
      c.items = c.items.filter((it) => it.count > 0);
      if (c.items.length === 0) this.caches.splice(i, 1);
    }
    return recovered;
  }

  /** USE one O₂ canister: +O2_CANISTER (clamped), consume one from inv. No-op if none. */
  useCanister(): boolean {
    if (take(this.inv, 'o2_canister', 1) !== 1) return false;
    this.state.o2 = Math.min(SURVIVAL.O2_MAX, this.state.o2 + O2_CANISTER);
    return true;
  }

  /**
   * USE one flare: consume one from inv, place an emissive lamp marker at the
   * player's feet voxel, and start a FLARE_SECONDS countdown. Returns the placed
   * voxel so the loop can mark its chunk dirty, or null if the cell is already
   * solid or the player has no flare.
   */
  useFlare(): { x: number; y: number; z: number } | null {
    const x = Math.floor(this.player.pos.x);
    const y = Math.floor(this.player.pos.y);
    const z = Math.floor(this.player.pos.z);
    if (this.world.getBlock(x, y, z) !== 0) return null; // occupied — don't overwrite
    if (take(this.inv, 'flare', 1) !== 1) return null;
    this.world.setBlock(x, y, z, BlockId.Lamp);
    this.flares.push({ x, y, z, stepsLeft: Math.round(FLARE_SECONDS / PHYS.FIXED_DT) });
    return { x, y, z };
  }
}
