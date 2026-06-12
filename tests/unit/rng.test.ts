// Spec: TECH_SPEC §2 — mulberry32 is the ONLY randomness source in src/core.
// Determinism is load-bearing: same seed ⇒ identical sequence across runs/platforms.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/rng';

describe('mulberry32', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = mulberry32(0x7e);
    const b = mulberry32(0x7e);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('stays in [0, 1)', () => {
    const r = mulberry32(0xdeadbeef);
    for (let i = 0; i < 10_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('matches the frozen reference sequence for the world seed 0x7e', () => {
    const r = mulberry32(0x7e);
    // Frozen vector: if this snapshot ever changes, worldgen changes for every save.
    expect([r(), r(), r()]).toMatchSnapshot();
  });

  it('treats seeds as uint32 (negative and float seeds normalize deterministically)', () => {
    const neg = mulberry32(-1);
    const wrapped = mulberry32(0xffffffff);
    expect(neg()).toBe(wrapped());
  });
});
