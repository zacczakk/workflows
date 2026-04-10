# Minutes Inbox Distillation Design

## Goal

Automatically convert each new Minutes transcript markdown file in `~/.minutes/meetings/` into one raw summary note in `~/Vaults/Knowledge/01_inbox/`.

The raw summary note should:
- condense the transcript into main findings
- extract actions and follow-ups
- infer related `03_active` project notes by checking the Knowledge vault
- suggest merge targets inside those project notes

The output is deliberately not a backlog note and not an automatic merge into `03_active`. It is a curated inbox artifact for later review.

## Context

Minutes is already operating as the raw capture layer. Raw transcripts stay outside the vault in `~/.minutes/meetings/`. The missing layer is automatic distillation into a vault-friendly note shape.

The `workflows` repo already provides launchd-driven scheduled execution with two workflow types:
- `agent` workflows for OpenCode prompts
- `script` workflows for local automation

This repo is schedule/poll based, not daemon/watcher based. Therefore the implementation should behave like a watcher through frequent interval polling, not a long-running filesystem daemon.

## Recommended Approach

Use a two-step workflow in `workflows`:

1. A small interval `script` workflow polls `~/.minutes/meetings/` for unprocessed transcript markdown files.
2. For each newly discovered transcript, the script invokes a single-purpose `agent` distillation prompt through OpenCode using `github-copilot/gpt-5.4`, passing the transcript path and a bounded set of relevant vault context.

This preserves repo conventions:
- scheduling and control flow stay in shell/script land
- reasoning stays in the agent prompt
- state files only track bookkeeping

## Alternatives Considered

### 1. Direct agent-only poller

Run a single agent on a schedule and let it discover transcripts, infer state, and write notes.

Pros:
- minimal implementation surface

Cons:
- weaker idempotency
- more fragile state handling
- expensive use of agent context for filesystem bookkeeping

Rejected because transcript detection and dedupe are deterministic script work.

### 2. Thin shell wrapper around `ask-model codex`

Use a shell/script workflow to build prompts and call `ask-model codex` or direct `codex exec`.

Pros:
- simple CLI surface
- easy model swapping

Cons:
- poorer vault-aware reasoning path than OpenCode
- less alignment with existing agent workflow architecture

Rejected as the first implementation. Could remain a fallback later.

### 3. Long-running filesystem watcher

Use `fs.watch` or `launchd KeepAlive` to keep a daemon alive and react instantly.

Pros:
- near-real-time behavior

Cons:
- fights repo architecture built around scheduled launchd jobs
- harder crash recovery and supervision story
- unnecessary for personal meeting distillation

Rejected. Interval polling is simpler and good enough.

## Architecture

### Workflow shape

Add a new interval schedule dedicated to Minutes transcript polling.

Suggested shape:
- schedule frequency: every 5 minutes
- script workflow: discover unprocessed transcripts
- agent invocation per transcript: distill one transcript into one inbox note

The script owns:
- file discovery
- file stabilization check
- dedupe / processed-state tracking
- invoking the agent with narrow input

The agent owns:
- summarization
- action extraction
- related-project inference
- merge-hint generation
- final note content generation

### State model

Processed-state bookkeeping stays outside the vault graph.

Store one local state manifest under `workflows/state/`, keyed by transcript path plus a fingerprint that changes when the transcript changes.

Recommended key material:
- absolute path
- last modified time
- file size

If a transcript changes after initial processing, the workflow should treat it as new work and rewrite or regenerate the inbox note.

### File stabilization

Because Minutes may still be writing when polling sees a file, the poller should only process a transcript when:
- file exists
- size is non-zero
- mtime/size are unchanged across two polls separated by a short delay

This avoids partial note generation from incomplete transcripts.

## Context Retrieval

The distillation agent should not read the entire vault. Keep context bounded.

Recommended retrieval flow:

1. Read the transcript markdown.
2. Read the active project index note(s): `03_active/projects.md` and any needed sub-index note if the first index points there.
3. Read a bounded set of active project notes for inference.

Selection rule:
- start with the active project index
- include up to 5 candidate `03_active/*.md` notes based on keyword overlap from title/body matching in the transcript or obvious project names

This gives the model enough context to infer related projects without blowing up prompt size.

## Output Note Format

Use a raw summary note in `Knowledge/01_inbox/` with minimal frontmatter matching vault conventions.

Recommended frontmatter:

```yaml
---
type: note
parent: "[[Home]]"
created: YYYY-MM-DD
summary: "15-25 word plain-text summary"
tags: [minutes, meeting]
---
```

Recommended body:

```md
# Meeting Summary: <title>

## Source
- Transcript: `~/.minutes/meetings/<file>.md`

## Main Findings
- ...

## Actions
- ...

## Related Projects
- [[workflows]] - reason
- [[metronome]] - reason

## Merge Hints
- [[workflows]] -> `## Notes` - reason
- [[metronome]] -> `## Notes` - reason
```

Important constraints:
- one inbox note per transcript
- project inference stays in the note body, not frontmatter
- note stays raw and reviewable; no automatic merge into project notes

### Filename

Use the transcript title plus `-summary.md`.

Examples:
- transcript: `2026-04-10-team-sync.md`
- inbox note: `team-sync-summary.md`

If Minutes filenames are noisy, the script may normalize them before generating the inbox note name.

## Prompt Responsibilities

The distillation prompt should explicitly instruct the model to:
- summarize facts, not write polished meeting prose
- extract only meaningful actions and decisions
- infer related projects only from provided project notes
- prefer `03_active` project wikilinks when evidence exists
- suggest merge targets conservatively, defaulting to `## Notes`
- avoid inventing commitments or decisions not supported by the transcript

The prompt should also include the current best-effort Minutes diarization note for context only as a configuration fact, not as meeting content.

Current best-effort Minutes settings:
- `embedding_model = "cam++"`
- `threshold = 0.58`
- `voice.enabled = false`

## Error Handling

### Transcript-level failures

If a single transcript fails processing:
- record failure in workflow state/logs
- do not block later transcripts on future runs
- retry on the next poll unless failure is marked permanent

### Bad model output

Reject and retry if output is missing any required sections:
- title
- main findings
- actions
- related projects
- merge hints

Reject and retry if frontmatter is invalid or missing required Knowledge fields.

### Vault write failures

If note creation fails:
- keep transcript unprocessed in state
- log exact error
- retry on next interval

## Observability

Logs should capture:
- discovered transcript count
- processed transcript path
- skipped transcript path and reason
- output inbox note path
- agent failure or invalid-output reason

This should fit existing `wf` logging and state conventions.

## Testing Strategy

### Script-level tests

Add coverage for:
- transcript discovery
- stabilization logic
- dedupe / state tracking
- filename normalization
- reprocessing when transcript changes

### Prompt-level verification

Use one or two real transcript fixtures and verify the agent output contains:
- valid Knowledge frontmatter
- one inbox note per transcript
- at least one project suggestion when clear evidence exists
- conservative merge hints

### End-to-end verification

Run the workflow against a fixture transcript directory and verify:
- transcript is detected
- inbox note is created in the expected location
- rerun does not duplicate output
- modified transcript triggers reprocessing

## Scope Boundaries

In scope:
- detect new Minutes transcript markdown files
- generate one inbox summary note per transcript
- infer related active projects from vault context
- suggest merge hints

Out of scope:
- automatic merge into `03_active`
- backlog task creation
- processing `.wav` files
- diarization/model improvements
- long-running daemon infrastructure
- full semantic search across entire vault

## Rollout Plan

Phase 1:
- implement polling script and state tracking
- implement distillation prompt
- create inbox note output path

Phase 2:
- tune prompt on real transcripts
- verify project inference quality

Phase 3:
- optionally add fallback model path via `ask-model`/Codex

## Success Criteria

The design is successful when:
- every new transcript markdown file results in exactly one inbox summary note
- reruns are idempotent unless the transcript changed
- inbox notes follow Knowledge vault conventions
- notes include useful related-project inference and merge hints
- raw transcripts remain outside the vault
