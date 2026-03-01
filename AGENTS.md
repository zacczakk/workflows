# Workflows

Scheduled workflow execution for vault maintenance and agent-driven tasks. launchd-based, macOS-native.

## Read First

- `docs/plans/PLAN.md` — full execution plan with research context, architecture decisions, implementation details.

## Structure

```
workflows.toml          workflow definitions + schedules (type: agent | script)
prompts/                agent instruction markdowns (read by wf directly for agent-type)
scripts/                executable .ts scripts (only script-type workflows)
src/
  wf.ts                 CLI dispatcher + commands
  types.ts              all interfaces (Workflow, Config, RunState, etc.)
  validate.ts           TOML config validation
  state.ts              run state read/write + formatting helpers
  plist.ts              nvm resolution + launchd plist generation
  wake.ts               scheduled wake via pmset (sleep-proof scheduling)
bin/wf                  compiled binary (gitignored)
plists/                 generated launchd plists (gitignored)
logs/                   runtime logs (gitignored)
state/                  JSON run state per workflow (gitignored)
```

## Execution

Two workflow types, declared via `type` field in `workflows.toml`:

- `type = "agent"` — reads prompt from `prompts/`, spawns `opencode run <prompt-text>`.
- `type = "script"` — spawns `bun run scripts/<name>.ts`.

```
launchd → wf run <name> → agent: opencode run <prompt>
                         → script: bun run scripts/<name>.ts
```

## Repo Conventions

- launchd plists call `wf run <name>`, not scripts directly.
- Agent prompts in `prompts/` are self-contained — no dependency on interactive context.
- Node version resolved dynamically from nvm aliases at `wf install` time.
- Script-type workflows source nvm explicitly for Node 22 compatibility (launchd has no shell env).
- Build: `bun build src/wf.ts --compile --outfile bin/wf`.
