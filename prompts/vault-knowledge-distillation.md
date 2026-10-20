# Knowledge Distillation

Distill the Memory vault and Knowledge vault docs into `MEMORY.md` (system/project context), the marked blocks of `USER.md` (Phil's setup, preferences and focus) and the marked block of `SOUL.md` (agent conduct lessons). These files are injected into every agent session.

## Purpose

An agent reads `MEMORY.md`, `USER.md` and `SOUL.md` first, then searches deeper via QMD or filesystem search. The goal is: after reading these files, the agent immediately knows who the user is, what they're working on, how things are structured, and where to find details.

**Critical: `MEMORY.md`, `USER.md` and `SOUL.md` are injected into every agent session and subagent at startup.** Every token in these files costs context window budget on every single interaction. Be ruthlessly concise. If a line doesn't change how an agent behaves, cut it.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Steps

### 1. List all Memory vault notes

List `~/Vaults/Memory/` recursively with filesystem tools.

**Skip these files:**
- `MEMORY.md` itself (self-referential)
- `USER.md`, `SOUL.md` (written in steps 5 and 6, not distilled as sources)
- `IDENTITY.md` (immutable, Phil-owned)
- `STYLE.md` (Phil's writing voice; Phil-owned, agents append Corrections only; never edit)
- `system/grooming-reports/*` (operational logs, not knowledge)
- Dated consolidation, retrieval and skill-sync reports and their report indexes (operational history). The rolling `system/report-retention.md` may contain useful unresolved findings; consult its summary only when relevant.

### 2. Read Memory vault notes

**Use a summary-first approach** to avoid reading every file in full:

1. Extract summaries in one pass using `rg`:
   ```bash
   rg '^summary:' ~/Vaults/Memory/ --glob '*.md' --no-heading 2>/dev/null
   ```
   Then read frontmatter directly (first 10-15 lines suffice for categorization).

2. For notes with a `summary:` field in frontmatter — use it directly. No full read needed unless the summary is unclear or you need to update the MEMORY.md entry significantly.

3. For notes WITHOUT a `summary:` field — read only enough to categorize and summarize for this hub. Report missing summaries; source note edits belong to grooming.

4. If `qmd` is on PATH, use `qmd query` to cluster notes by topic instead of reading all sequentially.

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

### 5. Maintain USER.md blocks

Read `~/Vaults/Memory/USER.md`. Content outside `<!-- auto:NAME:start -->` / `<!-- auto:NAME:end -->` markers is Phil-owned: never edit it. Rewrite each marked block in place from current vault evidence. Replace stale lines; never append dated sections or "supersedes" lines.

| Block | Holds | Cap |
|-------|-------|-----|
| `auto:setup` | Current stack, runtimes, tool choices and environment facts Phil relies on across projects. Current versions only. | 12 bullets |
| `auto:preferences` | Phil's durable cross-project choices about workflow, deliverables and tools. | 8 bullets |
| `auto:focus` | What Phil is working on now, one line per workstream, newest evidence wins. No build numbers, PASS counts or version strings. | 6 bullets |

Sources: `projects/` notes, latest `sessions/` decision notes, `Knowledge/03_active/` project indexes and `06_docs/`. Exclusions:
- Rules already stated in `~/.config/opencode/AGENTS.md`, `SOUL.md` or `IDENTITY.md`.
- Repo- or project-scoped rules and status (they stay in that repo's AGENTS.md or its Memory project note).
- Anything from notes marked confidential or with restricted-handling instructions.

If a marker pair is missing, leave the file unchanged and report it. Update frontmatter `updated:` only when a block changed.

### 6. Maintain SOUL.md learned preferences

Read `~/Vaults/Memory/SOUL.md`. Only the `<!-- auto:learned-preferences:start -->` / `<!-- auto:learned-preferences:end -->` block is writable. Sources: session notes created since SOUL's `updated:` date whose type is `decision`, `discovery` or `dead-end`, prioritizing notes tagged `agent-conduct`. A lesson qualifies when Phil corrected agent behavior or set a working rule for how agents should operate with him, and it applies beyond one repo.

- Add qualifying lessons as one-line imperative rules; merge with near-duplicates instead of adding.
- Drop lessons now stated in `~/.config/opencode/AGENTS.md`, `USER.md` or `IDENTITY.md`.
- Cap 10 bullets; when full, merge or drop the least general rule.
- When the block changes: bump `version:` by 1 and set `updated:` to the run date. Otherwise leave the file untouched.

### 7. Check budgets and write

Write directly to the filesystem:
- `~/Vaults/Memory/MEMORY.md`
- `~/Vaults/Memory/USER.md` (blocks only)
- `~/Vaults/Memory/SOUL.md` (block only, when changed)

Then run `wc -w ~/Vaults/Memory/USER.md ~/Vaults/Memory/SOUL.md ~/Vaults/Memory/MEMORY.md ~/Vaults/Memory/STYLE.md`. Budgets: USER ≤ 700 words, SOUL ≤ 500, MEMORY ≤ 250, STYLE ≤ 1200. STYLE over budget: report it for Phil; never edit STYLE. Over budget: tighten the auto blocks and rewrite. If Phil-owned text alone exceeds a budget, report it instead of editing it.

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

## Rules

- Telegraph style. Super condensed. Each section body is 1-2 lines of prose max.
- **No leaf listings in MEMORY.md.** Folder parents handle that. MEMORY.md links to folder parents only.
- Section headers use `## [[folder-parent]]` — a wikilink to the folder parent note. No other wikilinks anywhere in the file body.
- Body text is prose, not bullet lists. Describe what the section contains and why it matters.
- This file is **regenerated on every run** — it overwrites the previous version. Not hand-curated.
- `USER.md` and `SOUL.md`: rewrite marked blocks in place only; text outside markers is never edited.
- Write via filesystem (`~/Vaults/Memory/...`), not obsidian CLI. The CLI eats backticks in content.
- Do NOT modify any source notes. This workflow is read-only except for writing MEMORY.md and the marked blocks of USER.md and SOUL.md.
- Preserve the `[[wikilink]]` format exactly — Obsidian resolves these by filename.
- Omit empty sections. If there are no sessions worth listing, don't include the Sessions header.
- **Validate before writing.** Before writing MEMORY.md, verify every `[[wikilink]]` resolves to an existing note in the vault. If a note doesn't exist, convert to plain text.
