/**
 * Wrecked Drone — pure-state behavior (GAME_DESIGN §3e / §8). Static until
 * repaired (2 copper + 1 crystal via [E]); once repaired it follows the player
 * as a mobile light. No render, no DOM, no three.js, no Math.random — the homing
 * is a deterministic exponential ease, so identical inputs ⇒ identical path. The
 * render layer (M4.3) reads `pos` as the light position and `repaired` to switch
 * the drone from wreck to companion.
 *
 * INVENTORY-DECOUPLED: repairDrone takes a minimal DroneInventory port (has/take)
 * rather than importing the concrete player Inventory, keeping core/entity free
 * of the items catalog. The game layer passes an adapter over its real inventory.
 * DRONE_COST names the ingredient item ids from the catalog (copper_ore=block:8,
 * crystal=block:4) per the §5 recipe "2 copper + 1 crystal".
 *
 * Repair is ATOMIC: all ingredients are checked present before any are taken, so
 * a short inventory is left completely untouched on failure.
 */

export type Vec3 = [number, number, number];

/** One ingredient line of the repair recipe. */
export interface DroneCostLine {
  itemId: string;
  count: number;
}

/**
 * Repair recipe (GAME_DESIGN §3e / §5): 2 copper + 1 crystal. Item ids match the
 * catalog: copper_ore = 'block:8', crystal = 'block:4'.
 */
export const DRONE_COST: readonly DroneCostLine[] = [
  { itemId: 'block:8', count: 2 },
  { itemId: 'block:4', count: 1 },
] as const;

/** Fraction of the remaining gap closed per second by the eased homing. */
export const DRONE_FOLLOW_RATE = 3.0;

/** Minimal inventory surface the drone repair needs. */
export interface DroneInventory {
  has(itemId: string, n: number): boolean;
  take(itemId: string, n: number): number;
}

export interface Drone {
  pos: Vec3;
  /** True once repaired; gates following + the mobile light. */
  repaired: boolean;
}

/** Create a wrecked (unrepaired) drone at `pos`. */
export function createDrone(pos: Vec3): Drone {
  return { pos: [pos[0], pos[1], pos[2]], repaired: false };
}

/**
 * Attempt to repair the drone, consuming DRONE_COST from `inv`. Returns true on
 * success (and sets `repaired`). If already repaired, returns true without
 * consuming anything. If any ingredient is short, consumes NOTHING and returns
 * false (atomic).
 */
export function repairDrone(drone: Drone, inv: DroneInventory): boolean {
  if (drone.repaired) return true;
  // Check-all first so a partial stock never gets consumed.
  for (const line of DRONE_COST) {
    if (!inv.has(line.itemId, line.count)) return false;
  }
  for (const line of DRONE_COST) {
    inv.take(line.itemId, line.count);
  }
  drone.repaired = true;
  return true;
}

/**
 * Advance the drone by `dt` seconds. Before repair it is inert (no movement).
 * After repair it eases toward `playerPos` with a frame-rate-independent
 * exponential smoothing: each axis closes a (1 - e^(-rate*dt)) fraction of its
 * gap, so it converges without overshoot and is deterministic for fixed dt.
 */
export function stepDrone(drone: Drone, playerPos: Vec3, dt: number): void {
  if (!drone.repaired) return;
  const alpha = 1 - Math.exp(-DRONE_FOLLOW_RATE * dt);
  drone.pos[0] += (playerPos[0] - drone.pos[0]) * alpha;
  drone.pos[1] += (playerPos[1] - drone.pos[1]) * alpha;
  drone.pos[2] += (playerPos[2] - drone.pos[2]) * alpha;
}
