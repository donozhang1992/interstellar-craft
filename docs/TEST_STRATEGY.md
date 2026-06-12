# INTERSTELLAR CRAFT — Test Strategy

> Evidence-first: a feature does not exist until its evidence exists.
> "It looks right when I run it" is not evidence.

## 1. The Three Evidence Layers

Every feature must ship with all applicable layers in the SAME pull request/merge:

| Layer | Tool | Applies to | Gate |
|-------|------|-----------|------|
| L1 Unit (TDD) | Vitest | everything in `src/core/` | core coverage ≥ 85% lines, 100% of public functions touched |
| L2 Behavior E2E | Playwright | player-visible flows | all listed scenarios green |
| L3 Visual regression | Playwright screenshots | rendering, HUD, sky | pixel diff < 0.5% vs baseline |

`src/render/` is exempt from L1 (GPU code) but covered by L3. `src/game/` glue is
covered by L2.

## 2. TDD Protocol (L1)

For core modules, the commit sequence inside a task is:
1. Write failing test(s) expressing the spec (cite GAME_DESIGN section in a comment).
2. Run — confirm failure for the right reason.
3. Implement minimum to pass.
4. Refactor with tests green.

Tests mirror canonical numbers from GAME_DESIGN §12 via a shared
`tests/fixtures/constants.ts` — if design doc changes, fixture changes in the same
commit, and the diff makes the gameplay change visible to review.

**Must-have unit suites**: worldgen snapshot (hash per seed), raycast (face selection
edge cases), AABB collision (corner clip, step-up, ceiling), stats drain/restore
curves, full recipe table (every recipe craftable exactly when ingredients present;
ingredients consumed; stack limits), quest state machine (every transition + every
completion predicate + no skips), beacon shape validator (valid tower, 1-block-off
cases), entity behavior steps, save round-trip (state → JSON → state identical),
PRNG determinism (fixed vectors).

## 3. E2E Behavior (L2)

Playwright drives a real dev-server build through `window.__game` hooks + real key
events (see TECH_SPEC §3). Time advances ONLY via `stepFrames(n)` — never wall-clock
waits (`waitForTimeout` is banned in this repo).

**Scenario catalog (grows per milestone, all must stay green):**
- new game → READY < 3 s → tutorial prompt visible
- mine 3 regolith with LMB-hold → inventory shows 3
- place block from hotbar → world updated → collision works on it (jump onto it)
- craft Drill Mk1 at workbench → appears in hotbar → mines basalt faster (timed via stepFrames count)
- O₂ drains to 0 (teleport to cave, fast-forward) → HP drains → death → respawn at pod with 50% inventory
- chapter 1→2 transition fires exactly when predicate satisfied
- full-game speedrun: scripted hook-assisted playthrough of ch1–ch5 completes < 90 s of stepped sim
- save → reload page → state identical (position, inventory, quest, edited voxels)

## 4. Visual Regression (L3)

- Fixed seed `7e`, fixed camera poses via `teleport()`, `renderOnce()`, screenshot.
- Baselines in `tests/visual/__baselines__/` (committed PNGs, small set ≤ 15 shots).
- Shots: spawn vista (black hole sky), black hole close framing, cave + glowstone,
  HUD composite, crafting UI, each chapter's landmark, ending frame.
- Threshold: `maxDiffPixelRatio: 0.005`. Anti-aliasing jitter: render at fixed
  1280×720, `deviceScaleFactor 1`, GPU rasterization flags pinned in playwright config
  (same flags as prototype capture pipeline — they're proven stable).
- Changing a baseline requires: side-by-side justification in the PR/merge note +
  control-plane (main agent) approval. Agents may NEVER silently re-baseline.

## 5. Static Gates

`npm run check` = typecheck (tsc --noEmit) + ESLint (incl. core-imports-render ban)
+ Prettier check. Runs before any test suite in CI script `npm run ci`.

## 6. The Loop (every dev agent, every task)

```
red → green → refactor → npm run ci (all gates) →
  pass: hand off for adversarial verification
  fail: fix; after 3 consecutive failed fix attempts on the same gate,
        STOP and report to control plane with full failure output
```

Adversarial verification (separate agent, blind to implementation): re-runs `npm run
ci`, then actively tries to break the feature via hooks (out-of-range values, weird
orderings, spam inputs), and checks the feature against GAME_DESIGN numbers. Files
findings; feature merges only when verifier signs off.

## 7. Performance Probes

In E2E: average frame cost over 300 stepped frames < 16 ms; `renderer.info.render.
calls` < 250 at spawn vista. Vitest bench: single chunk remesh < 8 ms (run on CI
machine, soft-fail with warning since CI hardware varies; hard data recorded in
`docs/perf-log.md`).

## 8. Definition of Done (per task)

- [ ] All three evidence layers present and green (`npm run ci`)
- [ ] No skipped/`.only` tests; no `waitForTimeout`
- [ ] GAME_DESIGN / TECH_SPEC updated if behavior or numbers changed
- [ ] Adversarial verifier signed off
- [ ] Merged to main by control plane; main is never red
