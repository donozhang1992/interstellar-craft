/**
 * Save serialization (TECH_SPEC §4) — pure, no three.js / DOM / clock.
 *
 * Canonical on-disk shape `SaveV1`:
 *   { version: 1, seed, player, survival, quest, inventory, worldDiff }
 * where `worldDiff` is the sparse `[index, blockId, …]` pair array (worldDiff.ts),
 * NEVER the full world. `serializeSave` deep-copies live core state into a plain
 * JSON-safe object; `deserializeSave` parses + validates a version-1 document and
 * returns either the `SaveV1` or a typed `{ error }` (the caller offers a reset on
 * a version mismatch / malformed input — MVP migration policy).
 *
 * Round-trip determinism: serialize → JSON.stringify → JSON.parse → deserialize
 * yields a value deep-equal to the original SaveV1 (the worldDiff pair array is
 * index-sorted, so identical edits stringify byte-identically regardless of the
 * Map's insertion order).
 */
import type { PlayerState } from '../player/movement';
import type { SurvivalState } from '../player/stats';
import type { QuestState } from '../quest/engine';
import type { Inventory } from '../player/inventory';
import { diffFromJSON, diffToJSON, type WorldDiff, type WorldDiffJSON } from './worldDiff';

/** The current save format version. Bump on any breaking shape change. */
export const SAVE_VERSION = 1 as const;

/** The localStorage key for the active save slot (TECH_SPEC §4). */
export const SAVE_KEY = 'ic-save-v1';

/** Live game state gathered for a save (references; serialize deep-copies them). */
export interface SaveState {
  seed: number;
  player: PlayerState;
  survival: SurvivalState;
  quest: QuestState;
  inventory: Inventory;
  worldDiff: WorldDiff;
}

/** The canonical version-1 save document (plain, JSON-safe data). */
export interface SaveV1 {
  version: typeof SAVE_VERSION;
  seed: number;
  player: PlayerState;
  survival: SurvivalState;
  quest: QuestState;
  inventory: Inventory;
  /** Sparse edited-voxel pairs `[index, blockId, …]` (worldDiff.ts). */
  worldDiff: WorldDiffJSON;
}

/** A typed deserialize failure (caller offers a reset). */
export interface SaveError {
  error: 'version-mismatch' | 'malformed';
  /** Human-readable detail for logging / a reset prompt. */
  message: string;
  /** The version we found, when readable (version-mismatch only). */
  foundVersion?: unknown;
}

/** Type guard: a deserialize result that is the error branch. */
export function isSaveError(r: SaveV1 | SaveError): r is SaveError {
  return (r as SaveError).error !== undefined;
}

/** Deep structured copy via JSON (state here is plain data — no functions/Dates). */
function deepCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Build a `SaveV1` from live core state. Deep-copies player/survival/quest/
 * inventory so the snapshot is decoupled from ongoing mutation, and flattens the
 * worldDiff Map to its index-sorted pair array (stable serialization).
 */
export function serializeSave(state: SaveState): SaveV1 {
  return {
    version: SAVE_VERSION,
    seed: state.seed,
    player: deepCopy(state.player),
    survival: deepCopy(state.survival),
    quest: deepCopy(state.quest),
    inventory: deepCopy(state.inventory),
    worldDiff: diffToJSON(state.worldDiff),
  };
}

/**
 * Parse + validate a save document. Accepts either a JSON string or an
 * already-parsed object. Returns the `SaveV1` on success, or a typed `SaveError`
 * (`'version-mismatch'` when the version field isn't 1, `'malformed'` when the
 * JSON is unparseable or the required fields are missing/ill-typed).
 */
export function deserializeSave(input: string | unknown): SaveV1 | SaveError {
  let obj: unknown = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input);
    } catch {
      return { error: 'malformed', message: 'save JSON is not parseable' };
    }
  }
  if (typeof obj !== 'object' || obj === null) {
    return { error: 'malformed', message: 'save is not an object' };
  }
  const o = obj as Record<string, unknown>;

  if (o.version !== SAVE_VERSION) {
    return {
      error: 'version-mismatch',
      message: `unsupported save version ${String(o.version)} (expected ${SAVE_VERSION})`,
      foundVersion: o.version,
    };
  }

  if (
    typeof o.seed !== 'number' ||
    typeof o.player !== 'object' ||
    o.player === null ||
    typeof o.survival !== 'object' ||
    o.survival === null ||
    typeof o.quest !== 'object' ||
    o.quest === null ||
    typeof o.inventory !== 'object' ||
    o.inventory === null ||
    !Array.isArray(o.worldDiff)
  ) {
    return { error: 'malformed', message: 'save is missing or has ill-typed required fields' };
  }

  // worldDiff must be an even-length numeric pair array.
  const diff = o.worldDiff as unknown[];
  if (diff.length % 2 !== 0 || diff.some((n) => typeof n !== 'number')) {
    return { error: 'malformed', message: 'worldDiff is not an even-length number array' };
  }

  return {
    version: SAVE_VERSION,
    seed: o.seed,
    player: o.player as PlayerState,
    survival: o.survival as SurvivalState,
    quest: o.quest as QuestState,
    inventory: o.inventory as Inventory,
    worldDiff: o.worldDiff as WorldDiffJSON,
  };
}

/** Rebuild the live worldDiff Map from a deserialized SaveV1 (convenience). */
export function saveWorldDiff(save: SaveV1): WorldDiff {
  return diffFromJSON(save.worldDiff);
}
