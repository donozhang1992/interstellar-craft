/**
 * Survival stats — GAME_DESIGN §6 (Player Attributes) + §12 (Survival constants
 * block, CANONICAL 2026-06-13).
 *
 * INTEGRATION CONTRACT (M2.3 glue): `SurvivalState` is DELIBERATELY separate
 * from movement.ts `PlayerState`. The game layer composes both side-by-side
 * (e.g. `{ player: PlayerState, survival: SurvivalState }`) and each frame:
 *   1. derives `StepParams` from the world/inventory/equipment (depthY = player
 *      feet y = player.pos.y; nearPod = |pos − spawn| ≤ O2_SAFE_RADIUS; mining /
 *      miningDrillTier from the active drill; jumpPackActive / solarInRange from
 *      equipment + nearby placed panels);
 *   2. calls `stepSurvival(survival, params, PHYS.FIXED_DT)` ONCE per fixed step
 *      (same dt = 1/60 as movement — deterministic, snapshot-friendly);
 *   3. on a landing event computes blocksFallen and calls `applyFallDamage`;
 *   4. checks `isDead` → orchestrates death (see death.ts).
 *
 * Style matches movement.ts / inventory.ts: plain pure functions that mutate the
 * passed-in state object. No clock, no randomness, no three.js/DOM — same calls
 * ⇒ identical state.
 */

/** GAME_DESIGN §12 survival constants (CANONICAL). */
export const SURVIVAL = {
  HP_MAX: 100,
  O2_MAX: 100,
  ENERGY_MAX: 100,
  /** O₂ drain on the surface, per second. */
  O2_SURFACE: 0.25,
  /** O₂ drain when deep (feet y < O2_DEEP_Y), per second. */
  O2_DEEP: 0.6,
  /** Depth threshold (strict): feet y < this ⇒ deep drain. §12 "y < 28". */
  O2_DEEP_Y: 28,
  /**
   * O₂ refill rate near the pod, per second. DECISION: §12 leaves the rate open
   * ("pod/base interior: full"). We use a fast finite refill (+20/s, ~5 s from
   * empty) rather than instant — it reads as recovery without a teleport-feel
   * pop, and stays deterministic/clampable. (§ALT instant was offered; rejected
   * so the HUD bar animates.)
   */
  O2_POD_REFILL: 20,
  /** HP drain per second while O₂ is exactly 0. */
  HP_O2ZERO: 4,
  /** HP regen per second while O₂ > HP_REGEN_O2 (strict). */
  HP_REGEN: 1,
  /** Regen only above this O₂ level (strict >). §6 "when O₂>50%". */
  HP_REGEN_O2: 50,
  /** Fall ≤ this many blocks is harmless. */
  FALL_SAFE: 3,
  /** Damage per block beyond FALL_SAFE. dmg = (blocks − FALL_SAFE) * this. */
  FALL_DMG_PER_BLOCK: 8,
  /** Energy drain per second while the jump pack is active. */
  ENERGY_JUMPPACK: 8,
  /** Energy drain per second while mining with a Mk2+ drill. */
  ENERGY_DRILL: 1.5,
  /** Energy recharge per second while a placed solar panel is in range. */
  SOLAR: 2,
} as const;

/** The three survival numbers. Composed alongside PlayerState by the game layer. */
export interface SurvivalState {
  /** 0..HP_MAX; 0 ⇒ dead. */
  hp: number;
  /** 0..O2_MAX. */
  o2: number;
  /** 0..ENERGY_MAX. */
  energy: number;
}

/** Drill tiers the energy rule cares about ('hand' = no tool). */
export type SurvivalDrillTier = 'hand' | 'mk1' | 'mk2' | 'plasma';

/**
 * Per-step environment supplied by the game layer (derived from world / player /
 * inventory / equipment). `stepSurvival` reads it; it never reaches into the
 * world itself (keeps core/player free of world coupling).
 */
export interface StepParams {
  /** Player feet y (= PlayerState.pos.y). Drives surface-vs-deep O₂. */
  depthY: number;
  /** Within O2_SAFE_RADIUS of the pod/spawn ⇒ O₂ refills. */
  nearPod: boolean;
  /** Actively mining this step (continuous hold-to-mine). */
  mining: boolean;
  /** Tier of the drill being used to mine (only mk2+ costs energy). */
  miningDrillTier: SurvivalDrillTier;
  /** Jump pack thrusting this step. */
  jumpPackActive: boolean;
  /** A placed solar panel is within range (tidally-locked flat 2/s, §12 ①). */
  solarInRange: boolean;
}

/** Fresh stats at the §12 maxes. */
export function createSurvivalState(): SurvivalState {
  return { hp: SURVIVAL.HP_MAX, o2: SURVIVAL.O2_MAX, energy: SURVIVAL.ENERGY_MAX };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Advance survival stats one fixed step (dt = 1/60). Mutates `s` only.
 * Order: O₂ first, then HP (HP reads the just-updated O₂), then energy.
 */
export function stepSurvival(s: SurvivalState, p: StepParams, dt: number): void {
  // ── O₂ ────────────────────────────────────────────────────────────────
  if (p.nearPod) {
    // Refill takes priority over any drain (pod interior is safe).
    s.o2 = clamp(s.o2 + SURVIVAL.O2_POD_REFILL * dt, 0, SURVIVAL.O2_MAX);
  } else {
    const rate = p.depthY < SURVIVAL.O2_DEEP_Y ? SURVIVAL.O2_DEEP : SURVIVAL.O2_SURFACE;
    s.o2 = clamp(s.o2 - rate * dt, 0, SURVIVAL.O2_MAX);
  }

  // ── HP (reads updated O₂) ───────────────────────────────────────────────
  if (s.o2 === 0) {
    s.hp = clamp(s.hp - SURVIVAL.HP_O2ZERO * dt, 0, SURVIVAL.HP_MAX);
  } else if (s.o2 > SURVIVAL.HP_REGEN_O2) {
    s.hp = clamp(s.hp + SURVIVAL.HP_REGEN * dt, 0, SURVIVAL.HP_MAX);
  }
  // O₂ in (0, 50]: neither drain nor regen.

  // ── Energy ─────────────────────────────────────────────────────────────
  let delta = 0;
  if (p.jumpPackActive) delta -= SURVIVAL.ENERGY_JUMPPACK;
  if (p.mining && (p.miningDrillTier === 'mk2' || p.miningDrillTier === 'plasma')) {
    delta -= SURVIVAL.ENERGY_DRILL;
  }
  if (p.solarInRange) delta += SURVIVAL.SOLAR;
  if (delta !== 0) s.energy = clamp(s.energy + delta * dt, 0, SURVIVAL.ENERGY_MAX);
}

/**
 * Apply fall damage for `blocksFallen` vertical blocks (the game layer computes
 * this from the landing event). Damage = (blocksFallen − FALL_SAFE) * 8 when
 * over the safe threshold, else 0. Mutates hp (clamped ≥ 0). Returns the damage
 * dealt (the uncapped computed amount, so callers can log/score it).
 */
export function applyFallDamage(s: SurvivalState, blocksFallen: number): number {
  if (blocksFallen <= SURVIVAL.FALL_SAFE) return 0;
  const dmg = (blocksFallen - SURVIVAL.FALL_SAFE) * SURVIVAL.FALL_DMG_PER_BLOCK;
  s.hp = clamp(s.hp - dmg, 0, SURVIVAL.HP_MAX);
  return dmg;
}

/** GAME_DESIGN §6 "At zero: death" — HP ≤ 0. */
export function isDead(s: SurvivalState): boolean {
  return s.hp <= 0;
}
