# Nightly Workflow Health Design

## Goal

Restore reliable nightly completion by reducing backlog-triage work, aligning vault prompts with current filesystem rules, and bounding log growth.

## Backlog Triage

Keep one daily workflow and one prompt. On Monday through Saturday, evaluate only backlog notes newer than `02_backlog/backlog.md`. On Sunday, evaluate every backlog note.

The workflow derives its mode from the current local weekday. `backlog.md` remains the success marker: a failed run must not rewrite it, so the next daily run naturally retries unprocessed notes. Daily mode preserves existing classifications for unchanged items and updates only changed or new entries. Full mode rebuilds all classifications.

Remove fixed four-agent context gathering. Gather local indexes mechanically, then delegate only the selected item set in bounded batches. Keep the existing 60-minute runner timeout as a guardrail; the prompt targets 30 minutes.

## Vault Tooling

Update workflow prompts that still prescribe the Obsidian app CLI for routine reads, searches, writes, or deletes. Use filesystem tools and `rg` by default. Use `qmd` for semantic Memory lookup. Do not launch Obsidian unless app, plugin, theme, DOM, or console automation is explicitly needed.

## Log Rotation

Add a deterministic script workflow scheduled daily at 00:55, before nightly starts. For each `logs/*.log` file larger than 10 MiB:

1. Rotate numbered archives up to `.5`.
2. Move the current log to `.1`.
3. Create an empty current log for launchd append behavior.

Ignore smaller logs. A failure returns non-zero and must not block the 01:00 nightly schedule because it is a separate launchd job.

## I/O Diagnosis

Treat tool-storage failures separately from macOS vault permissions. Diagnose each layer independently and capture the exact failing operation rather than inferring a shared cause.

After implementation, run the nightly schedule manually. Confirm direct vault access under the signed binary and report tool-storage failures separately.

## Model Evaluation

Use `github-copilot/gpt-5.6-terra` for routine inbox, session-processing, backlog-triage, and distillation work. Use `github-copilot/gpt-5.6-sol` for reasoning-heavy grooming, consolidation, and retrieval practice. Luna remains reserved for future simple or repetitive tasks.

## Verification

- Unit-test adaptive daily/Sunday selection and unchanged-item preservation.
- Unit-test log threshold, archive retention, and empty-current-log behavior.
- Run typecheck/tests and rebuild `bin/wf`.
- Install launchd definitions and inspect registered schedules.
- Run `wf run nightly`; report each workflow result and exact failures.
