/**
 * Ending cinematic (M4.3b §3f) — a short, self-contained, in-engine sequel-hook
 * beat ported from the trailer's alien-world scene (prototype/trailer.html): a
 * tall, thin alien standing on a green tundra world receives the beacon's signal,
 * looks toward camera, amber eyes glowing. On finish (or skip) → return to free
 * mode play.
 *
 * SELF-CONTAINED. This module owns its OWN THREE.Scene + camera and draws into the
 * SHARED renderer (so it does not allocate a second WebGL context). It NEVER
 * touches the game scene or any existing render module's output, so the world/sky/
 * mesher visual baselines stay byte-identical (the game loop simply stops issuing
 * its own renders while the ending plays — see main.ts). The amber palette + the
 * blocky alien silhouette mirror the trailer (alienBodyMat 0x5e7468 tundra-green,
 * alienEyeMat emissive 0xffb340 amber).
 *
 * RENDERING LANDMINES (TECH_SPEC §7): NO offscreen RT, NO bloom, NO post — this is
 * a plain forward render of a handful of boxes lit by two lights, so there is no
 * AMD-TDR raymarch and nothing that could perturb the pinned black-hole pipeline.
 *
 * DETERMINISM (TECH_SPEC §3): time is STEPPED, never wall-clock. Under `__TEST__`
 * `play()` renders a SINGLE representative frame (the alien framed with amber eyes,
 * t = T_REPRESENTATIVE) and marks the sequence done on the next step — so the
 * ending visual baseline is reproducible and `stepFrames` drives it. Outside
 * `__TEST__` it animates via the rAF clock the controller installs on play().
 */
import * as THREE from 'three';

/** Tundra-green alien body + amber emissive eyes (trailer palette). */
const BODY_COLOR = 0x5e7468;
const BODY_EMISSIVE = 0x14201a;
const EYE_EMISSIVE = 0xffb340;
/** Green-world ground + sky tint (trailer alien-world feel). */
const GROUND_COLOR = 0x3f6a48;
const SKY_TOP = 0x0c1f18;
/** The representative still rendered under __TEST__ (a fixed, baseline-able t). */
const T_REPRESENTATIVE = 1.6;
/** Total runtime of the animated (non-test) sequence, seconds. */
const DURATION = 6.0;

export interface EndingCinematic {
  /** True while the sequence is playing (animating or holding the test still). */
  readonly isPlaying: boolean;
  /** True once the sequence has finished or been skipped at least once. */
  readonly isDone: boolean;
  /** Begin the sequence: show the overlay + (test) render one representative frame. */
  play(): void;
  /** Skip/dismiss immediately: hide the overlay, mark done, return to play. */
  skip(): void;
  /** Dispose owned GL resources. */
  dispose(): void;
}

/**
 * Build the ending cinematic over the SHARED renderer and a host DOM overlay
 * (#ending: a full-screen letterboxed band with the sequel-hook subtitle + a
 * "press any key to skip" hint). The overlay is hidden until play().
 */
export function createEndingCinematic(
  renderer: THREE.WebGLRenderer,
  overlay: HTMLElement,
): EndingCinematic {
  // ---- the alien world: a small green plinth + a blocky tall alien ----
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_TOP);
  scene.fog = new THREE.Fog(SKY_TOP, 14, 42);

  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 200);
  // Frame the alien from slightly below + to the side so the amber eyes read.
  camera.position.set(3.2, 2.4, 6.4);
  camera.lookAt(0, 2.2, 0);

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 9, 1, 32),
    new THREE.MeshStandardMaterial({ color: GROUND_COLOR, roughness: 0.95 }),
  );
  ground.position.y = -0.5;
  scene.add(ground);

  // Lighting: a cool ambient + a warm key, so the amber eyes pop against the dusk.
  scene.add(new THREE.AmbientLight(0x33485a, 0.7));
  const key = new THREE.DirectionalLight(0xffd9b0, 1.1);
  key.position.set(4, 8, 6);
  scene.add(key);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: BODY_COLOR,
    roughness: 0.8,
    emissive: new THREE.Color(BODY_EMISSIVE),
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x140e04,
    emissive: new THREE.Color(EYE_EMISSIVE),
    emissiveIntensity: 2,
  });

  /** Helper: a centered box at (x,y,z) of (w,h,d). */
  const box = (
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  };

  // The tall, thin alien (trailer proportions, scaled up ~2× for a clean portrait).
  const alien = new THREE.Group();
  alien.add(box(0.84, 1.84, 0.6, bodyMat, 0, 1.6, 0)); // torso
  const head = new THREE.Group();
  head.add(box(0.68, 1.08, 0.76, bodyMat, 0, 0, 0)); // long head
  head.add(box(0.17, 0.24, 0.06, eyeMat, -0.18, 0.06, 0.4)); // left eye
  head.add(box(0.17, 0.24, 0.06, eyeMat, 0.18, 0.06, 0.4)); // right eye
  head.add(box(0.05, 0.6, 0.05, bodyMat, -0.2, 0.66, -0.1)); // antenna L
  head.add(box(0.05, 0.72, 0.05, bodyMat, 0.2, 0.72, -0.1)); // antenna R
  head.add(box(0.1, 0.1, 0.1, eyeMat, -0.2, 1.0, -0.1)); // antenna tip L (glow)
  head.add(box(0.1, 0.1, 0.1, eyeMat, 0.2, 1.12, -0.1)); // antenna tip R (glow)
  head.position.set(0, 3.0, 0);
  alien.add(head);
  for (const sx of [-1, 1]) {
    alien.add(box(0.2, 1.56, 0.2, bodyMat, sx * 0.56, 2.36, 0)); // thin arm
    alien.add(box(0.24, 1.8, 0.24, bodyMat, sx * 0.24, 0.9, 0)); // thin leg
  }
  scene.add(alien);

  // A receiving-crystal beside the alien (the signal it just got — amber flare).
  const recvLight = new THREE.PointLight(EYE_EMISSIVE, 0, 18, 1.7);
  recvLight.position.set(-2.2, 2.4, -0.6);
  scene.add(recvLight);

  let playing = false;
  let done = false;
  let elapsed = 0;
  let rafId = 0;

  /** Render one frame of the alien world at sequence time t (seconds). */
  const renderAt = (t: number): void => {
    // The alien lifts its head toward camera as the signal lands; eyes brighten.
    const look = Math.min(1, t / 2.0);
    head.rotation.x = -0.5 + 0.5 * look; // tilt up to face camera
    eyeMat.emissiveIntensity = 1.2 + 2.0 * look;
    recvLight.intensity = 6 * Math.min(1, t / 1.2);
    renderer.render(scene, camera);
  };

  /** Finish the sequence: stop animating, hide the overlay, return to play. */
  const finish = (): void => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    playing = false;
    done = true;
    overlay.classList.remove('open');
  };

  return {
    get isPlaying(): boolean {
      return playing;
    },
    get isDone(): boolean {
      return done;
    },
    play(): void {
      if (playing) return;
      playing = true;
      elapsed = 0;
      overlay.classList.add('open');
      if (window.__TEST__) {
        // Deterministic: render a single representative still; no rAF clock.
        renderAt(T_REPRESENTATIVE);
        return;
      }
      const last = { t: performance.now() };
      const tick = (now: number): void => {
        const dt = Math.min((now - last.t) / 1000, 0.05);
        last.t = now;
        elapsed += dt;
        renderAt(elapsed);
        if (elapsed >= DURATION) {
          finish();
          return;
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    },
    skip(): void {
      if (!playing) return;
      finish();
    },
    dispose(): void {
      if (rafId) cancelAnimationFrame(rafId);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      bodyMat.dispose();
      eyeMat.dispose();
    },
  };
}
