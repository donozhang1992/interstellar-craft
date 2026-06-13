// Spec: GAME_DESIGN §6 (Player Attributes) + §12 (Survival constants block,
// CANONICAL 2026-06-13). Fixed dt = 1/60 (movement.ts FIXED_DT). All numeric
// expectations cite §12 literals.
import { describe, expect, it } from 'vitest';
import {
  applyFallDamage,
  createSurvivalState,
  isDead,
  stepSurvival,
} from '../../../src/core/player/stats';
import type { StepParams, SurvivalState } from '../../../src/core/player/stats';

const DT = 1 / 60;

/** Default environment: surface, away from pod, idle. Override per test. */
function env(over: Partial<StepParams> = {}): StepParams {
  return {
    depthY: 40,
    nearPod: false,
    mining: false,
    miningDrillTier: 'hand',
    jumpPackActive: false,
    solarInRange: false,
    ...over,
  };
}

/** Run n fixed steps with the same params (game loop drives one dt per frame). */
function steps(s: SurvivalState, p: StepParams, n: number): void {
  for (let i = 0; i < n; i++) stepSurvival(s, p, DT);
}

describe('createSurvivalState', () => {
  it('starts at the §12 maxes (HP_MAX/O2_MAX/ENERGY_MAX = 100)', () => {
    expect(createSurvivalState()).toEqual({ hp: 100, o2: 100, energy: 100 });
  });
  it('returns a fresh object each call (no shared mutable state)', () => {
    const a = createSurvivalState();
    const b = createSurvivalState();
    a.hp = 1;
    expect(b.hp).toBe(100);
  });
});

describe('O2 drain — surface vs deep (§12 O2_SURFACE 0.25/s, O2_DEEP 0.6/s, depth y<28)', () => {
  it('surface drains 0.25/s → after 60 steps (1 s) o2 = 99.75', () => {
    const s = createSurvivalState();
    steps(s, env({ depthY: 40 }), 60);
    expect(s.o2).toBeCloseTo(99.75, 10);
  });
  it('deep (y < 28) drains 0.6/s → after 60 steps o2 = 99.4', () => {
    const s = createSurvivalState();
    steps(s, env({ depthY: 27 }), 60);
    expect(s.o2).toBeCloseTo(99.4, 10);
  });
  it('y == 28 is still surface rate (boundary: deep is strictly y < 28)', () => {
    const s = createSurvivalState();
    steps(s, env({ depthY: 28 }), 60);
    expect(s.o2).toBeCloseTo(99.75, 10);
  });
  it('clamps O2 at 0 (cannot go negative)', () => {
    const s = createSurvivalState();
    s.o2 = 0.1;
    steps(s, env({ depthY: 27 }), 60); // would remove 0.6
    expect(s.o2).toBe(0);
  });
});

describe('O2 pod refill (§12 O2_SAFE_RADIUS → near pod refills; +20/s chosen rate)', () => {
  it('refills toward 100 at +20/s → after 60 steps from 50 → 70', () => {
    const s = createSurvivalState();
    s.o2 = 50;
    steps(s, env({ nearPod: true }), 60);
    expect(s.o2).toBeCloseTo(70, 10);
  });
  it('clamps refill at 100 (never overfills)', () => {
    const s = createSurvivalState();
    s.o2 = 95;
    steps(s, env({ nearPod: true }), 60); // +20 would reach 115
    expect(s.o2).toBe(100);
  });
  it('refill takes priority over deep-drain when both nearPod and deep', () => {
    const s = createSurvivalState();
    s.o2 = 50;
    steps(s, env({ nearPod: true, depthY: 10 }), 60);
    expect(s.o2).toBeCloseTo(70, 10);
  });
});

describe('HP — O2=0 drain (§12 HP_O2ZERO 4/s) and regen (§12 HP_REGEN 1/s when O2>50)', () => {
  it('o2 == 0 drains hp 4/s → after 60 steps hp = 96', () => {
    const s = createSurvivalState();
    s.o2 = 0;
    steps(s, env({ nearPod: false }), 60); // o2 stays 0 (already clamped)
    expect(s.o2).toBe(0);
    expect(s.hp).toBeCloseTo(96, 10);
  });
  it('o2 > 50 regens hp 1/s → after 60 steps from 90 → 91', () => {
    const s = createSurvivalState();
    s.hp = 90;
    s.o2 = 80;
    steps(s, env(), 60);
    expect(s.hp).toBeCloseTo(91, 10);
  });
  it('o2 == 50 does NOT regen (regen is strictly o2 > 50)', () => {
    const s = createSurvivalState();
    s.hp = 90;
    s.o2 = 50;
    steps(s, env(), 60);
    expect(s.hp).toBe(90);
  });
  it('o2 in (0, 50] and not zero: no regen, no o2-drain damage', () => {
    const s = createSurvivalState();
    s.hp = 90;
    s.o2 = 30;
    steps(s, env(), 60);
    expect(s.hp).toBe(90);
  });
  it('regen clamps hp at 100', () => {
    const s = createSurvivalState();
    s.hp = 99.5;
    s.o2 = 80;
    steps(s, env(), 60); // +1 → 100.5
    expect(s.hp).toBe(100);
  });
  it('o2-zero drain clamps hp at 0', () => {
    const s = createSurvivalState();
    s.hp = 2;
    s.o2 = 0;
    steps(s, env(), 60); // -4 → -2
    expect(s.hp).toBe(0);
  });
});

describe('Energy — drains and recharge (§12 ENERGY_JUMPPACK 8/s, ENERGY_DRILL 1.5/s mk2+, SOLAR 2/s)', () => {
  it('jump pack drains 8/s → after 60 steps from 100 → 92', () => {
    const s = createSurvivalState();
    steps(s, env({ jumpPackActive: true }), 60);
    expect(s.energy).toBeCloseTo(92, 10);
  });
  it('drilling with mk2 drains 1.5/s → after 60 steps from 100 → 98.5', () => {
    const s = createSurvivalState();
    steps(s, env({ mining: true, miningDrillTier: 'mk2' }), 60);
    expect(s.energy).toBeCloseTo(98.5, 10);
  });
  it('drilling with plasma (mk2+) drains 1.5/s', () => {
    const s = createSurvivalState();
    steps(s, env({ mining: true, miningDrillTier: 'plasma' }), 60);
    expect(s.energy).toBeCloseTo(98.5, 10);
  });
  it('drilling with hand or mk1 drains NO energy (only mk2+)', () => {
    const sHand = createSurvivalState();
    steps(sHand, env({ mining: true, miningDrillTier: 'hand' }), 60);
    expect(sHand.energy).toBe(100);
    const sMk1 = createSurvivalState();
    steps(sMk1, env({ mining: true, miningDrillTier: 'mk1' }), 60);
    expect(sMk1.energy).toBe(100);
  });
  it('mining=false with mk2 drains nothing (must be actively mining)', () => {
    const s = createSurvivalState();
    steps(s, env({ mining: false, miningDrillTier: 'mk2' }), 60);
    expect(s.energy).toBe(100);
  });
  it('solar in range recharges 2/s → after 60 steps from 50 → 52', () => {
    const s = createSurvivalState();
    s.energy = 50;
    steps(s, env({ solarInRange: true }), 60);
    expect(s.energy).toBeCloseTo(52, 10);
  });
  it('jump pack + solar net = -6/s (8 drain, 2 recharge)', () => {
    const s = createSurvivalState();
    steps(s, env({ jumpPackActive: true, solarInRange: true }), 60);
    expect(s.energy).toBeCloseTo(94, 10);
  });
  it('clamps energy at 0', () => {
    const s = createSurvivalState();
    s.energy = 0.05;
    steps(s, env({ jumpPackActive: true }), 60);
    expect(s.energy).toBe(0);
  });
  it('clamps energy at 100 (solar never overfills)', () => {
    const s = createSurvivalState();
    s.energy = 99.9;
    steps(s, env({ solarInRange: true }), 60);
    expect(s.energy).toBe(100);
  });
});

describe('applyFallDamage (§12 FALL_SAFE 3, FALL_DMG (n-3)*8)', () => {
  it('3 blocks is safe → 0 damage, hp unchanged', () => {
    const s = createSurvivalState();
    expect(applyFallDamage(s, 3)).toBe(0);
    expect(s.hp).toBe(100);
  });
  it('4 blocks → 8 damage', () => {
    const s = createSurvivalState();
    expect(applyFallDamage(s, 4)).toBe(8);
    expect(s.hp).toBe(92);
  });
  it('10 blocks → 56 damage', () => {
    const s = createSurvivalState();
    expect(applyFallDamage(s, 10)).toBe(56);
    expect(s.hp).toBe(44);
  });
  it('0/1/2 blocks → 0 damage (all under threshold)', () => {
    for (const n of [0, 1, 2]) {
      const s = createSurvivalState();
      expect(applyFallDamage(s, n)).toBe(0);
      expect(s.hp).toBe(100);
    }
  });
  it('clamps hp at 0 and returns the damage actually computed', () => {
    const s = createSurvivalState();
    s.hp = 10;
    // 20 blocks → (20-3)*8 = 136 damage, hp clamps to 0
    expect(applyFallDamage(s, 20)).toBe(136);
    expect(s.hp).toBe(0);
  });
});

describe('isDead (§6 At zero: HP=0 → death)', () => {
  it('hp > 0 is alive', () => {
    const s = createSurvivalState();
    s.hp = 0.01;
    expect(isDead(s)).toBe(false);
  });
  it('hp == 0 is dead (boundary)', () => {
    const s = createSurvivalState();
    s.hp = 0;
    expect(isDead(s)).toBe(true);
  });
  it('hp < 0 is dead', () => {
    const s = createSurvivalState();
    s.hp = -5;
    expect(isDead(s)).toBe(true);
  });
});
