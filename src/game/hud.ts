/**
 * DOM HUD — M1.4 rewrite over the M0 port (GAME_DESIGN §10 minimal style).
 *
 * The hotbar now renders the REAL inventory (slots 0–7 of the 40-slot core
 * inventory): item swatch (the block's actual 16×16 texture canvas, or a
 * glyph chip for tools/materials), count badge (shown for count ≥ 2), active
 * ring, and the active item's displayName on slot switch / hover.
 *
 * Determinism contract (visual baselines): every transient element (toast,
 * item-name label, pickup flash) is timed in SIM STEPS, never wall-clock —
 * `stepTimers()` is called once per fixed step by the game loop, so under
 * `__TEST__` the HUD after `stepFrames(n)` is a pure function of the steps.
 * DOM writes happen in `refresh()` (called once per rendered frame) and only
 * touch slots whose content signature changed.
 */
import { BLOCK_DEFS, makeBlockCanvas } from '../render/textures/blockTextures';
import { getItem, type ItemId } from '../core/items/catalog';
import {
  HOTBAR_SLOTS,
  setActiveSlot,
  type Inventory,
  type ItemStack,
} from '../core/player/inventory';

/** Transient UI lifetimes in fixed sim steps (1/60 s each). */
const TOAST_STEPS = 90; // 1.5 s
const NAME_STEPS = 120; // 2 s

/** Short glyph for non-block items (tools get their tier, others initials). */
function itemGlyph(itemId: ItemId): string {
  const def = getItem(itemId);
  if (def.kind === 'tool') {
    return def.toolTier === 'plasma' ? 'PL' : def.toolTier === 'mk2' ? 'M2' : 'M1';
  }
  return def.displayName
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Build a swatch element for an item: block items reuse the block's actual
 * texture canvas (pixelated, same pixels as the world); everything else is a
 * glyph chip. Shared with the inventory/crafting overlay.
 */
export function createItemSwatch(itemId: ItemId): HTMLElement {
  const def = getItem(itemId);
  if (def.kind === 'block' && def.blockId !== undefined) {
    const blockDef = BLOCK_DEFS[def.blockId];
    if (blockDef) {
      const wrap = document.createElement('div');
      wrap.className = 'swatch';
      const canvas = makeBlockCanvas(blockDef);
      canvas.className = 'swatch-tex';
      if (blockDef.glow) {
        wrap.style.boxShadow = `0 0 8px rgb(${blockDef.base.join(',')})`;
      }
      wrap.appendChild(canvas);
      return wrap;
    }
  }
  const chip = document.createElement('div');
  chip.className = 'swatch glyph';
  chip.textContent = itemGlyph(itemId);
  return chip;
}

/** One survival stat bar: the fill element + (for O₂) the low-warning host. */
export interface StatBar {
  /** The 0–100% width fill. */
  fill: HTMLElement;
  /** The bar row (gets the `low` class when the value is in warning range). */
  row: HTMLElement;
}

export interface HudElements {
  hotbar: HTMLElement;
  info: HTMLElement | null;
  /** Active-item name label (transient, above the hotbar). */
  itemName: HTMLElement | null;
  /** Transient toast line ("INVENTORY FULL", "TOOL TOO WEAK", pickups). */
  toast: HTMLElement | null;
  /** Mining progress bar container + fill (near the crosshair). */
  progress: HTMLElement | null;
  progressFill: HTMLElement | null;
  /** Survival stat bars (bottom-left, §10) — null in headless harness fallbacks. */
  hpBar?: StatBar | null;
  o2Bar?: StatBar | null;
  energyBar?: StatBar | null;
}

/** A snapshot of the three survival numbers the HUD renders (0..100 each). */
export interface SurvivalView {
  hp: number;
  o2: number;
  energy: number;
}

/** O₂ at or below this fraction (of 100) flashes the low-warning style (§10). */
const O2_LOW = 25;

export class Hud {
  private readonly slotEls: HTMLElement[] = [];
  /** Per-slot content signature ("itemId:count" | "") to skip DOM churn. */
  private readonly slotSig: string[] = [];
  private toastTimer = 0;
  private toastText = '';
  private nameTimer = 0;
  private nameText = '';
  private progressValue = 0;
  private survival: SurvivalView = { hp: 100, o2: 100, energy: 100 };
  /** Last written "hp:o2:o2low" signature to skip per-frame bar DOM churn. */
  private barSig = '';

  constructor(
    private readonly inv: Inventory,
    private readonly els: HudElements,
  ) {
    els.hotbar.replaceChildren();
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === inv.activeHotbarSlot ? ' active' : '');
      slot.addEventListener('mouseenter', () => this.showName(this.inv.slots[i] ?? null));
      els.hotbar.appendChild(slot);
      this.slotEls.push(slot);
      this.slotSig.push('\0'); // never matches ⇒ first refresh fills all
    }
    // Info line FROZEN at the M0 string: it appears in every game-page visual
    // baseline, only 5 of which are approved to change in M1.4 (Tab is taught
    // on the title overlay instead).
    if (els.info) els.info.textContent = 'INTERSTELLAR CRAFT · F fly · Esc release mouse';
    this.refresh();
  }

  /** Select a hotbar slot: core state + active ring + transient name label. */
  selectSlot(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= HOTBAR_SLOTS) return;
    setActiveSlot(this.inv, i);
    this.slotEls.forEach((el, j) => el.classList.toggle('active', j === i));
    this.showName(this.inv.slots[i] ?? null);
  }

  /** Transient toast ("INVENTORY FULL" / "TOOL TOO WEAK" / pickups). */
  toast(text: string): void {
    this.toastText = text;
    this.toastTimer = TOAST_STEPS;
  }

  /** Pickup feedback after a mining drop landed in the inventory. */
  pickup(itemId: ItemId): void {
    this.toast(`+1 ${getItem(itemId).displayName}`);
  }

  /** Mining progress 0..1 (bar hidden at 0) — set by the loop each frame. */
  setProgress(p: number): void {
    this.progressValue = p;
  }

  /** Survival stats (HP/O₂/Energy, 0..100) — set by the loop each frame. */
  setSurvival(s: SurvivalView): void {
    this.survival = s;
  }

  /** Advance transient timers by one fixed sim step (loop calls this). */
  stepTimers(): void {
    if (this.toastTimer > 0) this.toastTimer--;
    if (this.nameTimer > 0) this.nameTimer--;
  }

  /** Sync the DOM to current state — called once per rendered frame. */
  refresh(): void {
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const s = this.inv.slots[i] ?? null;
      const sig = s ? `${s.itemId}:${s.count}` : '';
      if (sig === this.slotSig[i]) continue;
      this.slotSig[i] = sig;
      const slot = this.slotEls[i]!;
      slot.replaceChildren();
      if (s) {
        slot.appendChild(createItemSwatch(s.itemId));
        if (s.count >= 2) {
          const badge = document.createElement('div');
          badge.className = 'count';
          badge.textContent = String(s.count);
          slot.appendChild(badge);
        }
      }
    }
    const { itemName, toast, progress, progressFill } = this.els;
    if (itemName) {
      itemName.textContent = this.nameTimer > 0 ? this.nameText : '';
      itemName.style.opacity = this.nameTimer > 0 ? '1' : '0';
    }
    if (toast) {
      toast.textContent = this.toastTimer > 0 ? this.toastText : '';
      toast.style.opacity = this.toastTimer > 0 ? '1' : '0';
    }
    if (progress && progressFill) {
      progress.style.display = this.progressValue > 0 ? 'block' : 'none';
      progressFill.style.width = `${Math.min(100, this.progressValue * 100).toFixed(1)}%`;
    }
    this.refreshBars();
  }

  /** Sync the three survival stat bars; skips DOM writes when nothing changed. */
  private refreshBars(): void {
    const { hpBar, o2Bar, energyBar } = this.els;
    if (!hpBar && !o2Bar && !energyBar) return;
    const { hp, o2, energy } = this.survival;
    const low = o2 <= O2_LOW;
    // Quantize widths to 0.1% so floating drift doesn't churn the DOM every frame.
    const q = (v: number): string => `${Math.max(0, Math.min(100, v)).toFixed(1)}%`;
    const sig = `${q(hp)}|${q(o2)}|${q(energy)}|${low ? 1 : 0}`;
    if (sig === this.barSig) return;
    this.barSig = sig;
    if (hpBar) hpBar.fill.style.width = q(hp);
    if (energyBar) energyBar.fill.style.width = q(energy);
    if (o2Bar) {
      o2Bar.fill.style.width = q(o2);
      o2Bar.row.classList.toggle('low', low);
    }
  }

  private showName(stack: ItemStack | null): void {
    this.nameText = stack ? getItem(stack.itemId).displayName : '';
    this.nameTimer = this.nameText ? NAME_STEPS : 0;
  }
}
