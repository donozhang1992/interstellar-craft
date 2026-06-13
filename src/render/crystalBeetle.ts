/**
 * Crystal Beetle render (M4.3a — GAME_DESIGN §3e / §8 "wanders cave floors, flees
 * the player; cornered → sheds 1 crystal shard").
 *
 * Pure visual shell over the M4.2 pure-behavior core (src/core/entity/beetle.ts):
 * the core owns the position + flee/shed state machine; this module only renders a
 * small emissive crystalline body that reads `beetle.pos` each frame. Like the
 * Observer Jelly it is a self-contained new render object the game layer adds to
 * the scene ONLY outside the __TEST__ visual-baseline harness (so the world/sky
 * baselines stay byte-identical — see scene.ts / main.ts notes).
 *
 * No DOM, no game-state coupling: the game layer steps the core (stepBeetle) and
 * calls `syncTo(pos)` to move the sprite; a faint emissive pulse uses a stepped
 * time so it stays deterministic under stepFrames.
 */
import * as THREE from 'three';

/** Crystal-shard body tint (matches the crystal block's cool glow). */
const BODY_COLOR = 0x8fffe0;
const HALO_COLOR = 0x39d6c2;

export interface CrystalBeetleView {
  /** The renderable group (body + halo). Add to the scene to show it. */
  group: THREE.Group;
  /** Move the sprite to the core beetle position (called each rendered frame). */
  syncTo(x: number, y: number, z: number): void;
  /** Advance the emissive pulse by `dt` seconds (stepped time under __TEST__). */
  update(dt: number): void;
  /** Hide the body once the beetle has shed (it "scurries off" — purely visual). */
  setShed(shed: boolean): void;
  /** Dispose owned geometry/materials. */
  dispose(): void;
}

/** Build a Crystal Beetle view at an initial position. */
export function createCrystalBeetle(x = 0, y = 0, z = 0): CrystalBeetleView {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  // Faceted little crystal body — emissive so it reads as cave life in the dim.
  const bodyGeo = new THREE.OctahedronGeometry(0.28, 0);
  const bodyMat = new THREE.MeshBasicMaterial({
    color: BODY_COLOR,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);

  // Soft halo shell — gives the glow a little volume against the rock.
  const haloGeo = new THREE.SphereGeometry(0.5, 12, 8);
  const haloMat = new THREE.MeshBasicMaterial({
    color: HALO_COLOR,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);

  group.add(body, halo);

  let phase = 0;

  return {
    group,
    syncTo(sx: number, sy: number, sz: number): void {
      group.position.set(sx, sy, sz);
    },
    update(dt: number): void {
      phase += dt;
      // Slow spin + opacity shimmer for life (deterministic, stepped).
      body.rotation.y = phase * 1.4;
      body.rotation.x = phase * 0.8;
      bodyMat.opacity = 0.7 + 0.25 * (0.5 + 0.5 * Math.sin((phase / 1.3) * Math.PI * 2));
    },
    setShed(shed: boolean): void {
      group.visible = !shed;
    },
    dispose(): void {
      bodyGeo.dispose();
      bodyMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
    },
  };
}
