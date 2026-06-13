/**
 * Scene assembly — port of prototype/index.html's 基础设置 / 光照 / sky sections,
 * composing the M0.2/M0.3 modules.
 *
 * Renderer settings verbatim from the prototype game page: antialias on,
 * pixelRatio = min(devicePixelRatio, 2), sRGB output, NO tone mapping (the
 * prototype game never sets one — the trailer's ACES 1.12 belongs to the
 * cinematic pipeline, not the game page). Fog/camera/light values verbatim;
 * the prototype game scene has no PointLights (Ambient/Directional/Hemisphere
 * only), so the r160 5–60 PointLight rule has nothing to port here.
 *
 * Black hole: the M0.3b offscreen-RT Gargantua replaces the prototype's cheap
 * billboard shader. Its raymarch RT is rendered ONCE at boot (ROADMAP M0.3b
 * contract — renderRT is expensive); the per-frame work is only the cheap
 * `update(camera)` billboard orientation. The prototype animated its disk via
 * uTime; M0 keeps the RT static (animating would re-raymarch per frame).
 */
import * as THREE from 'three';
import { BH_DIR, createBlackHole, type BlackHole } from '../render/blackhole';
import { createNebulae, createStars } from '../render/sky';
import { createBlockMaterials } from '../render/textures/blockTextures';
import { PHYS, type PlayerState } from '../core/player/movement';
import type { VoxelWorld } from '../core/world/voxelWorld';
import type { RaycastResult } from '../core/world/raycast';
import { WorldMeshes } from './worldMeshes';

export interface GameScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  blackHole: BlackHole;
  worldMeshes: WorldMeshes;
  /** Move the camera to the player eye + view angles (prototype loop). */
  syncCamera(player: PlayerState): void;
  /** Show/hide the wire highlight box on the targeted block (prototype loop). */
  updateHighlight(hit: RaycastResult | null): void;
  render(): void;
}

export function createGameScene(world: VoxelWorld, mount: HTMLElement): GameScene {
  // ---- renderer (prototype 基础设置, verbatim) ----
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05060e, 70, 170);

  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 3000);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ---- sky: stars + nebulae (M0.3b, renderOrder -2) + Gargantua billboard ----
  scene.add(createStars(renderer.getPixelRatio()));
  for (const nebula of createNebulae()) scene.add(nebula);
  const blackHole = createBlackHole(renderer);
  scene.add(blackHole.billboard);

  // ---- lighting (prototype 光照 — the accretion disk is the key light) ----
  const ambient = new THREE.AmbientLight(0x46507a, 0.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffd9b0, 1.05);
  sun.position.copy(BH_DIR).multiplyScalar(100); // prototype: the disk lights the terrain
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0x32406e, 0x0a0a12, 0.5);
  scene.add(hemi);
  // Surface-light intensities, restored above ground (M2.3 cave dim baseline).
  const AMBIENT_SURFACE = ambient.intensity;
  const HEMI_SURFACE = hemi.intensity;

  // ---- voxel world meshes ----
  const worldMeshes = new WorldMeshes(world, scene, createBlockMaterials());
  worldMeshes.buildAll();

  // ---- targeted-block highlight (prototype wire box) ----
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }),
  );
  highlight.visible = false;
  scene.add(highlight);

  return {
    renderer,
    scene,
    camera,
    blackHole,
    worldMeshes,
    syncCamera(player: PlayerState): void {
      camera.position.set(player.pos.x, player.pos.y + PHYS.EYE_HEIGHT, player.pos.z);
      camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
      // Cave dim (M2.3, MINIMAL — no voxel light propagation): fade the fill
      // lights as the eye descends below y=20 so caves read dark and lamps/
      // crystals matter; at/above y=20 the surface intensities are restored
      // UNCHANGED, so surface visual baselines stay byte-identical. Deterministic
      // (pure function of camera y). Floor 0.18 keeps caves navigable, not black.
      const eyeY = camera.position.y;
      const DIM_TOP = 20; // start dimming below this eye-y
      const DIM_FLOOR = 0.18; // residual fraction deep underground
      const t = eyeY >= DIM_TOP ? 1 : Math.max(DIM_FLOOR, eyeY / DIM_TOP);
      ambient.intensity = AMBIENT_SURFACE * t;
      hemi.intensity = HEMI_SURFACE * t;
    },
    updateHighlight(hit: RaycastResult | null): void {
      if (hit) {
        highlight.visible = true;
        highlight.position.set(hit.hit.x + 0.5, hit.hit.y + 0.5, hit.hit.z + 0.5);
      } else {
        highlight.visible = false;
      }
    },
    render(): void {
      renderer.render(scene, camera);
    },
  };
}
