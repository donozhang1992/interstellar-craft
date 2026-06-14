/**
 * Game settings — volume, mouse sensitivity, render scale (M5.2).
 *
 * Persisted to localStorage under key `ic-settings-v1` as JSON.
 * Loaded on startup; applied immediately to the live game state.
 *
 * Defaults: volume 1.0, mouseSens 1.0, renderScale 1.0.
 * Ranges: volume 0..1 (step 0.05), mouseSens 0.1..3.0 (step 0.1),
 *         renderScale in {0.5, 0.75, 1.0}.
 */

export interface GameSettings {
  /** Master volume 0..1. */
  volume: number;
  /** Mouse sensitivity multiplier 0.1..3.0. Applied to SENSITIVITY in input.ts. */
  mouseSens: number;
  /** Pixel ratio scale applied as devicePixelRatio * renderScale. */
  renderScale: number;
}

const STORAGE_KEY = 'ic-settings-v1';

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 1.0,
  mouseSens: 1.0,
  renderScale: 1.0,
};

/** Load settings from localStorage, falling back to defaults for missing fields. */
export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      volume: clampVolume(parsed.volume ?? DEFAULT_SETTINGS.volume),
      mouseSens: clampMouseSens(parsed.mouseSens ?? DEFAULT_SETTINGS.mouseSens),
      renderScale: clampRenderScale(parsed.renderScale ?? DEFAULT_SETTINGS.renderScale),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist settings to localStorage. */
export function saveSettings(s: GameSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clampVolume(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function clampMouseSens(v: number): number {
  return Math.max(0.1, Math.min(3.0, v));
}

export function clampRenderScale(v: number): number {
  // Nearest valid value: 0.5, 0.75, 1.0
  const valid = [0.5, 0.75, 1.0];
  return valid.reduce((best, cand) => (Math.abs(cand - v) < Math.abs(best - v) ? cand : best));
}
