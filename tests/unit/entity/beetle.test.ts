// Spec: GAME_DESIGN §3e / §8 — Crystal Beetle: wanders cave floors, flees the
// player; cornered (cannot flee, player very close) → sheds 1 crystal shard once
// (no kill). Pure seeded state behavior, no render, no Math.random.
import { describe, expect, it } from 'vitest';
import {
  createBeetle,
  stepBeetle,
  BEETLE_FLEE_RADIUS,
  BEETLE_CORNER_RADIUS,
} from '../../../src/core/entity/beetle';
import type { BeetleContext } from '../../../src/core/entity/beetle';

const DT = 1 / 60;

/** A context with no solids anywhere and a fixed player position. */
function openCtx(playerPos: [number, number, number]): BeetleContext {
  return { playerPos, isSolid: () => false };
}

/** Step a beetle `n` times against a fixed context, returning the beetle. */
function run(beetle: ReturnType<typeof createBeetle>, ctx: BeetleContext, n: number) {
  for (let i = 0; i < n; i++) stepBeetle(beetle, ctx, DT);
  return beetle;
}

describe('createBeetle', () => {
  it('starts at the given position, not shed', () => {
    const b = createBeetle([5, 2, 5], 42);
    expect(b.pos).toEqual([5, 2, 5]);
    expect(b.shed).toBe(false);
  });
});

describe('stepBeetle determinism (seeded, no Math.random)', () => {
  it('same seed + same inputs -> identical path', () => {
    const ctx = openCtx([100, 2, 100]);
    const a = run(createBeetle([5, 2, 5], 7), ctx, 120);
    const b = run(createBeetle([5, 2, 5], 7), ctx, 120);
    expect(a.pos).toEqual(b.pos);
  });

  it('different seeds -> different wander paths', () => {
    const ctx = openCtx([100, 2, 100]);
    const a = run(createBeetle([5, 2, 5], 7), ctx, 120);
    const b = run(createBeetle([5, 2, 5], 99), ctx, 120);
    expect(a.pos).not.toEqual(b.pos);
  });

  it('does not call Math.random (determinism guard)', () => {
    const orig = Math.random;
    let called = false;
    Math.random = () => {
      called = true;
      return orig();
    };
    try {
      run(createBeetle([5, 2, 5], 7), openCtx([100, 2, 100]), 60);
    } finally {
      Math.random = orig;
    }
    expect(called).toBe(false);
  });
});

describe('stepBeetle fleeing', () => {
  it('moves away from a nearby player (net displacement increases distance)', () => {
    const start: [number, number, number] = [10, 2, 10];
    const player: [number, number, number] = [10 - (BEETLE_FLEE_RADIUS - 1), 2, 10];
    const b = createBeetle(start, 3);
    const d0 = Math.hypot(b.pos[0] - player[0], b.pos[2] - player[2]);
    run(b, { playerPos: player, isSolid: () => false }, 30);
    const d1 = Math.hypot(b.pos[0] - player[0], b.pos[2] - player[2]);
    expect(d1).toBeGreaterThan(d0);
    expect(b.pos[0]).toBeGreaterThan(start[0]);
  });
});

describe('stepBeetle shed-when-cornered', () => {
  function walledCtx(playerPos: [number, number, number]): BeetleContext {
    return {
      playerPos,
      isSolid: (x, _y, z) => !(x === 10 && z === 10),
    };
  }

  it('sheds exactly once when cornered with the player very close', () => {
    const b = createBeetle([10, 2, 10], 5);
    const player: [number, number, number] = [10 + (BEETLE_CORNER_RADIUS - 0.5), 2, 10];
    run(b, walledCtx(player), 10);
    expect(b.shed).toBe(true);
  });

  it('does not shed when the player is far (no corner trigger)', () => {
    const b = createBeetle([10, 2, 10], 5);
    run(b, walledCtx([100, 2, 100]), 10);
    expect(b.shed).toBe(false);
  });

  it('shed is latched - reported once via the step return', () => {
    const b = createBeetle([10, 2, 10], 5);
    const player: [number, number, number] = [10 + (BEETLE_CORNER_RADIUS - 0.5), 2, 10];
    let firstShedStep = -1;
    let shedReports = 0;
    for (let i = 0; i < 10; i++) {
      const r = stepBeetle(b, walledCtx(player), DT);
      if (r.didShed) {
        shedReports++;
        if (firstShedStep < 0) firstShedStep = i;
      }
    }
    expect(shedReports).toBe(1);
    expect(b.shed).toBe(true);
    expect(firstShedStep).toBeGreaterThanOrEqual(0);
  });
});
