/**
 * Inventory + crafting overlay (M1.4) — Tab toggles anywhere (ROADMAP M1
 * decision: workbench proximity deferred to M3), Esc closes.
 *
 * Left pane: the full 40-slot inventory grid (8 columns × 5 rows; the first
 * row IS the hotbar, highlighted). Interaction is click-to-select then
 * click-to-move using core moveSlot semantics (merge same item up to
 * stackMax, otherwise swap; clicking the selected cell deselects).
 *
 * Right pane: every recipe from availableRecipes(UNLOCKED_CHAPTER), §5 table
 * order — output name, inputs as have/need counts (ok/lack colored), CRAFT
 * button enabled iff core canCraft. Crafting re-renders both panes live.
 *
 * Open/close side effects (documented for tests):
 *  - pointer lock is released on open and NOT re-acquired on close (the
 *    player clicks the canvas to re-lock, exactly like after Esc);
 *  - `game.paused` freezes the sim (loop.ts: rAF keeps rendering, stepFrames
 *    becomes a no-op) and `input.uiOpen` suppresses slot keys/wheel/edit
 *    clicks/lock requests;
 *  - all timing is event-driven — nothing here touches the clock, so the
 *    overlay is fully deterministic under __TEST__.
 */
import {
  count as invCount,
  INVENTORY_SLOTS,
  HOTBAR_SLOTS,
  moveSlot,
  type Inventory,
} from '../core/player/inventory';
import { getItem } from '../core/items/catalog';
import { availableRecipes, canCraft, craft } from '../core/crafting/craft';
import type { Recipe, RecipeId } from '../core/crafting/recipes';
import { UNLOCKED_CHAPTER } from './chapters';
import { createItemSwatch } from './hud';
import type { Game } from './loop';
import type { InputController } from './input';

export interface OverlayElements {
  /** The overlay root (`#invcraft`); gets the `open` class while visible. */
  root: HTMLElement;
  /** 40-cell inventory grid container. */
  grid: HTMLElement;
  /** Recipe list container. */
  recipes: HTMLElement;
}

export class InventoryCraftOverlay {
  private selected: number | null = null;

  constructor(
    private readonly inv: Inventory,
    private readonly game: Game,
    private readonly input: InputController,
    private readonly els: OverlayElements,
  ) {}

  get open(): boolean {
    return this.els.root.classList.contains('open');
  }

  /** Wire Tab (toggle) / Esc (close) — listens on document, lock-independent. */
  attach(): void {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault(); // keep focus out of the browser chrome
        if (!e.repeat) this.toggle();
      } else if (e.code === 'Escape' && this.open) {
        this.toggle();
      }
    });
  }

  toggle(): void {
    const opening = !this.open;
    this.els.root.classList.toggle('open', opening);
    this.game.paused = opening;
    this.input.uiOpen = opening;
    if (opening) {
      document.exitPointerLock();
      this.selected = null;
      this.render();
    }
  }

  /** Rebuild both panes from current inventory state. */
  private render(): void {
    this.renderGrid();
    this.renderRecipes();
  }

  private renderGrid(): void {
    const cells: HTMLElement[] = [];
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const cell = document.createElement('div');
      cell.className =
        'inv-cell' +
        (i < HOTBAR_SLOTS ? ' hot' : '') +
        (i === this.selected ? ' selected' : '') +
        (i === this.inv.activeHotbarSlot ? ' active' : '');
      cell.dataset.slot = String(i);
      const s = this.inv.slots[i];
      if (s) {
        cell.appendChild(createItemSwatch(s.itemId));
        cell.title = getItem(s.itemId).displayName;
        if (s.count >= 2) {
          const badge = document.createElement('div');
          badge.className = 'count';
          badge.textContent = String(s.count);
          cell.appendChild(badge);
        }
      }
      cell.addEventListener('click', () => this.onCellClick(i));
      cells.push(cell);
    }
    this.els.grid.replaceChildren(...cells);
  }

  /** Click-to-select then click-to-move (core moveSlot merge-or-swap). */
  private onCellClick(i: number): void {
    if (this.selected === null) {
      if (this.inv.slots[i] !== null) {
        this.selected = i; // only a non-empty cell can be picked up
        this.renderGrid();
      }
      return;
    }
    if (this.selected !== i) moveSlot(this.inv, this.selected, i);
    this.selected = null;
    this.render(); // counts may have merged ⇒ recipes refresh too
  }

  private renderRecipes(): void {
    const rows = availableRecipes(UNLOCKED_CHAPTER).map((r) => this.recipeRow(r));
    this.els.recipes.replaceChildren(...rows);
  }

  private recipeRow(recipe: Recipe): HTMLElement {
    const row = document.createElement('div');
    row.className = 'recipe';
    row.dataset.recipe = recipe.id;

    const head = document.createElement('div');
    head.className = 'r-head';
    const name = document.createElement('span');
    name.className = 'r-name';
    const out = getItem(recipe.output.itemId);
    name.textContent =
      recipe.output.count > 1 ? `${out.displayName} ×${recipe.output.count}` : out.displayName;
    const btn = document.createElement('button');
    btn.className = 'craft-btn';
    btn.type = 'button';
    btn.textContent = 'CRAFT';
    const recipeId = recipe.id as RecipeId; // RECIPES table rows carry their key as id
    btn.disabled = !canCraft(this.inv, recipeId, UNLOCKED_CHAPTER);
    btn.addEventListener('click', () => {
      if (craft(this.inv, recipeId, UNLOCKED_CHAPTER)) {
        this.selected = null;
        this.render(); // live update: grid + every recipe's have/need
      }
    });
    head.append(name, btn);

    const inputs = document.createElement('div');
    inputs.className = 'r-inputs';
    for (const inp of recipe.inputs) {
      const have = invCount(this.inv, inp.itemId);
      const span = document.createElement('span');
      span.className = 'r-in ' + (have >= inp.count ? 'ok' : 'lack');
      span.textContent = `${getItem(inp.itemId).displayName} ${have}/${inp.count}`;
      inputs.appendChild(span);
    }

    row.append(head, inputs);
    return row;
  }
}
