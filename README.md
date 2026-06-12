# INTERSTELLAR CRAFT

![Cinematic trailer — Gargantua over KIPP-7e](docs/media/trailer.webp)

*30-second in-engine cinematic trailer, rendered frame-by-frame in the browser
([how it was made](prototype/)).*

A story-driven voxel mining & building game in the browser. You are an engineer
stranded on a planet orbiting the supermassive black hole **Gargantua**. Mine,
craft, and raise a signal beacon to answer a mysterious pulse from a distant green
world — before the silence answers first.

- 🕳️ Physically-based black hole sky — real-time Schwarzschild geodesic ray tracing
- ⛏️ Minecraft-style voxel mining, crafting, and building
- 🧭 5-chapter story campaign (~40–60 min) + free build mode
- 🫁 Survival against the environment: oxygen, energy, darkness — no combat
- 🌐 Pure web: Three.js + TypeScript, no install

> **Status: in development.** The playable prototype and the 30-second cinematic
> trailer renderer that started this project live in [`prototype/`](prototype/).

## Quick start

```bash
npm install
npm run dev      # play at http://localhost:5173
npm run ci       # typecheck + lint + unit + e2e (full gate)
```

### Run the legacy prototype

```bash
python -m http.server 5181
# → http://localhost:5181/prototype/index.html        (playable prototype)
# → http://localhost:5181/prototype/trailer.html      (trailer renderer)
```

## Project structure

```
src/core/      pure game logic (deterministic, fully unit-tested)
src/render/    Three.js rendering (chunk mesher, black hole, post FX)
src/game/      input, main loop, save system
tests/         Vitest unit + Playwright e2e + visual baselines
docs/          design docs, tech spec, roadmap, agent protocol
prototype/     original single-file game + cinematic trailer pipeline
```

## Development

This game is developed evidence-first (TDD + Playwright visual regression) by a
multi-agent AI workflow under human direction — see
[docs/AGENT_RULES.md](docs/AGENT_RULES.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## License

[MIT](LICENSE) © 2026 Dapeng Zhang
