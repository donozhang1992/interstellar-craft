// Spec: GAME_DESIGN §5 (items), §7 (equipment), §12 (STACK_MAX = 64).
// The catalog is data the M1 crafting/mining tasks read: every block is a
// placeable item (`block:<id>`), plus the 12 non-block items of §5/§7.
import { describe, expect, it } from 'vitest';
import { blockItemId, getItem, isItemId, ITEMS, STACK_MAX } from '../../../src/core/items/catalog';
import type { ItemDef } from '../../../src/core/items/catalog';
import { BLOCKS } from '../../../src/core/world/blocks';
import type { BlockDef } from '../../../src/core/world/blocks';

const all = Object.values(ITEMS) as ItemDef[];

describe('item catalog', () => {
  it('every table key equals its entry id', () => {
    for (const [key, def] of Object.entries(ITEMS)) expect((def as ItemDef).id).toBe(key);
  });

  it('contains one block item per §4 block, kind=block, named after the block', () => {
    const blocks = Object.values(BLOCKS) as BlockDef[];
    expect(blocks).toHaveLength(13);
    for (const b of blocks) {
      const id = blockItemId(b.id);
      expect(id).toBe(`block:${b.id}`);
      const def = getItem(id);
      expect(def.kind).toBe('block');
      expect(def.blockId).toBe(b.id);
      expect(def.stackMax).toBe(STACK_MAX);
      expect(def.displayName.length).toBeGreaterThan(0);
    }
    expect(all.filter((d) => d.kind === 'block')).toHaveLength(13);
  });

  it('defines the three drills as tools with the §4 tier ladder', () => {
    expect(getItem('drill_mk1')).toMatchObject({ kind: 'tool', toolTier: 'mk1', stackMax: 1 });
    expect(getItem('drill_mk2')).toMatchObject({ kind: 'tool', toolTier: 'mk2', stackMax: 1 });
    expect(getItem('plasma_drill')).toMatchObject({
      kind: 'tool',
      toolTier: 'plasma',
      stackMax: 1,
    });
    expect(all.filter((d) => d.kind === 'tool')).toHaveLength(3);
  });

  it('defines the §5/§7 equipment, all stackMax 1', () => {
    for (const id of ['scanner', 'jump_pack', 'magnet_glove', 'solar_panel'] as const) {
      expect(getItem(id)).toMatchObject({ kind: 'equipment', stackMax: 1 });
    }
    expect(all.filter((d) => d.kind === 'equipment')).toHaveLength(4);
  });

  it('defines consumables and materials, stackMax 64', () => {
    for (const id of ['o2_canister', 'flare'] as const) {
      expect(getItem(id)).toMatchObject({ kind: 'consumable', stackMax: STACK_MAX });
    }
    for (const id of ['iron_plate', 'hull_plate', 'fusion_igniter'] as const) {
      expect(getItem(id)).toMatchObject({ kind: 'material', stackMax: STACK_MAX });
    }
  });

  it('is exactly 13 block + 12 non-block items', () => {
    expect(all).toHaveLength(25);
  });

  it('only tools carry a toolTier', () => {
    for (const def of all) {
      if (def.kind === 'tool') expect(def.toolTier).toBeDefined();
      else expect(def.toolTier).toBeUndefined();
    }
  });

  it('only block items carry a blockId', () => {
    for (const def of all) {
      if (def.kind === 'block') expect(def.blockId).toBeDefined();
      else expect(def.blockId).toBeUndefined();
    }
  });

  it('stackMax is 1 for tools/equipment and STACK_MAX=64 for everything else (§12)', () => {
    expect(STACK_MAX).toBe(64);
    for (const def of all) {
      expect(def.stackMax).toBe(def.kind === 'tool' || def.kind === 'equipment' ? 1 : 64);
    }
  });

  it('isItemId guards runtime strings; getItem throws on unknown ids', () => {
    expect(isItemId('block:1')).toBe(true);
    expect(isItemId('drill_mk1')).toBe(true);
    expect(isItemId('block:0')).toBe(false); // air is not an item
    expect(isItemId('block:14')).toBe(false);
    expect(isItemId('warp_drive')).toBe(false);
    expect(() => getItem('warp_drive' as never)).toThrow(RangeError);
  });

  it('display names are English for non-block items', () => {
    expect(getItem('drill_mk1').displayName).toBe('Drill Mk1');
    expect(getItem('o2_canister').displayName).toBe('O₂ Canister');
    expect(getItem('fusion_igniter').displayName).toBe('Fusion Igniter');
  });
});
