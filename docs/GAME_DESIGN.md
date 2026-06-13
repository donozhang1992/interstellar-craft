# INTERSTELLAR CRAFT — Game Design Document

> Single source of truth for gameplay design. Numbers here are the canonical values;
> code must match this document or this document must be updated in the same PR.

## 1. Vision

A story-driven voxel mining/building game. You are an engineer stranded on a rocky
planet orbiting the supermassive black hole **Gargantua**. Mine, craft, and build a
signal beacon to answer a mysterious pulse from a distant green world. The enemy is
the environment — oxygen, darkness, gravity — not combat.

**Pillars**: ① Lonely sublime (Interstellar mood) ② Tactile voxel crafting (Minecraft
feel) ③ A story worth finishing (40–60 min main quest).

**Out of scope (MVP)**: multiplayer, mobile, infinite worlds, combat system.

## 2. Story & Setting

2087. Survey ship *Endurance-9* breaks apart during a gravity-assist around Gargantua.
Engineer **Dapeng** (the player) crash-lands on **KIPP-7e**, a tidally locked rocky
planet. The black hole hangs permanently in the sky. The escape pod's radio picks up
a repeating, non-natural electromagnetic pulse from a green planet in a neighboring
system. Decoding it reveals a "greeting protocol". The player builds a beacon tower
to answer. Ending cinematic: a tall thin alien on the green world receives the reply,
looks up, amber eyes glowing — sequel hook. (Reuses trailer's alien-world assets.)

## 3. Chapter / Quest Structure

Quests are a linear state machine (see TECH_SPEC §QuestEngine). Each chapter has an
explicit completion predicate that must be unit-testable.

| Ch | Title | Player goal | Completion predicate | Unlocks |
|----|-------|-------------|---------------------|---------|
| 1 | Crash Site | Tutorial: move, mine 10 regolith, place 5 blocks, salvage pod | `flags.salvaged === true` (explicit [E] pod interaction — NOT a hull count; the M1 starter kit already stocks hull) | Workbench, Drill Mk1 |
| 2 | The Signal | Build antenna (place 3 antenna blocks on 4-high mast), decode 3 pulses (pattern puzzle: place blocks matching displayed glyph) | 3/3 puzzles solved | Scanner, deep ores spawn |
| 3 | Deep Veins | Descend cave, collect 12 crystal under O₂ pressure | `inventory.has('crystal', 12)` | Jump pack, crystal recipes |
| 4 | The Beacon | Build 24-block-tall beacon tower per blueprint; structure validator checks shape | `validateBeacon(world) === true` | Fusion igniter |
| 5 | First Contact | Charge (insert 8 crystal), ignite, launch | Ignition interaction | Ending cinematic → free mode, flight, all blocks |

Free mode after credits: creative-style building, flight enabled.

### 3a. Quest Engine model (M3 — canonical)

Pure-core linear state machine in `src/core/quest/`. Shape:
- `QuestState { chapter: 1..5, step: number, flags: Record<string, boolean>, counters: Record<string, number> }`.
- Each chapter = an ordered list of **steps**; each step has `{ id, objective (English HUD line), predicate(ctx): boolean, onEnter?/onComplete? effects (unlock ids, grants) }`.
- `ctx` (QuestContext) is a read-only view the game layer supplies each tick: `{ inv, player, world, flags, counters }`. Predicates are PURE and unit-testable; NO three.js/DOM.
- `advance(state, ctx)`: while the current step's predicate is satisfied, fire its onComplete, move to the next step (or next chapter). Deterministic, idempotent. Chapters never skip; a step only completes via its predicate.
- Game layer raises flags/counters from real events: `salvaged` (pod [E]), `moved`, `mined:regolith` counter, `placed` counter, `antennaBuilt`, `puzzle1/2/3Solved`, etc.

**M3 decision (2026-06-13): KEEP the M1 sandbox starter kit** (drill_mk1 + ore + hull) — retiring it for an empty start + salvage-grants-gear is deferred (it would ripple into M1/M2 e2e + HUD baselines). So ch1 salvage UNLOCKS the workbench/flavor and grants a small bonus, but the player already has a drill; the tutorial value is the guided beats, not the gear gate.

### 3b. Chapter 1 — Crash Site (steps)
1. `move` — objective "Move with WASD" → `counters.moveTicks > ~30` (held movement).
2. `mine` — "Mine 10 regolith" → `counters['mined:regolith'] >= 10`.
3. `place` — "Place 5 blocks" → `counters.placed >= 5`.
4. `salvage` — "Salvage the crash pod [E]" → `flags.salvaged` (pod interaction within reach). onComplete: unlock workbench, mark ch1 done → ch2.

### 3c. Chapter 2 — The Signal (steps)
1. `antenna` — "Raise the antenna (3 antenna blocks atop a 4-high mast)" → `flags.antennaBuilt`, set by a structural check: a vertical column ≥4 of any solid topped by 3 stacked `antenna(11)` blocks (validator in core, like the M4 beacon validator but simpler).
2. `decode` — "Decode the 3 pulses" → `counters.puzzlesSolved >= 3`. Each puzzle: a 3×3 target **glyph** (boolean mask) is shown; the player reproduces it on a 3×3 decode panel (place/clear cells); solved when the panel mask == the glyph. 3 distinct glyphs. onComplete: unlock scanner. Pure-core puzzle logic in `src/core/quest/decode.ts` (glyph table + `isSolved(panel, glyph)`); the 3×3 panel UI + block placement is game-layer.

Scanner (ch2 unlock): minimal M3 — highlights ore blocks within radius (a render tint / hook); full pulse/cooldown polish per §7 can come later.

## 4. Blocks (13 types)

> IDs 1–6 are the M0-ported prototype blocks and are FROZEN (terrain snapshot hash
> depends on them). New types extend 7–13. "lamp" fulfills the former "glowstone"
> design role (emissive placeable light). Hardness = seconds to mine BY HAND.

| ID | Name | Hardness (s, hand) | Min tool | Drops | Notes |
|----|------|--------------------|----------|-------|-------|
| 1 | regolith | 0.6 | hand | itself | surface layer |
| 2 | rock | 1.2 | hand | itself | ore-bearing stratum (legacy) |
| 3 | basalt | 1.5 | Mk1 | itself | deep crust, cave walls (M2) |
| 4 | crystal | 3.5 | Mk2 | itself | emissive; surface clusters + caves (M2) |
| 5 | ice | 0.8 | hand | itself | → O₂ + glass feedstock |
| 6 | lamp | 1.0 | Mk1 | itself | emissive light source (≈ "glowstone") |
| 7 | iron_ore | 2.5 | Mk1 | itself | spawns in M2 worldgen rework (y<24) |
| 8 | copper_ore | 2.0 | Mk1 | itself | spawns in M2 worldgen rework (y<28) |
| 9 | hull | 2.0 | Mk1 | itself | salvage + crafted plate |
| 10 | glass | 0.5 | hand | — (breaks) | smelt ice |
| 11 | antenna | 1.0 | Mk1 | itself | quest block, craftable ch2+ |
| 12 | beacon_core | 4.0 | Mk2 | itself | quest block, craftable ch4+ |
| 13 | launchpad | 4.0 | Mk2 | itself | quest block, craftable ch4+ |

Tool speed multipliers: hand ×1, Drill Mk1 ×2, Mk2 ×4, Plasma ×8. Mining time =
hardness / multiplier (continuous hold-to-mine with progress, replacing the M0
prototype's instant click — an intentional M1 behavior change). A block below its
min tool cannot be mined (progress refuses to start).

## 5. Items & Recipes (~20)

Crafting happens at the Workbench UI (grid-less, recipe-list style — click to craft
if ingredients present). Recipes unlock by chapter.

**Tools**: Drill Mk1 (3 hull + 2 iron), Drill Mk2 (1 Mk1 + 4 iron + 2 copper),
Plasma Drill (1 Mk2 + 6 crystal + 2 copper) · **Equipment**: Scanner (2 copper + 1
glass + 1 crystal), Jump Pack (4 hull + 3 copper + 2 crystal), Magnet Glove (2 iron +
3 copper), Solar Panel (3 glass + 2 copper + 1 iron) · **Consumables**: O₂ Canister
(2 ice + 1 iron, restores 40 O₂), Flare (1 lamp + 1 copper, placeable light,
60 s) · **Materials**: Iron Plate (2 iron_ore), Glass (2 ice, needs Workbench
"smelt"), Hull Plate (2 iron_plate + 1 basalt), Lamp (2 crystal + 1 copper) · **Quest**: Antenna Block (2 iron_plate +
1 copper), Beacon Core (4 iron_plate + 4 crystal), Launchpad Block (2 hull + 2 basalt),
Fusion Igniter (2 beacon_core + 4 crystal + 2 copper).

## 6. Player Attributes

| Stat | Max | Drain | Restore | At zero |
|------|-----|-------|---------|---------|
| HP | 100 | fall: `(blocks-3)*8` dmg; O₂=0: 4/s | 1/s when O₂>50% | death |
| O₂ | 100 | surface 0.25/s, caves (y<28) 0.6/s | O₂ Canister +40; pod/base interior: full | HP drain |
| Energy | 100 | jump pack 8/jump-s, drill Mk2+ 1.5/s while mining | Solar Panel placed nearby: 2/s in "daylight" (accretion-disk light) | tools fall back to hand speed, no jump pack |

Death: respawn at pod, drop 50% of each stack at death point (pickup ghost persists).
Movement: walk 4.3 m/s, low gravity (jump 1.4 blocks base), no fall damage ≤ 3 blocks.

## 7. Skills / Equipment Progression

No skill tree — equipment IS progression: Scanner (ch2, highlights ores ≤12 blocks
through walls, 10 s pulse / 30 s cooldown), Jump Pack (ch3, hold-jump hover ≤ 2 s),
Magnet Glove (craftable ch3, pickup radius 3→8 blocks), Flight Core (post-ending
free-mode flight = prototype fly mode).

## 8. Entities (3, non-hostile)

| Entity | Behavior | Purpose |
|--------|----------|---------|
| Observer Jelly | floats, drifts toward next quest location, soft glow | diegetic quest guide |
| Crystal Beetle | wanders cave floors, flees player, drops 1 crystal shard if cornered (no kill — it "sheds") | ambient life, bonus resource |
| Wrecked Drone | static until repaired (2 copper + 1 crystal); then follows player as mobile light | companion, darkness counterplay |

## 9. World

- Fixed 256×256×64 voxel world, seeded generation (seed in save file; default seed `7e`).
- Surface: regolith/basalt hills (heightmap, amplitude ±6), ice patches, scattered hull debris near spawn.
- Caves: 3 carved cave systems (worm-carver algorithm) reaching y=8, crystal clusters at y<20, glowstone veins on cave ceilings.
- Landmarks: crash pod (spawn, restores O₂), antenna hill (ch2 marker), beacon plateau (ch4 build site, flat 12×12).
- Sky: Gargantua (offscreen-RT geodesic shader from trailer), starfield, nebulae. Permanent — tidally locked, no day/night; "daylight" = accretion disk side of sky.

## 10. UI / HUD

Minimal diegetic-leaning HUD: hotbar (8 slots) + HP/O₂/Energy bars bottom-left,
quest objective top-right (one line + optional progress `7/12`), interaction prompt
center (`[E] Salvage`), subtitle band for story beats (reuses trailer typography),
pause menu (resume / save / settings / quit). Crafting UI: full-screen overlay at
Workbench. All text English. Font: same family as trailer titles.

## 11. Audio (M5)

Ambient drone bed (Interstellar-organ-adjacent, royalty-free or synthesized),
mining tick + block place thock, O₂ low-warning heartbeat, quest-complete chime,
ending cue reused from trailer mood. All optional until M5.

## 12. Tuning Constants (canonical)

**Movement (prototype-ported `PHYS`, authoritative — supersedes earlier aspirational
values; visual/e2e baselines depend on these):**
```
WALK_SPEED = 5    SPRINT = 8.5    FLY = 14    GRAVITY = -9.5    JUMP_VEL = 5.2
player 0.6w × 1.8h, eye 1.62    REACH = 7 blocks (prototype)
```

**Survival (M2 — new this milestone):**
```
HP_MAX = 100      O2_MAX = 100        ENERGY_MAX = 100
O2_SURFACE = 0.25/s    O2_DEEP = 0.6/s (depth y < 28)    O2_SAFE_RADIUS = 4 (near pod → refill)
HP_O2ZERO = 4/s (drain when O2 = 0)   HP_REGEN = 1/s (when O2 > 50%)
FALL_SAFE = 3 blocks    FALL_DMG = (n-3)*8 hp   (NEW: prototype had no fall damage)
ENERGY_JUMPPACK = 8/jump-s   ENERGY_DRILL = 1.5/s (mk2+ while mining)   SOLAR = 2/s (panel placed in radius)
O2_CANISTER = +40    FLARE_SECONDS = 60    PICKUP_RADIUS = 3
DEATH_DROP = 50% of each stack at death point (recoverable cache); respawn at pod
HOTBAR = 8 slots    STACK_MAX = 64
```

> **M2 simplifications (decided 2026-06-13):** ① tidally locked world has no
> day/night, so SOLAR recharges a flat 2/s whenever a placed solar_panel is within
> radius (no sun-angle math); ② O₂ "deep" drain is depth-gated (y < 28), not
> literally "inside a carved cave"; ③ O₂ refills when within O2_SAFE_RADIUS of the
> crash pod / spawn; ④ death drops a single recoverable cache at the death position
> (no scattered ground-item entities until later); ⑤ fall damage applies on landing
> using vertical blocks fallen.

Changing any value here requires updating the matching unit test fixture in the same commit.
