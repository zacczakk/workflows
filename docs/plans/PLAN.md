# Workflows — Execution Plan

Scheduled workflow execution for vault maintenance and agent-driven tasks on macOS. Inspired by [Alfred](https://github.com/ssdavidai/alfred) (Temporal-based agent infrastructure) but using launchd (zero-dependency, native macOS scheduler).

## Architecture

```
workflows.toml          defines workflows, schedules, metadata
       |
    wf CLI              reads toml, generates plists, manages launchd
       |
   launchd              native macOS scheduler, fires on StartCalendarInterval
       |
  scripts/              executable .ts scripts (run via bun)
       |
  prompts/              agent instruction markdowns (read by scripts)
```

### Design principles (from Alfred)
- **Shell/scheduler handles control flow, agent handles reasoning.** Scripts dispatch; prompts reason.
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
    vault-inbox-processing.md         # agent instructions (read by scripts)
    vault-grooming.md
    vault-knowledge-distillation.md
  scripts/
    vault-inbox-processing.ts         # reads prompt, calls opencode run
    vault-grooming.ts
    vault-knowledge-distillation.ts
    vault-embeddings.ts               # calls qmd update + embed
  src/
    wf.ts                             # CLI source (TypeScript/Bun)
  bin/
    wf                                # compiled binary (gitignored)
  plists/                             # generated launchd plists (gitignored)
  logs/                               # runtime logs (gitignored)
  state/                              # JSON state files (gitignored)
  .gitignore
```

### Separation: prompts/ vs scripts/
- `prompts/` — Pure markdown agent instructions. Clean syntax highlighting, no escaping, readable standalone.
- `scripts/` — Executable `.ts` files. Read a prompt, call `opencode run`, handle exit codes.
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

### Node version note
QMD uses `better-sqlite3` with native addons. Must run under Node 22 LTS (MODULE_VERSION 127). nvm default set to 22, `.zshrc` eager-loads nvm.

**Gotcha**: launchd jobs run in a non-interactive shell where nvm is NOT loaded. The `vault-embeddings.ts` script sources nvm explicitly before calling qmd.

## Execution flow

```
launchd fires → wf run <name>
  → reads workflows.toml
  → resolves script path
  → exec: bun run scripts/<name>.ts
    → (agent scripts) read prompts/<name>.md, spawn opencode run
    → (embeddings) source nvm, spawn qmd update + embed
  → capture exit code
  → log to logs/<name>.out.log / .err.log
```

All scripts are `.ts`, all dispatched via `bun run`. No runner field in TOML — uniform execution model.

## Workflows

### 1. vault-inbox-processing

| Field | Value |
|-------|-------|
| Script | `scripts/vault-inbox-processing.ts` |
| Prompt | `prompts/vault-inbox-processing.md` |
| Schedule | Weekdays 8am |
| Scope | Create + edit in Knowledge vault. Deletes processed inbox originals. |
| Vaults | Knowledge |

Based on `/obs-triage-inbox` command. Lists inbox, fetches URLs, checks duplicates, creates enriched backlog notes, deletes originals.

### 2. vault-grooming

| Field | Value |
|-------|-------|
| Script | `scripts/vault-grooming.ts` |
| Prompt | `prompts/vault-grooming.md` |
| Schedule | Sundays 3am |
| Scope | Knowledge: edit + report (no delete). Memory: edit + delete. |
| Vaults | Knowledge + Memory |

Scans both vaults for broken wikilinks, invalid frontmatter, orphans, stubs. Writes grooming report to `00_system/grooming-reports/`.

### 3. vault-knowledge-distillation

| Field | Value |
|-------|-------|
| Script | `scripts/vault-knowledge-distillation.ts` |
| Prompt | `prompts/vault-knowledge-distillation.md` |
| Schedule | Sundays 10pm |
| Scope | Create + edit in Memory vault |
| Vaults | Memory |

Reads all Memory vault notes, distills into `MEMORY.md` at vault root. Telegraph style, organized by topic, with wikilinks. Overwrites on each run. Writes via filesystem (backtick safety).

### 4. vault-embeddings

| Field | Value |
|-------|-------|
| Script | `scripts/vault-embeddings.ts` |
| Schedule | Daily 4am |
| Scope | Read-only (QMD indexes but never modifies source files) |
| Vaults | Memory |

Sources nvm, runs `qmd update && qmd embed`. No agent involved.

### Future: vault-relationship-discovery
Agent-driven workflow using QMD search to identify semantic clusters and write wikilinks back to notes. Not implemented — add when vault has enough content.

## wf CLI

### Commands

| Command | Description |
|---------|-------------|
| `wf list` | Show all defined workflows (name, schedule, enabled) |
| `wf install` | Generate plists → copy to `~/Library/LaunchAgents/` → `launchctl bootstrap` |
| `wf uninstall` | `launchctl bootout` + remove plists |
| `wf run <name>` | Execute workflow immediately (bypass schedule) |
| `wf status` | Loaded state in launchd, last exit code, schedule |
| `wf logs <name>` | Show stdout+stderr logs for a workflow |
| `wf enable <name>` | Load a single workflow into launchd |
| `wf disable <name>` | Unload a single workflow from launchd |

### Implementation
- **TOML**: `import { TOML } from "bun"` — built-in parser, zero deps.
- **Plist XML**: Template function handling weekday array expansion.
- **Environment in plists**: PATH (nvm node 22 + bun + homebrew + system), HOME, NVM_DIR.
- **No npm deps** — pure Bun APIs.
- **Compiled binary path**: Detects bundled vs dev mode for correct ROOT resolution.

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
