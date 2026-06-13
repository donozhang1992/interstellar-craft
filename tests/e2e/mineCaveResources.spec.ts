/**
 * Cave-resource mineability E2E (M2.4) — closes the ROADMAP M2 exit criterion
 * "ore/lamp/crystal obtainable by mining (M1's give()-hook stand-in retired)".
 *
 * The M2.2 worldgen rework actually places iron/copper ore, cave crystal, and
 * cave-ceiling lamps in the seed-0x7e world (tests/unit/world/worldgen.test.ts
 * proves they EXIST). This spec proves they are RECOVERABLE BY MINING through
 * the real game loop: teleport to a worldgen-placed block, aim at it, hold-mine
 * with a tier that satisfies its min-tool, and assert (a) the voxel becomes air
 * and (b) the matching `block:<id>` item enters the live inventory. No give()
 * of the resource itself — only the drill (a tool) is granted, exactly the M3
 * progression (you mine the world for materials, you don't get handed them).
 *
 * Targets were located by sweeping raycasts over the generated world (the same
 * pure `raycastFromPlayer` the loop uses); each (block, stand-cell, yaw, pitch)
 * below is a deterministic clean hit at seed 0x7e:
 *   IronOre(7) hardness 2.5, min mk1 → 2.5/2 = 1.25 s = 75 steps
 *   Crystal(4) hardness 3.5, min mk2 → 3.5/4 = 0.875 s = 53 steps
 *   Lamp(6)    hardness 1.0, min mk1 → 1.0/2 = 0.5 s  = 30 steps
 * (GAME_DESIGN §4 mining matrix; §9 cave resources.) Stepped-clocked, no
 * waitForTimeout — `__TEST__` makes stepFrames the only clock.
 */
import { expect, test, type Page } from '@playwright/test';

interface MineTarget {
  label: string;
  block: { x: number; y: number; z: number };
  stand: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  drill: 'drill_mk1' | 'drill_mk2';
  /** block:<id> item the drop yields. */
  item: string;
  /** A generous step budget that exceeds the exact mining time. */
  steps: number;
}

const TARGETS: MineTarget[] = [
  {
    label: 'iron ore (id 7) at a cave wall',
    block: { x: 8, y: 9, z: 6 },
    stand: { x: 8, y: 9, z: 7 },
    yaw: 0.0,
    pitch: -0.9,
    drill: 'drill_mk1',
    item: 'block:7',
    steps: 90, // > 75
  },
  {
    label: 'cave crystal (id 4) adjacent to carved air',
    block: { x: 4, y: 7, z: 5 },
    stand: { x: 4, y: 7, z: 6 },
    yaw: 0.0,
    pitch: -0.9,
    drill: 'drill_mk2',
    item: 'block:4',
    steps: 70, // > 53
  },
  {
    label: 'cave-ceiling lamp (id 6)',
    block: { x: 30, y: 24, z: 87 },
    stand: { x: 31, y: 24, z: 87 },
    yaw: 0.85085,
    pitch: -0.9,
    drill: 'drill_mk1',
    item: 'block:6',
    steps: 45, // > 30
  },
];

async function bootTest(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__TEST__ = true;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.READY === true, undefined, { timeout: 3000 });
}

test.beforeEach(async ({ page }) => {
  await bootTest(page);
});

for (const t of TARGETS) {
  test(`mining ${t.label} yields its item (worldgen, not give())`, async ({ page }) => {
    const res = await page.evaluate((tt) => {
      const g = window.__game!;
      const world = g.state!.world;
      const count = (id: string) =>
        g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);

      // The resource is placed by worldgen — confirm it's there BEFORE mining,
      // and that we did NOT give() ourselves the item.
      const blockBefore = world.getBlock(tt.block.x, tt.block.y, tt.block.z);
      const itemBefore = count(tt.item);

      // Grant only the DRILL (a tool), select its slot, aim, and hold-mine.
      const overflow = g.give!(tt.drill, 1); // → first empty slot after starter kit
      // find the slot the drill landed in
      let drillSlot = -1;
      for (let i = 0; i < g.state!.inv.slots.length; i++) {
        const s = g.state!.inv.slots[i];
        if (s && s.itemId === tt.drill) {
          drillSlot = i;
          break;
        }
      }
      g.teleport!(tt.stand.x + 0.5, tt.stand.y, tt.stand.z + 0.5, tt.yaw, tt.pitch);
      g.setInput!({ toggleFly: true, slot: drillSlot }); // fly-hover, hold no fall
      g.stepFrames!(1);
      g.setInput!({ mine: true });
      g.stepFrames!(tt.steps);
      g.setInput!({ mine: false });

      return {
        overflow,
        drillSlot,
        blockBefore,
        blockAfter: world.getBlock(tt.block.x, tt.block.y, tt.block.z),
        itemBefore,
        itemAfter: count(tt.item),
      };
    }, t);

    // The resource was a worldgen block, and we never give()'d the item itself
    // (only the drill, a tool). Note the M1 starter kit DOES stock some ores
    // (iron×8/copper×8), so assert the +1 DELTA from mining rather than a zero
    // baseline — this still proves the drop came from the mined voxel.
    const expectedId = Number(t.item.split(':')[1]);
    expect(res.overflow).toBe(0); // the drill fit
    expect(res.drillSlot).toBeGreaterThanOrEqual(0);
    expect(res.blockBefore).toBe(expectedId); // worldgen placed this resource here
    // Mining removed the voxel and exactly one drop entered the inventory.
    expect(res.blockAfter).toBe(0); // mined away to air
    expect(res.itemAfter).toBe(res.itemBefore + 1); // exactly one drop recovered
  });
}
