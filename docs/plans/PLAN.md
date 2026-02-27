# Workflows — Execution Plan

Scheduled workflow execution for vault maintenance and agent-driven tasks on macOS. Inspired by [Alfred](https://github.com/ssdavidai/alfred) (Temporal-based agent infrastructure) but using launchd (zero-dependency, native macOS scheduler).

## Architecture

```
workflows.toml          defines workflows, schedules, metadata
       |
    wf CLI              reads toml, validates, generates plists, manages launchd
       |
   launchd              native macOS scheduler, fires on StartCalendarInterval
       |
  type=agent            wf reads prompt, spawns opencode run
  type=script           wf spawns bun run scripts/<name>.ts
       |
  prompts/              agent instruction markdowns (read by wf directly)
  scripts/              executable .ts scripts (only for script-type workflows)
```

### Design principles (from Alfred)
- **Shell/scheduler handles control flow, agent handles reasoning.** The CLI dispatches; prompts reason.
- **Scope enforcement.** Each workflow has defined permissions (create/edit/delete per vault).
- **Vault is source of truth.** State files are bookkeeping only.
- **Durable logs.** Every run logs to `logs/`. Human-readable reports go into the vault.

### Why launchd, not Temporal
- Workflows are atomic: "run this script/prompt on schedule." No multi-step crash recovery needed.
- Zero dependencies. Ships with macOS. Survives reboots.
- Temporal requires running a server daemon — overkill for personal vault maintenance.

## Repo structure

```
~/Repos/workflows/
  AGENTS.md                           # repo conventions
  workflows.toml                      # all workflow definitions
  docs/plans/PLAN.md                  # this file
  prompts/
    vault-inbox-processing.md         # agent instructions (read by wf directly)
    vault-grooming.md
    vault-knowledge-distillation.md
  scripts/
    vault-embeddings.ts               # calls qmd update + embed (script-type only)
  src/
    wf.ts                             # CLI dispatcher + commands
    types.ts                          # all interfaces (Workflow, Config, RunState, etc.)
    validate.ts                       # TOML config validation
    state.ts                          # run state read/write + formatting helpers
    plist.ts                          # nvm resolution + launchd plist generation
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

Agent-type workflows have no per-workflow script file. The CLI handles prompt loading and opencode dispatch directly, eliminating duplication.

### Timeout

Workflows can set a `timeout` (seconds) to limit run duration via launchd's `TimeOut` key. Configurable per-workflow or as a default in `[meta]`:

```toml
[meta]
default_timeout = 3600    # 1 hour fallback for all workflows

[workflows.vault-embeddings]
timeout = 300             # override: 5 minutes for this workflow
```

Per-workflow `timeout` takes precedence over `default_timeout`. If neither is set, launchd uses its own default. Validated as a positive integer.

### Separation: prompts/ vs scripts/
- `prompts/` — Pure markdown agent instructions. Clean syntax highlighting, no escaping, readable standalone.
- `scripts/` — Executable `.ts` files for non-agent workflows only (e.g. vault-embeddings).
- Backtick safety: prompts contain inline code, obsidian CLI commands, markdown formatting. Embedding in TS template literals would require escaping. Keeping them as `.md` avoids this.

## Prerequisites

All installed and verified on PATH (via login shell with nvm eager-loaded):

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

The CLI resolves the nvm node version dynamically at plist generation time (`wf install`):
1. Reads `~/.nvm/alias/default` and follows the alias chain (max 5 hops)
2. Matches against installed versions in `~/.nvm/versions/node/`
3. Falls back to latest installed version with a warning if resolution fails

This means after `nvm install` of a new node version, run `wf install` to regenerate plists with the updated path.

**Gotcha**: launchd jobs run in a non-interactive shell where nvm is NOT loaded. The `vault-embeddings.ts` script sources nvm explicitly before calling qmd. The plist also includes the resolved nvm node bin in PATH.

## Execution flow

```
launchd fires → wf run <name>
  → reads + validates workflows.toml
  → checks workflow type
  → type=agent:
      read prompts/<name>.md
      spawn: opencode run <prompt-text>
  → type=script:
      spawn: bun run scripts/<name>.ts
  → capture exit code
  → write state to state/<name>.json
  → log to logs/<name>.out.log / .err.log
```

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

All workflows run nightly, staggered to avoid overlap and ordered by dependency:

### 1. vault-embeddings

| Field | Value |
|-------|-------|
| Type | `script` |
| Script | `scripts/vault-embeddings.ts` |
| Schedule | Daily 2am |
| Timeout | 300s (5 min) |
| Scope | Read-only (QMD indexes but never modifies source files) |
| Vaults | Memory |

Sources nvm, runs `qmd update && qmd embed`. No agent involved. Runs first to ensure search index is current for downstream workflows.

### 2. vault-grooming

| Field | Value |
|-------|-------|
| Type | `agent` |
| Prompt | `prompts/vault-grooming.md` |
| Schedule | Daily 3am |
| Scope | Knowledge: edit + report (no delete). Memory: edit + delete. |
| Vaults | Knowledge + Memory |

Scans both vaults for broken wikilinks, invalid frontmatter, orphans, stubs. Writes grooming report to `00_system/grooming-reports/`.

### 3. vault-knowledge-distillation

| Field | Value |
|-------|-------|
| Type | `agent` |
| Prompt | `prompts/vault-knowledge-distillation.md` |
| Schedule | Daily 4am |
| Scope | Create + edit in Memory vault |
| Vaults | Memory |

Reads all Memory vault notes, distills into `MEMORY.md` at vault root. Telegraph style, organized by topic, with wikilinks. Overwrites on each run. Writes via filesystem (backtick safety). Runs after grooming so it summarizes clean state.

### 4. vault-inbox-processing

| Field | Value |
|-------|-------|
| Type | `agent` |
| Prompt | `prompts/vault-inbox-processing.md` |
| Schedule | Daily 5am |
| Scope | Create + edit in Knowledge vault. Deletes processed inbox originals. |
| Vaults | Knowledge |

Based on `/obs-triage-inbox` command. Lists inbox, fetches URLs, checks duplicates, creates enriched backlog notes, deletes originals. Runs last so triaged items are ready for the day.

### Future: vault-relationship-discovery
Agent-driven workflow using QMD search to identify semantic clusters and write wikilinks back to notes. Not implemented — add when vault has enough content.

## wf CLI

### Commands

| Command | Description |
|---------|-------------|
| `wf list` | Config view: all workflows with type, schedule, enabled/disabled, description |
| `wf status` | Runtime view: enabled/disabled, scheduled/not scheduled, last run, health, failure streaks |
| `wf install` | Generate plists → copy to `~/Library/LaunchAgents/` → `launchctl bootstrap` |
| `wf uninstall` | `launchctl bootout` + remove plists, per-workflow reporting |
| `wf run <name>` | Execute workflow immediately (bypass schedule), writes state |
| `wf logs <name>` | Show stdout+stderr logs for a workflow |
| `wf enable <name>` | Load a single workflow into launchd |
| `wf disable <name>` | Unload a single workflow from launchd |

### Implementation
- **Source layout**: `src/wf.ts` (CLI + commands), `src/types.ts` (interfaces), `src/validate.ts` (config validation), `src/state.ts` (run state), `src/plist.ts` (nvm resolution + plist generation).
- **TOML**: `import { TOML } from "bun"` — built-in parser, zero deps.
- **Config validation**: Schema-level checks after parse (type enum, field exclusivity, schedule ranges, timeout).
- **Plist generation**: `src/plist.ts` handles XML template, weekday array expansion, nvm node resolution, optional `TimeOut` key.
- **Environment in plists**: PATH (dynamically resolved nvm node + bun + homebrew + system), HOME, NVM_DIR.
- **UID**: Resolved via `id -u` subprocess, with env override.
- **ANSI output**: All commands use colored terminal output — green for healthy/enabled, red for errors/failures, yellow for warnings, cyan for agent type, dim for secondary info, bold for names.
- **Status labels**: `scheduled` / `not scheduled` indicates whether launchd will fire the workflow. `ok` / `failed` for last run health. Consecutive failure count shown when > 1.
- **No npm deps** — pure Bun APIs.
- **Compiled binary path**: Detects bundled vs dev mode (`/$bunfs` prefix check) for correct ROOT resolution.

### Build
```bash
bun build src/wf.ts --compile --outfile bin/wf
```

Add to `~/.zshrc`:
```bash
export PATH="$HOME/Repos/workflows/bin:$PATH"
```

## Setup steps

1. Build: `bun build src/wf.ts --compile --outfile bin/wf`
2. Add `~/Repos/workflows/bin` to PATH
3. Test: `wf list`, `wf run vault-embeddings`
4. Install: `wf install`
5. Verify: `wf status`, `launchctl list | grep zacczakk`

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
