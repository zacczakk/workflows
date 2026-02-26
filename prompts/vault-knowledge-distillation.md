# Knowledge Distillation

Distill all Memory vault notes into a single condensed `MEMORY.md` at the vault root.

## Purpose

`MEMORY.md` is the entry point for agents reading the Memory vault. It provides a telegraph-style index of everything in the vault, organized by topic, with `[[wikilinks]]` to source notes. An agent reads this first, then searches deeper via QMD or the obsidian CLI.

## Steps

1. **List all Memory vault notes:** `obsidian vault=Memory files`

2. **Read every note.** For each file, extract:
   - The core insight or learning (1-2 lines max).
   - Which topic area it belongs to (Projects, Tools, Patterns, Sessions, General).
   - Its filename for the `[[wikilink]]`.

3. **Write `MEMORY.md`** directly to the filesystem at `~/Vaults/Memory/MEMORY.md`.
   Do NOT use the obsidian CLI for this write (backtick safety).

## Output Format

```markdown
# MEMORY

## Projects
- [[project-name]] — one-line summary of key learnings

## Tools
- [[tool-name]] — operational gotcha or setup note

## Patterns
- [[pattern-name]] — reusable approach summary

## Sessions
- [[session-name]] — key takeaway from session

## General
- [[note-name]] — key insight
```

## Rules

- Telegraph style. Super condensed. Each entry is 1-2 lines max.
- Every entry MUST have a `[[wikilink]]` to the source note.
- Organize by topic area matching the vault folder structure: Projects, Tools, Patterns, Sessions, General.
- Notes at the vault root go under General.
- This file is **regenerated on every run** — it overwrites the previous version. Not hand-curated.
- Write via filesystem (`~/Vaults/Memory/MEMORY.md`), not obsidian CLI. The CLI eats backticks in content.
- Do NOT modify any source notes. This workflow is read-only except for writing MEMORY.md.
- If a note is too vague to summarize in 1-2 lines, still include it with a generic summary. Don't skip notes.
- Preserve the `[[wikilink]]` format exactly — Obsidian resolves these by filename.
