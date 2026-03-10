# Vault Grooming

Sweep both vaults for structural issues. Fix what's safe, build a tree-shaped link graph, report the rest.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Performance Budget

This workflow has a 90-minute timeout. Do NOT read every file in either vault. Use the phased approach below — structural analysis first via `rg`, then targeted reads only for files that need fixes.

## Scope

| Vault | Fix in-place | Can create | Can delete | Report only |
|-------|-------------|------------|------------|-------------|
| Knowledge | Broken wikilinks, tree-structured links, promote backlog | Index notes in `06_docs/`, `07_knowledge/` | Promoted backlog notes only | Stubs, structural issues |
| Memory | Broken wikilinks, tree-structured links, fix frontmatter | `collection` notes when 3+ leaves cluster | Empty/artifact files only | Stubs, structural issues |

## Steps

### Phase 1: Build the link graph (no file reads)

Build a complete wikilink adjacency map for both vaults using `rg`. This replaces reading every file.

```bash
# 1a. Get all files in both vaults
obsidian vault=Knowledge files 2>/dev/null > /tmp/knowledge_files.txt
obsidian vault=Memory files 2>/dev/null > /tmp/memory_files.txt

# 1b. Extract all wikilinks from every file (filename:line:match)
rg -o '\[\[([^\]|#]+)[^\]]*\]\]' --no-heading -r '$1' ~/Vaults/Knowledge/ > /tmp/knowledge_links.txt
rg -o '\[\[([^\]|#]+)[^\]]*\]\]' --no-heading -r '$1' ~/Vaults/Memory/ > /tmp/memory_links.txt

# 1c. Extract all project tags from backlog (for promotion check)
rg -l '#(try|personal)' ~/Vaults/Knowledge/02_backlog/ > /tmp/backlog_tagged.txt 2>/dev/null || true
```

From these outputs, compute:
- **Broken wikilinks**: links whose target doesn't match any filename (minus extension) in either vault.
- **Orphaned files**: files with zero incoming links from any other file (excluding `Home.md`, `00_system/`, `MEMORY.md`, `IDENTITY.md`, `SOUL.md`, `USER.md`).
- **Missing parent links**: files not linking up to their folder index/parent.

### Phase 2: Fix broken wikilinks (targeted reads)

Only read files identified in Phase 1 as having broken links.

For each broken wikilink:
- Find the closest filename match (typo, moved file) across both vaults.
- If the match is obvious (edit distance ≤ 2, or a moved file with the same name), fix it.
- If ambiguous, report instead of guessing.
- Log every fix: before → after.

### Phase 3: Fix tree structure (targeted reads)

Only read files identified in Phase 1 as orphans or missing parent links.

**Knowledge vault — orphan resolution:**
- Read the orphan's `# Title` and first paragraph (not full body).
- Use `obsidian vault=Knowledge search query="..."` or `qmd search` to find its logical parent.
- Link upward only — add `See also: [[parent]]`. Check sub-indexes first, then folder indexes, then project notes.
- Do NOT add backlinks from other notes to the orphan.

**Memory vault — orphan resolution:**
- Read frontmatter only (first 10-15 lines). Use the `summary` field if present.
- Same approach: find logical parent via search, link upward via `related:` frontmatter.

**Missing parent links:**
- Knowledge vault: add `See also: [[folder-index]]` or `See also: [[sub-index]]`.
- Memory vault: fix `related:` first entry to be the folder parent.

### Phase 4: Memory vault frontmatter validation

Use `rg` to check frontmatter fields directly (avoids filesystem permission issues):

```bash
# Check for missing required fields across all Memory vault notes
rg -l --files-without-match '^type:' ~/Vaults/Memory/ --glob '*.md' 2>/dev/null
rg -l --files-without-match '^tags:' ~/Vaults/Memory/ --glob '*.md' 2>/dev/null
rg -l --files-without-match '^created:' ~/Vaults/Memory/ --glob '*.md' 2>/dev/null
rg -l --files-without-match '^related:' ~/Vaults/Memory/ --glob '*.md' 2>/dev/null

# Check session notes for missing consolidated field
rg -l --files-without-match '^consolidated:' ~/Vaults/Memory/sessions/ --glob '*.md' 2>/dev/null

# Count notes missing summary field
rg -l --files-without-match '^summary:' ~/Vaults/Memory/ --glob '*.md' 2>/dev/null
```

For files with missing required fields, read them via `obsidian vault=Memory read path="..."` to understand content and fix frontmatter. Write fixes via filesystem.

Scan for:
- Missing `type`, `tags`, or `created` fields.
- `related:` first entry not matching folder parent (use the link graph from Phase 1 for this).
- Missing `summary` field (report count, don't fix — other workflows populate summaries).
- Missing `consolidated` field on session notes.

### Phase 5: Backlog promotion (Knowledge vault)

```bash
# Get active project names as tags
obsidian vault=Knowledge files folder=03_active 2>/dev/null
```

Derive project tags from filenames. Then:

```bash
# Search backlog for project tags/mentions
rg -l '(#project-tag|project-name)' ~/Vaults/Knowledge/02_backlog/ 2>/dev/null
```

For each match:
1. Read the backlog note and the matching project note.
2. Append task line(s) to the project's `## Tasks` section.
3. Preserve URL/summary/context as a brief entry in the project note.
4. Delete the backlog note: `obsidian vault=Knowledge delete path="02_backlog/{file}"`
5. Log in the grooming report.

### Phase 6: Index/parent note validation

For each folder index and sub-index (these are few — read them all):

**Knowledge vault indexes:** `docs.md`, `knowledge.md`, `projects.md`, `backlog.md`, and all sub-indexes.
**Memory vault folder parents:** `tools.md`, `patterns.md`, `projects.md`, `sessions.md`, and all collection notes.

For each:
1. Read the index/parent note.
2. Check that every `[[wikilink]]` in its listing resolves to a file in the expected folder.
3. Remove listings for moved/deleted notes.
4. Add listings for notes in the folder that are missing from the listing.
5. Log all changes.

### Phase 7: Multi-topic detection (lightweight)

Do NOT read every file to check for multi-topic content. Instead:
- Only check files that were read for other fixes in Phases 2-6.
- If any of those files clearly covers 2+ separable topics, split them.
- Each split note gets the original's folder location and relevant links/tags.
- Update incoming links. Delete original only after splits are written.

### Phase 8: Collection threshold enforcement

After any fixes that removed links or reparented notes:
- Count each Memory vault collection's same-folder children (from the link graph built in Phase 1).
- If a collection has fewer than 3 children, dissolve it:
  1. Reparent each child to the folder parent.
  2. Remove the collection from other notes' `related:`.
  3. Delete the collection file.
  4. Add former children to folder parent's listing.
  5. Log in the grooming report.

### Phase 9: Write grooming reports

Write a separate report to each vault.

**Important:** Grooming reports must NOT contain `[[wikilinks]]`. Use plain text for all file names and note references.

**Knowledge vault report:**
```
obsidian vault=Knowledge create path="00_system/grooming-reports/{YYYY-MM-DD}.md" content="# Grooming Report — {YYYY-MM-DD}\n\n## Summary\n\n- {N} issues found, {M} fixed, {P} backlog notes promoted, {C} collections created\n\n## Fixed\n\n- ...\n\n## Promoted to Projects\n\n- ...\n\n## Needs Review\n\n- ..."
```

**Memory vault report** (write via filesystem for backtick safety):
Write to `~/Vaults/Memory/system/grooming-reports/{YYYY-MM-DD}.md`:
```markdown
---
type: reference
tags: [grooming, report]
created: YYYY-MM-DD
related: ["[[reports]]"]
---

# Grooming Report — {YYYY-MM-DD}

## Summary

- {N} issues found, {M} fixed, {K} files deleted, {C} collections created

## Fixed

- ...

## Deleted

- ...

## Needs Review

- ...
```

### Phase 10: Print technical log

Print all actions taken to stdout (captured by launchd).

## Rules

- **Performance first.** Use `rg` and targeted reads. Never read all files. The link graph from Phase 1 drives everything.
- Always include `vault=Knowledge` or `vault=Memory` in every `obsidian` command.
- Knowledge vault: ONLY delete `02_backlog/` notes that were successfully promoted. Never delete anything else.
- Memory vault: ONLY delete truly empty/artifact files (zero content below frontmatter). Everything else is reported.
- When fixing broken wikilinks, log before and after in the grooming report.
- **Tree-graph linking policy:** Links must build a traversable tree, not a dense mesh.
  - Every note gets exactly **1 parent link** — the broader topic or collection it belongs under.
  - Plus **0-3 dependency links** — notes required to understand this one.
  - No sibling links. No bidirectional links unless true mutual dependency.
  - Cross-vault links only through hub notes (`MEMORY.md`, `03_active/` project notes).
  - Max outgoing links per leaf note: 4 (1 parent + 3 deps). Collection/index notes have no cap.
  - When in doubt, link less.
- **Body `[[wikilinks]]` in Memory vault.** Leaf notes must NOT contain `[[wikilinks]]` to other leaf notes in body text. Only parent/collection notes link down to children. If found during targeted reads, convert to plain text.
- **Memory vault parent validation.** Every leaf note's `related:` first entry MUST be its folder parent or a same-folder collection. Fix if wrong.
- **Dangling wikilinks.** Every `[[wikilink]]` must resolve to an existing note. Convert to plain text if target doesn't exist.
- Frontmatter fixes in Memory vault: use the schema from `~/Vaults/AGENTS.md`. Use `stat` for `created` date, fall back to `unknown`.
- Memory vault file writes go through the filesystem (`~/Vaults/Memory/...`), not the obsidian CLI — backtick safety.
- If `qmd` is on PATH, use `qmd search` for finding related notes to link orphans.
- No subagent delegation for vault scans. The `rg`-based approach is faster and more predictable than spawning subagents that read every file.
