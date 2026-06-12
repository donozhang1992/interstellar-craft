/**
 * Item catalog — GAME_DESIGN §5 (items), §7 (equipment), §12 (STACK_MAX).
 *
 * A typed const table the rest of M1 reads:
 *  - every §4 block is a placeable item with id `block:<blockId>`;
 *  - 12 non-block items: 3 tools (drills, §4 tier ladder), 4 equipment,
 *    2 consumables, 3 materials (fusion_igniter — §5 "Quest" — is kept as a
 *    'material' until a quest-item kind is needed).
 *
 * Recipes are NOT here (crafting/ task). Mining reads `toolTier` and
 * `blockItemId`; inventory reads `stackMax`.
 */
import { BlockId } from '../world/blocks';
import type { SolidBlockId } from '../world/blocks';

/** GAME_DESIGN §12: default stack size for everything that stacks. */
export const STACK_MAX = 64;

export type ItemKind = 'block' | 'tool' | 'equipment' | 'consumable' | 'material';

/** Drill tiers (GAME_DESIGN §4 tool ladder; 'hand' is the absence of a tool). */
export type ToolTier = 'mk1' | 'mk2' | 'plasma';

export interface ItemDef {
  readonly id: string;
  /** English UI name (GAME_DESIGN §10: all text English). */
  readonly displayName: string;
  readonly kind: ItemKind;
  /** Max per inventory slot — 1 for tools/equipment, STACK_MAX otherwise. */
  readonly stackMax: number;
  /** Tools only. */
  readonly toolTier?: ToolTier;
  /** Block items only: the block this item places. */
  readonly blockId?: SolidBlockId;
}

/* eslint-disable @typescript-eslint/naming-convention -- ids are data keys */
export const ITEMS = {
  // ── Placeable blocks (one per §4 row) ──────────────────────────────────
  'block:1': {
    id: 'block:1',
    displayName: 'Regolith',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.Regolith,
  },
  'block:2': {
    id: 'block:2',
    displayName: 'Rock',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.Rock,
  },
  'block:3': {
    id: 'block:3',
    displayName: 'Basalt',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.Basalt,
  },
  'block:4': {
    id: 'block:4',
    displayName: 'Crystal',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.Crystal,
  },
  'block:5': {
    id: 'block:5',
    displayName: 'Ice',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.Ice,
  },
  'block:6': {
    id: 'block:6',
    displayName: 'Lamp',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.Lamp,
  },
  'block:7': {
    id: 'block:7',
    displayName: 'Iron Ore',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.IronOre,
  },
  'block:8': {
    id: 'block:8',
    displayName: 'Copper Ore',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.CopperOre,
  },
  'block:9': {
    id: 'block:9',
    displayName: 'Hull',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.Hull,
  },
  'block:10': {
    id: 'block:10',
    displayName: 'Glass',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.Glass,
  },
  'block:11': {
    id: 'block:11',
    displayName: 'Antenna',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.Antenna,
  },
  'block:12': {
    id: 'block:12',
    displayName: 'Beacon Core',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.BeaconCore,
  },
  'block:13': {
    id: 'block:13',
    displayName: 'Launchpad',
    kind: 'block',
    stackMax: STACK_MAX,
    blockId: BlockId.Launchpad,
  },
  // ── Tools (§5; tier ladder §4) ─────────────────────────────────────────
  drill_mk1: {
    id: 'drill_mk1',
    displayName: 'Drill Mk1',
    kind: 'tool',
    stackMax: 1,
    toolTier: 'mk1',
  },
  drill_mk2: {
    id: 'drill_mk2',
    displayName: 'Drill Mk2',
    kind: 'tool',
    stackMax: 1,
    toolTier: 'mk2',
  },
  plasma_drill: {
    id: 'plasma_drill',
    displayName: 'Plasma Drill',
    kind: 'tool',
    stackMax: 1,
    toolTier: 'plasma',
  },
  // ── Equipment (§5/§7) ──────────────────────────────────────────────────
  scanner: { id: 'scanner', displayName: 'Scanner', kind: 'equipment', stackMax: 1 },
  jump_pack: { id: 'jump_pack', displayName: 'Jump Pack', kind: 'equipment', stackMax: 1 },
  magnet_glove: { id: 'magnet_glove', displayName: 'Magnet Glove', kind: 'equipment', stackMax: 1 },
  solar_panel: { id: 'solar_panel', displayName: 'Solar Panel', kind: 'equipment', stackMax: 1 },
  // ── Consumables (§5) ───────────────────────────────────────────────────
  o2_canister: {
    id: 'o2_canister',
    displayName: 'O₂ Canister',
    kind: 'consumable',
    stackMax: STACK_MAX,
  },
  flare: { id: 'flare', displayName: 'Flare', kind: 'consumable', stackMax: STACK_MAX },
  // ── Materials (§5; fusion_igniter is the §5 "Quest" item) ──────────────
  iron_plate: {
    id: 'iron_plate',
    displayName: 'Iron Plate',
    kind: 'material',
    stackMax: STACK_MAX,
  },
  hull_plate: {
    id: 'hull_plate',
    displayName: 'Hull Plate',
    kind: 'material',
    stackMax: STACK_MAX,
  },
  fusion_igniter: {
    id: 'fusion_igniter',
    displayName: 'Fusion Igniter',
    kind: 'material',
    stackMax: STACK_MAX,
  },
} as const satisfies Record<string, ItemDef>;
/* eslint-enable @typescript-eslint/naming-convention */

/** Every valid item id (compile-time union of the table keys). */
export type ItemId = keyof typeof ITEMS;

/** Runtime guard for strings from saves/UI. */
export function isItemId(id: string): id is ItemId {
  return Object.prototype.hasOwnProperty.call(ITEMS, id);
}

/** Look up an item definition; throws RangeError on an unknown id. */
export function getItem(id: ItemId): ItemDef {
  const def = (ITEMS as Record<string, ItemDef>)[id];
  if (def === undefined) throw new RangeError(`unknown item id: ${id}`);
  return def;
}

/** The placeable-item id for a block (`block:<id>`). */
export function blockItemId(block: SolidBlockId): ItemId {
  return `block:${block}` as ItemId;
}
