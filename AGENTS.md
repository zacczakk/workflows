# Workflows

Scheduled vault maintenance via launchd. See `README.md` for full docs.

- Plan: `docs/plans/PLAN.md`
- Config: `workflows.toml`
- Prompts: `prompts/` (self-contained, no interactive context)
- Scripts: `scripts/` (Bun)
- Build: `bun build src/wf.ts --compile --outfile bin/wf`
