import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';

/**
 * Starfield — ported verbatim from prototype/trailer.html (seed, count, radius,
 * color/luminance/size distributions). TECH_SPEC §7.3: stars must draw before
 * the black-hole billboard → renderOrder = -2.
 */

export const STAR_SEED = 20260611;
export const STAR_COUNT = 3200;
export const STAR_RADIUS = 1600;

export interface StarAttributes {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
}

/**
 * Deterministic star placement (trailer-verbatim sampling). `pixelRatio`
 * multiplies gl_PointSize — the trailer rendered at SS = 1.5; pass the actual
 * renderer pixel ratio for the same on-screen star sizes.
 */
export function generateStarAttributes(
  seed: number = STAR_SEED,
  count: number = STAR_COUNT,
  pixelRatio = 1.5,
): StarAttributes {
  const rng = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    do {
      v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
    v.normalize().multiplyScalar(STAR_RADIUS);
    if (v.y < 0 && rng() < 0.8) v.y = -v.y;
    positions.set([v.x, v.y, v.z], i * 3);
    const t = rng();
    // tuple type (not number[]) keeps indexing safe under noUncheckedIndexedAccess
    const c: [number, number, number] =
      t < 0.68 ? [1, 1, 1] : t < 0.85 ? [0.72, 0.83, 1] : [1, 0.86, 0.7];
    const lum = 0.35 + rng() * 0.65;
    colors.set([c[0] * lum, c[1] * lum, c[2] * lum], i * 3);
    sizes[i] = (1.2 + rng() * 2.6) * pixelRatio;
  }
  return { positions, colors, sizes };
}

/** Build the star Points object (trailer-verbatim shader). */
export function createStars(pixelRatio = 1.5): THREE.Points {
  const { positions, colors, sizes } = generateStarAttributes(STAR_SEED, STAR_COUNT, pixelRatio);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: `attribute float aSize; varying vec3 vC;
      void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.);
        gl_PointSize=aSize; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC;
      void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard;
        gl_FragColor=vec4(vC*1.2, smoothstep(.5,.08,d)); }`,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  const stars = new THREE.Points(g, m);
  // 强制先画：星空整体对象中心在原点附近，默认排序会把它叠绘到黑洞上面
  stars.renderOrder = -2;
  return stars;
}
