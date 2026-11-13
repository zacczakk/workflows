# workflows

Scheduled vault maintenance using Bun, OpenCode V2, and macOS launchd.

## Schedule

Calendar times use the **Mac's local timezone**, printed by `wf status`. The wake and nightly start are 01:00. Log maintenance is scheduled at 00:55 and can catch up on wake. Reinstall after timezone changes to refresh launchd timers.

Nightly runs sequentially:

1. `skill-sync` — upstream skill updates
2. `vault-embeddings` — initial QMD refresh
3. `vault-inbox-processing` — inbox enrichment
4. `vault-session-processing` — durable knowledge extraction
5. `vault-consolidation` — synthesis and archive-gated cleanup
6. `vault-grooming` — final link/frontmatter repair
7. `vault-backlog-triage` — independent per-item evaluations
8. `vault-retrieval-practice` — weekly factual verification
9. `vault-report-maintenance` — weekly report retention and navigation cleanup
10. `vault-knowledge-distillation` — slim `MEMORY.md`; rewrites marked blocks in `USER.md` and `SOUL.md`; folds `STYLE.md` corrections into rules and moves evidence to the append-only `system/style-archive.md`; runner fails on word-budget or marker loss and on any STYLE quote, correction or archive line that disappears
11. `desktop-sync` — `metronome sync-desktop`: Claude Desktop and Cowork get the fresh `CLAUDE.md` (AGENTS.md plus IDENTITY/SOUL/USER/STYLE) and metronome skills
12. `vault-embeddings-final` — refresh after successful producers

`sessions-export` runs every 30 minutes. `log-maintenance` rotates logs above 10 MiB at 00:55, retaining five archives.

Report maintenance's zero-candidate fast path verifies report inventories, navigation and retained report hashes only. Unrelated iCloud placeholders cannot block a zero-move run; proposed removals still require findings preservation and visible vault-reference checks. Hidden planning/app files, exported media and workflow state stay outside those reference scans.

### Models

All top-level agents use GitHub Copilot:

| Workflow | Model |
|---|---|
| Inbox, session processing, backlog triage, distillation | `github-copilot/gpt-6.1-sol#medium` |
| Grooming, consolidation, retrieval, report maintenance | `github-copilot/gpt-6.1-sol#high` |

Grooming can use the configured vault-ops subagent for bounded repairs. QMD models remain local: EmbeddingGemma 300M, Qwen3 reranker 0.6B, and query expansion 1.7B.

## Safety and success

- **Network gate:** a schedule with agent workflows first waits up to `meta.network_wait` seconds (default 600) for `meta.network_host` (default `api.github.com`) to resolve. Still offline: one notification, no workflow runs, exit 1.
- **One sleep owner:** only nightly has `prevent_sleep = true`. Interval export and log maintenance leave sleep untouched. A watchdog is generated only for that owner, after the sum of configured timeouts plus 15 minutes. Reinstall removes obsolete non-owner watchdogs.
- **Archive first:** consolidation is blocked unless `~/.local/share/sessions/archive-health.json` confirms `fullCoverage: true`, a complete all-source export, fresh indexes, no failures, and success within 24 hours. Date-filtered exports and malformed source records cannot authorize pruning. Session notes retain a two-day grace period after `consolidated_at`; unknown timestamps retain the notes.
- **Independent triage:** `state/backlog-triage.json` tracks individual leaf mtimes. Grooming can change navigation without falsely marking items evaluated. Index/report notes are excluded. Priorities live in `Knowledge/00_system/backlog-triage-reports/`; `backlog.md` remains navigation. A fresh completion manifest must cover every selected path with a classification and reason, and both dated and latest reports must be refreshed before checkpointing.
- **Exact session checks:** `wf` requires OpenCode V2, creates a known session ID and location, then checks that session's final API outcome. Missing or failed outcomes fail closed. A completed session can recover a nonzero client exit, provided required outputs were actually refreshed.
- **Required outputs:** configured `outputs` must exist, be nonempty, and have changed during the run. `{date}` uses the run's local start date; all agents receive the same date.
- **Dependencies:** `depends_on` skips downstream work after a failed prerequisite. Final embeddings run only after successful vault producers; weekly cadence skips count as satisfied prerequisites.
- **Report retention:** weekly maintenance retains 30 calendar days plus the newest report per family. Scope: Knowledge grooming and Memory grooming/consolidation/retrieval/daily skill-sync logs. Up to ten old candidates per family are reviewed per run; extras are deferred. Useful unique findings go into one rolling `report-retention.md` per vault before exact paths move to Trash. Unreadable, changed, uncertain or externally referenced sources stay. Report indexes are repaired and report tags cleared; skill reports share one fanout-exempt index. Both rolling records must declare `retention_status: complete`, separate from normal note lifecycle status; partial cleanup fails, blocks final indexing, and leaves the independent `MEMORY.md` refresh available. Backlog evaluations, the GitHub audit baseline, session notes, durable knowledge and session-archive gates stay protected.
- **Recovery:** atomic state retains `lastSuccess` independently of ten-entry history. Per-schedule and per-workflow locks prevent overlapping runs. Timeouts stop the client and interrupt its exact agent session. Failures appear in logs, state, and macOS notifications.

## CLI

```sh
wf list
wf status
wf run nightly
wf run vault-grooming
wf run vault-report-maintenance
wf logs vault-grooming
wf install
wf uninstall
```

Workflow log lookup resolves to its schedule and shows the last 200 lines from each stream. Full files are in `logs/`.

## Setup

Requires macOS, Bun, OpenCode **V2**, QMD, `sessions`, and vaults under `~/Vaults/Knowledge` and `~/Vaults/Memory`.

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

QMD's `~/.config/qmd/index.yml` supports per-collection `ignore` patterns. Exclude dated operational logs from the Memory search collection (`system/skill-sync-*.md` and grooming/consolidation/retrieval report folders). These history files remain on disk. The `sessions` collection indexes `~/.local/share/sessions/archive/` with `**/*.md`; exports are local-only and refresh only that collection. Former cloud files are verified under `~/.local/share/sessions/legacy-icloud/`; cloud-only transcripts are indexed under `archive/legacy-icloud/`. The old cloud folder/symlink was removed after full checksum verification. Preserve source databases and local archives through normal Mac backups.

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
