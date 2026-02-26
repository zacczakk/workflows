# Workflows

Scheduled workflow execution for vault maintenance and agent-driven tasks. launchd-based, macOS-native.

## Read First

- `docs/plans/PLAN.md` — full execution plan with all research context, architecture decisions, and implementation details.

## Structure

```
workflows.toml          workflow definitions + schedules
scripts/                executable prompts (.md) and shell scripts (.sh)
src/wf.ts               CLI source (Bun/TypeScript)
bin/wf                  compiled binary (gitignored)
plists/                 generated launchd plists (gitignored)
logs/                   runtime logs (gitignored)
state/                  JSON state files (gitignored)
```

## Runners

- `opencode` — `opencode run "$(cat script.md)"`. Full tool access.
- `shell` — `bash script.sh`. For non-agent tasks.

## Key tools on PATH

- `opencode` — agent runner (headless via `opencode run`)
- `qmd` — hybrid markdown search (requires Node 22 via nvm)
- `obsidian` — vault CRUD
- `bun` — build wf.ts

## Conventions

- Commits: Conventional Commits.
- Files < 500 LOC.
- No secrets in repo. Use `.env` for local values.
- launchd plists call `wf run <name>`, not scripts directly.
- Agent prompts in scripts/ are self-contained — no dependency on interactive context.
- Shell scripts source nvm explicitly for Node 22 compatibility.
