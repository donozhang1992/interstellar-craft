import * as THREE from 'three';

/**
 * Gargantua placement + accretion-disk basis — ported verbatim from
 * prototype/trailer.html. TECH_SPEC §7 landmine 4: these constants are final and
 * user-approved against film stills. Do not change.
 *
 * Note: the trailer file uses an offset of +0.06 in the disk-normal formula
 * (TECH_SPEC §7.4 quotes 0.028 — the trailer file is authoritative per task brief).
 */

/** Direction from the world origin toward the black hole (game-parity sky). */
export const BH_DIR = new THREE.Vector3(0.55, 0.42, -0.72).normalize();
/** Billboard world position. */
export const BH_POS = BH_DIR.clone().multiplyScalar(1150);
/** Billboard edge length in world units. */
export const BH_QUAD = 2300;
/** How many Schwarzschild radii the quad spans (keeps the seam away from strong lensing). */
export const BH_SPAN_RS = 52.5;
/** World units per Schwarzschild radius. */
export const BH_WPRS = BH_QUAD / BH_SPAN_RS;

export interface DiskBasis {
  /** Disk normal (tilted ~3.8° toward the camera, rolled -0.21 rad about the view axis). */
  n: THREE.Vector3;
  /** In-disk horizontal axis. */
  bx: THREE.Vector3;
  /** Completes the right-handed local frame. */
  bz: THREE.Vector3;
}

/**
 * Disk local coordinate frame: normal is perpendicular-to-view plus a ~3.5°
 * camera-facing tilt (film camera placement: slightly above the disk plane),
 * then rolled ~12° about the view axis for the signature diagonal.
 *
 * Trailer-verbatim: bhN = up + view*(-view.y + .06), normalize, applyAxisAngle(view, -.21).
 */
export function computeDiskBasis(viewDir: THREE.Vector3): DiskBasis {
  const view = viewDir.clone().normalize();
  const n = new THREE.Vector3(0, 1, 0).addScaledVector(view, -view.y + 0.06).normalize();
  n.applyAxisAngle(view, -0.21);
  const bx = new THREE.Vector3().crossVectors(n, view).normalize();
  const bz = new THREE.Vector3().crossVectors(bx, n).normalize();
  return { n, bx, bz };
}
