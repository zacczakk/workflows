# workflows

Scheduled AI agent workflows for Obsidian vault maintenance. macOS-native, launchd-based.

`wf` is a CLI that schedules and runs workflows on a cron via macOS launchd. Each workflow is either an **agent prompt** (executed headlessly via [OpenCode](https://opencode.ai)) or a **script**. Designed for overnight vault maintenance — triaging inbox captures, grooming wikilinks, distilling session notes, condensing knowledge into agent-readable summaries.

## How it works

```
pmset wakeorpoweron  →  launchd fires at 02:00
                         └── wf run nightly
                              ├── disablesleep 1
                              ├── vault-embeddings     (script)
                              ├── vault-inbox-processing (agent)
                              ├── vault-session-processing (agent)
                              ├── vault-grooming         (agent)
                              ├── vault-knowledge-distillation (agent)
                              └── disablesleep 0
watchdog at 06:00    →  disablesleep 0 (safety net)
```

Workflows run **sequentially** in schedule order — the next starts immediately after the previous finishes. A single launchd plist triggers `wf run <schedule>` at the earliest schedule time. Per-workflow timeouts still apply.

Sleep is disabled for the duration of the batch and re-enabled afterward (via `finally` block + signal traps). A watchdog plist at 06:00 guarantees sleep re-enables even if `wf` crashes.

## Included workflows

| Workflow | Type | Timeout | What it does |
|----------|------|---------|-------------|
| `vault-embeddings` | script | 30m | Re-index vault in QMD for hybrid search |
| `vault-inbox-processing` | agent | 1h | Triage raw inbox captures into enriched backlog notes |
| `vault-session-processing` | agent | 30m | Distill session notes into patterns and project knowledge |
| `vault-grooming` | agent | 1h | Fix broken links, connect orphans, clean frontmatter |
| `vault-knowledge-distillation` | agent | 1h | Condense vault into a single context file for agents |

## CLI

```
wf list              show all workflows
wf status            show runtime health
wf run <name>        run a schedule or single workflow
wf logs <name>       show logs (schedule or workflow name)

wf install           install into launchd + schedule wake
wf uninstall         remove from launchd + clear wake
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

### 1. Build

```bash
git clone https://github.com/zacczakk/workflows.git
cd workflows
bun build src/wf.ts --compile --outfile bin/wf
export PATH="$PWD/bin:$PATH"
```

### 2. Configure sudoers for sleep management

Workflows run overnight while the Mac lid is closed. `wf` uses `pmset disablesleep` to prevent clamshell sleep during execution. This requires passwordless sudo for exactly two commands:

```bash
# create the sudoers rule
sudo tee /etc/sudoers.d/wf-pmset > /dev/null << 'EOF'
<your-username> ALL=(ALL) NOPASSWD: /usr/bin/pmset -a disablesleep 1
<your-username> ALL=(ALL) NOPASSWD: /usr/bin/pmset -a disablesleep 0
EOF

# set permissions + validate
sudo chmod 0440 /etc/sudoers.d/wf-pmset
sudo visudo -cf /etc/sudoers.d/wf-pmset

# verify it works
sudo -n pmset -a disablesleep 1 && sudo -n pmset -a disablesleep 0
```

Replace `<your-username>` with your macOS username (`whoami`).

**Security note:** The sudoers rule is scoped to exactly `pmset -a disablesleep 0` and `pmset -a disablesleep 1`. No other `pmset` subcommands get passwordless access. The `disablesleep` flag is runtime-only and resets on reboot.

### 3. Register QMD collection

```bash
qmd collection add ~/Vaults/Memory --name memory
```

### 4. Install

```bash
wf install
```

This registers two launchd agents per enabled schedule:

- **`wf-<schedule>`** — triggers `wf run <schedule>` at the scheduled time (e.g., 02:00 for `nightly`)
- **`wf-<schedule>-watchdog`** — runs `pmset disablesleep 0` at the watchdog time as a safety net

It also sets a `pmset repeat wakeorpoweron` so the Mac wakes from sleep to run workflows. This step prompts for sudo (one time).

### 5. Verify

```bash
wf status          # should show runner + watchdog as scheduled
wf run nightly     # manual test — runs all workflows now
```

## Configuration

All workflows and schedules are defined in `workflows.toml`:

```toml
[meta]
label_prefix = "com.example"
default_timeout = 3600

[schedules.nightly]
time = { hour = 2, minute = 0 }
watchdog = { hour = 6, minute = 0 }     # optional, auto-derived if omitted
enabled = true
workflows = ["my-workflow"]

[workflows.my-workflow]
type = "agent"                          # or "script"
prompt = "prompts/my-workflow.md"        # agent-type: path to prompt markdown
# script = "scripts/my-script.ts"       # script-type: path to script
description = "What this workflow does"
timeout = 1800                          # optional, overrides default_timeout
```

Schedules group workflows into ordered sequential batches. Workflows run in array order — the next starts immediately after the previous finishes.

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
  plist.ts              launchd plist generation
  wake.ts               scheduled wake via pmset (sleep-proof scheduling)
bin/wf                  compiled binary (gitignored)
plists/                 generated launchd plists (gitignored)
logs/                   runtime logs (gitignored)
state/                  JSON run state per workflow (gitignored)
```

## Sleep & wake

Workflows run overnight with the Mac lid closed. Three layers ensure reliability:

1. **`pmset repeat wakeorpoweron`** — wakes the Mac at the scheduled time (set during `wf install`)
2. **`pmset disablesleep`** — prevents clamshell sleep while workflows execute (`wf run` toggles this automatically via passwordless sudo)
3. **Sleep watchdog** — a launchd job at 06:00 that runs `pmset disablesleep 0` as a safety net in case `wf` crashes without re-enabling sleep

The `disablesleep` flag is runtime-only (not persisted) — a reboot always clears it.

`wf status` shows the current wake schedule. `wf uninstall` clears everything.

## Writing prompts

Agent prompts in `prompts/` are self-contained markdown files. They are read by `wf` at runtime and passed directly to `opencode run` as the prompt text. No interactive context is available — prompts must include all instructions the agent needs.

## Uninstall

```bash
wf uninstall                          # removes launchd agents + clears wake
sudo rm /etc/sudoers.d/wf-pmset      # removes passwordless pmset access
```

## License

MIT
