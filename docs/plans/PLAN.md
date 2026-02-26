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
  scripts/              executable scripts (agent prompts or shell scripts)
       |
  runners               opencode run (agent) or bash (shell)
```

### Design principles (from Alfred)
- **Python handles control flow, agent handles reasoning.** Adapted: shell/scheduler handles control flow, agent handles reasoning.
- **Scope enforcement.** Each workflow has defined permissions (create/edit/delete per vault).
- **Vault is source of truth.** State files are bookkeeping only.
- **Durable logs.** Every run logs to `logs/`. Human-readable reports go into the vault.

### Why launchd, not Temporal
- Workflows are atomic: "run this script/prompt on schedule." No multi-step crash recovery needed.
- Zero dependencies. Ships with macOS. Survives reboots.
- Temporal requires running a server daemon — overkill for personal vault maintenance.
- Reserve Temporal for future complex multi-step agent pipelines if needed.

## Repo structure

```
~/Repos/workflows/
  AGENTS.md                           # repo conventions
  workflows.toml                      # all workflow definitions
  docs/plans/PLAN.md                  # this file
  scripts/
    vault-inbox-processing.md         # agent prompt (opencode run)
    vault-grooming.md                 # agent prompt (opencode run)
    vault-knowledge-distillation.md   # agent prompt (opencode run)
    vault-embeddings.sh               # shell script (qmd)
  plists/                             # generated launchd plists (gitignored)
  logs/                               # runtime logs (gitignored)
  state/                              # JSON state files (gitignored)
  src/
    wf.ts                             # CLI source (TypeScript/Bun)
  bin/
    wf                                # compiled binary (gitignored)
  .gitignore
```

## Prerequisites

All installed and verified on PATH (via login shell with nvm eager-loaded):

| Tool | Location | Purpose |
|------|----------|---------|
| `opencode` | `/opt/homebrew/bin/opencode` | Agent runner (headless via `opencode run`) |
| `qmd` | `~/.bun/bin/qmd` | Hybrid markdown search (BM25 + vector + reranking) |
| `obsidian` | Obsidian.app CLI | Vault CRUD operations |
| `bun` | `~/.bun/bin/bun` | Build wf.ts into compiled binary |
| `node` | nvm Node 22 LTS | Required by qmd (native addon compatibility) |

### QMD setup (one-time, already done or to be done)
```bash
qmd collection add ~/Vaults/Memory --name memory
qmd update
qmd embed
```

### Node version note
QMD uses `better-sqlite3` with native addons. Must run under Node 22 LTS (MODULE_VERSION 127). nvm default set to 22, `.zshrc` eager-loads nvm. See `~/Vaults/Memory/tools/node-nvm-bun-zshrc-setup.md` for full details.

**Gotcha**: launchd jobs run in a non-interactive shell where nvm is NOT loaded. The `vault-embeddings.sh` script must either:
- Source nvm explicitly: `. "$HOME/.nvm/nvm.sh"`
- Or hardcode the Node 22 path in the script's PATH

## Runners

### `opencode run` (agent runner)
```bash
opencode run "$(cat scripts/prompt.md)"
```
- Full tool access: file I/O, obsidian CLI, web fetch
- Headless, non-interactive. Runs prompt, prints output, exits.
- Can also run slash commands: `opencode run --command /obs-triage-inbox`
- Optional optimization: `opencode serve` + `--attach` to avoid MCP cold boot (~5s per invocation)
- Docs: https://opencode.ai/docs/cli/

### `bash` (shell runner)
```bash
bash scripts/script.sh
```
- For non-agent tasks (QMD indexing, git backup, system health)

### `ask-model` (pure reasoning, future)
```bash
ask-model claude "question"
```
- No tool access. Pure text in/out.
- Uses `claude -p --no-session-persistence` under the hood.
- Good for: summarization, analysis, review tasks that don't need vault access.
- Source: `~/Repos/acsync/scripts/ask-model`

## Workflows

### 1. vault-inbox-processing

| Field | Value |
|-------|-------|
| Runner | `opencode` |
| Script | `scripts/vault-inbox-processing.md` |
| Schedule | Weekdays 8am |
| Scope | Create + edit in Knowledge vault. No delete of backlog/knowledge files. Deletes processed inbox originals. |
| Vaults | Knowledge |

Agent prompt mirrors existing `/obs-triage-inbox` command (see `~/Repos/acsync/configs/commands/obs-triage-inbox.md`):
- List `01_inbox/` via `obsidian vault=Knowledge files folder=01_inbox`
- For each file: read content, fetch URL if present (WebFetch/Tavily), check for duplicates in `02_backlog/`
- Create enriched `02_backlog/{kebab-name}.md` with `# Title`, summary, URL, `## Tasks`, `- [ ] {action} #{tag}`
- Tags: `#try` (URL/tools/articles), `#personal` (life/admin/career), `#esgenius`/`#linai` (project-specific)
- Task line style: telegraph. `#try` = noun-only. `#personal` = brief noun-phrase.
- Delete original from `01_inbox/`
- No frontmatter in Knowledge vault
- Print summary: "Triaged N items: ..."

### 2. vault-grooming

| Field | Value |
|-------|-------|
| Runner | `opencode` |
| Script | `scripts/vault-grooming.md` |
| Schedule | Sundays 3am |
| Scope | Knowledge: edit + report (no delete). Memory: edit + delete. |
| Vaults | Knowledge + Memory |

Agent prompt:
- Scan both vaults for: broken `[[wikilinks]]`, invalid/missing frontmatter (Memory only — Knowledge has no frontmatter), orphaned files (no incoming links), stub notes (< 3 lines of content)
- Knowledge vault: **report only**. Fix broken wikilinks in-place. Do NOT delete any files.
- Memory vault: fix broken wikilinks/frontmatter in-place. **Can delete** obvious orphans/stubs. Record deletions.
- Write technical log to stdout (captured by launchd → `logs/vault-grooming.out.log`)
- Write human-readable summary: `obsidian vault=Knowledge create path="00_system/grooming-reports/YYYY-MM-DD.md" content="..."`
  - Summary includes: issues found, fixes applied, files deleted (Memory), files flagged for review (Knowledge)

### 3. vault-knowledge-distillation

| Field | Value |
|-------|-------|
| Runner | `opencode` |
| Script | `scripts/vault-knowledge-distillation.md` |
| Schedule | Sundays 10pm |
| Scope | Create + edit in Memory vault |
| Vaults | Memory |

Agent prompt:
- Read ALL Memory vault notes: `obsidian vault=Memory files` → read each file
- Distill into a single `MEMORY.md` at vault root
- **Overwrites** on each run (regenerated summary, not hand-curated)
- Format: telegraph style, super condensed
- Organized by topic area matching vault folders:
  ```
  # MEMORY

  ## Projects
  - [[project-name]] — one-line summary of key learnings
  
  ## Tools  
  - [[tool-name]] — operational gotcha or setup note
  
  ## Patterns
  - [[pattern-name]] — reusable approach summary
  
  ## General
  - [[note-name]] — key insight
  ```
- Each entry: 1-2 lines max, with `[[wikilinks]]` to source note
- Write via filesystem (`~/Vaults/Memory/MEMORY.md`), not obsidian CLI (backtick safety)
- This is the "entry point" — an agent reads MEMORY.md first, then searches deeper via QMD or obsidian CLI

### 4. vault-embeddings

| Field | Value |
|-------|-------|
| Runner | `shell` |
| Script | `scripts/vault-embeddings.sh` |
| Schedule | Daily 4am |
| Scope | Read-only (QMD indexes but never modifies source files) |
| Vaults | Memory |

Shell script:
```bash
#!/bin/bash
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
qmd update
qmd embed
echo "$(date): vault-embeddings complete"
```

QMD is search-only. No clustering, no wikilink writing, no file modification. It provides the retrieval layer:
- BM25 keyword search: `qmd search "query"`
- Vector semantic search: `qmd vsearch "query"`
- Hybrid (best quality): `qmd query "query" --json`
- MCP server: `qmd mcp` (stdio) or `qmd mcp --http` (persistent daemon)

### Future: vault-relationship-discovery
Agent-driven workflow that uses QMD search results to identify semantic clusters and write `[[wikilinks]]` + `related:` frontmatter back to notes. Not implemented yet — add when the vault has enough content to benefit.

## workflows.toml format

```toml
[meta]
label_prefix = "com.zacczakk"
log_dir = "logs"
plist_dir = "plists"

[workflows.vault-inbox-processing]
script = "scripts/vault-inbox-processing.md"
runner = "opencode"
description = "Process Knowledge vault inbox into enriched backlog notes"
enabled = true

[workflows.vault-inbox-processing.schedule]
Hour = 8
Minute = 0
Weekday = [1, 2, 3, 4, 5]

[workflows.vault-grooming]
script = "scripts/vault-grooming.md"
runner = "opencode"
description = "Sweep both vaults for broken links, orphans, stale notes"
enabled = true

[workflows.vault-grooming.schedule]
Hour = 3
Minute = 0
Weekday = 0

[workflows.vault-knowledge-distillation]
script = "scripts/vault-knowledge-distillation.md"
runner = "opencode"
description = "Distill Memory vault into condensed MEMORY.md"
enabled = true

[workflows.vault-knowledge-distillation.schedule]
Hour = 22
Minute = 0
Weekday = 0

[workflows.vault-embeddings]
script = "scripts/vault-embeddings.sh"
runner = "shell"
description = "Re-index Memory vault in QMD for hybrid search"
enabled = true

[workflows.vault-embeddings.schedule]
Hour = 4
Minute = 0
```

The `[schedule]` block maps directly to launchd's `StartCalendarInterval` dict keys:
- `Hour`, `Minute`, `Month`, `Day`, `Weekday` (0=Sunday, 1=Monday, ...)
- Arrays for multiple values: `Weekday = [1, 2, 3, 4, 5]` = weekdays

## wf CLI (Bun-compiled binary)

### Why Bun, not Bash
- TOML parsing: Bun has native/npm TOML parsing. Bash can't parse TOML without external tools.
- Plist XML generation: structured XML generation beats string templates with sed.
- Error handling: try/catch vs `set -e` and hope.
- Consistency: existing helpers (`committer`, `docs-list`, `browser-tools`) are all bun-compiled.
- Distribution: `bun build --compile` → single binary on PATH.

### Commands

| Command | Description |
|---------|-------------|
| `wf list` | Show all defined workflows from toml (name, schedule, enabled, runner) |
| `wf install` | Generate plists from workflows.toml → `plists/` → copy to `~/Library/LaunchAgents/` → `launchctl bootstrap gui/$(id -u)` |
| `wf uninstall` | `launchctl bootout` + remove plists from LaunchAgents |
| `wf run <name>` | Execute workflow immediately (bypass schedule) |
| `wf status` | All workflows: loaded state in launchd, last exit code, schedule |
| `wf logs <name>` | Tail stdout+stderr logs for a workflow |
| `wf enable <name>` | Load a single workflow into launchd |
| `wf disable <name>` | Unload a single workflow from launchd |

### Plist generation

For each enabled workflow, `wf install` generates a plist:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.zacczakk.vault-inbox-processing</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/m332023/Repos/workflows/bin/wf</string>
        <string>run</string>
        <string>vault-inbox-processing</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Hour</key><integer>8</integer>
            <key>Minute</key><integer>0</integer>
            <key>Weekday</key><integer>1</integer>
        </dict>
        <!-- ... one dict per weekday ... -->
    </array>
    <key>StandardOutPath</key>
    <string>/Users/m332023/Repos/workflows/logs/vault-inbox-processing.out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/m332023/Repos/workflows/logs/vault-inbox-processing.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/Users/m332023/.nvm/versions/node/v22.../bin:/Users/m332023/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/m332023</string>
        <key>NVM_DIR</key>
        <string>/Users/m332023/.nvm</string>
    </dict>
</dict>
</plist>
```

Key details:
- ProgramArguments calls `wf run <name>` (not the script directly). This way `wf` handles runner selection, logging, error reporting.
- Weekday arrays expand to multiple `StartCalendarInterval` dicts (launchd requirement).
- PATH includes nvm Node 22, bun, homebrew — everything tools need.
- HOME and NVM_DIR set explicitly (launchd doesn't inherit user env).

### `wf run` execution flow

```
wf run <name>
  → read workflows.toml
  → find workflow by name
  → resolve script path (absolute)
  → if runner == "opencode":
      exec: opencode run "$(cat script.md)"
  → if runner == "shell":
      exec: bash script.sh
  → capture exit code
  → log to logs/<name>.out.log / .err.log
```

### Build and PATH

```bash
cd ~/Repos/workflows
bun build src/wf.ts --compile --outfile bin/wf
```

Add to `~/.zshrc`:
```bash
export PATH="$HOME/Repos/workflows/bin:$PATH"
```

## Implementation order

1. Write `AGENTS.md`
2. Write `workflows.toml`
3. Write four workflow scripts:
   - `scripts/vault-inbox-processing.md`
   - `scripts/vault-grooming.md`
   - `scripts/vault-knowledge-distillation.md`
   - `scripts/vault-embeddings.sh`
4. Write `src/wf.ts` — full CLI
5. Build `bin/wf`
6. Add `~/Repos/workflows/bin` to PATH in `~/.zshrc`
7. Test: `wf list`, `wf run vault-embeddings`
8. `wf install` — register all plists with launchd
9. Verify: `wf status`, check `launchctl list | grep zacczakk`

## Vault context

### Knowledge vault structure
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

### Memory vault structure
```
~/Vaults/Memory/
  MEMORY.md            # Generated distilled summary (created by vault-knowledge-distillation)
  projects/            # Per-repo learnings
  tools/               # CLI/tool knowledge
  patterns/            # Reusable implementation patterns
  sessions/            # Session recaps
  {general}.md         # General notes at root
```
- **Frontmatter required.** Schema: type, tags, created, related, depends-on.
- **Can delete** orphans/stubs via vault-grooming workflow.
- **Write code-containing notes via filesystem** (not obsidian CLI — backtick safety).

### Obsidian CLI reference
```bash
obsidian vault=Knowledge files [folder=01_inbox]
obsidian vault=Knowledge read path="..."
obsidian vault=Knowledge create path="..." content="..."
obsidian vault=Knowledge append path="..." content="..."
obsidian vault=Knowledge delete path="..."
obsidian vault=Knowledge search query="..."
obsidian vault=Knowledge move path="..." to="folder"
obsidian vault=Memory files [folder=projects]
obsidian vault=Memory read path="..."
obsidian vault=Memory create path="..." content="..."
obsidian vault=Memory delete path="..."
obsidian vault=Memory search query="..."
```

## Research sources

- **Alfred** (ssdavidai/alfred): Four-worker model (Curator, Janitor, Distiller, Surveyor), scope enforcement, Temporal kinetic layer, Obsidian vault as shared agent+human memory. https://github.com/ssdavidai/alfred
- **OpenClaw**: Two-tier memory (MEMORY.md curated + memory/YYYY-MM-DD.md daily logs), SOUL.md agent persona, USER.md user profile, heartbeat-driven grooming, vector search with temporal decay + MMR. https://docs.openclaw.ai/concepts/memory
- **QMD** (tobi/qmd): On-device hybrid markdown search. BM25 + vector + query expansion + LLM reranking. Read-only — no file modification. ~2GB model download on first use. https://github.com/tobi/qmd
- **opencode run**: Headless non-interactive mode. Full tool access. `opencode run "prompt"`. Optional `--attach` to persistent server. https://opencode.ai/docs/cli/
- **ask-model**: Cross-model consultation (claude/codex/gemini). No tool access. `~/Repos/acsync/scripts/ask-model`.
