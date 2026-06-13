/**
 * Scanner ore highlight (M3.3 should-have — GAME_DESIGN §7 minimal scanner).
 *
 * A new, self-contained render object: a pool of wireframe boxes that mark
 * iron(7) / copper(8) ore voxels within a radius of the player. Pure visual,
 * gated entirely behind the scanner unlock — `setEnabled(false)` (the default)
 * leaves the group empty/invisible, so NO scene this is added to changes its
 * render output until the player unlocks the scanner in ch2. That keeps every
 * existing visual baseline byte-identical (none of them unlock the scanner).
 *
 * Cheap by construction: a fixed-size box pool reused each refresh (no per-frame
 * allocation), only refreshed when explicitly called by the game loop, and
 * bounded by SCAN_RADIUS. Does not import DOM; only three.js + the core world.
 */
import * as THREE from 'three';
import type { VoxelWorld } from '../core/world/voxelWorld';
import { BlockId } from '../core/world/blocks';

/** Blocks per axis the scanner reaches around the player (GAME_DESIGN §7 ≈12). */
export const SCAN_RADIUS = 12;

/** Max ore markers drawn at once (pool size — keeps the effect cheap). */
const MAX_MARKERS = 64;

/** Ore tints: iron warm-amber, copper teal — distinct through-wall markers. */
const ORE_COLORS: Readonly<Record<number, number>> = {
  [BlockId.IronOre]: 0xffc24a,
  [BlockId.CopperOre]: 0x4fd2ff,
};

export interface ScannerHighlight {
  /** The group to add to the scene (empty/invisible until enabled). */
  group: THREE.Group;
  /** Toggle the whole effect (scanner unlock). */
  setEnabled(on: boolean): void;
  /** Rebuild markers for ores near (px,py,pz). No-op while disabled. */
  refresh(world: VoxelWorld, px: number, py: number, pz: number): void;
  /** Dispose pooled geometry/materials. */
  dispose(): void;
}

/** Build the (initially disabled) scanner highlight effect. */
export function createScannerHighlight(): ScannerHighlight {
  const group = new THREE.Group();
  group.visible = false;
  // Shared unit-cube edges geometry; one material per ore color (transparent so
  // markers read as a soft glow, not a hard overlay). renderOrder high so they
  // draw over the world (through-wall scanner per §7).
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04));
  const materials = new Map<number, THREE.LineBasicMaterial>();
  for (const [id, color] of Object.entries(ORE_COLORS)) {
    materials.set(
      Number(id),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false }),
    );
  }
  // A reusable pool of line-segment markers (default to the iron material).
  const pool: THREE.LineSegments[] = [];
  for (let i = 0; i < MAX_MARKERS; i++) {
    const box = new THREE.LineSegments(edges, materials.get(BlockId.IronOre)!);
    box.renderOrder = 3;
    box.visible = false;
    group.add(box);
    pool.push(box);
  }

  let enabled = false;

  function refresh(world: VoxelWorld, px: number, py: number, pz: number): void {
    for (const box of pool) box.visible = false;
    if (!enabled) return;
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    const cz = Math.floor(pz);
    let n = 0;
    for (let x = cx - SCAN_RADIUS; x <= cx + SCAN_RADIUS && n < MAX_MARKERS; x++) {
      for (let y = cy - SCAN_RADIUS; y <= cy + SCAN_RADIUS && n < MAX_MARKERS; y++) {
        for (let z = cz - SCAN_RADIUS; z <= cz + SCAN_RADIUS && n < MAX_MARKERS; z++) {
          const id = world.getBlock(x, y, z);
          const mat = materials.get(id);
          if (!mat) continue;
          const box = pool[n++]!;
          box.material = mat;
          box.position.set(x + 0.5, y + 0.5, z + 0.5);
          box.visible = true;
        }
      }
    }
  }

  return {
    group,
    setEnabled(on: boolean): void {
      enabled = on;
      group.visible = on;
      if (!on) for (const box of pool) box.visible = false;
    },
    refresh,
    dispose(): void {
      edges.dispose();
      for (const m of materials.values()) m.dispose();
    },
  };
}
