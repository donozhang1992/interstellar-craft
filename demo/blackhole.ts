/**
 * M0.3b verification demo: static camera aimed at Gargantua over the starfield.
 * No voxel world, no bloom composer (fx lands in M0.4) — raw renderer output
 * with the trailer's tone mapping (ACESFilmic, exposure 1.12).
 */
import * as THREE from 'three';
import { BH_POS, createBlackHole } from '../src/render/blackhole';
import { createNebulae, createStars } from '../src/render/sky';

// Trailer render settings: 1280×720 logical, supersampled ×1.5, ACES @ 1.12.
const W = 1280;
const H = 720;
const SS = 1.5;

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(SS);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(44, W / H, 0.08, 4000);
camera.position.set(0, 0, 0);
camera.lookAt(BH_POS);

scene.add(createStars(SS));
for (const nebula of createNebulae()) scene.add(nebula);

const blackHole = createBlackHole(renderer);
scene.add(blackHole.billboard);

// Static scene: orient billboard, raymarch the RT once, composite once.
blackHole.update(camera);
blackHole.renderRT();
renderer.render(scene, camera);

requestAnimationFrame(() => {
  window.READY = true;
});
