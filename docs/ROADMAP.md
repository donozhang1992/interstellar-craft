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

0 blocks→12 blocks; hotbar/inventory; workbench + full recipe table; tool tiers
gate mining; HUD (hotbar, stat bars, prompts). **Exit**: every GAME_DESIGN §5 recipe
unit-tested · E2E craft-and-use flow · HUD visual baselines · mining speed matrix
(block × tool) snapshot test.

## M2 — Survival: Stats, Death, Caves

HP/O₂/Energy with GAME_DESIGN §6 curves; death/respawn/drop; cave carving in
worldgen; glowstone/crystal/flares; solar recharge; O₂ canisters. **Exit**: stat
curve unit tests match design table · E2E death loop · cave visual baseline ·
worldgen snapshot updated once (justified).

## M3 — Quest Engine + Chapters 1–2

Quest state machine; objective HUD; subtitle/dialog system (trailer typography);
Observer Jelly guide; ch1 tutorial + pod salvage; ch2 antenna + 3 decode puzzles;
scanner. **Exit**: state machine 100% transition coverage · E2E ch1→ch2 playthrough ·
puzzle solvable + unsolvable-until-correct unit tests.

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

(Control plane appends one line per milestone close with evidence links.)
