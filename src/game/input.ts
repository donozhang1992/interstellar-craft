/**
 * Keyboard + mouse input — port of prototype/index.html's event wiring.
 *
 * Prototype semantics preserved:
 *  - pointer lock requested by clicking the title overlay (and the canvas);
 *    the overlay hides while locked (pointerlockchange);
 *  - mouse look applies at EVENT time: yaw/pitch -= movement * 0.0024,
 *    pitch clamped to ±1.55 (sensitivity/clamp verbatim);
 *  - mine/place are CLICK actions, one block per mousedown (the prototype has
 *    no hold-to-mine timer) and only while pointer-locked; contextmenu is
 *    suppressed;
 *  - KeyF fly toggle is EDGE-triggered (ROADMAP M0.2b contract): `e.repeat`
 *    guarded, queued and consumed by exactly one simulation step;
 *  - ControlLeft ONLY for fly-descend (prototype reads `keys['ControlLeft']`);
 *  - Shift sprint accepts ShiftLeft or ShiftRight (prototype);
 *  - Digit1–6 and the mouse wheel select hotbar slots at event time.
 *
 * `setInput(partial)` (test hooks, TECH_SPEC §3) writes the same state the DOM
 * events write: booleans are held overrides OR-ed with the live key map;
 * `toggleFly` / `mine` / `place: true` queue exactly one action each.
 */
import type { MoveInput } from '../core/player/movement';

/** What one fixed step consumes. */
export interface StepInput {
  move: MoveInput;
  /** Number of queued LMB clicks to mine (one raycast+edit each). */
  mineClicks: number;
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
  /** true queues exactly one mine click. */
  mine?: boolean;
  /** true queues exactly one place click. */
  place?: boolean;
  /** Select hotbar slot 0–5 (applied immediately). */
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
  private mineQueue = 0;
  private placeQueue = 0;

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
      if (/^Digit[1-6]$/.test(e.code)) this.selectSlot(+e.code.slice(5) - 1);
    });
    addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    addEventListener('wheel', (e) => {
      const dir = e.deltaY > 0 ? 1 : -1;
      this.selectSlot((this.currentSlot() + dir + this.slotCount) % this.slotCount);
    });

    const requestLock = () => canvas.requestPointerLock();
    overlay?.addEventListener('click', requestLock);
    canvas.addEventListener('click', requestLock);
    document.addEventListener('pointerlockchange', () => {
      overlay?.classList.toggle('hidden', document.pointerLockElement === canvas);
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      // prototype mouse look, applied at event time (sensitivity/clamp verbatim)
      this.look.yaw -= e.movementX * SENSITIVITY;
      this.look.pitch -= e.movementY * SENSITIVITY;
      this.look.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.look.pitch));
    });

    addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) this.mineQueue++;
      else if (e.button === 2) this.placeQueue++;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Programmatic input (test hooks). */
  setInput(partial: InputPartial): void {
    if (partial.toggleFly) this.toggleQueue++;
    if (partial.mine) this.mineQueue++;
    if (partial.place) this.placeQueue++;
    if (partial.slot !== undefined) this.selectSlot(partial.slot);
    for (const k of ['forward', 'back', 'left', 'right', 'jump', 'descend', 'sprint'] as const) {
      if (partial[k] !== undefined) this.held[k] = partial[k];
    }
  }

  /**
   * Snapshot + consume the input for one fixed step. Held movement merges the
   * live DOM key map with setInput overrides; queued edge actions are drained.
   * Multiple queued KeyF presses within one step net out by parity (each press
   * flips the mode, exactly like the prototype's per-keydown toggle).
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
    const mineClicks = this.mineQueue;
    const placeClicks = this.placeQueue;
    this.mineQueue = 0;
    this.placeQueue = 0;
    return { move, mineClicks, placeClicks };
  }
}
