# Vault Grooming

Sweep both vaults for structural issues. Fix what's safe, build a tree-shaped link graph, report the rest.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Performance Budget

This workflow has a 90-minute timeout. Do NOT read every file in either vault. Use the phased approach below — structural analysis first via `rg`, then targeted reads only for files that need fixes.

## Scope

| Vault | Fix in-place | Can create | Can delete | Report only |
|-------|-------------|------------|------------|-------------|
| Knowledge | Broken wikilinks, tree-structured links, promote backlog, fanout splits | Index notes in `06_docs/`, `07_knowledge/` | Promoted backlog notes only | Stubs, structural issues |
| Memory | Broken wikilinks, tree-structured links, fix frontmatter, fanout splits | `collection` notes when 3+ leaves cluster | Empty/artifact files only | Stubs, structural issues |

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

# 1d. Extract parent links from frontmatter (more reliable than wikilink scanning for tree structure)
rg '^parent:' ~/Vaults/Knowledge/ --glob '*.md' --glob '!.obsidian/**' --glob '!.planning/**' --no-heading > /tmp/knowledge_parents.txt
rg '^parent:' ~/Vaults/Memory/ --glob '*.md' --glob '!.obsidian/**' --no-heading > /tmp/memory_parents.txt

# 1c. Extract all project tags from backlog (for promotion check)
rg -l '#(try|personal)' ~/Vaults/Knowledge/02_backlog/ > /tmp/backlog_tagged.txt 2>/dev/null || true
```

From these outputs, compute:
- **Broken wikilinks**: links whose target doesn't match any filename (minus extension) in either vault.
- **Orphaned files**: files with zero incoming links from any other file (excluding `Home.md`, `00_system/`, `MEMORY.md`, `IDENTITY.md`, `SOUL.md`, `USER.md`).
- **Missing parent links**: files without a `parent:` frontmatter field (or `parent:` not matching expected folder index/parent).

### Phase 2: Fix broken wikilinks (targeted reads)

Only read files identified in Phase 1 as having broken links.

For each broken wikilink:
- Find the closest filename match (typo, moved file) across both vaults.
- If the match is obvious (edit distance ≤ 2, or a moved file with the same name), fix it.
- If ambiguous, report instead of guessing.
- Log every fix: before → after.

### Phase 3: Fix tree structure (targeted reads)

Only read files identified in Phase 1 as orphans or missing parent links. If there are more than 5 orphans/missing-parent items, delegate to parallel subagents in batches of ≤5 (see delegation rule below).

**Knowledge vault — orphan resolution:**
- Read the orphan's `# Title` and first paragraph (not full body).
- Use `obsidian vault=Knowledge search query="..."` or `qmd search` to find its logical parent.
- Fix the `parent:` frontmatter field to point to the nearest sub-index or folder index. Check sub-indexes first, then folder indexes, then project notes.
- Do NOT add backlinks from other notes to the orphan.

**Memory vault — orphan resolution:**
- Read frontmatter only (first 10-15 lines). Use the `summary` field if present.
- Same approach: find logical parent via search, fix the `parent:` frontmatter field.

**Missing parent links:**
- Knowledge vault: fix the `parent:` frontmatter field to point to the nearest sub-index or folder index.
- Memory vault: fix the `parent:` frontmatter field to point to the folder parent or same-folder collection.

### Phase 4: Memory vault frontmatter validation

Use `rg` to check frontmatter fields directly (avoids filesystem permission issues):

```bash
# Check for missing required fields across all Memory vault notes
rg -l --files-without-match '^type:' ~/Vaults/Memory/ --glob '*.md' --glob '!.obsidian/**' 2>/dev/null
rg -l --files-without-match '^parent:' ~/Vaults/Memory/ --glob '*.md' --glob '!.obsidian/**' --glob '!MEMORY.md' --glob '!IDENTITY.md' --glob '!SOUL.md' --glob '!USER.md' 2>/dev/null
rg -l --files-without-match '^summary:' ~/Vaults/Memory/ --glob '*.md' --glob '!.obsidian/**' 2>/dev/null
rg -l --files-without-match '^tags:' ~/Vaults/Memory/ --glob '*.md' --glob '!.obsidian/**' 2>/dev/null
rg -l --files-without-match '^created:' ~/Vaults/Memory/ --glob '*.md' --glob '!.obsidian/**' 2>/dev/null

# Check session notes for missing consolidated field
rg -l --files-without-match '^consolidated:' ~/Vaults/Memory/sessions/ --glob '*.md' 2>/dev/null
```

For files with missing required fields, read them via `obsidian vault=Memory read path="..."` to understand content and fix frontmatter. Write fixes via filesystem. All frontmatter fixes use the schema from `~/Vaults/AGENTS.md`.

Scan for and fix:
- Missing `type`, `tags`, or `created` fields.
- Missing or incorrect `parent:` field — must point to the folder parent or a same-folder collection. Root files (`MEMORY.md`, `IDENTITY.md`, `SOUL.md`, `USER.md`) are exempt from `parent:`.
- Missing `summary` field — read the note body via `obsidian vault=Memory read path="..."` and write a 15-25 word plain-text summary into frontmatter. No wikilinks, no markdown in the summary.
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
   2. Update former children's `parent:` to the folder parent.
  3. Delete the collection file.
  4. Add former children to folder parent's listing.
  5. Log in the grooming report.

### Phase 8b: Fanout enforcement (both vaults)

Check every parent/index note for more than 10 direct children. Use the link graph from Phase 1 — no extra file reads needed for counting.

**Exempt from the cap:** `sessions.md`, dated report indexes (`grooming-reports/`, `consolidation-reports/`), and Knowledge vault `08_people/` notes.

For each over-cap parent:
1. Read the parent note to see its current child listings.
2. Cluster children by theme using note titles and summaries (Memory) or titles and first headings (Knowledge).
3. Create sub-indexes / collections for each cluster of 3+ related children:
   - **Knowledge vault:** create a sub-index in the same folder. It lists its children with one-line summaries and has `parent:` frontmatter pointing to the folder index. Update each child's `parent:` to point to the new sub-index.
   - **Memory vault:** create a `collection` note in the same folder with proper frontmatter (`type: collection`, `parent: "[[folder-parent]]"`). Update each child's `parent:` to point to the new collection.
4. Remove reparented children from the original parent's listing and add the new sub-index/collection instead.
5. Repeat until the parent has ≤ 10 direct children.
6. Log all created sub-indexes/collections and reparented notes.

**Naming:** Use the cluster's theme as the filename (`agent-config-patterns.md`, `opencode-tools.md`). Kebab-case, descriptive.

**Delegation:** If more than 2 parents exceed the cap, delegate each parent's clustering to a subagent. Include the parent's content and its children's titles/summaries in the subagent prompt.

### Phase 9: Write grooming reports

Write a separate report to each vault.

**Important:** Grooming reports must NOT contain `[[wikilinks]]`. Use plain text for all file names and note references.

**Knowledge vault report:**
```
obsidian vault=Knowledge create path="00_system/grooming-reports/{YYYY-MM-DD}.md" content="---\ntype: report\nparent: \"[[reports]]\"\ncreated: YYYY-MM-DD\nsummary: \"Grooming run: N issues found, M fixed.\"\ntags: []\n---\n\n# Grooming Report — {YYYY-MM-DD}\n\n## Summary\n\n- {N} issues found, {M} fixed, {P} backlog notes promoted, {C} collections created\n\n## Fixed\n\n- ...\n\n## Promoted to Projects\n\n- ...\n\n## Needs Review\n\n- ..."
```

**Memory vault report** (write via filesystem for backtick safety):
Write to `~/Vaults/Memory/system/grooming-reports/{YYYY-MM-DD}.md`:
```markdown
---
type: sync-report
tags: []
created: YYYY-MM-DD
parent: "[[grooming-reports]]"
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
  - Every note gets exactly **1 parent link** via the `parent:` frontmatter field — the broader topic or collection it belongs under.
  - Plus **0-3 dependency links** — notes required to understand this one.
  - No sibling links. No bidirectional links unless true mutual dependency.
  - Cross-vault links only through hub notes (`MEMORY.md`, `03_active/` project notes).
  - Max outgoing links per leaf note: 4 (1 parent + 3 deps).
  - Max direct children per parent/index note: 10. Cluster into sub-indexes/collections when exceeded. Exempt: `sessions.md`, dated report indexes, Knowledge `08_people/` notes.
  - When in doubt, link less.
- **Body `[[wikilinks]]` in Memory vault.** Leaf notes must NOT contain `[[wikilinks]]` to other leaf notes in body text. Only parent/collection notes link down to children. If found during targeted reads, convert to plain text.
- **Parent validation.** Every leaf note's `parent:` field MUST be its folder parent or a same-folder collection. Fix if wrong.
- **Dangling wikilinks.** Every `[[wikilink]]` must resolve to an existing note. Convert to plain text if target doesn't exist.
- Frontmatter fixes in Memory vault: use the schema from `~/Vaults/AGENTS.md`. Use `stat` for `created` date, fall back to `unknown`.
- **Report parents.** Knowledge vault grooming reports must have `parent: "[[reports]]"`. Memory vault grooming reports must have `parent: "[[grooming-reports]]"`. Do not point reports to Home or MEMORY.
- Memory vault file writes go through the filesystem (`~/Vaults/Memory/...`), not the obsidian CLI — backtick safety.
- If `qmd` is on PATH, use `qmd search` for finding related notes to link orphans.
- **MEMORY.md is a slim hub.** It links ONLY to the 5 folder parents (`system`, `projects`, `patterns`, `tools`, `sessions`) — never to individual leaf notes. If grooming finds MEMORY.md linking directly to leaves, remove those links and ensure the folder parent lists the leaf instead. The distillation workflow regenerates MEMORY.md; grooming just validates the structure.
- **Subagent delegation for fix phases.** Phases 1, 5-10 run in the main agent (lightweight). Phases 2-4 (broken links, orphans, frontmatter) should be delegated to subagents for parallel execution. **Batch rule:** max 5 items per subagent. If there are 12 orphans, split into 3 subagents of 4 each. Each subagent prompt must include: (a) the exact file list to fix, (b) the specific action for each file, (c) all relevant data from Phase 1 (link targets, parent candidates). Keep subagent prompts self-contained — they cannot see the main agent's context. If a fix phase has ≤5 items total, run it inline instead of delegating.
