# workflows

Scheduled vault maintenance using Bun, OpenCode V2, and macOS launchd.

## Schedule

Calendar times use the **Mac's local timezone**, printed by `wf status`. The wake is 00:55; nightly starts at 01:00. Reinstall after timezone changes to refresh launchd timers.

Nightly runs sequentially:

1. `skill-sync` — upstream skill updates
2. `vault-embeddings` — initial QMD refresh
3. `vault-inbox-processing` — inbox enrichment
4. `vault-session-processing` — durable knowledge extraction
5. `vault-consolidation` — synthesis and archive-gated cleanup
6. `vault-grooming` — final link/frontmatter repair
7. `vault-backlog-triage` — independent per-item evaluations
8. `vault-knowledge-distillation` — slim `MEMORY.md`
9. `vault-retrieval-practice` — weekly factual verification
10. `vault-embeddings-final` — refresh after successful producers

`sessions-export` runs every 30 minutes. `log-maintenance` rotates logs above 10 MiB at 00:55, retaining five archives.

### Models

All top-level agents use GitHub Copilot:

| Workflow | Model |
|---|---|
| Inbox, session processing, backlog triage, distillation | `github-copilot/gpt-6.1-sol#medium` |
| Grooming, consolidation, retrieval | `github-copilot/gpt-6.1-sol#high` |

Grooming can use the configured vault-ops subagent for bounded repairs. QMD models remain local: EmbeddingGemma 300M, Qwen3 reranker 0.6B, and query expansion 1.7B.

## Safety and success

- **One sleep owner:** only nightly has `prevent_sleep = true`. Interval export and log maintenance leave sleep untouched. A watchdog is generated only for that owner, after the sum of configured timeouts plus 15 minutes. Reinstall removes obsolete non-owner watchdogs.
- **Archive first:** consolidation is blocked unless `~/.local/share/sessions/archive-health.json` confirms a complete all-source export, fresh indexes, no failures, and success within 24 hours. Session notes retain a two-day grace period after `consolidated_at`; unknown timestamps retain the notes.
- **Independent triage:** `state/backlog-triage.json` tracks individual leaf mtimes. Grooming can change navigation without falsely marking items evaluated. Index/report notes are excluded. Priorities live in `Knowledge/00_system/backlog-triage-reports/`; `backlog.md` remains navigation.
- **Exact session checks:** `wf` requires OpenCode V2, creates a known session ID and location, then checks that session's final API outcome. Missing or failed outcomes fail closed. A completed session can recover a nonzero client exit, provided required outputs were actually refreshed.
- **Required outputs:** configured `outputs` must exist, be nonempty, and have changed during the run. `{date}` uses the run's local start date; all agents receive the same date.
- **Dependencies:** `depends_on` skips downstream work after a failed prerequisite. Final embeddings run only after successful vault producers; weekly cadence skips count as satisfied prerequisites.
- **Recovery:** atomic state retains `lastSuccess` independently of ten-entry history. Per-schedule and per-workflow locks prevent overlapping runs. Timeouts stop the client and interrupt its exact agent session. Failures appear in logs, state, and macOS notifications.

## CLI

```sh
wf list
wf status
wf run nightly
wf run vault-grooming
wf logs vault-grooming
wf install
wf uninstall
```

Workflow log lookup resolves to its schedule and shows the last 200 lines from each stream. Full files are in `logs/`.

## Setup

Requires macOS, Bun, OpenCode **V2**, nvm Node 22+, QMD, `sessions`, and vaults under `~/Vaults/Knowledge` and `~/Vaults/Memory`.

Build with the existing installed Developer ID identity:

```sh
WF_CODESIGN_IDENTITY="Developer ID Application: Example Corp (TEAMID)" bun run scripts/build.ts
export PATH="$PWD/bin:$PATH"
```

The binary identifier is `com.zacczakk.workflows.wf`; stable signing preserves macOS filesystem permission identity across rebuilds.

Passwordless sudo must allow these exact commands:

```text
<username> ALL=(ALL) NOPASSWD: /usr/bin/pmset -a disablesleep 1
<username> ALL=(ALL) NOPASSWD: /usr/bin/pmset -a disablesleep 0
```

Register the Memory QMD collection and complete one archive export:

```sh
qmd collection add ~/Vaults/Memory --name memory
sessions export
wf install
wf status
```

QMD's `~/.config/qmd/index.yml` supports per-collection `ignore` patterns. Exclude dated operational logs from the Memory search collection (`system/skill-sync-*.md` and grooming/consolidation/retrieval report folders). These history files remain on disk. Index regenerated OpenCode files with `opencode/**/*-ses_*.md`; Claude/Codex exports can use `*-????????-????-????-????-????????????.md` to retain full-ID files and bypass older truncated-ID history. Preserve source databases and old exports until the replacement archive is proven.

Installation preserves a matching existing daily wake. If changing the wake requires authorization, run the printed `sudo pmset repeat wakeorpoweron MTWRFSU HH:MM:00` command, then check `wf status`.

## Configuration

`workflows.toml` defines workflows, schedules, models, timeouts, output contracts, dependencies, and cadence.

```toml
[schedules.nightly]
time = { hour = 1, minute = 0 }
prevent_sleep = true
enabled = true
workflows = ["example"]

[workflows.example]
type = "agent"
prompt = "prompts/example.md"
model = "github-copilot/gpt-6.1-sol#medium"
description = "Example workflow"
timeout = 1800
outputs = ["~/Vaults/Memory/system/example/{date}.md"]
```

`prevent_sleep` defaults false. Only one enabled calendar schedule may own sleep. Optional owner `watchdog` overrides the generated timeout-based time. Interval schedules require `interval >= 60` and cannot own sleep. Cadence uses the last successful start; direct runs bypass cadence.

## Verification and layout

```sh
bun test
WF_LIVE_TEST=1 bun test tests/opencode.test.ts
wf run nightly
```

- `src/wf.ts`: CLI/status/logs
- `src/run.ts`: execution, locks, sleep ownership, dependencies, outputs
- `src/opencode.ts`: exact V2 session API
- `src/backlog.ts`: independent leaf selection/checkpoint
- `src/install.ts`, `src/plist.ts`, `src/wake.ts`: launchd and wake setup
- `src/state.ts`, `src/types.ts`, `src/validate.ts`: state and config
- `prompts/`: self-contained agent instructions
- `scripts/`: non-agent work and signed build
- `state/`, `logs/`, `plists/`, `bin/`: ignored runtime artifacts

Active implementation and validation: [docs/plans/2026-10-02-nightly-reliability.md](docs/plans/2026-10-02-nightly-reliability.md).

MIT licensed.
