# Nightly Workflow Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make nightly maintenance reliable through incremental backlog triage, current vault-tool rules, bounded logs, and stable macOS code-signing identity.

**Architecture:** Keep the existing sequential runner. Put daily-versus-Sunday selection in the backlog prompt, add log maintenance as an independent script schedule, and wrap compilation in a build script that signs the binary with a stable Developer ID identity and identifier.

**Tech Stack:** Bun, TypeScript, TOML, launchd, macOS codesign, OpenCode agents

## Global Constraints

- Daily triage processes notes newer than `02_backlog/backlog.md`; Sunday processes all notes.
- Failed triage must not rewrite `backlog.md`.
- Filesystem tools and `rg` are primary for routine vault operations; `qmd` handles semantic Memory lookup.
- Rotate logs over 10 MiB and retain five numbered archives.
- Use GPT-5.6 Terra for routine agent workflows and GPT-5.6 Sol for reasoning-heavy maintenance workflows.
- Sign `bin/wf` as `com.zacczakk.workflows.wf` with the installed Developer ID Application identity.

---

### Task 1: Adaptive Backlog Triage

**Files:**
- Modify: `prompts/vault-backlog-triage.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: local date, note mtimes, and `02_backlog/backlog.md`
- Produces: daily delta or Sunday full prioritized backlog

- [ ] Replace mandatory four-agent context gathering with mechanical inventory and bounded delegation only for selected notes.
- [ ] Define daily mode as notes whose mtime is newer than `backlog.md`; define Sunday mode as all backlog leaf notes.
- [ ] Require unchanged classifications to remain intact in daily mode and defer the `backlog.md` write until all selected evaluations succeed.
- [ ] Change routine vault commands from Obsidian CLI to filesystem tools, `rg`, and `qmd`.
- [ ] Verify prompt contracts with `rg -n 'Sunday|newer than|must not rewrite|filesystem|qmd' prompts/vault-backlog-triage.md`.

### Task 2: Current Vault Tooling Rules

**Files:**
- Modify: `prompts/vault-inbox-processing.md`
- Modify: `prompts/vault-session-processing.md`
- Modify: `prompts/vault-grooming.md`
- Modify: `prompts/vault-knowledge-distillation.md`
- Modify: `prompts/vault-consolidation.md`
- Modify: `prompts/vault-retrieval-practice.md`

**Interfaces:**
- Consumes: `~/Vaults/AGENTS.md` filesystem policy
- Produces: prompts that never launch Obsidian for routine vault work

- [ ] Replace Obsidian-first instructions with filesystem reads/writes, `rg`, and `qmd`.
- [ ] Preserve `trash` for deletions and existing workflow-specific safety constraints.
- [ ] Verify no stale routine instruction remains with `rg -n 'Primary:.*obsidian|Always include.*vault=|obsidian vault=.*(files|read|search|create|delete)' prompts` and require no matches outside explicit app-automation caveats.

### Task 3: Log Rotation

**Files:**
- Create: `scripts/log-maintenance.ts`
- Create: `tests/log-maintenance.test.ts`
- Modify: `workflows.toml`
- Modify: `README.md`

**Interfaces:**
- Produces: `rotateLogs(directory: string, maxBytes: number, archiveCount: number): void`

- [ ] Write tests covering files below threshold, `.1` through `.5` retention, deletion of old `.5`, and empty current log creation.
- [ ] Run `bun test tests/log-maintenance.test.ts`; expect failure before implementation.
- [ ] Implement `rotateLogs` using Bun/Node filesystem APIs and a CLI entrypoint targeting `logs/`, 10 MiB, five archives.
- [ ] Run `bun test tests/log-maintenance.test.ts`; expect all tests passing.
- [ ] Add enabled `log-maintenance` calendar schedule at 00:55 and script workflow with a 300-second timeout.

### Task 4: Stable Signed Builds

**Files:**
- Create: `scripts/build.ts`
- Create: `tests/build-signing.test.ts`
- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**
- Produces: signed `bin/wf` with identifier `com.zacczakk.workflows.wf`

- [ ] Add a contract test asserting the build script compiles `src/wf.ts`, requires `WF_CODESIGN_IDENTITY`, and sets the stable identifier.
- [ ] Run `bun test tests/build-signing.test.ts`; expect failure before implementation.
- [ ] Implement build with `Bun.spawnSync` for `bun build` and `/usr/bin/codesign --force --sign ... --identifier com.zacczakk.workflows.wf bin/wf`, failing on either non-zero exit.
- [ ] Update documented build command to `bun run scripts/build.ts`.
- [ ] Run the build, then verify with `codesign --verify --strict --verbose=2 bin/wf` and `codesign -dvvv bin/wf`.

### Task 5: Install and Live Verification

**Files:**
- Regenerate: `plists/*.plist`
- Regenerate: `bin/wf`

**Interfaces:**
- Consumes: completed Tasks 1-4
- Produces: installed schedules and live nightly evidence

- [ ] Run `bun test` and require zero failures.
- [ ] Run `WF_CODESIGN_IDENTITY="<installed identity>" bun run scripts/build.ts` and verify the stable signing identifier.
- [ ] Run `./bin/wf install` and inspect `launchctl print gui/$(id -u)/com.zacczakk.wf-log-maintenance` plus nightly registration.
- [ ] Run `./bin/wf run log-maintenance` and verify current logs remain writable and archives respect retention.
- [ ] Run `./bin/wf run nightly`; approve the one expected macOS access prompt caused by switching from ad-hoc to stable signing identity.
- [ ] Report every workflow exit code, duration, any macOS permission denial, and any independent tool-storage failure.
- [ ] Research official or provider-visible metadata for `gpt-5.6-luna`, `gpt-5.6-sol`, and `gpt-5.6-terra`; if metadata is absent, report that and recommend a representative benchmark rather than guessing.
