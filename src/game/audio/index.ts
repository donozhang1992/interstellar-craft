/**
 * AudioManager (M5.3) — procedural sound effects synthesized at runtime via the
 * WebAudio API. No binary assets are shipped: every cue (mining tick, place
 * thock, O₂ low-warning heartbeat, quest-complete chime, ending cue, ambient
 * drone) is generated from oscillators / filtered noise + envelopes. This keeps
 * the footprint to a few hundred lines, ships zero asset bytes, and carries no
 * third-party license (see docs/CREDITS.md, GAME_DESIGN §11).
 *
 * GATING — robust + test-safe:
 *  - NO-OP under `window.__TEST__`: never constructs an AudioContext, so the
 *    headless e2e / visual baselines stay deterministic and silent (no audio
 *    device, no async audio graph, no console noise). `play()` etc. all return
 *    immediately and `audioState()` reports `{ ctxState: 'test' }`.
 *  - Autoplay policy: the AudioContext is created LAZILY on the first user
 *    gesture (`resume()` — called from a keydown/click handler in main.ts), not
 *    at construction. Until then nothing plays.
 *  - Muted by default: `muted` starts true; cues are silent until a real gesture
 *    flips it (resume() unmutes). The hooks (`muteAudio`, `setVolume`) let tests
 *    and the settings UI toggle/scale volume.
 *
 * The whole module is DOM-free except for the AudioContext itself; it imports no
 * three.js. It is only ever instantiated from the game layer (main.ts), never
 * from src/core.
 */

/** The named cues the game can request. */
export type CueName =
  | 'mine' // mining-completion tick
  | 'place' // block-placement thock
  | 'chime' // quest-complete / unlock chime
  | 'ending'; // beacon-ignition / ending cue

/** Snapshot returned by the `audio()` hook for tests + the settings UI. */
export interface AudioStateView {
  /** Master volume 0..1. */
  volume: number;
  /** True while muted (also true before the first user gesture). */
  muted: boolean;
  /** AudioContext.state, or 'uninitialized' before lazy init, or 'test' under __TEST__. */
  ctxState: 'test' | 'uninitialized' | AudioContextState;
  /** True while the O₂ low heartbeat loop is running. */
  heartbeat: boolean;
  /** True while the ambient drone loop is running. */
  drone: boolean;
}

/** Minimal structural type so we don't depend on lib.dom's exact AudioContext ctor. */
type AudioCtxCtor = new () => AudioContext;

function getAudioContextCtor(): AudioCtxCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioCtxCtor;
    webkitAudioContext?: AudioCtxCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class AudioManager {
  /** Lazily created on the first resume() (user gesture). Null = uninitialized. */
  private ctx: AudioContext | null = null;
  /** Master gain — all cues route through here; tracks volume + mute. */
  private master: GainNode | null = null;
  private volume = 0.6;
  /** Muted until the first user gesture (autoplay policy + opt-in feel). */
  private muted = true;
  /** True when this manager is a no-op (under __TEST__). */
  private readonly disabled: boolean;

  /** Active O₂ heartbeat loop handle (interval id via the ctx clock surrogate). */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** Active ambient-drone source nodes (so we can stop them). */
  private droneNodes: AudioNode[] = [];

  constructor() {
    this.disabled = typeof window !== 'undefined' && window.__TEST__ === true;
  }

  /**
   * Lazily create the AudioContext on a user gesture (autoplay policy) and
   * unmute. Safe to call repeatedly. No-op under __TEST__. Returns whether audio
   * is now live (ctx running + unmuted).
   */
  resume(): boolean {
    if (this.disabled) return false;
    if (!this.ctx) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return false;
      try {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        this.master = null;
        return false;
      }
    }
    // A suspended context (created before the gesture finished) resumes here.
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.muted = false;
    return this.ctx.state === 'running';
  }

  /** Set master volume 0..1. Applied immediately when a context exists. */
  setMasterVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.01);
    }
  }

  /** Mute / unmute. Muting also stops the looping cues (heartbeat/drone). */
  mute(on: boolean): void {
    this.muted = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0 : this.volume, this.ctx.currentTime, 0.01);
    }
    if (on) {
      this.stopHeartbeat();
      this.stopDrone();
    }
  }

  /** Snapshot for the `audio()` hook / settings UI. */
  state(): AudioStateView {
    return {
      volume: this.volume,
      muted: this.muted,
      ctxState: this.disabled ? 'test' : (this.ctx?.state ?? 'uninitialized'),
      heartbeat: this.heartbeatTimer !== null,
      drone: this.droneNodes.length > 0,
    };
  }

  /** True if a real AudioContext has been constructed (false under __TEST__). */
  get initialized(): boolean {
    return this.ctx !== null;
  }

  /**
   * Play a one-shot cue. No-op when disabled, uninitialized, or muted. Each cue
   * is a short synthesized envelope so there are no asset bytes.
   */
  play(name: CueName): void {
    if (!this.ready()) return;
    switch (name) {
      case 'mine':
        this.tick();
        break;
      case 'place':
        this.thock();
        break;
      case 'chime':
        this.chime();
        break;
      case 'ending':
        this.endingCue();
        break;
    }
  }

  /**
   * Start the O₂ low-warning heartbeat loop (a soft double-thump every ~1.1 s).
   * Idempotent — calling again while running is a no-op. Stops on muting or
   * stopHeartbeat(). Uses setInterval (the loop cadence is cosmetic, not the sim
   * clock); each beat is itself a precise ctx-scheduled envelope.
   */
  startHeartbeat(): void {
    if (!this.ready() || this.heartbeatTimer !== null) return;
    const beat = (): void => {
      if (!this.ready()) return;
      this.heartThump(0);
      this.heartThump(0.18); // the softer second thump
    };
    beat();
    this.heartbeatTimer = setInterval(beat, 1100);
  }

  /** Stop the O₂ heartbeat loop. Safe to call when not running. */
  stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Start the low ambient drone bed (a slow detuned organ-ish chord, GAME_DESIGN
   * §11 "Interstellar-organ-adjacent"). Idempotent. Loops until stopDrone()/mute.
   */
  startDrone(): void {
    if (!this.ready() || this.droneNodes.length > 0) return;
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(0.12, ctx.currentTime, 2.5); // slow fade-in
    bus.connect(this.master!);

    // A low root + a fifth + a slow-detuned octave for a hollow organ pad.
    const freqs = [55, 82.4, 110]; // A1, ~E2, A2
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07; // very slow shimmer
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = f * 0.006;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.connect(bus);
      osc.start();
      lfo.start();
      this.droneNodes.push(osc, lfo);
    }
    this.droneNodes.push(bus);
  }

  /** Stop the ambient drone (quick fade), releasing its nodes. */
  stopDrone(): void {
    if (this.droneNodes.length === 0) return;
    const ctx = this.ctx;
    for (const n of this.droneNodes) {
      if (n instanceof OscillatorNode) {
        try {
          n.stop(ctx ? ctx.currentTime + 0.3 : undefined);
        } catch {
          /* already stopped */
        }
      }
    }
    this.droneNodes = [];
  }

  /** True when a cue may actually sound: live, initialized, unmuted. */
  private ready(): boolean {
    return !this.disabled && this.ctx !== null && this.master !== null && !this.muted;
  }

  // ---- synth primitives (all route through master via the passed-in gain) ----

  /**
   * Schedule a tone with an exponential decay envelope. `freq` may sweep from
   * `freq` to `endFreq`. Returns nothing; the nodes self-clean via stop().
   */
  private blip(
    type: OscillatorType,
    freq: number,
    endFreq: number,
    peak: number,
    dur: number,
    when = 0,
  ): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== freq)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A short burst of filtered white noise (for the thock body). */
  private noiseBurst(peak: number, dur: number, cutoff: number, when = 0): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + when;
    const frames = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(lp).connect(g).connect(this.master!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Mining tick — a tight high click that drops in pitch. */
  private tick(): void {
    this.blip('square', 880, 440, 0.18, 0.05);
  }

  /** Block-place thock — a low woody noise body + a short sub. */
  private thock(): void {
    this.noiseBurst(0.25, 0.07, 1200);
    this.blip('sine', 180, 90, 0.2, 0.09);
  }

  /** Quest-complete / unlock chime — a quick bright major arpeggio. */
  private chime(): void {
    this.blip('triangle', 659.25, 659.25, 0.18, 0.18, 0); // E5
    this.blip('triangle', 783.99, 783.99, 0.18, 0.18, 0.08); // G5
    this.blip('triangle', 987.77, 987.77, 0.2, 0.3, 0.16); // B5
  }

  /** Ending cue — a swelling low->high organ-ish fifth (reused trailer mood). */
  private endingCue(): void {
    this.swell('sine', 110, 0.16, 1.6, 0);
    this.swell('sine', 164.81, 0.14, 1.6, 0.0); // a fifth above
    this.swell('triangle', 329.63, 0.1, 1.8, 0.4); // a high shimmer layer
  }

  /** A slow attack/release swell (for the ending). */
  private swell(type: OscillatorType, freq: number, peak: number, dur: number, when: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** One heartbeat thump — a soft low sine pulse. */
  private heartThump(when: number): void {
    this.blip('sine', 90, 55, 0.3, 0.16, when);
  }
}
