/**
 * Minimap — top-down 2D radar canvas rendered each frame from live world state.
 *
 * Draws a RADIUS×RADIUS block square centred on the player, scanning the
 * top-most non-air block in each (x,z) column for the surface colour. A player
 * arrow, crash-pod dot, and jelly dot are overlaid. Circular clip via CSS.
 *
 * NOT constructed under __TEST__ (same guard as jelly / crash pod) so visual
 * baselines stay byte-identical.
 */
import type { VoxelWorld } from '../core/world/voxelWorld';

/** Half-width of the map in world blocks (total coverage = RADIUS*2 × RADIUS*2). */
const RADIUS = 28;
/** Canvas pixel size (CSS px; multiplied by devicePixelRatio internally). */
const CSS_SIZE = 110;

/** Top-surface colour per block id (0 = air, handled as void/dark). */
const BLOCK_COLOR: Record<number, string> = {
  1: '#7a6e5a', // regolith
  2: '#525260', // rock
  3: '#3a3a48', // basalt
  4: '#1da8b8', // crystal — bright cyan
  5: '#5c8060', // ice — pale green
  6: '#d4b840', // lamp — yellow
  7: '#8a5a38', // iron ore
  8: '#a05c30', // copper ore
  9: '#5a6878', // hull
  10: '#28282e', // glass (deep rock in practice)
  11: '#7090c0', // antenna — blue
  12: '#5070b8', // beacon_core — deeper blue
  13: '#909090', // launchpad — grey
};

export interface Minimap {
  /** The canvas element — append to the DOM to show. */
  canvas: HTMLCanvasElement;
  /**
   * Redraw the minimap for the current frame.
   * @param world   Live voxel world (read-only column scan).
   * @param px/pz   Player world position (XZ).
   * @param podX/Z  Crash-pod world XZ (for ch1 dot).
   * @param showPod True while ch1 is active (hides dot after salvage).
   * @param jellyX/Z  Jelly world XZ (optional — omit to skip the dot).
   */
  update(
    world: VoxelWorld,
    px: number,
    pz: number,
    podX: number,
    podZ: number,
    showPod: boolean,
    jellyX?: number,
    jellyZ?: number,
  ): void;
}

export function createMinimap(): Minimap {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.round(CSS_SIZE * dpr);

  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  canvas.style.width = `${CSS_SIZE}px`;
  canvas.style.height = `${CSS_SIZE}px`;

  const ctx = canvas.getContext('2d')!;

  return {
    canvas,
    update(world, playerX, playerZ, podX, podZ, showPod, jellyX, jellyZ) {
      const scale = px / (RADIUS * 2);
      ctx.clearRect(0, 0, px, px);

      // Dark void background
      ctx.fillStyle = '#0a0a10';
      ctx.fillRect(0, 0, px, px);

      // Sample top-most non-air block for each column in view
      const ox = Math.round(playerX) - RADIUS;
      const oz = Math.round(playerZ) - RADIUS;

      for (let dz = 0; dz < RADIUS * 2; dz++) {
        for (let dx = 0; dx < RADIUS * 2; dx++) {
          const wx = ox + dx;
          const wz = oz + dz;
          if (wx < 0 || wz < 0 || wx >= world.sizeX || wz >= world.sizeZ) continue;

          // Scan top-down for the first solid block
          let topBlock = 0;
          for (let y = world.sizeY - 1; y >= 0; y--) {
            const b = world.getBlock(wx, y, wz);
            if (b !== 0) {
              topBlock = b;
              break;
            }
          }
          if (topBlock === 0) continue;

          const color = BLOCK_COLOR[topBlock] ?? '#555566';
          ctx.fillStyle = color;
          const sx = Math.floor(dx * scale);
          const sy = Math.floor(dz * scale);
          const sw = Math.ceil(scale) + 1;
          ctx.fillRect(sx, sy, sw, sw);
        }
      }

      // Vignette (darken edges so the circular clip looks natural)
      const centre = px / 2;
      const grad = ctx.createRadialGradient(centre, centre, px * 0.3, centre, centre, px * 0.55);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,8,0.65)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, px, px);

      // Helper: world XZ → canvas XY
      function toCanvas(wx: number, wz: number): [number, number] {
        return [((wx - ox) / (RADIUS * 2)) * px, ((wz - oz) / (RADIUS * 2)) * px];
      }

      // Crash-pod dot (orange, ch1 only)
      if (showPod) {
        const [sx, sy] = toCanvas(podX, podZ);
        if (sx >= 0 && sx <= px && sy >= 0 && sy <= px) {
          ctx.beginPath();
          ctx.arc(sx, sy, 3.5 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = '#ff9040';
          ctx.fill();
        }
      }

      // Jelly dot (cyan)
      if (jellyX !== undefined && jellyZ !== undefined) {
        const [sx, sy] = toCanvas(jellyX, jellyZ);
        if (sx >= 0 && sx <= px && sy >= 0 && sy <= px) {
          ctx.beginPath();
          ctx.arc(sx, sy, 3 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = '#60e8ff';
          ctx.fill();
        }
      }

      // Player dot (white triangle pointing "up" — fixed orientation, simple)
      const [ppx, ppy] = toCanvas(playerX, playerZ);
      const r = 4 * dpr;
      ctx.save();
      ctx.translate(ppx, ppy);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.7, r * 0.7);
      ctx.lineTo(-r * 0.7, r * 0.7);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    },
  };
}
