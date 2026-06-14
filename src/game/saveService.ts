/**
 * Save service (M5.1) — game-layer wrapper over serialize.ts that handles
 * localStorage persistence and browser file I/O. Lives in src/game/ (not
 * src/core/) because it touches the DOM (localStorage, anchor/input elements).
 *
 * localStorage key: SAVE_KEY ('ic-save-v1')
 * File export: triggers a browser <a download> with the JSON text.
 * File import: creates a hidden <input type="file">, reads text, deserializes.
 */
import type { Game } from './loop';
import {
  serializeSave,
  deserializeSave,
  SAVE_KEY,
  type SaveV1,
  type SaveError,
} from '../core/save/serialize';

/** Serialize live game state and write to localStorage under SAVE_KEY. */
export function gameSave(game: Game): void {
  const save = serializeSave({
    seed: game.seed,
    player: game.player,
    survival: game.survival.state,
    quest: game.quest.state,
    inventory: game.inv,
    worldDiff: game.worldDiff,
  });
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

/** Read and deserialize the save from localStorage. Returns SaveV1 or SaveError. */
export function gameLoad(): SaveV1 | SaveError {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw === null) {
    return { error: 'malformed', message: 'no save found in localStorage' };
  }
  return deserializeSave(raw);
}

/** True if localStorage contains a save under SAVE_KEY. */
export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

/** Remove the save from localStorage. */
export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

/**
 * Trigger a browser download of the current save as a JSON file.
 * Creates a hidden <a download> anchor, fires a click, then removes it.
 */
export function exportSaveFile(game: Game): void {
  const save = serializeSave({
    seed: game.seed,
    player: game.player,
    survival: game.survival.state,
    quest: game.quest.state,
    inventory: game.inv,
    worldDiff: game.worldDiff,
  });
  const json = JSON.stringify(save, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'interstellar-craft-save.json';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open a file picker, read the selected file as text, and deserialize it.
 * Returns a promise resolving to SaveV1 or SaveError.
 * If the user cancels the picker, resolves to a malformed error.
 */
export function importSaveFile(): Promise<SaveV1 | SaveError> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        resolve({ error: 'malformed', message: 'no file selected' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        resolve(deserializeSave(text));
      };
      reader.onerror = () => {
        resolve({ error: 'malformed', message: 'failed to read file' });
      };
      reader.readAsText(file);
    };

    // If user cancels: focus event fires on window after the dialog closes
    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      // Give the input.onchange a chance to fire first (it fires after focus)
      setTimeout(() => {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
          resolve({ error: 'malformed', message: 'file picker cancelled' });
        }
      }, 300);
    };
    window.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    input.click();
  });
}
