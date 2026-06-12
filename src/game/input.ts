/**
 * Keyboard + mouse input — M0 port of prototype/index.html's event wiring,
 * extended for the M1 core loop (hold-to-mine, 8-slot hotbar, crafting UI).
 *
 * Prototype semantics preserved:
 *  - pointer lock requested by clicking the title overlay (and the canvas);
 *    the overlay hides while locked (pointerlockchange);
 *  - mouse look applies at EVENT time: yaw/pitch -= movement * 0.0024,
 *    pitch clamped to ±1.55 (sensitivity/clamp verbatim);
 *  - KeyF fly toggle is EDGE-triggered (ROADMAP M0.2b contract): `e.repeat`
 *    guarded, queued and consumed by exactly one simulation step;
 *  - ControlLeft ONLY for fly-descend (prototype reads `keys['ControlLeft']`);
 *  - Shift sprint accepts ShiftLeft or ShiftRight (prototype).
 *
 * M1 changes (GAME_DESIGN §4/§12 — intentional behavior change over M0):
 *  - LMB is now HELD to mine: `mineHeld` is true for every fixed step while
 *    the button is down (released on mouseup AND on pointer-lock exit). The
 *    M0 one-click-one-block path is gone.
 *  - RMB place stays a queued CLICK action (one placement per mousedown).
 *  - Digit1–8 and the wheel select the 8 hotbar slots (was 1–6).
 *  - `uiOpen` (set by the inventory/crafting overlay) suppresses slot
 *    selection, edit clicks and pointer-lock requests while the overlay is up.
 *
 * `setInput(partial)` (test hooks, TECH_SPEC §3) writes the same state the DOM
 * events write: booleans (`mine` included — it is the LMB hold) are held
 * overrides OR-ed with the live key/button map; `toggleFly` / `place: true`
 * queue exactly one action.
 */
import type { MoveInput } from '../core/player/movement';

/** What one fixed step consumes. */
export interface StepInput {
  move: MoveInput;
  /** True while LMB (or the setInput `mine` override) is held this step. */
  mineHeld: boolean;
  /** Number of queued RMB clicks to place. */
  placeClicks: number;
}

/** Partial input accepted by window.__game.setInput (TECH_SPEC §3). */
export interface InputPartial {
  forward?: boolean;
  back?: boolean;
  left?: boolean;
  right?: boolean;
  jump?: boolean;
  descend?: boolean;
  sprint?: boolean;
  /** true queues exactly one fly toggle (edge semantics). */
  toggleFly?: boolean;
  /** HELD override: mining continues every step until set back to false. */
  mine?: boolean;
  /** true queues exactly one place click. */
  place?: boolean;
  /** Select hotbar slot 0–7 (applied immediately). */
  slot?: number;
}

export interface InputDomTargets {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement | null;
}

const SENSITIVITY = 0.0024; // prototype mousemove factor
const PITCH_LIMIT = 1.55; // prototype clamp

/** Mutable view-angle holder — PlayerState satisfies this structurally. */
export interface LookState {
  yaw: number;
  pitch: number;
}

export class InputController {
  private readonly keys: Record<string, boolean> = {};
  private readonly held: InputPartial = {};
  private toggleQueue = 0;
  private leftDown = false;
  private placeQueue = 0;
  /** Set by the inventory/crafting overlay while it is open (M1.4). */
  uiOpen = false;

  constructor(
    private readonly look: LookState,
    private readonly selectSlot: (i: number) => void,
    private readonly slotCount: number,
    private readonly currentSlot: () => number,
  ) {}

  /** Wire all DOM listeners (prototype event section, verbatim semantics). */
  attach({ canvas, overlay }: InputDomTargets): void {
    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      // KeyF fly toggle — EDGE-triggered: ignore OS auto-repeat (M0.2b contract)
      if (e.code === 'KeyF' && !e.repeat) this.toggleQueue++;
      if (!this.uiOpen && /^Digit[1-8]$/.test(e.code)) this.selectSlot(+e.code.slice(5) - 1);
    });
    addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    addEventListener('wheel', (e) => {
      if (this.uiOpen) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      this.selectSlot((this.currentSlot() + dir + this.slotCount) % this.slotCount);
    });

    const requestLock = () => {
      if (!this.uiOpen) canvas.requestPointerLock();
    };
    overlay?.addEventListener('click', requestLock);
    canvas.addEventListener('click', requestLock);
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      overlay?.classList.toggle('hidden', locked);
      if (!locked) this.leftDown = false; // lock lost mid-hold ⇒ stop mining
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      // prototype mouse look, applied at event time (sensitivity/clamp verbatim)
      this.look.yaw -= e.movementX * SENSITIVITY;
      this.look.pitch -= e.movementY * SENSITIVITY;
      this.look.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.look.pitch));
    });

    addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas || this.uiOpen) return;
      if (e.button === 0) this.leftDown = true;
      else if (e.button === 2) this.placeQueue++;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.leftDown = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Programmatic input (test hooks). */
  setInput(partial: InputPartial): void {
    if (partial.toggleFly) this.toggleQueue++;
    if (partial.place) this.placeQueue++;
    if (partial.slot !== undefined) this.selectSlot(partial.slot);
    for (const k of [
      'forward',
      'back',
      'left',
      'right',
      'jump',
      'descend',
      'sprint',
      'mine',
    ] as const) {
      if (partial[k] !== undefined) this.held[k] = partial[k];
    }
  }

  /**
   * Snapshot + consume the input for one fixed step. Held movement (and the
   * mine hold) merges the live DOM key/button map with setInput overrides;
   * queued edge actions are drained. Multiple queued KeyF presses within one
   * step net out by parity (each press flips the mode, exactly like the
   * prototype's per-keydown toggle).
   */
  consumeStep(): StepInput {
    const k = this.keys;
    const h = this.held;
    const move: MoveInput = {
      forward: !!(k['KeyW'] || h.forward),
      back: !!(k['KeyS'] || h.back),
      left: !!(k['KeyA'] || h.left),
      right: !!(k['KeyD'] || h.right),
      jump: !!(k['Space'] || h.jump),
      descend: !!(k['ControlLeft'] || h.descend), // ControlLeft ONLY (contract)
      sprint: !!(k['ShiftLeft'] || k['ShiftRight'] || h.sprint),
      toggleFly: this.toggleQueue % 2 === 1,
    };
    this.toggleQueue = 0;
    const mineHeld = !!(this.leftDown || h.mine);
    const placeClicks = this.placeQueue;
    this.placeQueue = 0;
    return { move, mineHeld, placeClicks };
  }
}
