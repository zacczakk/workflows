# workflows

Scheduled AI agent workflows for Obsidian vault maintenance. macOS-native, launchd-based.

`wf` is a CLI that schedules and runs workflows on a cron via macOS launchd. Each workflow is either an **agent prompt** (executed headlessly via [OpenCode](https://opencode.ai)) or a **script**. Designed for overnight vault maintenance — triaging inbox captures, grooming wikilinks, distilling session notes, condensing knowledge into agent-readable summaries.

## How it works

```
pmset wakeorpoweron  →  launchd fires at 01:00
                         └── wf run nightly
                              ├── disablesleep 1
                              ├── skill-sync           (script)
                              ├── vault-embeddings     (script)
                              ├── vault-inbox-processing (agent)
                              ├── vault-session-processing (agent)
                              ├── vault-grooming         (agent)
                              ├── vault-backlog-triage   (agent)
                              ├── vault-knowledge-distillation (agent)
                              ├── vault-consolidation    (agent, cadence 1d)
                              ├── vault-retrieval-practice (agent, cadence 7d)
                              └── disablesleep 0
watchdog at 07:00    →  disablesleep 0 (safety net)

sessions-export      →  launchd fires every 30 minutes (interval schedule)
```

Workflows run **sequentially** in schedule order — the next starts immediately after the previous finishes. A single launchd plist triggers `wf run <schedule>` at the earliest schedule time. Per-workflow timeouts still apply.

Sleep is disabled for the duration of the batch and re-enabled afterward (via `finally` block + signal traps). A watchdog plist at 07:00 guarantees sleep re-enables even if `wf` crashes.

## Included workflows

### Nightly (01:00)

| Workflow | Type | Timeout | Cadence | What it does |
|----------|------|---------|---------|-------------|
| `skill-sync` | script | 5m | daily | Sync upstream agent skills from GitHub repos via `gh api` |
| `vault-embeddings` | script | 30m | daily | Re-index Memory vault in QMD for hybrid search |
| `vault-inbox-processing` | agent | 1h | daily | Triage raw inbox captures into enriched backlog notes |
| `vault-session-processing` | agent | 30m | daily | Distill session notes into patterns and project knowledge |
| `vault-grooming` | agent | 90m | daily | Fix broken links, connect orphans, clean frontmatter |
| `vault-backlog-triage` | agent | 30m | daily | Evaluate and prioritize backlog items |
| `vault-knowledge-distillation` | agent | 90m | daily | Condense Memory vault into `MEMORY.md` for agent context |
| `vault-consolidation` | agent | 1h | daily | Synthesize cross-cutting insights from recent session notes |
| `vault-retrieval-practice` | agent | 30m | weekly | Spot-check Memory vault notes for accuracy |

### Sessions export (every 30 minutes)

| Workflow | Type | Timeout | What it does |
|----------|------|---------|-------------|
| `sessions-export` | script | 10m | Incremental export and index of OpenCode session history |

## CLI

```
wf list              show all workflows and schedules
wf status            show runtime health, last run times, failure streaks
wf run <name>        run a schedule (all workflows) or a single workflow
wf logs <name>       show stdout + stderr logs (accepts schedule or workflow name)

wf install           generate plists, register with launchd, schedule wake
wf uninstall         remove from launchd, clear wake schedule
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

- **`wf-<schedule>`** — triggers `wf run <schedule>` at the scheduled time (e.g., 01:00 for `nightly`)
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

Two schedule types:
- **`time`** — fires at a fixed daily time via launchd `StartCalendarInterval`
- **`interval`** — fires every N seconds via launchd `StartInterval`

### Cadence gating

Workflows can declare `cadence_days` to run less frequently than their schedule:

```toml
[workflows.vault-retrieval-practice]
cadence_days = 7    # skip if last success was < 7 days ago
```

`wf` checks the state file before spawning the process and prints `skip` if the cadence hasn't elapsed. Direct `wf run <name>` always executes regardless of cadence.

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
3. **Sleep watchdog** — a launchd job at 07:00 that runs `pmset disablesleep 0` as a safety net in case `wf` crashes without re-enabling sleep

The `disablesleep` flag is runtime-only (not persisted) — a reboot always clears it.

`wf status` shows the current wake schedule. `wf uninstall` clears everything.

## Error detection

### opencode silent exit bug

opencode ≥1.3.0 (released 2026-03-22) silently exits 0 when the model provider call fails — network timeouts, auth errors, DNS failures, etc. The agent does no work but `wf` sees exit 0 and records success.

`wf` works around this by querying the opencode session database after every agent run:

```
~/.local/share/opencode/opencode.db
  message.data->>'error'   -- populated on provider failure
```

If the most recent session created during the run contains a message-level error, `wf` overrides the exit code to 1, prints the error, and records it as a failure. Uses `/usr/bin/sqlite3` (always available, no PATH dependency).

Error types caught: `UnknownError` (network/TCP), `APIError`, `ProviderAuthError`, `ContextOverflowError`, `MessageAbortedError`.

### Network failures at 1am

Agent workflows use `github-copilot/claude-opus-4.6` as the model. If the machine is offline at 1am (wifi dropped, router cycled), `api.githubcopilot.com` is unreachable. The opencode silent exit bug means these failures were previously invisible — `wf status` showed all agent workflows as passing.

With the DB check, offline nights now correctly show as failed and increment `consecutiveFailures` in state.

### skill-sync network failures

`skill-sync` previously used `git clone` to fetch upstream skill repos. `git` goes through the system DNS resolver — on Merck-managed machines, DNS is routed through corporate nameservers that are unreachable when off-network. This caused `Could not resolve host: github.com`.

Fixed by switching to `gh api /repos/{owner}/{repo}/tarball/HEAD` (piped to `tar`). `gh` uses its own Go HTTP client, bypassing git's DNS/SSL stack. One tarball fetch per repo (~1s each) replaces four `git clone` calls that could each timeout after 60s.

## Writing prompts

Agent prompts in `prompts/` are self-contained markdown files. They are read by `wf` at runtime and passed directly to `opencode run` as the prompt text. No interactive context is available — prompts must include all instructions the agent needs.

## Uninstall

```bash
wf uninstall                          # removes launchd agents + clears wake
sudo rm /etc/sudoers.d/wf-pmset      # removes passwordless pmset access
```

## License

MIT
