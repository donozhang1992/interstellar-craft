/**
 * Capstone death-loop E2E (M2.4) — ONE cohesive survival arc, distinct from the
 * unit-y rate/edge checks in survival.spec.ts. Where survival.spec asserts each
 * mechanic in isolation (drain rate, refill rate, a forced-stat death, a single
 * cache recovery), THIS spec runs the whole loop end-to-end with NO forced HP/O₂
 * stat pokes during the lethal phase: the player descends into a cave, O₂ drains
 * at the DEEP rate purely from depth, runs the tank dry, then HP drains to 0 and
 * death fires — exactly the GAME_DESIGN §6 chain
 *   O₂ (deep 0.6/s) → 0  ⇒  HP (4/s) → 0  ⇒  death.
 * On death (§6/§12 ④) the player respawns at the pod with full stats and a
 * recoverable cache holds floor-50 % of each stack at the death point; walking
 * back within PICKUP_RADIUS recovers it. The spec also pins the CONSERVATION
 * invariant — inventory + outstanding cache counts equal the original totals at
 * every checkpoint (death only MOVES items into the cache, never creates or
 * destroys them).
 *
 * Driven only through the TECH_SPEC §3 hooks; `__TEST__` disables the rAF clock
 * so `stepFrames(n)` is the sole clock (NO waitForTimeout). Every number below is
 * a pure function of the steps taken at the §12 canonical rates.
 *
 * Spawn (seed 0x7e): world-centre column (48,48), surface y=30 ⇒ spawn pos y=32.
 * A deep cave pocket at feet (87,7,63) sits at eye-y 8.62 ≪ 28, so the deep O₂
 * drain applies and (being far from the pod, |Δ|≫O2_SAFE_RADIUS=4) nothing
 * refills.
 */
import { expect, test, type Page } from '@playwright/test';

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

test('capstone death loop: descend → O₂ starves → HP death → respawn+cache → recover, items conserved throughout', async ({
  page,
}) => {
  const res = await page.evaluate(() => {
    const g = window.__game!;

    // Total count of an item across the WHOLE inventory (hotbar + backpack).
    const inv = (id: string): number =>
      g.state!.inv.slots.reduce((n, s) => (s && s.itemId === id ? n + s.count : n), 0);
    // Total of an item still sitting in (un-recovered) death caches.
    const cached = (id: string): number =>
      g.caches!().reduce(
        (n, c) => n + c.items.reduce((m, it) => (it.itemId === id ? m + it.count : m), 0),
        0,
      );

    // A known stackable so the death drop produces a deterministic cache:
    // regolith ×12 ⇒ DEATH_DROP floor(12/2) = 6 dropped, 6 kept.
    const ITEM = 'block:1';
    g.give!(ITEM, 12);
    const original = inv(ITEM); // starter kit holds none of block:1 ⇒ exactly 12
    const checkpoints: { phase: string; inv: number; cache: number; total: number }[] = [];
    const snap = (phase: string) =>
      checkpoints.push({
        phase,
        inv: inv(ITEM),
        cache: cached(ITEM),
        total: inv(ITEM) + cached(ITEM),
      });
    snap('start');

    // ── Descend into the deep cave pocket and hover (fly so no fall damage
    //    masks the O₂→HP death chain). eye-y 8.62 ≪ 28 ⇒ DEEP drain. ──
    g.teleport!(87.5, 7, 63.5, 0, 0);
    g.setInput!({ toggleFly: true });
    g.stepFrames!(1);
    const deathPos = { ...g.state!.player.pos };
    const o2AtDepth = g.survival!().o2;

    // Drop the tank to a sliver so the unforced deep drain empties it in a known
    // window (no HP poke — HP must fall ONLY from the O₂=0 rule).
    g.setStat!('o2', 1); // 1 O₂; deep 0.6/s ⇒ empty in <2 s
    g.stepFrames!(120); // 2 s: O₂ crosses 0, then HP_O2ZERO 4/s starts draining
    const o2Drained = g.survival!().o2; // expect 0
    const hpFalling = g.survival!().hp; // < 100: HP is draining from O₂=0
    snap('o2-starving'); // still alive, items untouched

    // Let HP drain the rest of the way to 0 (4/s from ~<100 ⇒ ≤25 s); step a
    // generous 30 s so death definitely fires this window, then respawn runs.
    g.stepFrames!(30 * 60);
    // Snapshot respawn state + position as PRIMITIVES now — both g.survival() and
    // player.pos are LIVE references that the recover phase below mutates.
    const sNow = g.survival!();
    const respawn = { hp: sNow.hp, o2: sNow.o2, energy: sNow.energy };
    const pNow = g.state!.player.pos;
    const atPod = Math.hypot(pNow.x - 48.5, pNow.z - 48.5) < 0.001;
    snap('after-death'); // half moved into the cache

    const caches = g.caches!();
    // Capture as PRIMITIVES now — caches is a LIVE array the recover phase below
    // empties (collectCaches splices recovered caches out), so reading .length at
    // return time would see the post-recovery 0, not the post-death 1.
    const cacheCount = caches.length;
    const cacheAtDeath =
      caches.length === 1 &&
      Math.hypot(caches[0]!.pos.x - deathPos.x, caches[0]!.pos.z - deathPos.z) < 0.001;

    // ── Walk back to the death cache and recover it. Stand on the cache's
    //    ACTUAL position (read from the hook) so no deathPos-vs-cache rounding
    //    can keep us outside PICKUP_RADIUS; Survival.collectCaches() runs every
    //    fixed step, so a few steps within range empties it. ──
    const cpos = caches[0]!.pos;
    g.setInput!({ mine: false, forward: false }); // no held actions
    g.teleport!(cpos.x, cpos.y, cpos.z, 0, 0);
    g.stepFrames!(5);
    snap('after-recover');

    return {
      original,
      o2AtDepth,
      o2Drained,
      hpFalling,
      respawn,
      atPod,
      cacheCount,
      cacheAtDeath,
      checkpoints,
    };
  });

  // Depth drove the deep O₂ drain (started full at depth, > surface would lose).
  expect(res.o2AtDepth).toBeGreaterThan(99); // full tank on arrival
  // O₂ emptied purely from the deep drain, then HP began falling from the O₂=0 rule.
  expect(res.o2Drained).toBe(0);
  expect(res.hpFalling).toBeLessThan(100);
  expect(res.hpFalling).toBeGreaterThan(0); // still alive at the o2-starving snap

  // Death → respawn at the pod with FULL stats (§6 "respawn at pod").
  expect(res.respawn).toEqual({ hp: 100, o2: 100, energy: 100 });
  expect(res.atPod).toBe(true);

  // Exactly one recoverable cache, at the death position (§12 ④).
  expect(res.cacheCount).toBe(1);
  expect(res.cacheAtDeath).toBe(true);

  // ── Phase-by-phase ledger (§6/§12 DEATH_DROP = 50 % of each stack) ──
  const byPhase = Object.fromEntries(res.checkpoints.map((c) => [c.phase, c]));
  // start: all 12 in the inventory, none cached.
  expect(byPhase.start).toMatchObject({ inv: 12, cache: 0, total: 12 });
  // o2-starving: still pre-death, untouched.
  expect(byPhase['o2-starving']).toMatchObject({ inv: 12, cache: 0, total: 12 });
  // after-death: floor(12/2)=6 moved into the cache, 6 kept.
  expect(byPhase['after-death']).toMatchObject({ inv: 6, cache: 6, total: 12 });
  // after-recover: the cache's 6 returned to the inventory, cache emptied.
  expect(byPhase['after-recover']).toMatchObject({ inv: 12, cache: 0, total: 12 });

  // CONSERVATION: inv + cache == original at EVERY checkpoint (death only moves).
  for (const c of res.checkpoints) expect(c.total).toBe(res.original);
});
