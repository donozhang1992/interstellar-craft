import * as THREE from 'three';
import { BH_DIR, BH_POS, BH_QUAD, BH_WPRS, computeDiskBasis } from './diskBasis';
import { BH_FRAGMENT_SHADER, BH_VERTEX_SHADER } from './shaders';

export { BH_DIR, BH_POS, BH_QUAD, BH_SPAN_RS, BH_WPRS, computeDiskBasis } from './diskBasis';
export type { DiskBasis } from './diskBasis';

/** Offscreen RT resolution — TECH_SPEC §7.1: 1280², HalfFloat. NEVER full-screen (AMD TDR). */
export const BH_RT_SIZE = 1280;

export interface BlackHole {
  /** Billboard quad carrying the RT texture; add to the main scene. */
  billboard: THREE.Mesh;
  /** Orient the billboard at the camera + refresh shader camera uniforms. Call before renderRT. */
  update(camera: THREE.Camera): void;
  /**
   * Run the geodesic raymarch into the offscreen 1280² RT. EXPENSIVE (up to 230
   * integration steps × 1280² fragments) — render once at startup and only on
   * demand (camera moved / setTime called), never unconditionally per frame.
   */
  renderRT(renderer?: THREE.WebGLRenderer): void;
  /**
   * Advance the accretion-disk swirl phase (trailer uniform uTime, seconds).
   * Only takes visual effect after the next renderRT call — animating the disk
   * means paying the full raymarch cost per update.
   */
  setTime(t: number): void;
  /** Free GPU resources (RT, geometries, materials). */
  dispose(): void;
}

/**
 * Gargantua black hole: Schwarzschild geodesic raytracer rendered into an
 * offscreen 1280² HalfFloat render target, composited into the scene as a
 * premultiplied-alpha billboard. Ported verbatim from prototype/trailer.html.
 */
export function createBlackHole(defaultRenderer: THREE.WebGLRenderer): BlackHole {
  // 吸积盘局部坐标系：法线略向镜头倾斜（电影机位：从盘面稍上方看）
  const { n: bhN, bx: bhBx, bz: bhBz } = computeDiskBasis(BH_DIR);

  const uniforms = {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uBHPos: { value: BH_POS },
    uWprs: { value: BH_WPRS },
    uBx: { value: bhBx },
    uBn: { value: bhN },
    uBz: { value: bhBz },
    uQuadPos: { value: BH_POS },
    uQuadRight: { value: new THREE.Vector3(1, 0, 0) },
    uQuadUp: { value: new THREE.Vector3(0, 1, 0) },
    uQuadSize: { value: 0 },
  };
  const blackHoleMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: BH_VERTEX_SHADER,
    fragmentShader: BH_FRAGMENT_SHADER,
  });

  // 离屏渲染：固定分辨率做测地线积分，billboard 只贴结果纹理（防 GPU 超时）
  const rt = new THREE.WebGLRenderTarget(BH_RT_SIZE, BH_RT_SIZE, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const rtScene = new THREE.Scene();
  const rtCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rtQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blackHoleMat);
  rtScene.add(rtQuad);

  const billboardMat = new THREE.MeshBasicMaterial({
    map: rt.texture,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  // 预乘 alpha 混合：rgb 直加、alpha 只控制背景遮挡（雾尾不被边缘渐隐削暗）
  // TECH_SPEC §7.2 — plain transparency darkens the disk fog tails.
  billboardMat.blending = THREE.CustomBlending;
  billboardMat.blendSrc = THREE.OneFactor;
  billboardMat.blendDst = THREE.OneMinusSrcAlphaFactor;
  const billboard = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), billboardMat);
  billboard.position.copy(BH_POS);
  billboard.scale.setScalar(BH_QUAD);
  uniforms.uQuadSize.value = BH_QUAD;

  function update(camera: THREE.Camera): void {
    billboard.lookAt(camera.position);
    billboard.updateMatrixWorld();
    const q = billboard.quaternion;
    uniforms.uQuadRight.value.set(1, 0, 0).applyQuaternion(q);
    uniforms.uQuadUp.value.set(0, 1, 0).applyQuaternion(q);
    uniforms.uCamPos.value.copy(camera.position);
  }

  function renderRT(renderer: THREE.WebGLRenderer = defaultRenderer): void {
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(rtScene, rtCamera);
    renderer.setRenderTarget(prevTarget);
  }

  function setTime(t: number): void {
    uniforms.uTime.value = t;
  }

  function dispose(): void {
    rt.dispose();
    rtQuad.geometry.dispose();
    blackHoleMat.dispose();
    billboard.geometry.dispose();
    billboardMat.dispose();
  }

  return { billboard, update, renderRT, setTime, dispose };
}
