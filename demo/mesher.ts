/**
 * M0.3a demo — mesh the whole seed-0x7e world with the ported chunk mesher,
 * light it with the prototype's lighting constants, render ONE static frame,
 * then set window.READY = true (control-plane screenshot hook).
 */
import * as THREE from 'three';
import { generateWorld } from '../src/core/world/worldgen';
import { createChunkMesh } from '../src/render/chunkMesher/createChunkMesh';
import { buildChunkGeometry } from '../src/render/chunkMesher/mesher';
import { createBlockMaterials } from '../src/render/textures/blockTextures';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060e);
scene.fog = new THREE.Fog(0x05060e, 70, 170); // prototype scene fog

// lighting — prototype constants (prototype/index.html "光照" block)
const BH_DIR = new THREE.Vector3(0.55, 0.42, -0.72).normalize();
scene.add(new THREE.AmbientLight(0x46507a, 0.55));
const sun = new THREE.DirectionalLight(0xffd9b0, 1.05);
sun.position.copy(BH_DIR).multiplyScalar(100);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x32406e, 0x0a0a12, 0.5));

// world + meshes
const world = generateWorld(0x7e);
const materials = createBlockMaterials();
const t0 = performance.now();
let chunks = 0;
for (let cy = 0; cy < world.chunksY; cy++) {
  for (let cz = 0; cz < world.chunksZ; cz++) {
    for (let cx = 0; cx < world.chunksX; cx++) {
      const mesh = createChunkMesh(buildChunkGeometry(world, cx, cy, cz), materials);
      if (mesh) {
        scene.add(mesh);
        chunks++;
      }
    }
  }
}
console.log(
  `[mesher-demo] meshed ${chunks} non-empty chunks in ${(performance.now() - t0).toFixed(1)} ms`,
);

// static orbit-ish camera over the world centre
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 3000);
camera.position.set(118, 64, 128);
camera.lookAt(48, 18, 48);

renderer.render(scene, camera);
window.READY = true;
