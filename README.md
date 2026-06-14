# INTERSTELLAR CRAFT

![Cinematic trailer — Gargantua over KIPP-7e](docs/media/trailer.webp)

A story-driven voxel mining game set on a planet orbiting the **Gargantua** black
hole. You are an engineer stranded on KIPP-7e. Mine, craft, and raise a signal
beacon to answer a mysterious pulse from a distant green world — before the silence
answers first.

**Play online:** https://donozhang1992.github.io/interstellar-craft/ *(after GH Pages deploy)*

- Physically-based black hole sky — real-time Schwarzschild geodesic ray tracing
- Minecraft-style voxel mining, crafting, and building
- 5-chapter story campaign (~40-60 min) + free build mode after the ending
- Survival: oxygen, energy, darkness — no combat
- Pure web: Three.js + TypeScript, no install

## Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Space | Jump / Jump-pack hover (when equipped) |
| Mouse | Look (pointer lock) |
| LMB hold | Mine block |
| RMB | Place block |
| 1–8 | Hotbar slots |
| E | Interact (salvage pod, ignite beacon) |
| Tab / I | Inventory + crafting overlay |
| F | Toggle flight (free mode only) |
| Esc | Pause / settings |

## Quick start

```bash
npm install
npm run dev      # play at http://localhost:5173
npm run ci       # typecheck + lint + unit + e2e (full gate)
```

## Build for web

```bash
VITE_BASE=/interstellar-craft/ npm run build   # produces dist/
```

## Project structure

```
src/core/      pure game logic (deterministic, fully unit-tested)
src/render/    Three.js rendering (chunk mesher, black hole, post FX)
src/game/      input, main loop, save system, audio
tests/         Vitest unit + Playwright e2e + visual baselines
docs/          design docs, tech spec, roadmap, agent protocol
prototype/     original single-file game + cinematic trailer pipeline
```

## Development

Evidence-first (TDD + Playwright visual regression) multi-agent AI workflow under
human direction. See [docs/AGENT_RULES.md](docs/AGENT_RULES.md) and
[docs/ROADMAP.md](docs/ROADMAP.md).

## License

[MIT](LICENSE) © 2026 Dapeng Zhang
