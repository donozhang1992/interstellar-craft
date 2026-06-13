# INTERSTELLAR CRAFT — Roadmap

> Milestones are sequential; tasks inside a milestone may run in parallel worktrees
> when their module footprints don't overlap (see AGENT_RULES §3).
> A milestone is closed only when every exit criterion has linked evidence.

## M0 — Scaffold & Prototype Port

Goal: modern toolchain up; prototype gameplay reproduced 1:1; test pipeline proven.

| # | Task | Module footprint | Parallel-safe |
|---|------|-----------------|---------------|
| 0.1 | Vite+TS+Vitest+Playwright scaffold, ESLint boundary rule, `npm run ci` | repo root | first (blocks all) |
| 0.2 | Port core: world storage, worldgen, raycast, AABB physics, PRNG (TDD) | `src/core/` | ✅ with 0.3 |
| 0.3 | Port render: chunk mesher + vertex AO, sky, black hole offscreen RT, composer | `src/render/` | ✅ with 0.2 |
| 0.4 | Glue: input, fixed-dt loop, pointer lock, test hooks (`__game`) | `src/game/` | after 0.2+0.3 |
| 0.5 | E2E + visual baselines; adversarial pass; perf probes | `tests/` | last |

**Exit criteria**: prototype parity (move/jump/fly, mine/place all 6 legacy blocks,
identical black-hole sky) · `npm run ci` green · ≥ 12 visual baselines committed ·
perf budgets met · `prototype/` untouched (kept as reference).

## M1 — Core Loop: Inventory, Crafting, Tools, HUD

6→13 block types; hotbar(8)/inventory; full recipe table; tool tiers gate mining
(hold-to-mine with progress, replaces M0 instant click); crafting overlay UI; HUD
expansion. M1 design decisions (logged 2026-06-12): block IDs 1–6 frozen, new types
7–13; "lamp" fulfills glowstone role; iron/copper ore EXIST as items/blocks but only
spawn in worldgen at M2 (E2E uses give() hook); crafting UI opens via Tab anywhere
(workbench-proximity requirement deferred to M3 quest flavor); HOTBAR = 8 slots
(HUD baselines change — pre-approved).

| # | Task | Module footprint | Order |
|---|------|-----------------|-------|
| 1.1 | Inventory + item system (TDD): stacks, STACK_MAX 64, hotbar 8, tools as items | `src/core/player/inventory.ts`, `src/core/items/**` | first |
| 1.2 | Recipe table + craft() (TDD, every §5 recipe) | `src/core/crafting/**` | ∥ 1.3, after 1.1 |
| 1.3 | Mining model (TDD): hardness × tool matrix, hold-progress, min-tool gate | `src/core/mining/**` | ∥ 1.2, after 1.1 |
| 1.4 | Game glue + HUD: 8-slot hotbar, inventory/craft overlay (Tab), hold-to-mine input + progress UI, textures for blocks 7–13, place-from-inventory | `src/game/**`, `src/render/textures/**` (additive), `index.html` | after 1.2+1.3 |
| 1.5 | E2E craft-and-use flows, mining matrix snapshot, HUD visual baselines (re-baseline approved), adversarial pass | `tests/**` | last |

**Exit**: every GAME_DESIGN §5 recipe unit-tested · E2E craft-and-use flow ·
HUD visual baselines · mining speed matrix (block × tool) snapshot test.

## M2 — Survival: Stats, Death, Caves

HP/O₂/Energy with GAME_DESIGN §6/§12 curves; death/respawn/drop; cave carving in
worldgen; lamp(glowstone)/crystal in caves; flares; solar recharge; O₂ canisters.
M2 design decisions logged in GAME_DESIGN §12 (survival block + M2 simplifications).
**This is the one milestone where the worldgen terrain snapshot changes** — the
terrain-affected visual baselines are regenerated WITH control-plane pre-approval.

| # | Task | Module footprint | Order |
|---|------|-----------------|-------|
| 2.1 | Stats core (TDD): HP/O₂/Energy step curves, fall damage, death detection, respawn+drop cache | `src/core/player/stats.ts`, `src/core/player/death.ts`, `tests/unit/stats/**` | ∥ 2.2 |
| 2.2 | Worldgen rework (TDD): 3 worm-carver caves→y8, iron y<24, copper y<28, lamp on cave ceilings, crystal y<20; keep spawn solid. NEW terrain hash + regen terrain visual baselines (PRE-APPROVED) | `src/core/world/worldgen.ts`, `src/game/spawn.ts`, `tests/unit/world/**`, terrain `tests/visual` baselines + any terrain-dependent `tests/e2e` fixups | ∥ 2.1 (merge 2.1 first) |
| 2.3 | Game glue: stat HUD bars (HP/O₂/Energy), depth/pod O₂ logic, energy drains, solar/canister/flare use, death→respawn flow, cave lamp lighting | `src/game/**`, `index.html`, `tests/e2e/**`, HUD visual baselines | after 2.1+2.2 |
| 2.4 | Closeout: E2E death loop, cave visual baseline, survival exit-criteria audit | `tests/**` | last |

**Exit**: stat curve unit tests match design table · E2E death loop · cave visual
baseline · worldgen snapshot updated once (justified) · ore/lamp/crystal obtainable
by mining (M1's give()-hook stand-in retired).

## M3 — Quest Engine + Chapters 1–2

Quest state machine; objective HUD; subtitle/dialog system (trailer typography);
Observer Jelly guide; ch1 tutorial + pod salvage; ch2 antenna + 3 decode puzzles;
scanner. Design pinned in GAME_DESIGN §3a–3c (quest model, ch1/ch2 steps, decode
puzzle). M3 decision: KEEP the M1 starter kit (salvage-grants-gear retirement
deferred). Ch1 completion = explicit `salvaged` flag (§3 predicate fixed from the
bogus hull-count).

| # | Task | Module footprint | Order |
|---|------|-----------------|-------|
| 3.1 | Quest engine core (TDD): QuestState, chapter/step tables for ch1+ch2, predicates, `advance()`, flags/counters, unlock effects | `src/core/quest/engine.ts` + chapter defs, `tests/unit/quest/**` | ∥ 3.2 |
| 3.2 | Decode puzzle core (TDD): 3×3 glyph table, `isSolved(panel, glyph)`, antenna structural validator | `src/core/quest/decode.ts`, `src/core/quest/antenna.ts`, `tests/unit/quest/**` | ∥ 3.1 |
| 3.3 | Game glue + HUD: objective line (top-right), subtitle/dialog band (trailer type), event→flag/counter wiring, pod [E] salvage, antenna build detection, 3×3 decode panel UI, scanner unlock+highlight, Observer Jelly entity (drift+glow) | `src/game/**`, `index.html`, `src/render/**` (jelly + scanner tint), `tests/e2e/**`, HUD visual baselines | after 3.1+3.2 |
| 3.4 | Closeout: E2E ch1→ch2 full playthrough, state-machine transition-coverage audit, objective/subtitle/jelly visual baselines | `tests/**` | last |

**Exit**: state machine 100% transition coverage · E2E ch1→ch2 playthrough · puzzle
solvable + unsolvable-until-correct unit tests · objective HUD + decode panel baselines.

## M4 — Chapters 3–5 + Ending

Jump pack; beetle + drone entities; ch3 cave expedition; ch4 beacon blueprint UI +
shape validator; ch5 ignition sequence; ending cinematic (port trailer alien-world
scene as in-engine sequence); free mode + flight. **Exit**: full speedrun E2E < 90 s
stepped sim · beacon validator property tests · ending visual baselines · sequel-hook
shot matches trailer framing.

## M5 — Polish & Release

Audio set; save/load + export; pause/settings (volume, mouse sens, render scale);
title screen (cover.png art direction); perf pass to budgets; README gameplay GIF;
GitHub Pages deploy (`vite build` + actions workflow); itch.io-ready zip. **Exit**:
all budgets green in CI · cold-start full playthrough on clean profile · Pages URL
live · README updated.

## Status Log

| Date | Event |
|------|-------|
| 2026-06-12 | Harness created; M0 started |
| 2026-06-12 | M0.1 scaffold merged (03c4e07): Vite+TS+Vitest+Playwright, core-boundary lint proven, `npm run ci` green (5 unit / 100% rng cov / e2e smoke msedge) |
| 2026-06-12 | M0.2a core world merged (ef0603f, verifier PASS): voxel storage + seeded worldgen + DDA raycast, 29 unit tests, core cov 99%. Terrain contract: hash 55922fda @ seed 0x7e. Accepted deviations: mulberry32 replaces unseeded sine hash; raycast strict maxDist. Remaining M0.2b: AABB physics port |
| 2026-06-12 | M0.2b physics merged (c06837b, verifier PASS): AABB collision + stepPlayer (walk/sprint/jump/fly), PHYS constants prototype-exact, 63 unit tests total, core cov 99%. Integrator contracts: pass dt=1/60, heightmap-derived spawn, edge-triggered toggleFly, ControlLeft-only descend |
| 2026-06-12 | M0.3b black hole + sky merged (2b7ff85, verifier PASS): geodesic RT 1280² HalfFloat, premultiplied billboard, disk basis .06/−.21 pinned, seeded stars/nebulae renderOrder −2, demo/blackhole.html. uTime swirl exposed via setTime — renderRT is expensive (render once at boot / on demand). TECH_SPEC §7.4/7.8 corrected to trailer-actual |
| 2026-06-12 | M0.3a mesher merged (6e13fc1, verifier PASS): pure-data buildChunkGeometry + AO quirk frozen, verbatim textures, demo/mesher.html, 2.2 ms/chunk. NOT ported (deferred to M0.4+): markDirty diagonal-chunk dirty propagation for interactive edits. createChunkMesh takes per-block materials Record |
| 2026-06-12 | M0.4 game glue merged (b3994db, verifier PASS): playable at prototype parity — input/loop/scene/edits+markDirty/HUD/__game hooks, 8 gameplay e2e, determinism probe identical across page reloads. Decisions: game page has NO tone mapping (prototype-verbatim; demos keep ACES) — canonical for M0.5 baselines. BH RT static, rendered once at boot. Known deviation: no disk swirl animation (prototype's cheap billboard had uTime) |
| 2026-06-12 | M0.5 baselines merged (control-plane verified): 12 visual baselines @0.5% gate, perf probes pass with huge margin (0.52 ms avg frame / 16 budget, 77 draw calls / 250, 1.3 s boot / 3). `npm run ci` = check+unit+e2e+visual, 23 browser tests + 83 unit. **M0 CLOSED — all exit criteria met.** Baselines are machine-tied (ANGLE d3d11 + Segoe UI); re-baseline needs CP approval if CI moves. Follow-up backlog: vitest mesher bench + docs/perf-log.md (TEST_STRATEGY §7); shared bootTest e2e fixture |
| 2026-06-13 | M1.1 inventory (ce4a20e) / M1.2 crafting 17 recipes (5db341d) / M1.3 mining matrix (b2d9123) merged, all verifier PASS. 283 unit tests, core modules 100% cov. Ratified: fusion_igniter=material, displayName(EN) canonical for UI, "iron"=ore, outputs=1, magnet_glove ch3, antenna ch2, scanner ch2, drop lost on full inventory |
| 2026-06-13 | M1.4 glue merged (12ff4ef, verifier PASS): real inventory economy + starter kit (TODO M3: drill_mk1 + 8 iron + 8 copper + 4 hull), hold-to-mine w/ progress UI, Tab crafting overlay (unlockedChapter=5 until M3), textures 7–13, 3 HUD baselines re-gen. Tool tier = active hotbar slot. Tier change mid-mine carries progress |
| 2026-06-13 | M1.5 closeout merged (CP verified): capstone craft-and-use e2e, crafting-overlay + mining-progress baselines (14 total), 33 browser tests. **M1 CLOSED — all four exit criteria evidenced** (recipes: tests/unit/crafting; craft-and-use: tests/e2e/craftAndUse.spec.ts; HUD baselines: 6 PNGs; matrix: mining snapshot) |
| 2026-06-13 | Bugfix merged (2d9a29a, CP verified): Tab/crafting overlay was blocked by the title screen (exitPointerLock re-revealed #overlay z20 over #invcraft z15). Centralized title visibility in InputController.syncTitleOverlay() (hidden iff locked OR uiOpen) + re-lock on close + regression e2e |
| 2026-06-13 | M2.1 survival stats merged (20012c0, verifier PASS): SurvivalState hp/o2/energy curves, fall damage, death-drop (floor 50%, tools kept), respawn — §12 exact, 43 tests 100% cov. Pure core; game layer composes with PlayerState. O2 pod refill = 20/s (design decision, §12 left rate open) |
| 2026-06-13 | M2.2 worldgen merged (1454ed5, verifier PASS): 3 worm caves→y8, iron<24/copper<28 veins (in rock+basalt stone family, ratified), crystal y<20 near caves, lamp on cave ceilings; spawn pod platform. Terrain hash 55922fda→9734fb1f. Only crater-rim-ao + demo-mesher baselines changed (demo-blackhole canary intact). Mining economy now closed (give()-hook stand-in still in M1 starter kit until M3). Deferred: beacon-plateau/hull-debris landmarks (§9) → M3/M4. OPS LESSON: a parallel agent's tool leaked an uncommitted worldgen edit into the MAIN worktree (path confusion, same class as the 5173 port-reuse trap) — CP must `git restore` stray edits before merging the verified branch |
| 2026-06-13 | M2.3 survival glue merged (f23cc94, verifier PASS): HP/O₂/Energy HUD bars, depth/pod O₂, fall damage (apex-tracked), death→cache→respawn (conserving, 7/7 adversarial probes), energy gate (Mk2→hand at 0), canister(C)/flare(G), solar=own, minimal cave dim below eye-y 20. 6 HUD baselines re-gen. Decisions: solar own-not-place, jump-pack stub (no own/thrust path yet, energy-drain dormant). Perf boot<3000 is a contention flake (passes clean ~1.9s) |
| 2026-06-13 | M2.4 closeout merged (CP verified): death-loop capstone e2e + cave-resource mineability e2e (iron/crystal/lamp from worldgen, not give) + cave-interior baseline (15 total). Full ci 48 passed. **M2 CLOSED — all exit criteria evidenced** (stat curves: tests/unit/stats; death loop: tests/e2e/deathLoop; cave baseline: cave-interior.png; worldgen snapshot 9734fb1f; mineability: tests/e2e/mineCaveResources). Closeout agent died silently mid-debug (0-byte output, no notification) leaving 2 test-authoring bugs; CP finished — note: agent deaths can leave uncommitted near-complete work, recover via `git status` in the worktree, don't restart |

(Control plane appends one line per milestone close with evidence links.)
