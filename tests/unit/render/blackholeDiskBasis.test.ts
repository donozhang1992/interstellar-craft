import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BH_DIR,
  BH_QUAD,
  BH_SPAN_RS,
  BH_WPRS,
  computeDiskBasis,
} from '../../../src/render/blackhole/diskBasis';

describe('black hole constants (trailer-verbatim)', () => {
  it('BH_DIR/BH_QUAD/BH_SPAN_RS match prototype/trailer.html', () => {
    const raw = new THREE.Vector3(0.55, 0.42, -0.72);
    expect(BH_DIR.angleTo(raw)).toBeCloseTo(0, 10);
    expect(BH_DIR.length()).toBeCloseTo(1, 10);
    expect(BH_QUAD).toBe(2300);
    expect(BH_SPAN_RS).toBe(52.5);
    expect(BH_WPRS).toBeCloseTo(2300 / 52.5, 10);
  });
});

describe('accretion-disk basis (TECH_SPEC §7.4 — values final, do not change)', () => {
  const { n, bx, bz } = computeDiskBasis(BH_DIR);

  it('tilts the disk normal ~3.78° toward the camera (offset .06 in trailer file)', () => {
    // dot(n, view) = .06 / |up + view*(-view.y+.06)| — preserved by the roll.
    expect(n.dot(BH_DIR)).toBeCloseTo(0.06598897611021172, 8);
    const tiltDeg = (Math.asin(n.dot(BH_DIR)) * 180) / Math.PI;
    expect(tiltDeg).toBeCloseTo(3.7836392256207727, 6);
  });

  it('reproduces the exact trailer basis vectors', () => {
    expect(n.toArray().map((v) => +v.toFixed(8))).toEqual([-0.37810178, 0.91314805, 0.15231441]);
    expect(bx.toArray().map((v) => +v.toFixed(8))).toEqual([-0.72399262, -0.18912753, -0.66337431]);
    expect(bz.toArray().map((v) => +v.toFixed(8))).toEqual([0.57695211, 0.36109751, -0.7326219]);
  });

  it('returns an orthonormal frame', () => {
    expect(n.length()).toBeCloseTo(1, 10);
    expect(bx.length()).toBeCloseTo(1, 10);
    expect(bz.length()).toBeCloseTo(1, 10);
    expect(n.dot(bx)).toBeCloseTo(0, 10);
    expect(n.dot(bz)).toBeCloseTo(0, 10);
    expect(bx.dot(bz)).toBeCloseTo(0, 10);
    // bx lies in the disk plane and is perpendicular to the view axis
    expect(bx.dot(BH_DIR)).toBeCloseTo(0, 10);
  });

  it('does not mutate the input view direction', () => {
    const view = BH_DIR.clone();
    computeDiskBasis(view);
    expect(view.toArray()).toEqual(BH_DIR.toArray());
  });

  it('is deterministic', () => {
    const again = computeDiskBasis(BH_DIR);
    expect(again.n.toArray()).toEqual(n.toArray());
    expect(again.bx.toArray()).toEqual(bx.toArray());
    expect(again.bz.toArray()).toEqual(bz.toArray());
  });
});
