# Nightly Reliability Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore dependable unattended vault maintenance, preserve history, and upgrade scheduled models.

**Architecture:** Keep launchd and the sequential Bun runner. Export via atomic files with per-item progress; use exact V2 session IDs for outcome checks. Only the nightly batch owns sleep; archive health and independent backlog checkpoints protect destructive and incremental work.

**Tech Stack:** Bun, TypeScript, Python standard library, SQLite, OpenCode V2, macOS launchd.

## Global Constraints

- No new dependencies, no service restart, no system-timezone change, no push.
- User approved real CLI regression tests and one live nightly batch.
- Owned workflows scope: `src/`, `scripts/sessions-export.ts`, `tests/`, `workflows.toml`, `prompts/`, `README.md`, `docs/plans/`.
- Owned metronome scope: `scripts/sessions`, new export helper, `scripts/__tests__/sessions-opencode.test.ts`, sessions documentation.
- Work in `.worktrees/fix-nightly-reliability` and metronome `.worktrees/fix-session-export-reliability`; integrate committed fixes locally before installation.

---

### Task 1: Repair archive writes

- [x] Add real export CLI regression: duplicate titles must produce distinct session files; a blocked destination must leave the original and later progress intact.
- [x] Run `bun test scripts/__tests__/sessions-opencode.test.ts` in metronome; watch the collision assertion fail.
- [x] Implement same-directory temporary write, flush, atomic replacement, unique session-ID filenames, bounded per-item failure handling, incremental checkpoint persistence, and exporter lock. Failed exports stay nonzero; propagate QMD failures.
- [x] Rerun tests; update sessions docs; commit with `committer`.
- [ ] Run real export with the updated command; confirm checkpoint and FTS freshness. Keep cleanup paused if any item fails.

### Task 2: Repair runner ownership and outcomes

- [x] Add `wf` CLI regression fixtures using real Bun scripts and temporary config/source files; test failed dependencies, persistent successful state, schedule validation, and report prerequisites.
- [x] Run `bun test`; observe the new checks fail.
- [x] Split execution and installation out of oversized `src/wf.ts`. Add explicit `prevent_sleep` schedule field, default false; watchdogs only for sleep-owning schedules and remove obsolete registered watchdogs during install.
- [x] Require OpenCode V2; create each agent session with a known ID and repository location, run that ID, query its exact V2 outcome and required report. Fail closed on missing evidence.
- [x] Use atomic state, independent last-success marker, per-workflow execution locks, failure notifications, and archive freshness env for consolidation. Refresh index only after successful producers.
- [x] Run CLI tests and real V2 smoke; commit.

### Task 3: Repair prompts, order, and models

- [x] Set four workflows to `github-copilot/gpt-6.1-sol#medium`; grooming, consolidation, retrieval to `#high`.
- [x] Order: skill sync, embeddings, inbox, sessions, consolidation, grooming, backlog, distillation, retrieval, final embeddings.
- [x] Backlog evaluations live in a separate report; structural indexes retain navigation. Select leaf notes only; persist per-item triage checkpoint independent of grooming mtimes.
- [x] Require archive health before consolidation pruning; protect indexes and use consolidation timestamps for retention.
- [x] Replace `rg -L` with `--files-without-match`, fix frontmatter examples and contradictory scope, exclude sync reports from retrieval samples, validate complete scans before edits.
- [x] Update README and active plan to match behavior; run all tests.

### Task 4: Install and prove

- [x] Integrate only committed owned changes to clean main checkouts; rebuild with the existing Developer ID identity.
- [x] Reinstall launchd schedules; preserve current wake schedule if sudo needs interactive authorization; show actual timezone in status.
- [ ] Run one live nightly batch with observable logs; verify exact model IDs, reports, backlog evaluation, final graph links, export state, and QMD freshness.
- [ ] Record evidence and remaining blockers in session notes. No remote push.

## Evidence / scope adjustments

- Metronome local main includes `23e2126` and `63ed4c3`; 13 script tests pass; Ruff and `uvx ty` helper checks pass.
- Real export recreated 10,719 OpenCode session files and 173,534 text blocks. Existing source DBs and archive files preserved.
- QMD trace pinned blocking Memory read to historical `system/skill-sync-2026-08-31.md`; operational history now excluded from Memory indexing and redundant legacy export filenames excluded from Sessions indexing. User offered history clearing; preservation plus narrower indexing chosen first.
- QMD update/embed timeout now four minutes; incomplete index leaves consolidation blocked. Old scheduled export stopped for safe reinstall.
- Real GPT-6.1 Sol medium session smoke passes via exact V2 outcome API; CLI tests cover dependencies, retained last success, output validation, timezone, backlog independent checkpoint and index exclusion.
- TypeScript compiler present in another repo, Bun type definitions unavailable; compiled Bun build and runtime tests provide current verification.
