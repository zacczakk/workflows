# Backlog Triage

Evaluate changed backlog items daily and every backlog item on Sunday, then rewrite `backlog.md` as a prioritized working document.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Performance Budget

Target 30 minutes. Gather indexes mechanically and delegate only selected backlog items, in batches of at most 8.

## Tool Access

The Knowledge vault is at `~/Vaults/Knowledge/`.

- Use filesystem tools for listing, reading, and writing vault files. Use `rg` for exact search.
- Use `qmd query "{topic}" -c memory` for semantic Memory lookup after a summary-first `rg` scan.
- Do not launch the Obsidian app CLI for routine vault operations.
- **URL checks:** use WebFetch or Tavily to verify freshness of URLs in backlog items.

## Steps

### Phase 1: Select mode and items

Determine the current local weekday.

- **Sunday full mode:** select every `02_backlog/*.md` leaf except `backlog.md`.
- **Daily delta mode:** select only leaf notes whose filesystem modification time is newer than `02_backlog/backlog.md`.
- If `backlog.md` is missing, use full mode.
- If daily mode selects no notes, print "No changed backlog items to triage." and stop without rewriting `backlog.md`.

Read the existing `backlog.md`, selected notes, and these lightweight indexes directly: `03_active/projects.md`, `06_docs/docs.md`, and `07_knowledge/knowledge.md`. Gather only matching Memory summaries for each selected topic.

For selected items with URLs, fetch each URL and classify freshness as `active`, `stale`, `archived`, `dead-link`, `major-update`, or `no-url`.

### Phase 2: Evaluate (parallel subagents, batched)

Split selected items into batches of at most 8. Delegate only when more than 8 items are selected. Each subagent receives:
- Its batch of selected notes
- Active project, docs, and knowledge index context
- Matching Memory summaries
- Freshness data for its items

Each subagent evaluates per item:

1. **Stack/setup value:** Can this improve the current stack, setup, or workflow?
   - If yes: how specifically — replaces X, enhances Y, fills gap Z, improves workflow W.
   - If no: why — already covered by X, too niche, immature, out of scope.

2. **Relations:** What does this relate to?
   - Active project? Which one, and how?
   - Existing docs? Which area?
   - Knowledge topic? Which sub-index?
   - Personal note or idea? Which?
   - Just informational — no direct connection.

3. **Already implemented:** Does this capability already exist?
   - Check Memory vault tools and patterns.
   - Check active projects for overlap.
   - Check docs for existing coverage.
   - Flag: `already-have`, `partial-overlap`, `no-overlap`.

4. **Personal items** (`#personal` tag): Check against active projects, personal notes in `05_notes/`, and evaluate whether the idea warrants becoming a new project.

5. **Classification:** Based on evaluation, assign ONE of:
   - **quick-win** — low effort, immediate value. Drop-in tool, ready-to-bundle knowledge, direct project connection.
   - **high-impact** — worth the effort. Significant workflow improvement, should become a project, fills a major gap.
   - **stale** — in backlog too long, repo dead/archived, superseded by something already adopted, or already implemented.
   - **holding** — valid but not urgent. Keep watching.

Return: per-item evaluation with all fields above.

### Phase 3: Rewrite `backlog.md` (main agent)

Synthesize all results before writing. In daily mode, preserve every unchanged item's existing classification and text, then insert or replace only selected items. In Sunday mode, rebuild all classifications.

Do not rewrite `backlog.md` unless every selected item has a completed evaluation. A failed run must leave the previous success marker intact so the next daily run retries the same changed notes.

Overwrite `02_backlog/backlog.md` with the prioritized structure:

```markdown
# Backlog Index

Last triaged: {YYYY-MM-DD}

{N} items evaluated. {Q} quick wins, {H} high impact, {S} stale, {K} holding.

## Quick Wins

- [[{item}]] — {one-line summary}. {Stack value or action}. Relates to: {project/docs/knowledge area}.
- ...

## High Impact

- [[{item}]] — {one-line summary}. {Why high impact}. Relates to: {project/docs/knowledge area}.
- ...

## Stale

- [[{item}]] — {one-line summary}. {Why stale}. Suggestion: {kill/merge into knowledge/revive with fresh research}.
- ...

## Holding

- [[{item}]] — {one-line summary}. {Why holding}. Relates to: {project/docs/knowledge area}.
- ...
```

Write via filesystem. `backlog.md` uses `parent: "[[Home]]"` in frontmatter.

### Phase 4: Log

Print summary to stdout:

```
Backlog triage — {YYYY-MM-DD}
{N} items evaluated: {Q} quick wins, {H} high impact, {S} stale, {K} holding.
Changes from last triage: {items reclassified, new items evaluated, items removed}.
```

## Rules

- Fully autonomous — no user interaction. This is a nightly workflow.
- Never delete backlog items. Classification only. Deletion is Phil's decision via `/obs-triage`.
- Never create new notes. Only rewrite `backlog.md`.
- Do not use the Obsidian app CLI for routine vault work.
- Preserve all `[[wikilinks]]` in `backlog.md` — every listed item must be a wikilink to its note.
- `backlog.md` uses `parent: "[[Home]]"` in frontmatter. No other outgoing links from `backlog.md` except child wikilinks to backlog items.
- Items that arrived from inbox processing earlier in the nightly pipeline: evaluate them with the same criteria. They may lack research — fetch their URLs and enrich the evaluation.
- Freshness checks: if a URL returns 404 or the repo is archived, mark the item `stale` with reason.
- If an item's capability is already fully covered by an existing tool/pattern in Memory vault, mark it `stale` with "already implemented: {what covers it}."
- Subagent prompts must be self-contained. Include all data the subagent needs — it cannot see the main agent's context.
- Batch rule: max 8 items per evaluation subagent. If there are 30 items, launch 4 subagents.
- Memory vault reads: use summary-first scan (`rg '^summary:'`). Only read full notes when summary matches.
