# Workflows — Execution Plan

Scheduled workflow execution for vault maintenance and agent-driven tasks on macOS. Inspired by [Alfred](https://github.com/ssdavidai/alfred) (Temporal-based agent infrastructure) but using launchd (zero-dependency, native macOS scheduler).

## Architecture

```
workflows.toml          defines workflows + schedules
       |
    wf CLI              reads toml, validates, generates plists, manages launchd
       |
   schedules            meta-schedules group workflows into ordered batches
       |
   launchd fires        one runner plist per schedule, one watchdog per schedule
       |
    wf run <sched>       disablesleep → run workflows sequentially → re-enable sleep
       |
    type=agent           wf reads prompt, spawns opencode run
                         → post-run: query opencode DB for session errors
    type=script          wf spawns bun run scripts/<name>.ts
```

### Design principles (from Alfred)
- **Shell/scheduler handles control flow, agent handles reasoning.** The CLI dispatches; prompts reason.
- **Scope enforcement.** Each workflow has defined permissions (create/edit/delete per vault).
- **Vault is source of truth.** State files are bookkeeping only.
- **Durable logs.** Every run logs to `logs/`.

### Why launchd, not Temporal
- Workflows are atomic: "run this script/prompt on schedule." No multi-step crash recovery needed.
- Zero dependencies. Ships with macOS. Survives reboots.
- Temporal requires running a server daemon — overkill for personal vault maintenance.

### Sleep management

Three layers prevent clamshell sleep from freezing overnight workflows:

1. **`pmset repeat wakeorpoweron`** — wakes Mac at schedule time (set by `wf install`)
2. **`pmset disablesleep`** — toggled by `wf run` via passwordless sudo (scoped to exactly two commands)
3. **Sleep watchdog** — launchd plist that runs `pmset disablesleep 0` as safety net

The `disablesleep` flag is runtime-only (resets on reboot). Sudoers config in `/etc/sudoers.d/wf-pmset` grants NOPASSWD for exactly:
- `pmset -a disablesleep 1`
- `pmset -a disablesleep 0`

Previous approach (`caffeinate -s`) only prevented idle sleep, not clamshell sleep. Processes froze in DarkWake within 10 seconds of pmset-triggered wake.

## Repo structure

```
~/Repos/workflows/
  AGENTS.md                           # repo conventions
  workflows.toml                      # workflow + schedule definitions
  docs/plans/PLAN.md                  # this file
  prompts/
    vault-inbox-processing.md         # agent instructions
    vault-session-processing.md
    vault-grooming.md
    vault-backlog-triage.md
    vault-knowledge-distillation.md
    vault-consolidation.md
    vault-retrieval-practice.md
  scripts/
    vault-embeddings.ts               # qmd update + embed (script-type)
    skill-sync.ts                     # sync upstream skills via gh API
    sessions-export.ts                # incremental opencode session export
  src/
    wf.ts                             # CLI dispatcher + commands
    types.ts                          # interfaces (Workflow, ScheduleDef, Config, etc.)
    validate.ts                       # TOML config validation
    state.ts                          # run state read/write + formatting helpers
    plist.ts                          # launchd plist generation (runner + watchdog)
    wake.ts                           # pmset wake scheduling
  bin/
    wf                                # compiled binary (gitignored)
  plists/                             # generated launchd plists (gitignored)
  logs/                               # runtime logs (gitignored)
  state/                              # JSON run state per workflow (gitignored)
  .gitignore
```

### Workflow types

Two types, declared in `workflows.toml` via the `type` field:

| Type | TOML field | Execution |
|------|-----------|-----------|
| `agent` | `prompt = "prompts/<name>.md"` | `wf` reads prompt file, spawns `opencode run <prompt-text>` |
| `script` | `script = "scripts/<name>.ts"` | `wf` spawns `bun run <script-path>` |

Validation enforces mutual exclusivity: agent-type requires `prompt` (rejects `script`), script-type requires `script` (rejects `prompt`).

### Timeout

Per-workflow or default in `[meta]`:

```toml
[meta]
default_timeout = 3600    # 1 hour fallback

[workflows.vault-embeddings]
timeout = 1800            # override: 30 minutes
```

Timeouts are enforced in-process by `wf` (SIGTERM → 5s grace → SIGKILL). Not reliant on launchd's TimeOut.

### Schedules

Two schedule types supported:

**Time-based** (daily at a fixed clock time, via launchd `StartCalendarInterval`):
```toml
[schedules.nightly]
time = { hour = 1, minute = 0 }
watchdog = { hour = 7, minute = 0 }
enabled = true
workflows = [
  "skill-sync",
  "vault-embeddings",
  "vault-inbox-processing",
  "vault-session-processing",
  "vault-grooming",
  "vault-backlog-triage",
  "vault-knowledge-distillation",
  "vault-consolidation",
  "vault-retrieval-practice",
]
```

**Interval-based** (every N seconds, via launchd `StartInterval`):
```toml
[schedules.sessions-export]
interval = 1800    # every 30 minutes
enabled = true
workflows = ["sessions-export"]
```

- `time` / `interval` — mutually exclusive trigger types
- `watchdog` — safety-net plist that runs `pmset disablesleep 0` (time-based schedules only; auto-derived if omitted: trigger + sum of timeouts + 15min buffer)
- `workflows` — ordered list; executed sequentially, next starts immediately after previous finishes
- `enabled` — whether `wf install` registers this schedule

### Cadence gating

Workflows can declare `cadence_days` to skip runs when last success is recent:

```toml
[workflows.vault-retrieval-practice]
cadence_days = 7
```

`wf` reads the state file before spawning. If `lastSuccess` is within `cadence_days`, it prints `skip` and moves to the next workflow. Direct `wf run <name>` bypasses cadence and always executes.

### Separation: prompts/ vs scripts/
- `prompts/` — Pure markdown agent instructions. Clean syntax highlighting, no escaping, readable standalone.
- `scripts/` — Executable `.ts` files for non-agent workflows only (e.g. vault-embeddings).
- Backtick safety: prompts contain inline code, obsidian CLI commands, markdown formatting. Embedding in TS template literals would require escaping. Keeping them as `.md` avoids this.

## Prerequisites

All installed and on PATH via `~/.zprofile` (sourced by launchd login shell):

| Tool | Location | Purpose |
|------|----------|---------|
| `opencode` | `/opt/homebrew/bin/opencode` | Agent runner (headless via `opencode run`) |
| `qmd` | `~/.bun/bin/qmd` | Hybrid markdown search (BM25 + vector + reranking) |
| `obsidian` | Obsidian.app CLI | Vault CRUD operations |
| `bun` | `~/.bun/bin/bun` | Build wf.ts, run all scripts |
| `node` | nvm Node 22 LTS | Required by qmd (native addon compatibility) |

### QMD setup (one-time)
```bash
qmd collection add ~/Vaults/Memory --name memory
qmd update
qmd embed
```

### Node version resolution
QMD uses `better-sqlite3` with native addons. Must run under Node >= 22 (MODULE_VERSION 127).

`~/.zprofile` resolves nvm's default alias to a static PATH entry at shell startup. The launchd plist launches `wf` via `/bin/zsh -lc`, which sources `.zprofile` and gets the correct Node version automatically. No manual `wf install` needed after `nvm install`.

## Execution flow

```
launchd fires at 01:00 → /bin/zsh -lc "wf run nightly"
  → reads + validates workflows.toml
  → resolves schedule → ordered workflow list
  → disablesleep 1 (passwordless sudo)
  → for each workflow (sequential):
      → check cadence_days — skip if last success too recent
      → type=agent:  read prompt, spawn opencode run -m <model> <prompt>
                     → wait for exit
                     → if exit 0: query opencode DB for session errors
                     → if session error found: override exit code to 1
      → type=script: spawn bun run scripts/<name>.ts
      → enforce per-workflow timeout (SIGTERM → 5s grace → SIGKILL)
      → write state to state/<name>.json
  → disablesleep 0 (finally block + signal traps)
  → log to logs/<schedule>.out.log / .err.log
```

Single workflow: `wf run <name>` — same sleep toggle, single workflow only.

### opencode session error detection

opencode ≥1.3.0 exits 0 silently when the model provider fails (network timeout, auth error, DNS failure). The agent produces no output, does no work, but `wf` would previously record success.

After each agent exit 0, `wf` queries:

```sql
SELECT json_extract(m.data, '$.error.name'),
       json_extract(m.data, '$.error.data.message')
FROM message m
JOIN session s ON m.session_id = s.id
WHERE s.directory = '<cwd>'
  AND s.time_created >= <t0>
  AND json_extract(m.data, '$.error') IS NOT NULL
ORDER BY m.time_created DESC
LIMIT 1
```

- DB path: `~/.local/share/opencode/opencode.db`
- `t0` = Unix timestamp (ms) at start of the workflow run
- Uses `/usr/bin/sqlite3` directly — no PATH dependency, always available

If a row is returned, the error name and message are printed and exit code is overridden to 1. Error types encountered in practice: `UnknownError` (TCP connection refused/timeout — "Was there a typo in the url or port?"), `APIError`, `ProviderAuthError`, `ContextOverflowError`.

## State tracking

Each `wf run` writes run state to `state/<name>.json`:

```json
{
  "lastRun": "2026-02-26T08:00:12Z",
  "lastExitCode": 0,
  "lastDurationMs": 45230,
  "consecutiveFailures": 0,
  "history": [
    { "startedAt": "2026-02-26T08:00:12Z", "exitCode": 0, "durationMs": 45230 }
  ]
}
```

- History capped at 10 entries
- `consecutiveFailures` increments on non-zero exit, resets on success
- `wf status` reads state files to show last run time, duration, and failure streaks

## Workflows

### Nightly schedule (01:00, sequential)

### 1. skill-sync

| Field | Value |
|-------|-------|
| Type | `script` |
| Script | `scripts/skill-sync.ts` |
| Timeout | 5min |
| Scope | Read-only (syncs to `~/.config/opencode/skill/`) |

Fetches upstream skill repos and diffs local copies against upstream. Auto-sync skills are overwritten; manual-sync skills get diff reports only. Writes a summary to `~/Vaults/Memory/system/skill-sync-YYYY-MM-DD.md`.

**Network transport:** uses `gh api /repos/{owner}/{repo}/tarball/HEAD` piped to `tar` — one HTTP request per repo via `gh`'s Go HTTP client. Does not use `git clone` or system DNS. Resilient to corporate DNS restrictions that block external resolution at runtime.

Registry: `~/Repos/zacczakk/metronome/configs/skills/registry.json`

### 2. vault-embeddings

| Field | Value |
|-------|-------|
| Type | `script` |
| Script | `scripts/vault-embeddings.ts` |
| Timeout | 30min |
| Scope | Read-only (QMD indexes but never modifies source files) |
| Vaults | Memory |

Sources nvm, runs `qmd update && qmd embed`. No agent involved. Runs first to ensure search index is current for downstream workflows.

### 3. vault-inbox-processing

| Field | Value |
|-------|-------|
| Type | `agent` |
| Prompt | `prompts/vault-inbox-processing.md` |
| Timeout | 1h |
| Scope | Create + edit in Knowledge vault. Deletes processed inbox originals. |
| Vaults | Knowledge |

Lists inbox, fetches URLs, checks duplicates, creates enriched backlog notes, deletes originals.

### 4. vault-session-processing

| Field | Value |
|-------|-------|
| Type | `agent` |
| Prompt | `prompts/vault-session-processing.md` |
| Timeout | 30min |
| Scope | Create + edit in Memory vault |
| Vaults | Memory |

Distills session notes into patterns, tools, and project knowledge.

### 5. vault-grooming

| Field | Value |
|-------|-------|
| Type | `agent` |
| Prompt | `prompts/vault-grooming.md` |
| Timeout | 90min |
| Scope | Knowledge: edit + report (no delete). Memory: edit + delete. |
| Vaults | Knowledge + Memory |

Scans both vaults for broken wikilinks, invalid frontmatter, orphans, stubs. Writes grooming report to `00_system/grooming-reports/`.

### 6. vault-backlog-triage

| Field | Value |
|-------|-------|
| Type | `agent` |
| Prompt | `prompts/vault-backlog-triage.md` |
| Model | `github-copilot/claude-opus-4.6` |
| Timeout | 30min |
| Scope | Edit in Knowledge vault |
| Vaults | Knowledge |

Reads `02_backlog/` notes, evaluates and prioritizes them, and rewrites `backlog.md` with classified, prioritized items. Runs after grooming so it operates on clean notes.

### 7. vault-knowledge-distillation

| Field | Value |
|-------|-------|
| Type | `agent` |
| Prompt | `prompts/vault-knowledge-distillation.md` |
| Timeout | 90min |
| Scope | Create + edit in Memory vault |
| Vaults | Memory |

Reads all Memory vault notes, distills into `MEMORY.md` at vault root. Runs after grooming so it summarizes clean state.

### 8. vault-consolidation

| Field | Value |
|-------|-------|
| Type | `agent` |
| Prompt | `prompts/vault-consolidation.md` |
| Timeout | 1h |
| Scope | Create + edit in Memory vault |
| Vaults | Memory |

Synthesizes cross-cutting insights from recent unconsolidated session notes. Marks processed notes as `consolidated: true`. Cadence-gated to once per day.

### 9. vault-retrieval-practice

| Field | Value |
|-------|-------|
| Type | `agent` |
| Prompt | `prompts/vault-retrieval-practice.md` |
| Model | `github-copilot/claude-opus-4.6` |
| Timeout | 30min |
| Cadence | 7 days |
| Scope | Read + edit in Memory vault |
| Vaults | Memory |

Spot-checks a sample of Memory vault notes against current reality — verifies facts, flags stale content, corrects inaccuracies. Runs weekly; skipped on cadence if last success was less than 7 days ago.

### Sessions export schedule (every 30 minutes)

### sessions-export

| Field | Value |
|-------|-------|
| Type | `script` |
| Script | `scripts/sessions-export.ts` |
| Timeout | 10min |
| Schedule | `sessions-export` (interval: 1800s) |

Incrementally exports OpenCode session history and updates the sessions search index. Runs continuously throughout the day on a 30-minute interval — not part of the nightly batch.

## wf CLI

### Commands

| Command | Description |
|---------|-------------|
| `wf list` | Schedule→workflow hierarchy with types and timeouts |
| `wf status` | Runtime view: schedule health, per-workflow last run, failure streaks |
| `wf install` | Generate runner + watchdog plists per schedule, register with launchd, schedule wake |
| `wf uninstall` | Remove all plists from launchd, clear wake schedule |
| `wf run <name>` | Execute a schedule (all workflows) or single workflow with sleep toggle |
| `wf logs <name>` | Show stdout+stderr logs (accepts workflow name or schedule name) |

### Implementation
- **Source layout**: `src/wf.ts` (CLI + commands), `src/types.ts` (interfaces), `src/validate.ts` (config validation), `src/state.ts` (run state), `src/plist.ts` (plist generation), `src/wake.ts` (pmset wake scheduling).
- **TOML**: `import { TOML } from "bun"` — built-in parser, zero deps.
- **Config validation**: Schema-level checks after parse (type enum, field exclusivity, timeout, schedule→workflow references).
- **Plist generation**: `src/plist.ts` generates two plist types: `generateRunnerPlist()` (login shell → `wf run <schedule>`) and `generateWatchdogPlist()` (fires `pmset disablesleep 0`). Interval schedules use `StartInterval`, time-based use `StartCalendarInterval`.
- **Labels**: `<prefix>.wf-<schedule>` for runners, `<prefix>.wf-<schedule>-watchdog` for watchdogs.
- **Legacy cleanup**: `wf install` and `wf uninstall` remove old per-workflow plists from previous architecture.
- **Environment in plists**: Inherited from login shell (`/bin/zsh -lc`) which sources `~/.zprofile`. No hardcoded env vars in plist.
- **UID**: Resolved via `id -u` subprocess, with env override.
- **ANSI output**: Colored terminal output — green for healthy/enabled, red for errors/failures, yellow for warnings, cyan for agent type, dim for secondary info, bold for names.
- **No npm deps** — pure Bun APIs.
- **Compiled binary path**: Detects bundled vs dev mode (`/$bunfs` prefix check) for correct ROOT resolution.
- **opencode session error detection**: `checkOpencodeSessionError(cwd, t0)` in `src/wf.ts` — post-run DB query via `/usr/bin/sqlite3` to catch silent provider failures introduced in opencode ≥1.3.0.

### Build
```bash
bun build src/wf.ts --compile --outfile bin/wf
```

## Vault context

### Knowledge vault
```
~/Vaults/Knowledge/
  00_system/           # Attachments, scripts, grooming-reports/
  01_inbox/            # Web clipper captures, raw thoughts
  02_backlog/          # Triaged items with - [ ] tasks
  03_active/           # Active projects
  04_archive/          # Completed projects
  05_notes/            # Personal notes
  06_docs/             # Technical docs
  07_knowledge/        # Consumed material
  Home.md              # Dashboard
```
- **No frontmatter.** Folder position conveys type.
- **No delete** by automated workflows (except inbox originals after processing).

### Memory vault
```
~/Vaults/Memory/
  MEMORY.md            # Generated distilled summary
  projects/            # Per-repo learnings
  tools/               # CLI/tool knowledge
  patterns/            # Reusable implementation patterns
  sessions/            # Session recaps
  {general}.md         # General notes at root
```
- **Frontmatter required.** Schema: type, tags, created, related, depends-on.
- **Can delete** orphans/stubs via vault-grooming workflow.
- **Write code-containing notes via filesystem** (not obsidian CLI — backtick safety).

## Research sources

- **Alfred** (ssdavidai/alfred): Four-worker model, scope enforcement, Temporal kinetic layer, Obsidian vault as shared agent+human memory.
- **OpenClaw**: Two-tier memory (MEMORY.md curated + daily logs), SOUL.md agent persona, heartbeat-driven grooming, vector search with temporal decay + MMR.
- **QMD** (tobi/qmd): On-device hybrid markdown search. BM25 + vector + query expansion + LLM reranking.
- **opencode run**: Headless non-interactive mode. Full tool access.
