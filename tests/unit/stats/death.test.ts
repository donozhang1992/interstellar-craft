// Spec: GAME_DESIGN §6 (Death: respawn at pod, drop 50% of each stack) + §12
// (DEATH_DROP = 50% of each stack at death point, recoverable cache).
import { describe, expect, it } from 'vitest';
import { createInventory, give } from '../../../src/core/player/inventory';
import { computeDeathDrop, respawnState } from '../../../src/core/player/death';
import { createSurvivalState } from '../../../src/core/player/stats';

describe('computeDeathDrop — 50% of each stack (§12 DEATH_DROP), floor rounding', () => {
  it('drops floor(count/2) of a stackable item, keeps the rest', () => {
    const inv = createInventory();
    give(inv, 'block:1', 10); // → drop 5, keep 5
    const { drops, kept } = computeDeathDrop(inv);
    expect(drops).toContainEqual({ itemId: 'block:1', count: 5 });
    expect(kept).toContainEqual({ itemId: 'block:1', count: 5 });
  });

  it('odd counts floor: 7 → drop 3, keep 4', () => {
    const inv = createInventory();
    give(inv, 'block:1', 7);
    const { drops, kept } = computeDeathDrop(inv);
    expect(drops).toContainEqual({ itemId: 'block:1', count: 3 });
    expect(kept).toContainEqual({ itemId: 'block:1', count: 4 });
  });

  it('count 1 stackable → drop 0 (floored), keep 1; no zero-count entries emitted', () => {
    const inv = createInventory();
    give(inv, 'block:1', 1);
    const { drops, kept } = computeDeathDrop(inv);
    expect(drops).not.toContainEqual(expect.objectContaining({ itemId: 'block:1' }));
    expect(kept).toContainEqual({ itemId: 'block:1', count: 1 });
  });

  it('tools (stackMax 1) are KEPT, never dropped (decision: keep tools on death)', () => {
    const inv = createInventory();
    give(inv, 'drill_mk2', 1);
    const { drops, kept } = computeDeathDrop(inv);
    expect(drops).not.toContainEqual(expect.objectContaining({ itemId: 'drill_mk2' }));
    expect(kept).toContainEqual({ itemId: 'drill_mk2', count: 1 });
  });

  it('mixed inventory: stackables split, tools kept', () => {
    const inv = createInventory();
    give(inv, 'block:4', 12); // crystal → drop 6, keep 6
    give(inv, 'iron_plate', 5); // → drop 2, keep 3
    give(inv, 'drill_mk1', 1); // tool → keep all
    const { drops, kept } = computeDeathDrop(inv);
    expect(drops).toContainEqual({ itemId: 'block:4', count: 6 });
    expect(drops).toContainEqual({ itemId: 'iron_plate', count: 2 });
    expect(drops).not.toContainEqual(expect.objectContaining({ itemId: 'drill_mk1' }));
    expect(kept).toContainEqual({ itemId: 'block:4', count: 6 });
    expect(kept).toContainEqual({ itemId: 'iron_plate', count: 3 });
    expect(kept).toContainEqual({ itemId: 'drill_mk1', count: 1 });
  });

  it('does NOT mutate the inventory (pure read)', () => {
    const inv = createInventory();
    give(inv, 'block:1', 10);
    give(inv, 'drill_mk1', 1);
    const before = JSON.stringify(inv);
    computeDeathDrop(inv);
    expect(JSON.stringify(inv)).toBe(before);
  });

  it('drops + kept account for the full original count of each item', () => {
    const inv = createInventory();
    give(inv, 'block:1', 7);
    const { drops, kept } = computeDeathDrop(inv);
    const dropped = drops.filter((d) => d.itemId === 'block:1').reduce((a, b) => a + b.count, 0);
    const keptN = kept.filter((d) => d.itemId === 'block:1').reduce((a, b) => a + b.count, 0);
    expect(dropped + keptN).toBe(7);
  });

  it('empty inventory → no drops, no kept', () => {
    const inv = createInventory();
    expect(computeDeathDrop(inv)).toEqual({ drops: [], kept: [] });
  });

  it('multiple stacks of the same item are each split (two full stacks of 64)', () => {
    const inv = createInventory();
    give(inv, 'block:1', 128); // two slots of 64
    const { drops, kept } = computeDeathDrop(inv);
    const dropped = drops.filter((d) => d.itemId === 'block:1').reduce((a, b) => a + b.count, 0);
    const keptN = kept.filter((d) => d.itemId === 'block:1').reduce((a, b) => a + b.count, 0);
    expect(dropped).toBe(64); // 32 + 32
    expect(keptN).toBe(64);
  });
});

describe('respawnState (§6 respawn at pod with full stats)', () => {
  it('restores full hp/o2/energy to the §12 maxes', () => {
    const s = createSurvivalState();
    s.hp = 0;
    s.o2 = 3;
    s.energy = 12;
    expect(respawnState(s)).toEqual({ hp: 100, o2: 100, energy: 100 });
  });

  it('returns a fresh object (does not alias the input)', () => {
    const s = createSurvivalState();
    const r = respawnState(s);
    r.hp = 1;
    expect(s.hp).toBe(100);
  });
});
