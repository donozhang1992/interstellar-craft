// Spec: GAME_DESIGN §4 (canonical) — tool multipliers hand ×1 / Mk1 ×2 /
// Mk2 ×4 / Plasma ×8; mining time = hardness / multiplier; a block below its
// min tool cannot be mined (time is null). M1 exit criterion: the full
// 13 blocks × 4 tiers matrix is frozen by snapshot, with hand-computed
// literal spot checks so the snapshot itself is cross-checked.
import { describe, expect, it } from 'vitest';
import { BlockId } from '../../../src/core/world/blocks';
import {
  MINING_TIERS,
  MINING_TIME_MATRIX,
  miningTime,
  tierSatisfies,
  toolMultiplier,
} from '../../../src/core/mining/model';

describe('toolMultiplier (GAME_DESIGN §4 tool ladder)', () => {
  it('returns the literal §4 multipliers', () => {
    expect(toolMultiplier('hand')).toBe(1);
    expect(toolMultiplier('mk1')).toBe(2);
    expect(toolMultiplier('mk2')).toBe(4);
    expect(toolMultiplier('plasma')).toBe(8);
  });
});

describe('tierSatisfies (hand < mk1 < mk2 < plasma)', () => {
  it('every tier satisfies itself and everything below', () => {
    for (let have = 0; have < MINING_TIERS.length; have++) {
      for (let req = 0; req < MINING_TIERS.length; req++) {
        expect(tierSatisfies(MINING_TIERS[have]!, MINING_TIERS[req]!)).toBe(have >= req);
      }
    }
  });

  it('spot checks the ordering literally', () => {
    expect(tierSatisfies('hand', 'hand')).toBe(true);
    expect(tierSatisfies('hand', 'mk1')).toBe(false);
    expect(tierSatisfies('mk1', 'mk2')).toBe(false);
    expect(tierSatisfies('mk2', 'mk1')).toBe(true);
    expect(tierSatisfies('plasma', 'mk2')).toBe(true);
    expect(tierSatisfies('mk2', 'plasma')).toBe(false);
  });
});

describe('miningTime', () => {
  it('regolith by hand takes the literal §4 hardness: 0.6 s', () => {
    expect(miningTime(BlockId.Regolith, 'hand')).toBe(0.6);
  });

  it('crystal with mk2 is 3.5 / 4 = 0.875 s (hand-computed)', () => {
    expect(miningTime(BlockId.Crystal, 'mk2')).toBe(0.875);
  });

  it('basalt by hand is gated (minTool mk1) → null', () => {
    expect(miningTime(BlockId.Basalt, 'hand')).toBeNull();
  });

  it('crystal below mk2 is gated for both hand and mk1', () => {
    expect(miningTime(BlockId.Crystal, 'hand')).toBeNull();
    expect(miningTime(BlockId.Crystal, 'mk1')).toBeNull();
  });

  it('plasma halves mk2 times: crystal 3.5 / 8 = 0.4375 s', () => {
    expect(miningTime(BlockId.Crystal, 'plasma')).toBe(0.4375);
  });

  it('returns null for invalid block ids (air, unknown, fractional)', () => {
    expect(miningTime(BlockId.Air, 'plasma')).toBeNull();
    expect(miningTime(99, 'plasma')).toBeNull();
    expect(miningTime(-1, 'hand')).toBeNull();
    expect(miningTime(1.5, 'hand')).toBeNull();
  });
});

describe('MINING_TIME_MATRIX (13 blocks × 4 tiers — M1 exit criterion)', () => {
  it('covers all 13 blocks × 4 tiers and agrees with miningTime()', () => {
    expect(Object.keys(MINING_TIME_MATRIX)).toHaveLength(13);
    for (const [key, row] of Object.entries(MINING_TIME_MATRIX)) {
      const id = Number(key);
      expect(Object.keys(row)).toHaveLength(4);
      for (const tier of MINING_TIERS) {
        expect(row[tier]).toBe(miningTime(id, tier));
      }
    }
  });

  it('matches the frozen snapshot (null where tier < minTool)', () => {
    expect(MINING_TIME_MATRIX).toMatchSnapshot();
  });
});
