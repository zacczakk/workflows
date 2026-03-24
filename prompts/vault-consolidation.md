# Vault Consolidation

Synthesize cross-cutting insights from recent Memory vault activity. Create new pattern notes when themes emerge, flag drift and staleness, and clean up processed session notes.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Purpose

Session processing extracts individual facts. Grooming fixes structure. Distillation compresses for context injection. **Consolidation is the reasoning layer** — it asks: "what patterns emerge across recent work that no single session captured?"

This runs nightly after session processing. Input = unconsolidated session notes + recently modified vault notes. Output = new pattern notes, a consolidation report, and cleaned-up sessions.

**TTL Policy:** Session notes in the Memory vault are a hot cache — the Sessions vault (persistent Claude/OpenCode session lookup) is the long-term archive. Memory vault sessions should be consolidated quickly and purged aggressively:
- Consolidated notes (`consolidated: true`): delete after 2 days.
- Unconsolidated notes older than 5 days: force-consolidate (extract what's useful, then mark consolidated and delete). These are overdue — don't skip them.

## Steps

### 1. Gather unconsolidated session notes

`obsidian vault=Memory files folder=sessions`

Read every session note. Partition into two sets:

- **Unconsolidated:** `consolidated: false` in frontmatter, or no `consolidated` field at all.
- **Stale consolidated:** `consolidated: true` AND `created` date is older than 2 days.
- **Overdue unconsolidated:** no `consolidated` field (or `consolidated: false`) AND `created` date is older than 5 days. These must be force-consolidated in step 2 — extract whatever is useful, then mark consolidated.

If zero unconsolidated notes exist, skip to step 4 (staleness analysis). Still run steps 4-7.

### 2. Cross-reference with existing knowledge

For each unconsolidated session note:

a. Read the note in full.

b. Extract key themes, tools, patterns, and project references mentioned.

c. Search for related existing notes:
   - `qmd search "{key themes}" --json` for semantic matching (preferred).
   - `obsidian vault=Memory search query="{keywords}"` as fallback.

d. For each theme, check:
   - Does a pattern note already capture this? → Note it as "already covered."
   - Does a project note mention this issue? → Note it as "project-specific."
   - Is this theme appearing across 2+ independent contexts (different projects, different sessions, different days)? → **Candidate for new pattern note.**

### 3. Synthesize new pattern notes

For each candidate theme that appears in ≥2 independent contexts and isn't already captured:

a. Draft a pattern note:
   - Derive a kebab-case filename from the theme.
   - Distill the cross-cutting insight — what's the reusable lesson?
   - Reference the source contexts (plain text, not wikilinks to sessions).

b. Check one more time that no existing note covers this:
   - `qmd search "{pattern title}" --json`
   - If a close match exists, **merge into the existing note** instead of creating a new one. Append new information, update stale content.

c. Write the new pattern note via filesystem (`~/Vaults/Memory/patterns/{kebab-name}.md`):

   ```markdown
   ---
   type: pattern
   summary: "{one-line plain-text summary, 15-25 words, no wikilinks}"
   tags: [{inferred from content}]
   created: YYYY-MM-DD
    parent: "[[patterns]]"
   ---

   # {Pattern Title}

   {Distilled cross-cutting insight — concise, actionable.}

   ## Context

   {Where this pattern was observed. Reference projects and situations in plain text.}

   ## Approach

   {The reusable approach, convention, or solution.}
   ```

d. If merging into an existing note: preserve existing frontmatter, append or update content sections. Write via filesystem.

### 4. Detect staleness and drift

Read frontmatter (especially `summary` and `updated` fields) for notes in `projects/`, `patterns/`, and `tools/`. Only full-read notes where drift is suspected. Use a summary-first scan:

For each note, read frontmatter via `obsidian vault=Memory read path="..."` (first 10-15 lines are sufficient). Or use `rg` to check specific fields:

```bash
rg '^(type|summary|updated|status):' ~/Vaults/Memory/projects/ ~/Vaults/Memory/patterns/ ~/Vaults/Memory/tools/ --glob '*.md' --no-heading 2>/dev/null
```

For each:

**Project notes (`status: active`):**
- Check if any unconsolidated session note references this project.
- If no session note has referenced the project in any of the available sessions, AND the project note's `updated` (or `created` if no `updated`) is older than 21 days → flag as "possibly inactive."
- If a session note contradicts something in the project note (different architecture, changed approach, deprecated tool) → flag as "drift detected" with specifics.

**Pattern notes:**
- If a session note describes a situation where this pattern was violated or didn't apply → flag as "pattern may need revision" with specifics.
- If a session note describes a better approach to the same problem → flag as "superseded?" with the alternative.

**Tool notes:**
- If a session note mentions a version change, new CLI flag, or setup change for a documented tool → flag as "possibly outdated" with specifics.

Do NOT auto-fix any of these. Report them. The agent or user will decide what to update.

### 5. Mark sessions as consolidated

For each unconsolidated session note processed in steps 2-4:
- Set `consolidated: true` in its frontmatter.
- Write via filesystem (`~/Vaults/Memory/sessions/{file}`) — backtick safety.

### 6. Clean up stale sessions

Delete session notes that have served their purpose:

**Delete if ANY of these conditions are met:**
- `consolidated: true` AND `created` date is older than 2 days.
- `consolidated: true` AND was just marked consolidated in step 5 of this run AND `created` date is older than 5 days (overdue notes — no grace period needed).

For each deletion: `obsidian vault=Memory delete path="sessions/{file}"` and log it in the consolidation report.

Do NOT delete any session note that is:
- `consolidated: true` but less than 2 days old (grace period for verification).
- Still `consolidated: false` and less than 5 days old (not yet overdue).

### 7. Write consolidation report

Write to `~/Vaults/Memory/system/consolidation-reports/{YYYY-MM-DD}.md` via filesystem:

```markdown
---
type: sync-report
tags: []
created: YYYY-MM-DD
parent: "[[consolidation-reports]]"
---

# Consolidation Report — {YYYY-MM-DD}

## Summary

- {N} session notes processed, {M} new patterns created, {K} existing notes updated, {D} sessions deleted

## New Patterns

- patterns/{name}.md — {one-line description}
- ...

## Updated Notes

- {folder}/{name}.md — {what was added/changed}
- ...

## Staleness Flags

### Possibly Inactive Projects
- projects/{name}.md — no session references in {N} days

### Drift Detected
- {folder}/{name}.md — {specific contradiction found in session X}

### Possibly Outdated
- {folder}/{name}.md — {what changed, per session X}

### Patterns to Revisit
- patterns/{name}.md — {why: violated, superseded, edge case found}

## Sessions Cleaned Up

- Consolidated: {list of session files marked consolidated: true}
- Deleted: {list of session files removed (>7 days old)}
```

**Important:** Consolidation reports must NOT contain `[[wikilinks]]`. Use plain text for all file names and note references. Same reasoning as grooming reports — links create graph noise.

### 8. Print technical log

Print all actions taken to stdout (captured by launchd to `logs/consolidation.out.log`).

## Rules

- Always include `vault=Memory` in every `obsidian` command.
- Memory vault file writes go through the filesystem (`~/Vaults/Memory/...`), not the obsidian CLI — backtick safety.
- **Merge over create.** Always check for existing notes before creating new patterns. Extend existing notes rather than creating near-duplicates.
- **≥2 independent contexts required.** Don't create a pattern note from a single session. The insight must appear across different projects, days, or problem domains to qualify as a cross-cutting pattern.
- **Tree-graph linking.** New pattern notes: `parent: "[[patterns]]"` (or the relevant collection). Optional `related:` for up to 2 lateral dependencies. No sibling links.
- **No body `[[wikilinks]]` between leaves.** New pattern notes must not contain wikilinks to other leaf notes in body text. Use plain text for references.
- **Staleness is about contradiction, not age.** Don't flag a note as stale just because it's old. Flag it when evidence suggests the content is wrong, incomplete, or superseded. The exception: active projects with no recent session references get flagged as "possibly inactive" — that's a status question, not a content question.
- **Conservative synthesis.** If the cross-cutting pattern isn't clear, don't force it. Better to skip a marginal insight than to create a vague, unhelpful pattern note.
- **Don't modify non-session notes without reason.** This workflow creates new patterns and updates existing ones when merging. It does NOT restructure, rename, or reformat existing notes — that's grooming's job.
- **Consolidation report frontmatter.** Must include `parent: "[[consolidation-reports]]"` to integrate with the report collection hierarchy.
- If `qmd` is on PATH, prefer `qmd search` for all semantic matching. It provides better results than keyword search for finding related notes.
- Do NOT modify notes outside the Memory vault. This workflow is Memory-vault-only.
