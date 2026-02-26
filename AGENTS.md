# Workflows

Scheduled workflow execution for vault maintenance and agent-driven tasks. launchd-based, macOS-native.

## Read First

- `docs/plans/PLAN.md` — full execution plan with all research context, architecture decisions, and implementation details.

## Structure

```
workflows.toml          workflow definitions + schedules
prompts/                agent instruction markdowns (read by scripts)
scripts/                executable .ts scripts (all run via bun)
src/wf.ts               CLI source (Bun/TypeScript)
bin/wf                  compiled binary (gitignored)
plists/                 generated launchd plists (gitignored)
logs/                   runtime logs (gitignored)
state/                  JSON state files (gitignored)
```

## Execution

All scripts are `.ts`, dispatched via `bun run`. Agent scripts read their prompt from `prompts/`, then call `opencode run`.

```
launchd → wf run <name> → bun run scripts/<name>.ts → opencode run / qmd
```

## Key tools on PATH

- `opencode` — agent runner (headless via `opencode run`)
- `qmd` — hybrid markdown search (requires Node 22 via nvm)
- `obsidian` — vault CRUD
- `bun` — build wf.ts, run all scripts

## Conventions

- Commits: Conventional Commits.
- Files < 500 LOC.
- No secrets in repo. Use `.env` for local values.
- launchd plists call `wf run <name>`, not scripts directly.
- Agent prompts in `prompts/` are self-contained — no dependency on interactive context.
- Scripts source nvm explicitly for Node 22 compatibility (launchd has no shell env).
- Build: `bun build src/wf.ts --compile --outfile bin/wf`.
