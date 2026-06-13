/**
 * Decode puzzle — GAME_DESIGN §3c step 2 (ch2 "Decode the 3 pulses").
 *
 * Each of the 3 pulses is a 3×3 target **glyph**: a boolean mask the player must
 * reproduce on a 3×3 decode panel (place/clear cells). The pulse is solved when
 * the panel mask exactly equals the glyph, cell-for-cell.
 *
 * Pure core logic only: the glyph table + `isSolved(panel, glyphIndex)`. The 3×3
 * panel UI and the block-placement → panel-mask mapping live in the game layer
 * (M3.3), which calls `isSolved` to bump `counters.puzzlesSolved`.
 *
 * Representation: a glyph/panel is a flat `boolean[9]` in ROW-MAJOR order —
 * index = row*3 + col, rows top→bottom, cols left→right. `true` = filled cell.
 */

/** Number of distinct decode glyphs (GAME_DESIGN §3c: "3 distinct glyphs"). */
export const GLYPH_COUNT = 3;

/** Cells per glyph/panel (a 3×3 grid). */
export const GLYPH_CELLS = 9;

const X = true;
const o = false;

/**
 * The 3 canonical glyphs (frozen by tests/unit/quest/decode.test.ts). Each is a
 * 3×3 mask drawn below; `#` = filled (true), `.` = empty (false):
 *
 *   0 — CROSS (plus)      1 — DIAGONAL (TL→BR)   2 — RING (hollow border)
 *       . # .                 # . .                  # # #
 *       # # #                 . # .                  # . #
 *       . # .                 . . #                  # # #
 *
 * They are pairwise distinct (the contract test asserts this), so reproducing
 * one never accidentally solves another.
 */
export const GLYPHS: readonly (readonly boolean[])[] = Object.freeze([
  Object.freeze([o, X, o, X, X, X, o, X, o]), // 0 — cross
  Object.freeze([X, o, o, o, X, o, o, o, X]), // 1 — diagonal
  Object.freeze([X, X, X, X, o, X, X, X, X]), // 2 — ring
]);

function assertGlyphIndex(glyphIndex: number): void {
  if (!Number.isInteger(glyphIndex) || glyphIndex < 0 || glyphIndex >= GLYPH_COUNT) {
    throw new RangeError(
      `glyphIndex out of range: ${glyphIndex} (expected integer 0..${GLYPH_COUNT - 1})`,
    );
  }
}

/**
 * The glyph at `glyphIndex`. Throws RangeError for a non-integer or out-of-range
 * index. The returned array is the frozen canonical glyph (do not mutate).
 */
export function getGlyph(glyphIndex: number): readonly boolean[] {
  assertGlyphIndex(glyphIndex);
  return GLYPHS[glyphIndex]!;
}

/**
 * True iff `panel` exactly reproduces glyph `glyphIndex`, cell-for-cell.
 *
 * A panel of the wrong shape (length !== 9) is simply unsolved → `false`
 * (defensive: malformed UI state must not crash the quest engine). An
 * out-of-range or non-integer `glyphIndex`, by contrast, is a programmer error
 * and throws RangeError.
 */
export function isSolved(panel: readonly boolean[], glyphIndex: number): boolean {
  assertGlyphIndex(glyphIndex);
  if (panel.length !== GLYPH_CELLS) return false;
  const glyph = GLYPHS[glyphIndex]!;
  for (let i = 0; i < GLYPH_CELLS; i++) {
    if (panel[i] !== glyph[i]) return false;
  }
  return true;
}
