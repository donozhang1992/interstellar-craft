# INTERSTELLAR CRAFT

Story-driven voxel mining/building game set on a planet orbiting the Gargantua
black hole. Web, Three.js r160, TypeScript, single-player.

## Document map (read in this order for any dev task)

1. [docs/AGENT_RULES.md](docs/AGENT_RULES.md) — multi-agent protocol, evidence rules, merge discipline
2. [docs/TECH_SPEC.md](docs/TECH_SPEC.md) — architecture, module boundaries, **rendering landmines (§7)**
3. [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — canonical gameplay numbers, quests, recipes
4. [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md) — three evidence layers, TDD protocol, DoD
5. [docs/ROADMAP.md](docs/ROADMAP.md) — milestones, task footprints, status log

## Hard rules (summary — full versions in the docs above)

- `src/core/` never imports three.js or DOM. Fixed dt = 1/60. Seeded PRNG only.
- Evidence first: failing test → implement → `npm run ci` green → adversarial verify → merge.
- Black hole renders in an offscreen 1280² RT (AMD TDR!). Stars `renderOrder=-2`.
  Premultiplied-alpha billboard. Don't "fix" the vertex-AO off-by-one. (TECH_SPEC §7)
- Never weaken a test/baseline/threshold to pass. 3 failed fixes ⇒ stop and escalate.
- Only the control plane merges to `main` and pushes.

## Commands

- `npm run dev` — Vite dev server
- `npm run ci` — typecheck + lint + unit + e2e (the merge gate)
- `npm test` / `npm run e2e` — individual suites
- Preview server for the legacy prototype: `.claude/launch.json` (`minecraft-space`,
  python http.server 5181) → `/prototype/index.html`, `/prototype/trailer.html`

## Layout

- `src/core|render|game` — the game (see TECH_SPEC §2)
- `tests/` — unit, e2e, visual baselines
- `prototype/` — original single-file game + 30 s cinematic trailer renderer +
  frame-capture/encode tools. **Reference only — do not modify, do not read
  `prototype/tools/frames/`.**
- `docs/media/` — committed promo images
