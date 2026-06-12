// Spec: GAME_DESIGN §4 (13-block table — canonical). This test is the
// design-contract FREEZE: every §4 value is mirrored here as a literal.
// If this test and the doc disagree, the doc wins — update code, not the doc.
//
// IDs 1–6 are the M0 prototype blocks and are FROZEN (terrain snapshot hash
// depends on them); 7–13 are the M1 extension.
import { describe, expect, it } from 'vitest';
import { BLOCKS, BlockId, BLOCK_NAMES, isSolid } from '../../../src/core/world/blocks';
import type { BlockDef } from '../../../src/core/world/blocks';

/** GAME_DESIGN §4, transcribed literally: [id, name, hardness(s), minTool, drops]. */
const GD4_TABLE: ReadonlyArray<
  [id: number, name: string, hardness: number, minTool: string, drops: number | null]
> = [
  [1, 'regolith', 0.6, 'hand', 1],
  [2, 'rock', 1.2, 'hand', 2],
  [3, 'basalt', 1.5, 'mk1', 3],
  [4, 'crystal', 3.5, 'mk2', 4],
  [5, 'ice', 0.8, 'hand', 5],
  [6, 'lamp', 1.0, 'mk1', 6],
  [7, 'iron_ore', 2.5, 'mk1', 7],
  [8, 'copper_ore', 2.0, 'mk1', 8],
  [9, 'hull', 2.0, 'mk1', 9],
  [10, 'glass', 0.5, 'hand', null], // glass breaks, drops nothing
  [11, 'antenna', 1.0, 'mk1', 11],
  [12, 'beacon_core', 4.0, 'mk2', 12],
  [13, 'launchpad', 4.0, 'mk2', 13],
];

describe('block table (GAME_DESIGN §4 contract)', () => {
  it('has exactly 13 entries with ids 1..13 and no air entry', () => {
    const ids = Object.values(BLOCKS)
      .map((b: BlockDef) => b.id)
      .sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(Object.keys(BLOCKS)).toHaveLength(13);
    expect((BLOCKS as Record<number, BlockDef>)[0]).toBeUndefined();
  });

  it.each(GD4_TABLE)(
    'id %i = %s: hardness %f s, minTool %s, drops %s (§4 row, literal)',
    (id, name, hardness, minTool, drops) => {
      const def = (BLOCKS as Record<number, BlockDef>)[id];
      expect(def).toBeDefined();
      expect(def!.id).toBe(id);
      expect(def!.name).toBe(name);
      expect(def!.hardness).toBe(hardness);
      expect(def!.minTool).toBe(minTool);
      expect(def!.drops).toBe(drops);
    },
  );

  it('keeps the frozen M0 enum values 0..6 (terrain snapshot depends on them)', () => {
    expect(BlockId.Air).toBe(0);
    expect(BlockId.Regolith).toBe(1);
    expect(BlockId.Rock).toBe(2);
    expect(BlockId.Basalt).toBe(3);
    expect(BlockId.Crystal).toBe(4);
    expect(BlockId.Ice).toBe(5);
    expect(BlockId.Lamp).toBe(6);
  });

  it('extends the enum with M1 ids 7..13', () => {
    expect(BlockId.IronOre).toBe(7);
    expect(BlockId.CopperOre).toBe(8);
    expect(BlockId.Hull).toBe(9);
    expect(BlockId.Glass).toBe(10);
    expect(BlockId.Antenna).toBe(11);
    expect(BlockId.BeaconCore).toBe(12);
    expect(BlockId.Launchpad).toBe(13);
  });

  it('keeps the frozen M0 display names for ids 1..6 and names every new id', () => {
    // FROZEN prototype display names (M0 parity) — do not change.
    expect(BLOCK_NAMES[BlockId.Regolith]).toBe('月壤');
    expect(BLOCK_NAMES[BlockId.Rock]).toBe('星岩');
    expect(BLOCK_NAMES[BlockId.Basalt]).toBe('玄武岩');
    expect(BLOCK_NAMES[BlockId.Crystal]).toBe('能量晶簇');
    expect(BLOCK_NAMES[BlockId.Ice]).toBe('寒冰');
    expect(BLOCK_NAMES[BlockId.Lamp]).toBe('聚变灯');
    for (let id = 7 as BlockId; id <= 13; id++) {
      expect(BLOCK_NAMES[id]).toBeTruthy();
    }
  });

  it('isSolid: air is not solid, all 13 block ids are (M0 behavior unchanged)', () => {
    expect(isSolid(BlockId.Air)).toBe(false);
    for (let id = 1; id <= 13; id++) expect(isSolid(id)).toBe(true);
  });
});
