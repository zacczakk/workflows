# Report Retention Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound operational reports in both vaults, preserving findings before recoverable cleanup.

**Architecture:** Reuse the existing agent runner and weekly cadence. A report-maintenance prompt owns review, Trash operations, index repair and report-only tag cleanup; existing output checks prove completion. No new dependency or runner abstraction.

**Tech Stack:** Bun, TOML, Markdown, OpenCode V2 runner, macOS Trash.

## Global Constraints

- Thirty-day retention by report date; always retain newest report of each family.
- Exact scope: Knowledge grooming; Memory grooming, consolidation, retrieval and daily skill-sync reports.
- Preserve unique findings in rolling records; retain uncertain or unreadable sources.
- Keep session notes, durable knowledge, backlog evaluations, GitHub baseline and original archives intact.
- Empty report tags; retain durable domain tags. Collapse obsolete report collections and repair links.
- No push. Local integration and activation after tests.

## Owned files

- `prompts/vault-report-maintenance.md`: cleanup and safety contract.
- `workflows.toml`: weekly step after producers, before distillation and final indexing.
- `README.md`: scope, retention, ordering and manual run.
- `tests/report-retention.test.ts`: real config/prompt contract checks.
- `src/run.ts`: reject partial report-maintenance completion statuses.
- Approved vault report folders/navigation and report-retention session note.

## Tasks

- [ ] Audit old findings and external references; write rolling records.
- [ ] Trash eligible logs; repair indexes; verify protected hashes and links.
- [x] Add weekly ordering/output/safety tests; observed two missing-feature failures before wiring.
- [x] Add prompt/TOML workflow: Sol high, seven-day cadence, two required rolling outputs, 900-second timeout and ten candidates per family.
- [x] Update README; `bun test`: 10 pass, one opt-in skip; separate live OpenCode test: one pass.
- [ ] Commit with `committer`; integrate locally; live-run maintenance and refresh search/schedule.

## Acceptance

- Removed targets absent from indexes; newest reports and protected hashes survive.
- Live no-candidate run refreshes both outputs and succeeds through the real runner.
- Valid nightly ordering; partial maintenance blocks final indexing while distillation stays independent; one sleep owner remains.

## Review adjustments

- Infra review found that cleanup dependencies would unnecessarily block distillation; keep that refresh independent.
- Bounded batches limit weekly work. Exact frontmatter completion status rejects partial results through real CLI tests.
- Metronome's sync-upstream-skills.ts writes daily skill logs; nightly grooming normalizes their tags/navigation.
