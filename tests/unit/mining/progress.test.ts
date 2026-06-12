// Spec: GAME_DESIGN §4 — continuous hold-to-mine with progress (intentional
// M1 behavior change vs. the M0 prototype's instant click). Fixed dt = 1/60.
// Progress accumulates dt/miningTime while held on the SAME target key;
// switching targets or releasing resets to 0; a block below its min tool
// refuses (progress stays 0); reaching 1.0 completes exactly once.
import { describe, expect, it } from 'vitest';
import { BlockId } from '../../../src/core/world/blocks';
import { applyMiningDrop, createMiningState, stepMining } from '../../../src/core/mining/progress';
import type { MiningStepInput } from '../../../src/core/mining/progress';
import { STACK_MAX, blockItemId } from '../../../src/core/items/catalog';
import { count, createInventory, give } from '../../../src/core/player/inventory';

const DT = 1 / 60;

/** Convenience: hold on one target for n steps, return the last result. */
function hold(
  state: ReturnType<typeof createMiningState>,
  input: Omit<MiningStepInput, 'dt'>,
  steps: number,
) {
  let last = { completed: false, refused: false, progress: 0 };
  for (let i = 0; i < steps; i++) last = stepMining(state, { ...input, dt: DT });
  return last;
}

describe('stepMining — hold-to-mine accumulation', () => {
  it('regolith by hand (0.6 s) does NOT complete on step 35, completes on step 36', () => {
    const state = createMiningState();
    const input = {
      targetKey: '1,2,3',
      targetBlockId: BlockId.Regolith,
      toolTier: 'hand',
    } as const;
    const at35 = hold(state, input, 35);
    expect(at35.completed).toBe(false);
    expect(at35.progress).toBeCloseTo(35 / 36, 9);
    const at36 = stepMining(state, { ...input, dt: DT });
    expect(at36.completed).toBe(true);
  });

  it('crystal with mk2 (3.5/4 = 0.875 s = 52.5 steps) completes on step 53, not 52', () => {
    const state = createMiningState();
    const input = { targetKey: '0,0,0', targetBlockId: BlockId.Crystal, toolTier: 'mk2' } as const;
    expect(hold(state, input, 52).completed).toBe(false);
    expect(stepMining(state, { ...input, dt: DT }).completed).toBe(true);
  });

  it('reports fractional progress mid-hold (18/36 steps of regolith ≈ 0.5)', () => {
    const state = createMiningState();
    const input = { targetKey: 'k', targetBlockId: BlockId.Regolith, toolTier: 'hand' } as const;
    const r = hold(state, input, 18);
    expect(r.progress).toBeCloseTo(0.5, 9);
    expect(r.completed).toBe(false);
    expect(r.refused).toBe(false);
  });

  it('better tools accumulate faster: regolith with plasma (0.075 s) completes on step 5', () => {
    const state = createMiningState();
    const input = { targetKey: 'k', targetBlockId: BlockId.Regolith, toolTier: 'plasma' } as const;
    expect(hold(state, input, 4).completed).toBe(false); // 4/4.5 of the way
    expect(stepMining(state, { ...input, dt: DT }).completed).toBe(true);
  });
});

describe('stepMining — target switching and release', () => {
  it('switching to a different targetKey resets progress to 0 (new step counts from 1)', () => {
    const state = createMiningState();
    const a = { targetKey: 'a', targetBlockId: BlockId.Regolith, toolTier: 'hand' } as const;
    const b = { targetKey: 'b', targetBlockId: BlockId.Regolith, toolTier: 'hand' } as const;
    hold(state, a, 30); // almost done on a
    const first = stepMining(state, { ...b, dt: DT });
    expect(first.progress).toBeCloseTo(1 / 36, 9); // restarted, this step counted
    expect(hold(state, b, 34).completed).toBe(false); // 35 total on b
    expect(stepMining(state, { ...b, dt: DT }).completed).toBe(true); // 36 total on b
  });

  it('null target (released) resets progress; re-holding starts over', () => {
    const state = createMiningState();
    const a = { targetKey: 'a', targetBlockId: BlockId.Regolith, toolTier: 'hand' } as const;
    hold(state, a, 35);
    const released = stepMining(state, {
      targetKey: null,
      targetBlockId: BlockId.Regolith,
      toolTier: 'hand',
      dt: DT,
    });
    expect(released).toEqual({ completed: false, refused: false, progress: 0 });
    expect(hold(state, a, 35).completed).toBe(false); // full 36 needed again
    expect(stepMining(state, { ...a, dt: DT }).completed).toBe(true);
  });
});

describe('stepMining — completion fires exactly once, state reusable', () => {
  it('after completing, the same held target starts a fresh cycle from 0', () => {
    const state = createMiningState();
    const input = { targetKey: 'k', targetBlockId: BlockId.Regolith, toolTier: 'hand' } as const;
    expect(hold(state, input, 36).completed).toBe(true);
    // Next step must NOT report completed again — a new cycle begins.
    const after = stepMining(state, { ...input, dt: DT });
    expect(after.completed).toBe(false);
    expect(after.progress).toBeCloseTo(1 / 36, 9);
    // And the second block takes the full 36 steps again.
    expect(hold(state, input, 34).completed).toBe(false);
    expect(stepMining(state, { ...input, dt: DT }).completed).toBe(true);
  });
});

describe('stepMining — tier gating refuses', () => {
  it('basalt by hand: refused, progress pinned at 0 no matter how long held', () => {
    const state = createMiningState();
    const input = { targetKey: 'k', targetBlockId: BlockId.Basalt, toolTier: 'hand' } as const;
    for (let i = 0; i < 10; i++) {
      const r = stepMining(state, { ...input, dt: DT });
      expect(r).toEqual({ completed: false, refused: true, progress: 0 });
    }
  });

  it('a refused hold does not poison a following valid hold', () => {
    const state = createMiningState();
    hold(state, { targetKey: 'k', targetBlockId: BlockId.Crystal, toolTier: 'mk1' }, 5);
    const input = { targetKey: 'k2', targetBlockId: BlockId.Regolith, toolTier: 'hand' } as const;
    expect(hold(state, input, 35).completed).toBe(false);
    expect(stepMining(state, { ...input, dt: DT }).completed).toBe(true);
  });

  it('an invalid target block id (air) also refuses', () => {
    const state = createMiningState();
    const r = stepMining(state, {
      targetKey: 'k',
      targetBlockId: BlockId.Air,
      toolTier: 'plasma',
      dt: DT,
    });
    expect(r).toEqual({ completed: false, refused: true, progress: 0 });
  });
});

describe('stepMining — determinism and input validation', () => {
  it('same inputs ⇒ identical state trajectories (pure, no clock)', () => {
    const s1 = createMiningState();
    const s2 = createMiningState();
    const input = { targetKey: 'k', targetBlockId: BlockId.Ice, toolTier: 'mk1' } as const;
    for (let i = 0; i < 20; i++) {
      expect(stepMining(s1, { ...input, dt: DT })).toEqual(stepMining(s2, { ...input, dt: DT }));
      expect(s1).toEqual(s2);
    }
  });

  it('rejects negative or non-finite dt loudly', () => {
    const state = createMiningState();
    const input = { targetKey: 'k', targetBlockId: BlockId.Regolith, toolTier: 'hand' } as const;
    expect(() => stepMining(state, { ...input, dt: -DT })).toThrow(RangeError);
    expect(() => stepMining(state, { ...input, dt: Number.NaN })).toThrow(RangeError);
    expect(() => stepMining(state, { ...input, dt: Infinity })).toThrow(RangeError);
  });
});

describe('applyMiningDrop — block drops into a real inventory', () => {
  it('regolith drops one block:1 into the inventory', () => {
    const inv = createInventory();
    const r = applyMiningDrop(inv, BlockId.Regolith);
    expect(r).toEqual({ dropped: 'block:1', overflow: 0 });
    expect(count(inv, 'block:1')).toBe(1);
  });

  it('glass drops nothing (GAME_DESIGN §4: breaks) and leaves the inventory untouched', () => {
    const inv = createInventory();
    const r = applyMiningDrop(inv, BlockId.Glass);
    expect(r).toEqual({ dropped: null, overflow: 0 });
    expect(inv.slots.every((s) => s === null)).toBe(true);
  });

  it('full inventory: block still breaks, drop is lost (overflow 1, counts unchanged)', () => {
    const inv = createInventory();
    // Fill all 40 slots to stackMax with the same block item.
    expect(give(inv, blockItemId(BlockId.Regolith), 40 * STACK_MAX)).toBe(0);
    const r = applyMiningDrop(inv, BlockId.Regolith);
    expect(r).toEqual({ dropped: 'block:1', overflow: 1 });
    expect(count(inv, 'block:1')).toBe(40 * STACK_MAX);
  });

  it('throws RangeError on a non-§4 block id (air / unknown)', () => {
    const inv = createInventory();
    expect(() => applyMiningDrop(inv, BlockId.Air)).toThrow(RangeError);
    expect(() => applyMiningDrop(inv, 99)).toThrow(RangeError);
  });
});
