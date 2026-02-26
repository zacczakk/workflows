# Knowledge Distillation

Distill the Memory vault into two files: `MEMORY.md` (system/project context) and `USER.md` (user preferences/identity). These are the entry points for any agent working in this environment.

## Purpose

An agent reads `MEMORY.md` and `USER.md` first, then searches deeper via QMD or the obsidian CLI. The goal is: after reading these two files, the agent immediately knows who the user is, what they're working on, how things are structured, and where to find details.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Steps

### 1. List all Memory vault notes

`obsidian vault=Memory files` — get full file list.

**Skip these files:**
- `MEMORY.md` itself (self-referential)
- `USER.md` itself
- `system/grooming-reports/*` (operational logs, not knowledge)

### 2. Read notes efficiently

**At current vault size (< 50 notes):** read every note in full.

**At larger vault sizes (50+ notes):**
- Read frontmatter + first 20 lines of each note first. This is enough to categorize and summarize most notes.
- Only deep-read notes that are unclear from the first pass.
- If `qmd` is on PATH, use `qmd search` to cluster notes by topic instead of reading all sequentially.
- Prioritize recently updated notes (`updated` or `created` frontmatter fields). Older, unchanged notes can keep their existing MEMORY.md entry if one exists.

### 3. Build MEMORY.md

For each note, extract:
- The core insight or operational knowledge (1-2 lines max).
- Which section it belongs to (reason about content, don't blindly map from folder).
- Its filename for the `[[wikilink]]`.

Use the `type` frontmatter field as a hint, but override based on actual content when it makes more sense.

### 4. Build USER.md

If `USER.md` already exists at `~/Vaults/Memory/USER.md`, read it first. Preserve any hand-written content. Only append or update sections that have new information from vault notes — never remove content the user added manually.

If `USER.md` does not exist yet, create it from what can be inferred from vault notes. Keep it minimal — the user will bootstrap and curate it.

### 5. Write files

Write both files directly to the filesystem:
- `~/Vaults/Memory/MEMORY.md`
- `~/Vaults/Memory/USER.md`

Do NOT use the obsidian CLI for these writes (backtick safety).

## MEMORY.md Format

Organize by what an agent needs to know, not by folder structure.

```markdown
# MEMORY

## System
- Two vaults: Knowledge (personal notes, projects, backlog) + Memory (agent operational memory).
- Knowledge: folder = type, no frontmatter. Memory: frontmatter required, folder-scoped.
- {other system/architecture notes, one line each with [[wikilink]]}

## Active Projects
- [[project-name]] — what it is, current state, key learnings

## Tools & Setup
- [[tool-name]] — operational gotcha or setup note

## Patterns
- [[pattern-name]] — reusable approach, when to use it

## Sessions
- [[session-name]] — key takeaway (only if it adds insight not captured elsewhere)
```

### Section assignment logic

Use the note's content and frontmatter `type` to decide placement:

| Content is about... | Section |
|---------------------|---------|
| Vault structure, agent config, system architecture | System |
| A specific repo, feature, or project | Active Projects |
| CLI tools, setup gotchas, operational knowledge | Tools & Setup |
| Reusable implementation approaches | Patterns |
| Session recaps with unique insights | Sessions |

If a session recap's insights are already captured in another note, skip it or add a brief reference. Avoid duplicating information across sections.

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

- Telegraph style. Super condensed. Each entry is 1-2 lines max.
- Every entry MUST have a `[[wikilink]]` to the source note.
- Each entry should convey **why it matters** — not just what the note is about, but what an agent should know or do differently because of it.
- This file is **regenerated on every run** — it overwrites the previous version. Not hand-curated.
- `USER.md` is the opposite: primarily hand-curated. Only append, never rewrite.
- Write via filesystem (`~/Vaults/Memory/...`), not obsidian CLI. The CLI eats backticks in content.
- Do NOT modify any source notes. This workflow is read-only except for writing MEMORY.md and USER.md.
- If a note is too vague to summarize in 1-2 lines, still include it with a generic summary. Don't skip notes.
- Preserve the `[[wikilink]]` format exactly — Obsidian resolves these by filename.
- Omit empty sections. If there are no sessions worth listing, don't include the Sessions header.
