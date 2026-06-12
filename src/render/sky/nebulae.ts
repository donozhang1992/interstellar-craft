import * as THREE from 'three';

/**
 * Nebula sprites — ported verbatim from prototype/trailer.html (colors,
 * directions, scales, opacity). TECH_SPEC §7.3: renderOrder = -2 so they draw
 * before the black-hole billboard.
 */

const NEBULAE: ReadonlyArray<[number, [number, number, number], number]> = [
  [0x2a3a7a, [-0.7, 0.25, -0.4], 1000],
  [0x5a2a6a, [0.3, 0.5, -0.8], 1250],
  [0x1a4a5a, [0.9, 0.15, 0.5], 1100],
];

function makeNebulaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,.8)');
  grad.addColorStop(0.4, 'rgba(255,255,255,.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Build the three nebula sprites (requires DOM for the canvas texture). */
export function createNebulae(): THREE.Sprite[] {
  const tex = makeNebulaTexture();
  return NEBULAE.map(([color, d, sc]) => {
    const m = new THREE.SpriteMaterial({
      map: tex,
      color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      fog: false,
    });
    const s = new THREE.Sprite(m);
    s.position.set(d[0], d[1], d[2]).normalize().multiplyScalar(1500);
    s.scale.setScalar(sc);
    s.renderOrder = -2;
    return s;
  });
}
