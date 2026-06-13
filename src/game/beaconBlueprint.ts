/**
 * Beacon blueprint panel (M4.3b ch4 — GAME_DESIGN §3d). A small, passive DOM hint
 * that shows the player the target beacon assembly so they know what to build:
 *
 *     ▲  antenna cap        (block 11)
 *     ║  6 × beacon-core     (block 12)
 *     ║
 *     ▣  launchpad           (block 13, on solid ground)
 *
 * It is purely informational — no game-state coupling beyond reading the quest
 * chapter to auto-show during ch4 (and a [B] manual toggle for any time). Mirrors
 * the decodeUI overlay pattern (a class over pre-existing #beacon-blueprint DOM),
 * but it does NOT pause the sim or grab pointer lock — it is a side hint, like the
 * objective line, so play continues underneath it.
 *
 * Determinism: pure DOM, driven by stepped chapter state; nothing here touches the
 * clock, so it never affects the visual baselines (the markup is hidden by default
 * and only auto-shown once the quest reaches ch4, which the baselines never do).
 */
import type { QuestBridge } from './quest';

/** ch4 chapter index (1-based) — the blueprint auto-shows here. */
const BEACON_CHAPTER = 4;

export class BeaconBlueprint {
  /** True once the player manually closed it with [B] (suppresses auto-show). */
  private dismissed = false;

  constructor(
    private readonly quest: QuestBridge,
    private readonly root: HTMLElement,
  ) {}

  get isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  /** Manual [B] toggle: flip visibility; a manual close suppresses auto-show. */
  toggle(): void {
    if (this.isOpen) {
      this.root.classList.remove('open');
      this.dismissed = true;
    } else {
      this.root.classList.add('open');
      this.dismissed = false;
    }
  }

  /**
   * Per-frame refresh (called from the render path). Auto-shows the panel while
   * the quest sits in ch4 AND the beacon is not yet valid AND the player has not
   * dismissed it; auto-hides it once ch4 is done (beacon built / chapter passed).
   */
  refresh(): void {
    const ch = this.quest.state.chapter;
    const built = this.quest.state.flags.beaconValid === true;
    // Out of ch4 (or beacon built): always hide; reset dismiss so a future visit
    // can auto-show again.
    if (ch !== BEACON_CHAPTER || built) {
      this.root.classList.remove('open');
      this.dismissed = false;
      return;
    }
    if (!this.dismissed) this.root.classList.add('open');
  }
}
