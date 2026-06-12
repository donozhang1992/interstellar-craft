# INTERSTELLAR CRAFT — Technical Specification

> Architecture contract. Agents MUST respect module boundaries and the rendering
> landmine list (§7) — those are hard-won lessons, do not re-learn them.

## 1. Stack

- **Build**: Vite 5+, TypeScript (strict), ES2022 target
- **Engine**: Three.js r160 (npm dependency, NOT CDN importmap)
- **Unit tests**: Vitest (+ @vitest/coverage-v8)
- **E2E / visual**: Playwright (Chromium project only; Edge fallback channel `msedge` on dev machines)
- **Lint/format**: ESLint + Prettier (config committed; run in CI script)
- **No other runtime dependencies without control-plane approval.**

## 2. Module Architecture — sim/render separation (HARD RULE)

```
src/
├── core/      # Pure logic. ZERO imports from three.js or DOM. 100% unit-testable.
│   ├── world/        # voxel storage (Uint8Array chunks), worldgen (seeded), raycast
│   ├── physics/      # AABB collision, gravity, movement integration (fixed dt)
│   ├── player/       # stats (HP/O2/Energy), inventory, equipment
│   ├── crafting/     # recipe table (mirrors GAME_DESIGN §5), craft()
│   ├── quest/        # chapter state machine, completion predicates, beacon validator
│   ├── entity/       # jelly/beetle/drone behavior (pure state updates)
│   └── rng.ts        # mulberry32 seeded PRNG — the ONLY randomness source in core
├── render/    # Three.js only. Reads core state, never mutates it.
│   ├── chunkMesher/  # greedy-ish mesher + vertex AO (port from prototype verbatim)
│   ├── blackhole/    # geodesic raytracer → offscreen RT → billboard (port from trailer)
│   ├── sky/          # stars, nebulae (renderOrder = -2), gas giant sprite
│   ├── fx/           # particles, bloom/grade composer (trailer pipeline)
│   └── hud/          # DOM-based HUD/menus (HTML overlay, not three.js)
├── game/      # Glue: input, main loop, save/load, audio. Imports core + render.
└── main.ts
```

- `core/` may not import from `render/` or `game/`. Enforced by ESLint
  `no-restricted-imports` — CI fails on violation.
- All game logic advances via `core.step(state, input, dt)` with **fixed dt =
  1/60 s** (accumulator loop in `game/`). Determinism: same seed + same input
  sequence ⇒ identical state. This is load-bearing for tests.

## 3. Determinism & Test Hooks (load-bearing)

The page must expose, in dev/test builds only (`import.meta.env.DEV ||
VITE_TEST_HOOKS=1`):

```ts
window.__game = {
  state,                    // live core GameState (read/write for test setup)
  stepFrames(n: number),    // advance simulation n fixed steps synchronously, then render once
  setInput(partial),        // hold inputs programmatically {forward, jump, mine, ...}
  teleport(x, y, z, yaw?, pitch?),
  give(itemId, count),
  setQuest(chapterId, stepId),
  renderOnce(),             // single deterministic render (no rAF)
  READY: true               // set after worldgen + first render complete
}
```

Playwright drives the game exclusively through these hooks + real key events.
The rAF loop must pause when `window.__TEST__` is set, so `stepFrames` is the only
clock. (Same pattern as trailer's `renderFrame(i)` — proven to work headless.)

## 4. Save System

- `localStorage` key `ic-save-v1`, JSON: `{version, seed, playerState, questState,
  inventory, worldDiff}` where `worldDiff` is a sparse map of edited voxels
  (index → blockId) — never serialize the full world.
- Export/import save as downloadable JSON file (free insurance against storage loss).
- Migration: refuse + offer reset on version mismatch (MVP).

## 5. Performance Budgets (CI-checked where possible)

| Metric | Budget | How measured |
|--------|--------|--------------|
| Frame rate | 60 fps @1080p mid-tier iGPU | Playwright perf probe: avg `stepFrames`+render < 16 ms over 300 frames |
| Chunk rebuild | < 8 ms per 16³ chunk | Vitest bench on mesher (pure data in/out) |
| First playable | < 3 s on localhost | Playwright: nav → `READY` |
| Bundle | < 1.5 MB gzipped (excl. three.js) | `vite build` report |
| Draw calls | < 250 in normal play | `renderer.info` assert in E2E |

## 6. Worldgen Spec

- Chunks 16×16×16, world 16×4×16 chunks (256×64×256).
- Heightmap: 2-octave value noise (seeded mulberry32), amplitude ±6 around y=32.
- Strata: surface regolith (2–3), basalt below, iron y<24 (3% of basalt), copper
  y<28 (2.5%), ice surface patches (noise threshold).
- Caves: 3 worm-carvers, seeded start points, length 180–260 steps, radius 2–3,
  crystal clusters (y<20, cave-adjacent), glowstone on cave ceilings (8%).
- Landmarks placed post-gen: pod at spawn (flatten 6×6), beacon plateau (flatten
  12×12 at fixed offset), debris field (12–18 hull blocks scattered ≤25 of spawn).
- `generateWorld(seed)` is pure and snapshot-tested (hash of voxel array).

## 7. Rendering Landmines (DO NOT RE-LEARN — these cost days)

1. **Black hole MUST render in an offscreen `WebGLRenderTarget` (1280², HalfFloat)
   and be composited as a billboard.** Full-screen geodesic raymarching exceeds
   Windows TDR on AMD iGPUs → WebGL context loss → page freeze. Never raise RT size
   or step counts without a TDR test on weak hardware.
2. **Billboard compositing uses premultiplied alpha** (`CustomBlending`, `OneFactor`/
   `OneMinusSrcAlphaFactor`). Plain transparency makes the billboard edge fade darken
   the accretion-disk fog tails (visible arc artifact).
3. **Stars/nebulae need `renderOrder = -2`** so they draw before the billboard;
   three.js transparent sorting is by object center and WILL put stars on top of the
   black-hole shadow otherwise.
4. **Disk inclination formula**: `bhN = up + view*(-view.y + 0.028)` then
   `bhN.applyAxisAngle(view, -0.21)`. The naive `up - view*k` looks "squat" because
   it ignores camera elevation. Values are final, user-approved against film stills.
5. **Volume disk**: Gaussian-thickness fog (DISK_H = 0.26 rs) with step-size
   subdivision `dt = min(dt, 0.5*DISK_H/|dir.y|)`. A zero-thickness plane leaves a
   concave gap at the disk/lens junction.
6. **Vertex AO corner sampling in the prototype is `x+n+co` (off-by-one vs.
   geometric corner) — keep it.** The final look was tuned WITH this quirk; "fixing"
   it changes the approved visuals. Port verbatim, document, move on.
7. PointLight intensities in r160 physical lighting need 5–60 range, not 0–2.
8. Black-hole shader needs built-in soft compression `col/(1+0.42*col)` before
   bloom or close-ups blow out white.
9. Composer chain: RenderPass → UnrealBloomPass → OutputPass → custom grade pass
   (grain/vignette/CA). Order matters; OutputPass before grade keeps grain linear-safe.

## 8. Input Map

WASD move · Space jump (hold = jump-pack hover when owned) · Mouse look (pointer
lock) · LMB mine (hold) · RMB place · 1–8 hotbar · E interact · Tab/I inventory+craft
· F flight toggle (free mode only) · Esc pause. All bindings in one
`core/input/bindings.ts` table.

## 9. Asset Policy

No binary assets in repo except tiny PNGs (icons ≤ 32 KB each). Block textures are
procedural canvas-generated at boot (prototype already does this — port it). Audio
files (M5) go in `public/audio/`, ≤ 200 KB each, license noted in `docs/CREDITS.md`.

## 10. Browser Support

Chromium-family desktop (Chrome/Edge) is the target. Firefox/Safari: best-effort,
no CI gate. WebGL2 required — show a friendly error card if unavailable.
