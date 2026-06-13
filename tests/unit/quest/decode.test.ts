// Spec: GAME_DESIGN §3c step 2 — ch2 "decode the 3 pulses": each puzzle shows a
// 3×3 target glyph (boolean mask); the player reproduces it on a 3×3 panel;
// solved when panel mask == glyph. 3 distinct glyphs. Pure-core logic lives in
// src/core/quest/decode.ts (glyph table + isSolved(panel, glyph)).
//
// This suite is the design-contract FREEZE for the glyph table: the 3 glyphs are
// transcribed here as literals. Code must match these; if they diverge, fix code.
import { describe, expect, it } from 'vitest';
import { GLYPHS, GLYPH_COUNT, getGlyph, isSolved } from '../../../src/core/quest/decode';

/**
 * Canonical glyph literals (frozen by this contract test). Each is a flat
 * boolean[9] in row-major order (index = row*3 + col). 3 DISTINCT patterns:
 *   0: cross  (plus sign)        1: diagonal (top-left → bottom-right)
 *   2: ring   (border, hollow center)
 */
const X = true;
const o = false;
const EXPECTED_GLYPHS: ReadonlyArray<readonly boolean[]> = [
  // 0 — cross / plus
  [o, X, o, X, X, X, o, X, o],
  // 1 — main diagonal
  [X, o, o, o, X, o, o, o, X],
  // 2 — ring (border on, center off)
  [X, X, X, X, o, X, X, X, X],
];

describe('decode glyph table (GAME_DESIGN §3c contract)', () => {
  it('exposes exactly 3 glyphs', () => {
    expect(GLYPH_COUNT).toBe(3);
    expect(GLYPHS).toHaveLength(3);
  });

  it('matches the frozen glyph literals cell-for-cell', () => {
    expect(GLYPHS.map((g) => [...g])).toEqual(EXPECTED_GLYPHS.map((g) => [...g]));
  });

  it('every glyph is a 9-cell boolean mask', () => {
    for (const g of GLYPHS) {
      expect(g).toHaveLength(9);
      for (const cell of g) expect(typeof cell).toBe('boolean');
    }
  });

  it('the 3 glyphs are pairwise distinct', () => {
    const keys = GLYPHS.map((g) => g.map((c) => (c ? '1' : '0')).join(''));
    expect(new Set(keys).size).toBe(3);
  });

  it('getGlyph returns the glyph at an index and throws RangeError out of range', () => {
    for (let i = 0; i < GLYPH_COUNT; i++) {
      expect([...getGlyph(i)]).toEqual([...EXPECTED_GLYPHS[i]!]);
    }
    expect(() => getGlyph(-1)).toThrow(RangeError);
    expect(() => getGlyph(GLYPH_COUNT)).toThrow(RangeError);
  });
});

describe('isSolved(panel, glyphIndex) (GAME_DESIGN §3c step 2)', () => {
  it('exact panel matching each glyph → true', () => {
    for (let i = 0; i < GLYPH_COUNT; i++) {
      expect(isSolved([...EXPECTED_GLYPHS[i]!], i)).toBe(true);
    }
  });

  it('any single-cell-off panel → false (for every glyph, every cell)', () => {
    for (let i = 0; i < GLYPH_COUNT; i++) {
      for (let c = 0; c < 9; c++) {
        const panel = [...EXPECTED_GLYPHS[i]!];
        panel[c] = !panel[c];
        expect(isSolved(panel, i)).toBe(false);
      }
    }
  });

  it("a different glyph's panel → false (glyphs are distinct)", () => {
    for (let target = 0; target < GLYPH_COUNT; target++) {
      for (let other = 0; other < GLYPH_COUNT; other++) {
        if (other === target) continue;
        expect(isSolved([...EXPECTED_GLYPHS[other]!], target)).toBe(false);
      }
    }
  });

  it('a wrong-shape panel is rejected (length != 9 → false)', () => {
    expect(isSolved([X, o, X], 0)).toBe(false);
    expect(isSolved([], 0)).toBe(false);
    expect(isSolved([...EXPECTED_GLYPHS[0]!, o], 0)).toBe(false);
  });

  it('a bad glyphIndex throws RangeError', () => {
    const panel = [...EXPECTED_GLYPHS[0]!];
    expect(() => isSolved(panel, -1)).toThrow(RangeError);
    expect(() => isSolved(panel, GLYPH_COUNT)).toThrow(RangeError);
    expect(() => isSolved(panel, 1.5)).toThrow(RangeError);
  });
});
