/**
 * DOM HUD — port of the prototype's hotbar UI + info line (prototype/index.html
 * "物品栏 UI" section). Slot swatches use the prototype block base colours (with
 * the glow box-shadow for crystal/lamp); labels are English (M0 page is English).
 */
import { BLOCK_DEFS } from '../render/textures/blockTextures';

/** Prototype HOTBAR: the 6 legacy block ids in slot order. */
export const HOTBAR: readonly number[] = [1, 2, 3, 4, 5, 6];

/** English display names for the M0 page (BLOCK_DEFS carries the legacy Chinese names). */
export const BLOCK_LABELS: Readonly<Record<number, string>> = {
  1: 'Regolith',
  2: 'Rock',
  3: 'Basalt',
  4: 'Crystal',
  5: 'Ice',
  6: 'Lamp',
};

export class Hud {
  private slotIndexValue = 0;
  private readonly hotbarEl: HTMLElement;

  constructor(hotbarEl: HTMLElement, infoEl: HTMLElement | null) {
    this.hotbarEl = hotbarEl;
    hotbarEl.replaceChildren();
    HOTBAR.forEach((id, i) => {
      const def = BLOCK_DEFS[id];
      if (!def) return;
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === 0 ? ' active' : '');
      const sw = document.createElement('div');
      sw.className = 'swatch';
      sw.style.background = `rgb(${def.base.join(',')})`;
      if (def.glow) sw.style.boxShadow = `0 0 8px rgb(${def.base.join(',')})`;
      slot.appendChild(sw);
      slot.appendChild(document.createTextNode(BLOCK_LABELS[id] ?? def.name));
      hotbarEl.appendChild(slot);
    });
    if (infoEl) infoEl.textContent = 'INTERSTELLAR CRAFT · F fly · Esc release mouse';
  }

  get slotIndex(): number {
    return this.slotIndexValue;
  }

  /** Block id the current slot places (prototype `HOTBAR[slotIndex]`). */
  get selectedBlock(): number {
    return HOTBAR[this.slotIndexValue] ?? 1;
  }

  /** Prototype `selectSlot(i)` — clamps to the 6 slots, updates the active ring. */
  selectSlot(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= HOTBAR.length) return;
    this.slotIndexValue = i;
    [...this.hotbarEl.children].forEach((el, j) => el.classList.toggle('active', j === i));
  }
}
