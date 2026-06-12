# AGENT_RULES — Multi-Agent Development Protocol

> Read this first. These rules bind every agent (dev, verifier, control plane)
> working in this repository.

## 1. Roles

- **Control plane (main agent)**: owns ROADMAP, decomposes tasks, spawns agents,
  reviews, merges to `main`, pushes to origin. ONLY the control plane merges/pushes.
- **Dev agent**: implements exactly one roadmap task in an isolated git worktree,
  following the TDD loop in TEST_STRATEGY §6. Commits to its own branch.
- **Verifier agent**: blind to implementation details; re-runs all gates and
  adversarially probes the feature. Outputs a signed verdict (pass / findings list).

## 2. Required Reading Order (every agent, every task)

1. This file → 2. The task brief from control plane → 3. TECH_SPEC (esp. §2
boundaries, §7 landmines) → 4. The relevant GAME_DESIGN sections → 5. TEST_STRATEGY.
Do not start coding before this. Do not read `prototype/tools/frames/` or any
generated media — they are large and irrelevant.

## 3. Worktree & Branch Discipline

- One task = one branch `task/<milestone>-<slug>` (e.g. `task/m0-core-port`) in its
  own worktree. Never commit to `main`. Never touch another task's worktree.
- Parallel tasks must have disjoint module footprints (declared in ROADMAP tables).
  If you need to edit a file outside your footprint, STOP and report — the control
  plane re-scopes; shared needs become a separate sequenced task.
- Shared contract files (`src/core/types.ts`, GAME_DESIGN, TECH_SPEC) are
  control-plane-owned: propose changes in your report, don't edit unilaterally.
- Commit messages: `m0.2 core: <what>` — small, frequent, always with tests green
  at each commit if feasible.

## 4. Evidence Rules (non-negotiable)

- TDD order for core code: failing test first. A task report without test evidence
  (paste the summary lines of the test run) is incomplete.
- `npm run ci` must be green before requesting verification.
- Never edit a visual baseline, never add `.skip`/`.only`, never raise a diff
  threshold, never extend a timeout to make a test pass. If a gate seems wrong,
  report it — don't bend it.
- 3 consecutive failed attempts at the same failing gate ⇒ stop, write up: what you
  tried, full error output, your best hypothesis. Escalate to control plane.

## 5. Scope Rules

- Implement the task brief, the whole brief, and nothing but the brief. Notice
  adjacent problems → list them in your report under "Observations" instead of
  fixing them.
- No new npm dependencies without control-plane approval (TECH_SPEC §1).
- No design inventions: if GAME_DESIGN is silent on a needed detail, propose 1–3
  options in your report; control plane decides.
- Respect the visual quirk list (TECH_SPEC §7) — especially: do not "fix" the
  vertex-AO off-by-one, do not move the black hole out of its offscreen RT, do not
  change disk-angle constants.

## 6. Report Format (dev agent → control plane)

```
TASK: <id + title>
STATUS: done | blocked
EVIDENCE: <test run tail: suites/tests passed, coverage line, e2e summary>
COMMITS: <branch name + short log>
DOC CHANGES: <none | which docs and why>
OBSERVATIONS: <adjacent issues noticed, not fixed>
OPEN QUESTIONS: <design gaps for control plane>
```

## 7. Verifier Protocol

Input: task brief + branch name only (not the dev agent's reasoning). Steps:
1. `npm run ci` from scratch in the worktree — any red = instant fail.
2. Cross-check behavior against GAME_DESIGN numbers (pick ≥ 3 spot checks).
3. Adversarial probes via `window.__game` hooks: boundary values, rapid input spam,
   order-of-operations abuse, save/reload mid-action.
4. Diff review: flag boundary violations (core importing three.js), silent baseline
   edits, test weakening, scope creep.
Verdict: `PASS` or `FINDINGS: [numbered list with repro steps]`. No style nitpicks.

## 8. Control-Plane Merge Checklist

- [ ] Dev report complete + verifier PASS
- [ ] Rebase/merge branch onto current main; rerun `npm run ci` post-merge
- [ ] ROADMAP status log updated; task tracker updated
- [ ] Push to origin `main`
- [ ] Worktree + branch cleaned up
