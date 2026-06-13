/**
 * Wrecked Drone render (M4.3a — GAME_DESIGN §3e / §8 "static until repaired
 * (2 copper + 1 crystal); then follows player as mobile light").
 *
 * Pure visual shell over the M4.2 pure-behavior core (src/core/entity/drone.ts):
 * the core owns position + the `repaired` flag + the eased follow; this module
 * renders the body and reads `drone.pos` / `drone.repaired`. Two visual states:
 *  - WRECK: a dim, dark, motionless husk (no emissive glow, no light).
 *  - COMPANION: an emissive core + a real PointLight that lights nearby voxels
 *    (the §8 "darkness counterplay"), switched on by `setRepaired(true)`.
 *
 * Like the Observer Jelly / Crystal Beetle it is a self-contained new render
 * object added to the scene ONLY outside the __TEST__ visual-baseline harness, so
 * the byte-identical world/sky baselines never see it (see main.ts notes). The
 * PointLight (added only on repair, outside __TEST__) stays within the r160 5–60
 * point-light budget — it is the only one in the game scene.
 */
import * as THREE from 'three';

const HUSK_COLOR = 0x44484f;
const CORE_COLOR = 0xffe2a6;
const LIGHT_COLOR = 0xffd9a0;

export interface WreckedDroneView {
  /** The renderable group (husk + core + companion light). Add to the scene. */
  group: THREE.Group;
  /** Move the body to the core drone position (called each rendered frame). */
  syncTo(x: number, y: number, z: number): void;
  /** Switch wreck → companion: light the emissive core + the PointLight. */
  setRepaired(repaired: boolean): void;
  /** Advance the companion bob/pulse by `dt` seconds (stepped time). */
  update(dt: number): void;
  /** Dispose owned geometry/materials/light. */
  dispose(): void;
}

/** Build a Wrecked Drone view at an initial position. */
export function createWreckedDrone(x = 0, y = 0, z = 0): WreckedDroneView {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  // Husk — a dull boxy chassis, visible in both states (the drone's body).
  const huskGeo = new THREE.BoxGeometry(0.5, 0.32, 0.5);
  const huskMat = new THREE.MeshStandardMaterial({
    color: HUSK_COLOR,
    roughness: 0.9,
    metalness: 0.3,
  });
  const husk = new THREE.Mesh(huskGeo, huskMat);

  // Emissive core — dark while wrecked, glowing once repaired (additive).
  const coreGeo = new THREE.SphereGeometry(0.16, 12, 8);
  const coreMat = new THREE.MeshBasicMaterial({
    color: CORE_COLOR,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 0.28;

  // Companion light — off (intensity 0) until repaired. Short-range warm fill.
  const light = new THREE.PointLight(LIGHT_COLOR, 0, 14, 2);
  light.position.y = 0.3;

  group.add(husk, core, light);

  let repaired = false;
  let phase = 0;

  return {
    group,
    syncTo(sx: number, sy: number, sz: number): void {
      group.position.set(sx, sy, sz);
    },
    setRepaired(r: boolean): void {
      repaired = r;
      coreMat.opacity = r ? 0.95 : 0;
      light.intensity = r ? 1.6 : 0;
    },
    update(dt: number): void {
      if (!repaired) return;
      phase += dt;
      // Gentle companion bob + core shimmer once it is alive.
      core.position.y = 0.28 + Math.sin((phase / 1.5) * Math.PI * 2) * 0.05;
      coreMat.opacity = 0.8 + 0.15 * (0.5 + 0.5 * Math.sin((phase / 0.9) * Math.PI * 2));
    },
    dispose(): void {
      huskGeo.dispose();
      huskMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
    },
  };
}
