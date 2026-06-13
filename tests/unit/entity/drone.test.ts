// Spec: GAME_DESIGN §3e / §8 — Wrecked Drone: static until repaired (2 copper +
// 1 crystal); then follows the player as a mobile light. Pure-state, no render,
// deterministic (eased homing). Repair consumes via a minimal inventory port.
import { describe, expect, it } from 'vitest';
import { createDrone, repairDrone, stepDrone, DRONE_COST } from '../../../src/core/entity/drone';
import type { DroneInventory } from '../../../src/core/entity/drone';

const DT = 1 / 60;

function dist3(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** A counting fake inventory implementing has/take over an item->count map. */
function fakeInv(
  stock: Record<string, number>,
): DroneInventory & { stock: Record<string, number> } {
  return {
    stock,
    has(itemId: string, n: number) {
      return (this.stock[itemId] ?? 0) >= n;
    },
    take(itemId: string, n: number) {
      const have = this.stock[itemId] ?? 0;
      const took = Math.min(have, n);
      this.stock[itemId] = have - took;
      return took;
    },
  };
}

describe('createDrone', () => {
  it('starts at position, not repaired', () => {
    const d = createDrone([4, 3, 4]);
    expect(d.pos).toEqual([4, 3, 4]);
    expect(d.repaired).toBe(false);
  });
});

describe('repairDrone (2 copper + 1 crystal)', () => {
  it('cost constant is 2 copper + 1 crystal', () => {
    expect(DRONE_COST).toEqual([
      { itemId: 'block:8', count: 2 },
      { itemId: 'block:4', count: 1 },
    ]);
  });

  it('succeeds and consumes exactly 2 copper + 1 crystal', () => {
    const inv = fakeInv({ 'block:8': 5, 'block:4': 3 });
    const d = createDrone([0, 0, 0]);
    expect(repairDrone(d, inv)).toBe(true);
    expect(d.repaired).toBe(true);
    expect(inv.stock['block:8']).toBe(3);
    expect(inv.stock['block:4']).toBe(2);
  });

  it('fails when short on copper and leaves the inventory untouched', () => {
    const inv = fakeInv({ 'block:8': 1, 'block:4': 3 });
    const d = createDrone([0, 0, 0]);
    expect(repairDrone(d, inv)).toBe(false);
    expect(d.repaired).toBe(false);
    expect(inv.stock['block:8']).toBe(1);
    expect(inv.stock['block:4']).toBe(3);
  });

  it('fails when short on crystal and leaves the inventory untouched', () => {
    const inv = fakeInv({ 'block:8': 5, 'block:4': 0 });
    const d = createDrone([0, 0, 0]);
    expect(repairDrone(d, inv)).toBe(false);
    expect(d.repaired).toBe(false);
    expect(inv.stock['block:8']).toBe(5);
    expect(inv.stock['block:4']).toBe(0);
  });

  it('a second repair is a no-op success (already repaired, no further consumption)', () => {
    const inv = fakeInv({ 'block:8': 5, 'block:4': 3 });
    const d = createDrone([0, 0, 0]);
    repairDrone(d, inv);
    expect(repairDrone(d, inv)).toBe(true);
    // Only the first repair consumed resources.
    expect(inv.stock['block:8']).toBe(3);
    expect(inv.stock['block:4']).toBe(2);
  });
});

describe('stepDrone homing', () => {
  it('does not move until repaired', () => {
    const d = createDrone([0, 3, 0]);
    for (let i = 0; i < 60; i++) stepDrone(d, [10, 3, 10], DT);
    expect(d.pos).toEqual([0, 3, 0]);
  });

  it('eases toward the player once repaired (closes distance, never overshoots)', () => {
    const inv = fakeInv({ 'block:8': 2, 'block:4': 1 });
    const d = createDrone([0, 3, 0]);
    repairDrone(d, inv);
    const player: [number, number, number] = [10, 5, 10];
    const d0 = dist3(d.pos, player);
    for (let i = 0; i < 30; i++) stepDrone(d, player, DT);
    const d1 = dist3(d.pos, player);
    expect(d1).toBeLessThan(d0);
    expect(d1).toBeGreaterThan(0); // eased follow, not teleport
  });

  it('is deterministic: identical inputs -> identical position', () => {
    const mk = () => {
      const inv = fakeInv({ 'block:8': 2, 'block:4': 1 });
      const d = createDrone([0, 3, 0]);
      repairDrone(d, inv);
      for (let i = 0; i < 50; i++) stepDrone(d, [10, 5, 10], DT);
      return d.pos;
    };
    expect(mk()).toEqual(mk());
  });

  it('converges toward the player over many steps', () => {
    const inv = fakeInv({ 'block:8': 2, 'block:4': 1 });
    const d = createDrone([0, 3, 0]);
    repairDrone(d, inv);
    const player: [number, number, number] = [10, 5, 10];
    for (let i = 0; i < 2000; i++) stepDrone(d, player, DT);
    const dist = dist3(d.pos, player);
    expect(dist).toBeLessThan(0.5);
  });
});
