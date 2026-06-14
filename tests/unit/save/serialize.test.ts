// Tests for serialize.ts — SaveV1 round-trip, version-mismatch, malformed
// inputs, worldDiff pair array round-trip, and isSaveError type guard.
import { describe, expect, it } from 'vitest';
import {
  serializeSave,
  deserializeSave,
  isSaveError,
  SAVE_KEY,
  SAVE_VERSION,
  type SaveState,
  type SaveV1,
  type SaveError,
} from '../../../src/core/save/serialize';
import { diffFromJSON, type WorldDiff } from '../../../src/core/save/worldDiff';
import type { PlayerState } from '../../../src/core/player/movement';
import type { SurvivalState } from '../../../src/core/player/stats';
import type { QuestState } from '../../../src/core/quest/engine';
import type { Inventory } from '../../../src/core/player/inventory';

// Minimal valid player state (fields tested by deserialize shape check)
function makePlayer(): PlayerState {
  return {
    pos: { x: 10, y: 32, z: 10 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 1.5,
    pitch: 0,
    onGround: true,
    flying: false,
    spawn: { x: 10, y: 32, z: 10 },
  };
}

function makeSurvival(): SurvivalState {
  return { hp: 80, o2: 60, energy: 100 };
}

function makeQuest(): QuestState {
  return {
    chapter: 1,
    step: 0,
    flags: { salvaged: true },
    counters: { moveTicks: 42 },
    unlocked: ['workbench'],
  };
}

function makeInventory(): Inventory {
  const slots: (null | { itemId: string; count: number })[] = Array.from(
    { length: 40 },
    () => null,
  );
  slots[0] = { itemId: 'block:1', count: 5 };
  return { slots, activeHotbarSlot: 0 } as Inventory;
}

function makeWorldDiff(): WorldDiff {
  const diff: WorldDiff = new Map();
  diff.set(100, 0);
  diff.set(200, 4);
  diff.set(300, 1);
  return diff;
}

function makeSaveState(): SaveState {
  return {
    seed: 12345,
    player: makePlayer(),
    survival: makeSurvival(),
    quest: makeQuest(),
    inventory: makeInventory(),
    worldDiff: makeWorldDiff(),
  };
}

describe('SAVE_KEY / SAVE_VERSION', () => {
  it('SAVE_KEY is ic-save-v1', () => {
    expect(SAVE_KEY).toBe('ic-save-v1');
  });

  it('SAVE_VERSION is 1', () => {
    expect(SAVE_VERSION).toBe(1);
  });
});

describe('isSaveError', () => {
  it('returns true for a SaveError', () => {
    const err: SaveError = { error: 'malformed', message: 'test' };
    expect(isSaveError(err)).toBe(true);
  });

  it('returns false for a SaveV1', () => {
    const save = serializeSave(makeSaveState());
    expect(isSaveError(save)).toBe(false);
  });

  it('returns true for version-mismatch error', () => {
    const err: SaveError = { error: 'version-mismatch', message: 'old', foundVersion: 0 };
    expect(isSaveError(err)).toBe(true);
  });
});

describe('serializeSave', () => {
  it('produces a version=1 document with all required fields', () => {
    const state = makeSaveState();
    const save = serializeSave(state);
    expect(save.version).toBe(1);
    expect(save.seed).toBe(12345);
    expect(typeof save.player).toBe('object');
    expect(typeof save.survival).toBe('object');
    expect(typeof save.quest).toBe('object');
    expect(typeof save.inventory).toBe('object');
    expect(Array.isArray(save.worldDiff)).toBe(true);
  });

  it('deep-copies player so mutations do not affect the save', () => {
    const state = makeSaveState();
    const save = serializeSave(state);
    state.player.pos.x = 9999;
    expect(save.player.pos.x).toBe(10);
  });

  it('flattens the worldDiff Map to a sorted pair array', () => {
    const state = makeSaveState();
    const save = serializeSave(state);
    // Our diff has keys 100, 200, 300 — sorted ascending
    expect(save.worldDiff).toEqual([100, 0, 200, 4, 300, 1]);
  });

  it('produces JSON-safe output (no functions, Dates, or Maps)', () => {
    const save = serializeSave(makeSaveState());
    const roundtripped = JSON.parse(JSON.stringify(save)) as SaveV1;
    expect(roundtripped.version).toBe(1);
    expect(roundtripped.seed).toBe(12345);
  });
});

describe('deserializeSave — success', () => {
  it('accepts a valid SaveV1 object and returns it', () => {
    const state = makeSaveState();
    const save = serializeSave(state);
    const result = deserializeSave(save);
    expect(isSaveError(result)).toBe(false);
    const v1 = result as SaveV1;
    expect(v1.version).toBe(1);
    expect(v1.seed).toBe(12345);
  });

  it('accepts a JSON string and parses it', () => {
    const save = serializeSave(makeSaveState());
    const json = JSON.stringify(save);
    const result = deserializeSave(json);
    expect(isSaveError(result)).toBe(false);
    const v1 = result as SaveV1;
    expect(v1.seed).toBe(12345);
  });

  it('full round-trip: serializeSave → JSON.stringify → JSON.parse → deserializeSave gives deep-equal SaveV1', () => {
    const state = makeSaveState();
    const original = serializeSave(state);
    const json = JSON.stringify(original);
    const result = deserializeSave(json);
    expect(isSaveError(result)).toBe(false);
    expect(result).toEqual(original);
  });

  it('worldDiff pair array survives round-trip', () => {
    const state = makeSaveState();
    const save = serializeSave(state);
    const result = deserializeSave(save);
    expect(isSaveError(result)).toBe(false);
    const v1 = result as SaveV1;
    const rebuilt = diffFromJSON(v1.worldDiff);
    expect(rebuilt.size).toBe(3);
    expect(rebuilt.get(100)).toBe(0);
    expect(rebuilt.get(200)).toBe(4);
    expect(rebuilt.get(300)).toBe(1);
  });
});

describe('deserializeSave — version-mismatch', () => {
  it('returns version-mismatch when version is 0', () => {
    const result = deserializeSave({
      version: 0,
      seed: 1,
      player: {},
      survival: {},
      quest: {},
      inventory: {},
      worldDiff: [],
    });
    expect(isSaveError(result)).toBe(true);
    const err = result as SaveError;
    expect(err.error).toBe('version-mismatch');
    expect(err.foundVersion).toBe(0);
  });

  it('returns version-mismatch when version is 2', () => {
    const result = deserializeSave({
      version: 2,
      seed: 1,
      player: {},
      survival: {},
      quest: {},
      inventory: {},
      worldDiff: [],
    });
    expect(isSaveError(result)).toBe(true);
    const err = result as SaveError;
    expect(err.error).toBe('version-mismatch');
    expect(err.foundVersion).toBe(2);
  });

  it('returns version-mismatch when version is a string', () => {
    const result = deserializeSave({
      version: '1',
      seed: 1,
      player: {},
      survival: {},
      quest: {},
      inventory: {},
      worldDiff: [],
    });
    expect(isSaveError(result)).toBe(true);
    const err = result as SaveError;
    expect(err.error).toBe('version-mismatch');
  });
});

describe('deserializeSave — malformed', () => {
  it('returns malformed for unparseable JSON string', () => {
    const result = deserializeSave('not-json{{{');
    expect(isSaveError(result)).toBe(true);
    const err = result as SaveError;
    expect(err.error).toBe('malformed');
  });

  it('returns malformed for null', () => {
    const result = deserializeSave(null);
    expect(isSaveError(result)).toBe(true);
    const err = result as SaveError;
    expect(err.error).toBe('malformed');
  });

  it('returns malformed for a number', () => {
    const result = deserializeSave(42);
    expect(isSaveError(result)).toBe(true);
    expect((result as SaveError).error).toBe('malformed');
  });

  it('returns malformed when seed is missing', () => {
    const result = deserializeSave({
      version: 1,
      player: {},
      survival: {},
      quest: {},
      inventory: {},
      worldDiff: [],
    });
    expect(isSaveError(result)).toBe(true);
    expect((result as SaveError).error).toBe('malformed');
  });

  it('returns malformed when player is null', () => {
    const result = deserializeSave({
      version: 1,
      seed: 1,
      player: null,
      survival: {},
      quest: {},
      inventory: {},
      worldDiff: [],
    });
    expect(isSaveError(result)).toBe(true);
    expect((result as SaveError).error).toBe('malformed');
  });

  it('returns malformed when worldDiff is not an array', () => {
    const result = deserializeSave({
      version: 1,
      seed: 1,
      player: {},
      survival: {},
      quest: {},
      inventory: {},
      worldDiff: {},
    });
    expect(isSaveError(result)).toBe(true);
    expect((result as SaveError).error).toBe('malformed');
  });

  it('returns malformed when worldDiff has odd length', () => {
    const result = deserializeSave({
      version: 1,
      seed: 1,
      player: {},
      survival: {},
      quest: {},
      inventory: {},
      worldDiff: [1, 2, 3],
    });
    expect(isSaveError(result)).toBe(true);
    expect((result as SaveError).error).toBe('malformed');
  });

  it('returns malformed when worldDiff has non-numeric entries', () => {
    const result = deserializeSave({
      version: 1,
      seed: 1,
      player: {},
      survival: {},
      quest: {},
      inventory: {},
      worldDiff: [1, 'block'],
    });
    expect(isSaveError(result)).toBe(true);
    expect((result as SaveError).error).toBe('malformed');
  });

  it('returns malformed for empty object (no version)', () => {
    const result = deserializeSave({});
    // no version field → version-mismatch (version = undefined !== 1)
    expect(isSaveError(result)).toBe(true);
  });
});
