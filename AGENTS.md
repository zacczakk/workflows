# Workflows

Scheduled vault maintenance via launchd. See `README.md` for full docs.

- Plan: `docs/plans/PLAN.md`
- Config: `workflows.toml`
- Prompts: `prompts/` (self-contained, no interactive context)
- Scripts: `scripts/` (Bun)
- Build: `WF_CODESIGN_IDENTITY="..." bun run scripts/build.ts` (compiles and signs `bin/wf` with a stable macOS identity)
