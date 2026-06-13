/**
 * Observer Jelly (M3.3 should-have — GAME_DESIGN §8 "floats, drifts toward next
 * quest location, soft glow; diegetic quest guide").
 *
 * A single floating emissive blob: an additive-blended sphere with a larger,
 * fainter halo shell, bobbing on a deterministic sine and easing toward a target
 * point (the rough location of the current objective; defaults to bobbing near
 * spawn for ch1). Pure visual — no DOM, no game-state coupling; the game layer
 * sets the target and ticks `update(t)` with a stepped time so it stays
 * deterministic under __TEST__.
 *
 * Self-contained new render object. The game layer decides whether to add it to
 * the scene; it is NOT wired into the byte-identical visual-baseline scene to
 * keep those frames unchanged (see scene.ts note).
 */
import * as THREE from 'three';

/** Bob amplitude / period (blocks / seconds) — slow, dreamlike drift. */
const BOB_AMPLITUDE = 0.6;
const BOB_PERIOD = 4.0;
/** Per-second easing fraction toward the target (slow homing). */
const HOME_RATE = 0.4;

export interface ObserverJelly {
  /** The renderable group (core + halo). Add to the scene to show it. */
  group: THREE.Group;
  /** Set the rough world point the jelly drifts toward. */
  setTarget(x: number, y: number, z: number): void;
  /** Advance the bob + homing by `dt` seconds (stepped time under __TEST__). */
  update(dt: number): void;
  /** Dispose owned geometry/materials. */
  dispose(): void;
}

/** Build the Observer Jelly at an initial position. */
export function createObserverJelly(x = 0, y = 0, z = 0): ObserverJelly {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  // Emissive core — additive so it reads as a soft light against dark terrain.
  const coreGeo = new THREE.SphereGeometry(0.35, 16, 12);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x9fe8ff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);

  // Halo shell — larger, fainter, gives the glow a volume.
  const haloGeo = new THREE.SphereGeometry(0.7, 16, 12);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x4fb6ff,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);

  group.add(core, halo);

  const target = new THREE.Vector3(x, y, z);
  /** The homed base position (group.y = base.y + bob). */
  const base = new THREE.Vector3(x, y, z);
  let phase = 0;

  return {
    group,
    setTarget(tx: number, ty: number, tz: number): void {
      target.set(tx, ty, tz);
    },
    update(dt: number): void {
      // Ease the base toward the target (frame-rate-independent lerp).
      const k = 1 - Math.exp(-HOME_RATE * dt);
      base.lerp(target, k);
      phase += dt;
      const bob = Math.sin((phase / BOB_PERIOD) * Math.PI * 2) * BOB_AMPLITUDE;
      group.position.set(base.x, base.y + bob, base.z);
      // Gentle pulse on the core opacity for life.
      coreMat.opacity = 0.75 + 0.2 * (0.5 + 0.5 * Math.sin((phase / 1.7) * Math.PI * 2));
    },
    dispose(): void {
      coreGeo.dispose();
      coreMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
    },
  };
}
