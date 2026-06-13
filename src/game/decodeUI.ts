/**
 * Decode panel overlay (M3.3 ch2 step2 — GAME_DESIGN §3c). Shows the current
 * target glyph (3×3, read-only) beside an editable 3×3 panel; clicking a panel
 * cell toggles it. SUBMIT calls the pure-core `isSolved(panel, glyphIndex)`; on
 * success the quest bridge bumps `puzzlesSolved` (advancing to the next of 3
 * glyphs, then unlocking the scanner on the 3rd) and the panel re-targets.
 *
 * Overlay coexistence (REUSES the input.ts syncTitleOverlay fix from the
 * crafting overlay, M1.4): opening releases pointer lock, pauses the sim
 * (`game.paused`), and sets `input.uiOpen` so the title screen stays hidden and
 * play keys/edits are suppressed; closing re-acquires lock. All deterministic —
 * nothing here touches the clock.
 */
import { GLYPHS, GLYPH_CELLS, GLYPH_COUNT, isSolved } from '../core/quest/decode';
import type { Game } from './loop';
import type { InputController } from './input';

export interface DecodeElements {
  /** Overlay root (`#decode`); gets the `open` class while visible. */
  root: HTMLElement;
  /** Read-only target glyph 3×3 grid. */
  target: HTMLElement;
  /** Editable panel 3×3 grid. */
  panel: HTMLElement;
  /** "n / 3 decoded" progress line. */
  progress: HTMLElement;
  /** SUBMIT button. */
  submit: HTMLButtonElement;
}

export class DecodeOverlay {
  /** The editable panel mask (row-major boolean[9]). */
  private mask: boolean[] = new Array(GLYPH_CELLS).fill(false);
  private targetCells: HTMLElement[] = [];
  private panelCells: HTMLElement[] = [];

  constructor(
    private readonly game: Game,
    private readonly input: InputController,
    private readonly els: DecodeElements,
  ) {}

  get isOpen(): boolean {
    return this.els.root.classList.contains('open');
  }

  /** Build the static 3×3 cell grids + wire SUBMIT / Esc once. */
  attach(): void {
    for (let i = 0; i < GLYPH_CELLS; i++) {
      const t = document.createElement('div');
      t.className = 'cell';
      this.els.target.appendChild(t);
      this.targetCells.push(t);
      const p = document.createElement('div');
      p.className = 'cell';
      p.dataset.cell = String(i);
      p.addEventListener('click', () => this.toggle(i));
      this.els.panel.appendChild(p);
      this.panelCells.push(p);
    }
    this.els.submit.addEventListener('click', () => this.submit());
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen) this.close();
    });
  }

  /** Open the panel (no-op if already solved all 3, or another overlay is up). */
  open(): void {
    if (this.input.uiOpen || this.isOpen) return;
    if (this.game.quest.decodeGlyphIndex() >= GLYPH_COUNT) return; // all decoded
    this.mask = new Array(GLYPH_CELLS).fill(false);
    this.els.root.classList.add('open');
    this.game.paused = true;
    this.input.uiOpen = true;
    document.exitPointerLock();
    this.input.syncTitleOverlay();
    this.render();
  }

  /** Close + return straight to play (re-acquire lock, not the title screen). */
  close(): void {
    this.els.root.classList.remove('open');
    this.game.paused = false;
    this.input.uiOpen = false;
    this.input.requestLock();
    this.input.syncTitleOverlay();
  }

  private toggle(i: number): void {
    this.mask[i] = !this.mask[i];
    this.render();
  }

  /** SUBMIT: on a correct mask, advance the pulse; close after the 3rd. */
  private submit(): void {
    const idx = this.game.quest.decodeGlyphIndex();
    if (idx >= GLYPH_COUNT) return;
    if (!isSolved(this.mask, idx)) return; // wrong — leave the panel for retry
    this.game.quest.solvePulse();
    if (this.game.quest.decodeGlyphIndex() >= GLYPH_COUNT) {
      this.close(); // all 3 decoded — advance fires the scanner unlock next step
    } else {
      this.mask = new Array(GLYPH_CELLS).fill(false); // next glyph, fresh panel
      this.render();
    }
  }

  /** Sync both grids + progress to current state. */
  private render(): void {
    const idx = Math.min(this.game.quest.decodeGlyphIndex(), GLYPH_COUNT - 1);
    const glyph = GLYPHS[idx]!;
    for (let i = 0; i < GLYPH_CELLS; i++) {
      this.targetCells[i]!.classList.toggle('on', glyph[i] === true);
      this.panelCells[i]!.classList.toggle('on', this.mask[i]);
    }
    this.els.progress.textContent = `${this.game.quest.decodeGlyphIndex()} / ${GLYPH_COUNT} DECODED`;
  }
}
