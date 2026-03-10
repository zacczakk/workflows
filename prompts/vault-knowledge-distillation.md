# Knowledge Distillation

Distill the Memory vault and Knowledge vault docs into two files: `MEMORY.md` (system/project context) and `USER.md` (user preferences/identity). These are the entry points for any agent working in this environment.

## Purpose

An agent reads `MEMORY.md` and `USER.md` first, then searches deeper via QMD or the obsidian CLI. The goal is: after reading these two files, the agent immediately knows who the user is, what they're working on, how things are structured, and where to find details.

**Critical: `MEMORY.md` is injected into every agent session at startup.** Every token in this file costs context window budget on every single interaction. Be ruthlessly concise. If a line doesn't change how an agent behaves, cut it.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Steps

### 1. List all Memory vault notes

`obsidian vault=Memory files` — get full file list.

**Skip these files:**
- `MEMORY.md` itself (self-referential)
- `USER.md` (agent-injected, user-curated)
- `IDENTITY.md` (agent persona config, auto-injected)
- `SOUL.md` (agent persona config, auto-injected)
- `system/grooming-reports/*` (operational logs, not knowledge)

### 2. Read Memory vault notes

**Use a summary-first approach** to avoid reading every file in full:

1. Extract summaries in one pass using `rg`:
   ```bash
   rg '^summary:' ~/Vaults/Memory/ --glob '*.md' --no-heading 2>/dev/null
   ```
   Then read frontmatter of each note via `obsidian vault=Memory read path="..."` (first 10-15 lines suffice for categorization).

2. For notes with a `summary:` field in frontmatter — use it directly. No full read needed unless the summary is unclear or you need to update the MEMORY.md entry significantly.

3. For notes WITHOUT a `summary:` field — read the full note to categorize and summarize. Add a `summary:` field to the frontmatter while you're there (backfill).

4. If `qmd` is on PATH, use `qmd search` to cluster notes by topic instead of reading all sequentially.

5. Prioritize recently updated notes (`updated` or `created` frontmatter fields). Older, unchanged notes can keep their existing MEMORY.md entry if one exists.

### 3. Scan Knowledge vault docs

Read all leaf files in `~/Vaults/Knowledge/06_docs/`. Skip index and sub-index notes (`docs.md`, `terminal-shell.md`, `python.md`, `agent-obsidian.md`) — they're structural, not content. This folder contains personal runbooks, cheat sheets, tool configs, and setup guides — operational knowledge that agents benefit from.

For each doc, extract:
- Tool names, CLI patterns, setup gotchas, or environment-specific knowledge an agent would need.
- Skip content that is purely reference (e.g., generic command lists) unless there's a non-obvious gotcha or workflow-specific usage.

These entries go into MEMORY.md alongside Memory vault entries. Use `[[filename]]` wikilinks — Obsidian resolves cross-vault links by filename. Tag the section assignment the same way as Memory notes (most will land in **Tools & Setup**, but route by content).

**Dedup:** If a Memory vault note already covers the same tool/topic, prefer the Memory note (it's closer to agent context). Only add the Knowledge doc entry if it contributes something the Memory note doesn't.

### 4. Build MEMORY.md

MEMORY.md is a **slim hub** that links to folder parents — NOT to individual leaf notes. The folder parents (`system.md`, `projects.md`, `patterns.md`, `tools.md`, `sessions.md`) already index their leaves. MEMORY.md's job is: help an agent decide WHICH folder parent to drill into, in minimal tokens.

For each folder parent, write:
- A 1-2 line prose summary of what that section contains (counts, themes, key highlights).
- Use the leaf summaries you collected to write accurate, current descriptions.
- Do NOT list individual leaf notes in MEMORY.md — that's the folder parent's job.

Use the `type` frontmatter field and folder location as hints for categorization.

### 5. Build USER.md

If `USER.md` already exists at `~/Vaults/Memory/USER.md`, read it first. Preserve any hand-written content. Only append or update sections that have new information from vault notes — never remove content the user added manually.

If `USER.md` does not exist yet, create it from what can be inferred from vault notes. Keep it minimal — the user will bootstrap and curate it.

### 6. Write files

Write both files directly to the filesystem:
- `~/Vaults/Memory/MEMORY.md`
- `~/Vaults/Memory/USER.md`

Do NOT use the obsidian CLI for these writes (backtick safety).

## MEMORY.md Format

MEMORY.md is a slim hub. It links to folder parents only — never to individual leaf notes. Each section is a prose summary helping agents decide which folder parent to drill into.

```markdown
---
type: agent-memory
mutable: true
tags: [agent, memory]
created: YYYY-MM-DD
updated: YYYY-MM-DD
related: ["[[IDENTITY]]", "[[SOUL]]", "[[USER]]"]
---

# MEMORY

Agent-facing persistent memory. Each section links to a folder parent that indexes its leaves. Read folder parents for detail.

## [[system]]

{1-2 line prose summary of system notes — architecture, conventions, tooling, report collections}

## [[projects]]

{1-2 line prose summary — count of tracked projects, themes}

## [[patterns]]

{1-2 line prose summary — what patterns cover, count}

## [[tools]]

{1-2 line prose summary — tool categories, count}

## [[sessions]]

{1-2 line prose summary — session lifecycle description}
```

**Key rules:**
- Section headers use `## [[folder-parent]]` format — a wikilink to the folder parent note.
- Body text is prose, not bullet lists. No `[[wikilinks]]` in body text.
- No leaf note listings. The folder parents already have those.
- Omit empty sections (e.g., if no sessions exist, skip that header).
- Preserve the frontmatter exactly. Update `updated:` to today's date.

### Section assignment logic

Use the note's content and frontmatter `type` to decide which folder parent it summarizes under:

| Content is about... | Section | Typical source |
|---------------------|---------|----------------|
| Vault structure, agent config, system architecture | `[[system]]` | Memory |
| A specific repo, feature, or project | `[[projects]]` | Memory |
| CLI tools, setup gotchas, operational knowledge | `[[tools]]` | Memory + Knowledge/06_docs |
| Environment setup, shell config, dev tooling | `[[tools]]` | Knowledge/06_docs |
| Reusable implementation approaches | `[[patterns]]` | Memory |
| Session recaps with unique insights | `[[sessions]]` | Memory |

Knowledge vault docs from `06_docs/` contribute to the prose summaries (especially tools/system) but are NOT listed as individual entries.

## USER.md Format

```markdown
# USER

## Identity
- Name, handle, key context

## Preferences
- Work style, communication preferences, tooling choices

## Current Focus
- What they're actively working on right now
```

This file is primarily user-curated. The distillation workflow only:
- Creates it from inferred content if it doesn't exist yet
- Appends new observations if vault notes reveal something not yet captured
- Never removes or rewrites user-written content

## Rules

- Telegraph style. Super condensed. Each section body is 1-2 lines of prose max.
- **No leaf listings in MEMORY.md.** Folder parents handle that. MEMORY.md links to folder parents only.
- Section headers use `## [[folder-parent]]` — a wikilink to the folder parent note. No other wikilinks anywhere in the file body.
- Body text is prose, not bullet lists. Describe what the section contains and why it matters.
- This file is **regenerated on every run** — it overwrites the previous version. Not hand-curated.
- `USER.md` is the opposite: primarily hand-curated. Only append, never rewrite.
- Write via filesystem (`~/Vaults/Memory/...`), not obsidian CLI. The CLI eats backticks in content.
- Do NOT modify any source notes. This workflow is read-only except for writing MEMORY.md and USER.md.
- Preserve the `[[wikilink]]` format exactly — Obsidian resolves these by filename.
- Omit empty sections. If there are no sessions worth listing, don't include the Sessions header.
- **Validate before writing.** Before writing MEMORY.md, verify every `[[wikilink]]` resolves to an existing note in the vault. If a note doesn't exist, convert to plain text.
