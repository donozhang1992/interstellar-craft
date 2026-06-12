import { describe, expect, it } from 'vitest';
import {
  generateStarAttributes,
  STAR_COUNT,
  STAR_RADIUS,
  STAR_SEED,
} from '../../../src/render/sky/stars';

describe('starfield placement (trailer-verbatim, seeded)', () => {
  it('is deterministic: same seed → same first-10 star positions', () => {
    const a = generateStarAttributes(STAR_SEED);
    const b = generateStarAttributes(STAR_SEED);
    expect(Array.from(a.positions.slice(0, 30))).toEqual(Array.from(b.positions.slice(0, 30)));
    expect(Array.from(a.colors.slice(0, 30))).toEqual(Array.from(b.colors.slice(0, 30)));
    expect(Array.from(a.sizes.slice(0, 10))).toEqual(Array.from(b.sizes.slice(0, 10)));
  });

  it('different seed → different positions', () => {
    const a = generateStarAttributes(STAR_SEED);
    const b = generateStarAttributes(STAR_SEED + 1);
    expect(Array.from(a.positions.slice(0, 30))).not.toEqual(Array.from(b.positions.slice(0, 30)));
  });

  it('produces trailer counts and places every star on the 1600-radius sphere', () => {
    const { positions, colors, sizes } = generateStarAttributes();
    expect(STAR_COUNT).toBe(3200);
    expect(positions).toHaveLength(STAR_COUNT * 3);
    expect(colors).toHaveLength(STAR_COUNT * 3);
    expect(sizes).toHaveLength(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = positions[i * 3] ?? 0;
      const y = positions[i * 3 + 1] ?? 0;
      const z = positions[i * 3 + 2] ?? 0;
      expect(Math.hypot(x, y, z)).toBeCloseTo(STAR_RADIUS, 2);
    }
  });

  it('sizes stay in the trailer range (1.2..3.8 × pixelRatio)', () => {
    const pixelRatio = 1.5;
    const { sizes } = generateStarAttributes(STAR_SEED, STAR_COUNT, pixelRatio);
    for (const s of sizes) {
      expect(s).toBeGreaterThanOrEqual(1.2 * pixelRatio);
      expect(s).toBeLessThanOrEqual(3.8 * pixelRatio);
    }
  });

  it('biases stars to the upper hemisphere (~80% of low stars mirrored)', () => {
    const { positions } = generateStarAttributes();
    let above = 0;
    for (let i = 0; i < STAR_COUNT; i++) if ((positions[i * 3 + 1] ?? 0) >= 0) above++;
    expect(above / STAR_COUNT).toBeGreaterThan(0.85);
  });
});
