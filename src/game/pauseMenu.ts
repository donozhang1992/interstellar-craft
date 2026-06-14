/**
 * Pause menu + Settings panel (M5.2).
 *
 * Manages:
 *  - pause/resume game state (pauses sim, shows/hides #pause overlay)
 *  - pointer lock released on pause, re-acquired on resume
 *  - settings panel: volume, mouseSens, renderScale
 *  - localStorage persistence under 'ic-settings-v1'
 *
 * Called from main.ts; wired to the Esc keydown (edge-triggered).
 * All DOM manipulation is isolated here — no imports from core/.
 */
import type { Game } from './loop';
import type { InputController } from './input';
import { loadSettings, saveSettings, type GameSettings } from './settings';

export interface PauseMenuDeps {
  game: Game;
  input: InputController;
  renderer: import('three').WebGLRenderer;
  audio: { setMasterVolume(v: number): void };
  pauseEl: HTMLElement;
  settingsEl: HTMLElement;
}

export class PauseMenu {
  private _paused = false;
  private settings: GameSettings;
  private readonly deps: PauseMenuDeps;

  constructor(deps: PauseMenuDeps) {
    this.deps = deps;
    // Load settings from localStorage on construction (startup).
    this.settings = loadSettings();
    this._applyToRuntime();
    this._buildDOM();
  }

  /** Whether the game is currently paused. */
  isPaused(): boolean {
    return this._paused;
  }

  /**
   * Pause the game: freeze the sim, release pointer lock, show the menu.
   * Edge-safe: calling pause() while already paused is a no-op.
   */
  pause(): void {
    if (this._paused) return;
    this._paused = true;
    this.deps.game.paused = true;
    // Release pointer lock — per GAME_DESIGN §10 / TECH_SPEC §8.
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.deps.pauseEl.classList.add('open');
    // Hide title overlay (if visible) while pause menu is shown.
    this.deps.input.uiOpen = true;
    this.deps.input.syncTitleOverlay();
  }

  /**
   * Resume the game: unfreeze the sim, hide the menu, request pointer lock.
   * Edge-safe: calling resume() while already running is a no-op.
   */
  resume(): void {
    if (!this._paused) return;
    this._paused = false;
    this.deps.game.paused = false;
    this.deps.pauseEl.classList.remove('open');
    this.deps.settingsEl.classList.remove('open');
    this.deps.input.uiOpen = false;
    this.deps.input.syncTitleOverlay();
    // Re-acquire pointer lock.
    this.deps.input.requestLock();
  }

  /** Toggle pause/resume (used by Esc key handler). */
  toggle(): void {
    if (this._paused) this.resume();
    else this.pause();
  }

  /** Get a snapshot of the current settings. */
  getSettings(): GameSettings {
    return { ...this.settings };
  }

  /** Apply new settings, persist to localStorage, and push to runtime. */
  applySettings(s: Partial<GameSettings>): void {
    if (s.volume !== undefined) this.settings.volume = Math.max(0, Math.min(1, s.volume));
    if (s.mouseSens !== undefined)
      this.settings.mouseSens = Math.max(0.1, Math.min(3.0, s.mouseSens));
    if (s.renderScale !== undefined) {
      const valid = [0.5, 0.75, 1.0];
      this.settings.renderScale = valid.reduce((best, cand) =>
        Math.abs(cand - s.renderScale!) < Math.abs(best - s.renderScale!) ? cand : best,
      );
    }
    saveSettings(this.settings);
    this._applyToRuntime();
    this._refreshSettingsUI();
  }

  /** Push the in-memory settings to the actual runtime systems. */
  private _applyToRuntime(): void {
    const { settings, deps } = this;
    // Volume -> audio manager (M5.3 hook).
    deps.audio.setMasterVolume(settings.volume);
    // Mouse sensitivity -> InputController.
    deps.input.setSensitivity(settings.mouseSens);
    // Render scale -> renderer pixel ratio.
    deps.renderer.setPixelRatio(window.devicePixelRatio * settings.renderScale);
  }

  /** Build pause-menu and settings-panel DOM children (called once at construction). */
  private _buildDOM(): void {
    const { pauseEl, settingsEl } = this.deps;

    // --- Pause menu buttons ---
    pauseEl.innerHTML = `
      <div class="pause-panel">
        <h2 class="pause-title">PAUSED</h2>
        <button class="pause-btn" id="pause-resume">RESUME</button>
        <button class="pause-btn" id="pause-settings">SETTINGS</button>
        <button class="pause-btn" id="pause-quit">SAVE &amp; QUIT</button>
      </div>
    `;

    document.getElementById('pause-resume')?.addEventListener('click', () => this.resume());
    document
      .getElementById('pause-settings')
      ?.addEventListener('click', () => settingsEl.classList.toggle('open'));
    document.getElementById('pause-quit')?.addEventListener('click', () => {
      // Save and reload to title (GAME_DESIGN §10: "Save & Quit").
      this.deps.game.paused = false; // allow save to run cleanly
      window.__game?.save?.();
      location.reload();
    });

    // --- Settings panel ---
    settingsEl.innerHTML = `
      <div class="settings-panel">
        <h2 class="settings-title">SETTINGS</h2>

        <label class="setting-row">
          <span class="setting-label">VOLUME</span>
          <input id="setting-volume" type="range" min="0" max="1" step="0.05"
                 value="${this.settings.volume}" class="setting-slider">
          <span class="setting-val" id="setting-volume-val">${Math.round(this.settings.volume * 100)}%</span>
        </label>

        <label class="setting-row">
          <span class="setting-label">MOUSE SENS</span>
          <input id="setting-mousesens" type="range" min="0.1" max="3.0" step="0.1"
                 value="${this.settings.mouseSens}" class="setting-slider">
          <span class="setting-val" id="setting-mousesens-val">${this.settings.mouseSens.toFixed(1)}</span>
        </label>

        <label class="setting-row">
          <span class="setting-label">RENDER SCALE</span>
          <select id="setting-renderscale" class="setting-select">
            <option value="0.5" ${this.settings.renderScale === 0.5 ? 'selected' : ''}>0.5&times;</option>
            <option value="0.75" ${this.settings.renderScale === 0.75 ? 'selected' : ''}>0.75&times;</option>
            <option value="1.0" ${this.settings.renderScale === 1.0 ? 'selected' : ''}>1.0&times;</option>
          </select>
        </label>

        <button class="pause-btn settings-close" id="settings-close">BACK</button>
      </div>
    `;

    // Wire settings controls.
    const volSlider = document.getElementById('setting-volume') as HTMLInputElement | null;
    const sensSlider = document.getElementById('setting-mousesens') as HTMLInputElement | null;
    const scaleSelect = document.getElementById('setting-renderscale') as HTMLSelectElement | null;

    volSlider?.addEventListener('input', () => {
      const v = parseFloat(volSlider.value);
      const valEl = document.getElementById('setting-volume-val');
      if (valEl) valEl.textContent = `${Math.round(v * 100)}%`;
      this.applySettings({ volume: v });
    });

    sensSlider?.addEventListener('input', () => {
      const v = parseFloat(sensSlider.value);
      const valEl = document.getElementById('setting-mousesens-val');
      if (valEl) valEl.textContent = v.toFixed(1);
      this.applySettings({ mouseSens: v });
    });

    scaleSelect?.addEventListener('change', () => {
      this.applySettings({ renderScale: parseFloat(scaleSelect.value) });
    });

    document.getElementById('settings-close')?.addEventListener('click', () => {
      settingsEl.classList.remove('open');
    });
  }

  /** Sync settings panel controls to the current in-memory settings values. */
  private _refreshSettingsUI(): void {
    const vol = document.getElementById('setting-volume') as HTMLInputElement | null;
    const sens = document.getElementById('setting-mousesens') as HTMLInputElement | null;
    const scale = document.getElementById('setting-renderscale') as HTMLSelectElement | null;

    if (vol) vol.value = String(this.settings.volume);
    const volVal = document.getElementById('setting-volume-val');
    if (volVal) volVal.textContent = `${Math.round(this.settings.volume * 100)}%`;

    if (sens) sens.value = String(this.settings.mouseSens);
    const sensVal = document.getElementById('setting-mousesens-val');
    if (sensVal) sensVal.textContent = this.settings.mouseSens.toFixed(1);

    if (scale) scale.value = String(this.settings.renderScale);
  }
}
