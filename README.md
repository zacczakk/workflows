# workflows

Scheduled AI agent workflows for Obsidian vault maintenance. macOS-native, launchd-based.

`wf` is a CLI that schedules and runs workflows on a cron via macOS launchd. Each workflow is either an **agent prompt** (executed headlessly via [OpenCode](https://opencode.ai)) or a **script**. Designed for overnight vault maintenance — triaging inbox captures, grooming wikilinks, distilling session notes, condensing knowledge into agent-readable summaries.

## How it works

```
launchd -> wf run <name> -> agent: opencode run <prompt>
                          -> script: bun run scripts/<name>.ts
```

Workflows are defined in `workflows.toml`. Agent-type workflows read a markdown prompt from `prompts/` and pass it to `opencode run`. Script-type workflows execute a TypeScript file via Bun.

## Included workflows

| Workflow | Type | Schedule | What it does |
|----------|------|----------|-------------|
| `vault-embeddings` | script | 02:00 | Re-index vault in QMD for hybrid search |
| `vault-inbox-processing` | agent | 02:30 | Triage raw inbox captures into enriched backlog notes |
| `vault-session-processing` | agent | 03:00 | Distill session notes into patterns and project knowledge |
| `vault-grooming` | agent | 03:30 | Fix broken links, connect orphans, clean frontmatter |
| `vault-knowledge-distillation` | agent | 04:30 | Condense vault into a single context file for agents |

Workflows run nightly, staggered to avoid overlap and ordered by dependency. On `wf install`, a scheduled wake (`pmset repeat wakeorpoweron`) is set so the Mac wakes from sleep to run them.

## CLI

```
wf list              show all workflows
wf status            show runtime health
wf run <name>        run a workflow now
wf logs <name>       show logs

wf install           install all into launchd + schedule wake
wf uninstall         remove all from launchd + clear wake
wf enable <name>     activate a workflow
wf disable <name>    deactivate a workflow

--sort <key>         sort list/status (schedule, name)
```

## Setup

### Prerequisites

- macOS with launchd
- [Bun](https://bun.sh) — runtime + compiler
- [nvm](https://github.com/nvm-sh/nvm) with Node >= 22 — required for plist PATH resolution and qmd
- [OpenCode](https://opencode.ai) — headless agent execution (`opencode run`)
- [Obsidian CLI](https://github.com/zacczakk/obsidian) — vault CRUD (used by agent prompts)
- [qmd](https://github.com/tobi/qmd) — hybrid markdown search + embeddings (required for `vault-embeddings`, optional for agent workflows)
- Two Obsidian vaults at `~/Vaults/Knowledge/` and `~/Vaults/Memory/`

### Build & install

```bash
# compile the CLI
bun build src/wf.ts --compile --outfile bin/wf

# add to PATH
export PATH="$PWD/bin:$PATH"

# one-time: register vault with qmd for embeddings
qmd collection add ~/Vaults/Memory --name memory

# register with launchd
wf install
```

## Configuration

All workflows are defined in `workflows.toml`:

```toml
[meta]
label_prefix = "com.example"
default_timeout = 3600

[workflows.my-workflow]
type = "agent"                          # or "script"
prompt = "prompts/my-workflow.md"        # agent-type: path to prompt markdown
# script = "scripts/my-script.ts"       # script-type: path to script
description = "What this workflow does"
enabled = true
timeout = 1800                          # optional, overrides default_timeout
schedule = { hour = 3, minute = 0 }     # launchd StartCalendarInterval
```

### Schedule options

```toml
schedule = { hour = 3, minute = 30 }                    # daily at 03:30
schedule = { hour = 8, minute = 0, weekday = [1,2,3,4,5] }  # weekdays at 08:00
schedule = { hour = 0, minute = 0, day = 1 }             # 1st of each month
```

## Project structure

```
workflows.toml          workflow definitions + schedules
prompts/                agent prompt markdowns
scripts/                executable .ts scripts (script-type only)
src/
  wf.ts                 CLI dispatcher + commands
  types.ts              interfaces
  validate.ts           TOML config validation
  state.ts              run state + formatting helpers
  plist.ts              nvm resolution + launchd plist generation
  wake.ts               scheduled wake via pmset (sleep-proof scheduling)
bin/wf                  compiled binary (gitignored)
plists/                 generated launchd plists (gitignored)
logs/                   runtime logs (gitignored)
state/                  JSON run state per workflow (gitignored)
```

## Sleep & wake

launchd `StartCalendarInterval` jobs don't fire while the Mac is asleep — but they fire once on the next wake (coalesced if multiple intervals were missed). `wf install` automatically sets a `pmset repeat wakeorpoweron` at the earliest scheduled workflow time so the Mac wakes, runs workflows, and sleeps again after idle timeout. Requires sudo (prompted during install).

`wf status` shows the current wake schedule. `wf uninstall` clears it.

## Writing prompts

Agent prompts in `prompts/` are self-contained markdown files. They are read by `wf` at runtime and passed directly to `opencode run` as the prompt text. No interactive context is available — prompts must include all instructions the agent needs.

## License

MIT
