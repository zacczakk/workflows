# Backlog Triage

Evaluate every item in `02_backlog/`, classify by priority, and rewrite `backlog.md` as a prioritized working document.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Performance Budget

This workflow has a 30-minute timeout. Use parallel subagents aggressively. Never read files sequentially when they can be batched.

## Tool Access

The Knowledge vault is at `~/Vaults/Knowledge/`.

- **Primary:** use `obsidian` CLI (`obsidian vault=Knowledge files`, `read`, `create`, `delete`, `search`).
- **Fallback:** if `obsidian` CLI is unavailable or a command fails, use the filesystem directly:
  - List: `Read` tool on `~/Vaults/Knowledge/02_backlog/`
  - Read: `Read` tool on `~/Vaults/Knowledge/{path}`
  - Write: `Write` tool to `~/Vaults/Knowledge/{path}`
  - Search: `Grep` tool on `~/Vaults/Knowledge/`
- **Memory vault:** use `rg` for summary-first scans, `obsidian vault=Memory` for reads.
- **URL checks:** use WebFetch or Tavily to verify freshness of URLs in backlog items.

## Steps

### Phase 1: Context gathering (4 parallel subagents)

Launch all four simultaneously. Each subagent prompt must be self-contained.

**Subagent A — Backlog + Memory inventory:**
1. Read `backlog.md`: `obsidian vault=Knowledge read path="02_backlog/backlog.md"`
2. Read every backlog note in `02_backlog/` (list via `obsidian vault=Knowledge files folder=02_backlog`, then read each)
3. List active projects: `obsidian vault=Knowledge files folder=03_active`
4. Read Memory vault indexes (summary-first):
   ```bash
   rg '^summary:' ~/Vaults/Memory/patterns/ --glob '*.md' --no-heading
   rg '^summary:' ~/Vaults/Memory/tools/ --glob '*.md' --no-heading
   rg '^summary:' ~/Vaults/Memory/projects/ --glob '*.md' --no-heading
   ```
5. Return: full backlog item list with note contents, active project names, current tools/patterns/projects inventory from Memory vault.

**Subagent B1 — Docs context:**
1. Read `06_docs/docs.md` index: `obsidian vault=Knowledge read path="06_docs/docs.md"`
2. Read all sub-indexes listed in `docs.md`
3. Return: what's documented, topic coverage, which tools/setups have docs.

**Subagent B2 — Knowledge + personal notes context:**
1. Read `07_knowledge/knowledge.md` index: `obsidian vault=Knowledge read path="07_knowledge/knowledge.md"`
2. Read all sub-indexes listed in `knowledge.md`
3. List personal notes: `obsidian vault=Knowledge files folder=05_notes`
4. Return: what's in knowledge base, topic areas covered, personal notes inventory.

**Subagent C — Freshness check:**
1. Receive the list of backlog items with their URLs (passed from a quick pre-scan).
2. For each item with a URL: fetch the URL. Check:
   - Is the repo/project still active? (last commit, archived status)
   - Any major updates since the item was captured?
   - Is the URL still valid (404, redirect)?
3. For items without URLs: skip.
4. Return: per-item freshness status — `active`, `stale`, `archived`, `dead-link`, `major-update`, or `no-url`.

**Pre-scan for Subagent C:** Before launching subagents, do a quick `rg` to extract URLs from backlog notes:
```bash
rg 'https?://[^\s)]+' ~/Vaults/Knowledge/02_backlog/ --no-heading --no-filename | sort -u > /tmp/backlog_urls.txt
rg -l 'https?://' ~/Vaults/Knowledge/02_backlog/ --no-heading > /tmp/backlog_with_urls.txt
```
Pass this to Subagent C's prompt.

### Phase 2: Evaluate (parallel subagents, batched)

Split backlog items into batches of ~8 items. Launch one subagent per batch. Each subagent receives:
- Its batch of items (full note contents from Phase 1A)
- Active project list (from Phase 1A)
- Memory vault tools/patterns inventory (from Phase 1A)
- Docs coverage (from Phase 1B1)
- Knowledge coverage (from Phase 1B2)
- Personal notes list (from Phase 1B2)
- Freshness data for its items (from Phase 1C)

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

Synthesize all subagent results. Overwrite `02_backlog/backlog.md` with the prioritized structure:

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

Write via obsidian CLI or filesystem. `backlog.md` uses `parent: "[[Home]]"` in frontmatter.

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
- Always include `vault=Knowledge` in every `obsidian` command.
- Preserve all `[[wikilinks]]` in `backlog.md` — every listed item must be a wikilink to its note.
- `backlog.md` uses `parent: "[[Home]]"` in frontmatter. No other outgoing links from `backlog.md` except child wikilinks to backlog items.
- Items that arrived from inbox processing earlier in the nightly pipeline: evaluate them with the same criteria. They may lack research — fetch their URLs and enrich the evaluation.
- Freshness checks: if a URL returns 404 or the repo is archived, mark the item `stale` with reason.
- If an item's capability is already fully covered by an existing tool/pattern in Memory vault, mark it `stale` with "already implemented: {what covers it}."
- Subagent prompts must be self-contained. Include all data the subagent needs — it cannot see the main agent's context.
- Batch rule: max 8 items per evaluation subagent. If there are 30 items, launch 4 subagents.
- Memory vault reads: use summary-first scan (`rg '^summary:'`). Only read full notes when summary matches.
