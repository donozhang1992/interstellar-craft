/**
 * Crash Pod render entity — a low-poly wrecked escape pod at the spawn point.
 * Gives the player a clear visual target for the ch1 "Salvage the crash pod [E]"
 * step. Pure visual (no game-state coupling); game layer adds it to the scene.
 *
 * Shape: a squat cylinder body (the pod shell) + four splayed landing-leg stumps
 * + a cracked viewport disc on the front face. Tinted with emissive accent so it
 * reads at night. Material is MeshStandardMaterial with modest emissive so it
 * catches ambient light from the black-hole sky.
 *
 * NOT added under __TEST__ (same pattern as the Observer Jelly) so visual baselines
 * stay byte-identical.
 */
import * as THREE from 'three';

export interface CrashPod {
  group: THREE.Group;
  dispose(): void;
}

export function createCrashPod(x: number, y: number, z: number): CrashPod {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const mats: THREE.Material[] = [];

  function mat(
    color: number,
    emissive = 0x000000,
    emissiveIntensity = 0,
  ): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity,
      roughness: 0.85,
      metalness: 0.35,
    });
    mats.push(m);
    return m;
  }

  // — Pod shell: flattened cylinder (the main hull)
  const shellGeo = new THREE.CylinderGeometry(0.9, 1.05, 1.5, 10, 1);
  const shell = new THREE.Mesh(shellGeo, mat(0x4a5568, 0x2a3a4a, 0.15));
  shell.rotation.z = Math.PI / 2; // lay on its side (crashed)
  shell.rotation.y = 0.4;
  shell.position.y = 0.6;
  group.add(shell);

  // — Viewport disc on the front face (cracked look via ring geometry)
  const viewGeo = new THREE.RingGeometry(0.12, 0.38, 12);
  const view = new THREE.Mesh(viewGeo, mat(0x1a2a4a, 0x3060a0, 0.6));
  view.position.set(Math.cos(0.4) * 0.91, 0.6, Math.sin(0.4) * 0.91);
  view.lookAt(new THREE.Vector3(x + Math.cos(0.4) * 3, y + 0.6, z + Math.sin(0.4) * 3));
  group.add(view);

  // — Landing leg stumps (4, splayed outward, partly buried)
  const legGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.7, 6);
  const legMat = mat(0x3a4050, 0x000000, 0);
  const legOffsets: [number, number][] = [
    [0.8, 0.6],
    [-0.8, 0.6],
    [0.8, -0.6],
    [-0.8, -0.6],
  ];
  for (const [lx, lz] of legOffsets) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, 0.2, lz);
    leg.rotation.z = lx > 0 ? 0.35 : -0.35;
    leg.rotation.x = lz > 0 ? 0.25 : -0.25;
    group.add(leg);
  }

  // — Ground scorch disc (a flat dark circle under the pod)
  const scorchGeo = new THREE.CircleGeometry(1.4, 16);
  const scorchMat = new THREE.MeshBasicMaterial({
    color: 0x0a0a0e,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  mats.push(scorchMat);
  const scorch = new THREE.Mesh(scorchGeo, scorchMat);
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = 0.01;
  group.add(scorch);

  // — [E] prompt billboard (always faces camera via renderOrder trick — positioned above)
  // We use a simple plane with a canvas texture for the "[E] Salvage" hint.
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.roundRect(2, 2, 124, 28, 6);
  ctx.fill();
  ctx.fillStyle = '#ffd98a';
  ctx.font = 'bold 14px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('[E] Salvage', 64, 16);
  const tex = new THREE.CanvasTexture(canvas);
  const promptGeo = new THREE.PlaneGeometry(1.4, 0.35);
  const promptMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mats.push(promptMat);
  const prompt = new THREE.Mesh(promptGeo, promptMat);
  prompt.position.y = 2.1;
  prompt.renderOrder = 1;
  group.add(prompt);

  // Billboard update — caller calls this each frame with camera
  (group as THREE.Group & { billboardTarget: THREE.Mesh }).billboardTarget = prompt;

  return {
    group,
    dispose() {
      shellGeo.dispose();
      viewGeo.dispose();
      legGeo.dispose();
      scorchGeo.dispose();
      promptGeo.dispose();
      tex.dispose();
      scorchMat.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
