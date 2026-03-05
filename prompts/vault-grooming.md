# Vault Grooming

Sweep both vaults for structural issues. Fix what's safe, build a tree-shaped link graph, report the rest.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Scope

| Vault | Fix in-place | Can create | Can delete | Report only |
|-------|-------------|------------|------------|-------------|
| Knowledge | Broken wikilinks, tree-structured links, promote backlog | Index notes in `06_docs/`, `07_knowledge/` | Promoted backlog notes only | Stubs, structural issues |
| Memory | Broken wikilinks, tree-structured links, fix frontmatter | `collection` notes when 3+ leaves cluster | Empty/artifact files only | Stubs, structural issues |

## Steps

### 1. Scan Knowledge vault

- `obsidian vault=Knowledge files` — get full file list.
- For each file, read and check for:

**Broken wikilinks:**
- Links to notes that don't exist in either vault.
- Fix where the target is obvious (typo, moved file) — find the closest filename match.
- If ambiguous, report instead of guessing.

**Missing links (tree-structured):**
- Scan content for mentions of concepts, tools, projects, or topics that exist as notes in either vault but aren't linked.
- Add links following the tree-graph linking policy (see Rules section). Every note links **upward** to its nearest parent (sub-index if one exists, otherwise folder index) and to **direct dependencies** only.
- Do NOT link siblings (notes at the same level under the same parent) — they're reachable by traversing up then down.
- Cross-vault links only through hub notes (`MEMORY.md`, `03_active/` project notes).

**Orphaned files** (no incoming links from any other note, excluding `Home.md` and `00_system/`):
- Do NOT delete orphans.
- Read the orphan's content and find its logical parent using `obsidian vault=Knowledge search query="..."` and `obsidian vault=Memory search query="..."`.
- If `qmd` is available on PATH, prefer `qmd search "{note title or key concepts}" --json` for better semantic matching.
- Link the orphan **upward only** — add a `[[wikilink]]` or `See also:` pointing to its nearest parent. Check sub-indexes first (e.g., `agent-memory.md`, `terminal-shell.md`), then folder indexes (`docs.md`, `knowledge.md`), then project notes in `03_active/`.
- Do NOT add backlinks from other notes to the orphan. Let it earn inbound links organically.
- Report what was linked in the grooming report.

**Multi-topic notes:**
- If a note covers two or more distinct, separable topics in a single file, split it into individual notes — one per topic.
- Each new note gets the original's folder location and inherits relevant links/tags.
- Link each split note upward to their shared parent note. Do NOT link split notes to each other — they share a parent, which is sufficient for traversal.
- Update any incoming links from other notes to point to the correct split note.
- Report every split in the grooming report (original → new notes).

**Backlog promotion** (project-specific notes stuck in `02_backlog/`):
- First, discover active project tags: `obsidian vault=Knowledge files folder=03_active` — derive a tag for each project from its filename (e.g. `my-project.md` → `#my-project`). Use these as the set of known project tags.
- Scan all `02_backlog/` notes for any of those project tags, explicit `[[wikilinks]]`, or mentions of an active project.
- For each match:
  1. Find the matching project note in `03_active/`.
  2. Read both the backlog note and the project note.
  3. Append the backlog note's task line(s) to the project's `## Tasks` section.
  4. If the backlog note has a URL, summary, or context worth preserving, add it as a `See also:` line or brief entry in the project note.
  5. Delete the backlog note: `obsidian vault=Knowledge delete path="02_backlog/{file}"`.
  6. Log the promotion in the grooming report (backlog note → project note).
- If no matching `03_active/` project note exists, leave the backlog note in place and report it.

**Stub notes** (fewer than 3 lines of actual content):
- Report only. Do NOT delete.

### 2. Scan Memory vault

- `obsidian vault=Memory files` — get full file list.
- For each file, read and check for:

**Broken wikilinks:**
- Same as Knowledge vault — fix obvious, report ambiguous.

**Missing links (tree-structured):**
- Same as Knowledge vault — scan content, add links following the tree-graph linking policy. Link upward to parent + direct dependencies only.

**Invalid or missing frontmatter:**
- Must have `type`, `tags`, `created` at minimum (see AGENTS.md schema).
- Fix missing fields:
  - `type`: infer from folder (`tools/` → `tool`, `patterns/` → `pattern`, `projects/` → `project`, `sessions/` → `session`, root → `reference`).
  - `tags`: infer from content. Use `[]` if nothing obvious.
  - `created`: try to get the file's birth time via `stat -f %SB ~/Vaults/Memory/{path}`. Parse the date from the output. Fall back to `created: unknown` and flag in the report.
  - `related`: add the note's logical parent and up to 2 direct dependencies. Max 3 entries. Don't pad with tangential connections.
- Write frontmatter fixes via filesystem (`~/Vaults/Memory/{path}`) — backtick safety.

**Multi-topic notes:**
- Same as Knowledge vault — split notes covering multiple distinct topics into individual notes.
- Each new note must have valid frontmatter (infer `type`, `tags`, `created` from the original).
- Write new notes via filesystem (`~/Vaults/Memory/{path}`) — backtick safety.

**Orphaned files:**
- Same approach as Knowledge vault — find the orphan's logical parent, link upward only. Do NOT add backlinks. Do NOT delete.
- Use `qmd search` if available for better semantic matching.

**Empty/artifact files:**
- If a file has zero meaningful lines of content (blank, or just frontmatter with no body text at all), delete it: `obsidian vault=Memory delete path="..."`.
- If a file has even one line of real content, report it as a stub instead of deleting.
- Record every deletion in the grooming report.

### 3. Create collection and index notes

After scanning both vaults, identify clusters of leaf notes that lack a shared parent. Create parent notes to give the tree structure.

**Memory vault — `collection` notes:**
- Group leaf notes by shared theme within each folder (`patterns/`, `tools/`, `projects/`, `system/`).
- If 3+ leaf notes share a common topic and no existing note serves as their parent → create a `collection` note.
- Place the collection in the same folder as its children.
- Format:
  ```markdown
  ---
  type: collection
  tags: [{inferred from children}]
  created: {YYYY-MM-DD}
  related: []
  ---

  # {Topic Name}

  {2-3 sentence summary of what this collection covers.}

  ## Notes

  - [[child-note-1]] — one-line summary
  - [[child-note-2]] — one-line summary
  - [[child-note-3]] — one-line summary
  ```
- Write via filesystem — backtick safety.
- Update each child's `related:` frontmatter to include the new collection as its parent (first entry).

**Knowledge vault — index and sub-index notes:**

Two levels of hierarchy exist:
1. **Folder indexes** — `docs.md`, `knowledge.md`, `projects.md`, `backlog.md`. Link up to `Home.md`. List sub-indexes under a `## Topics` section and unclustered leaves under thematic `##` sections.
2. **Sub-indexes** — topic clusters within `06_docs/` and `07_knowledge/` (e.g., `agent-memory.md`, `terminal-shell.md`). Link up to their folder index. List their children with one-line summaries.

Maintenance rules:
- If a folder index or sub-index already exists, update it (add/remove children) — don't recreate.
- Create a **new sub-index** when 3+ unparented leaves in `06_docs/` or `07_knowledge/` cluster around a theme. Name it after the theme. Add `See also: [[folder-index]]`. List children. Update each child's `See also:` to point to the new sub-index (not the folder index).
- `05_notes/`: create a folder index only when 5+ notes exist. Skip if fewer.
- `02_backlog/`: `backlog.md` is the index. No sub-indexes.
- `03_active/`: `projects.md` is the index. No sub-indexes.
- Leaves with <3 siblings in a theme: link directly to the folder index (no sub-index needed).

Format for sub-indexes (Knowledge vault — no frontmatter):
  ```markdown
  # {Topic Name}

  {Brief framing paragraph.}

  See also: [[folder-index]]

  - [[note-a]] — one-line summary
  - [[note-b]] — one-line summary
  ```

Format for folder indexes:
  ```markdown
  # {Folder} Index

  {Brief framing paragraph.}

  See also: [[Home]]

  ## Topics
  - [[sub-index-a]] — description (N leaves)
  - [[sub-index-b]] — description (N leaves)

  ## {Unclustered Theme}
  - [[note-c]] — one-line summary
  ```

**Rules for parent creation:**
- Merge-first: check if a natural parent already exists (project note, existing doc, existing collection) before creating a new one.
- One level deep: don't create grandparent notes. If collections themselves cluster, a future run can address that.
- Report every new collection/index note in the grooming report.

### 4. Write grooming reports

Write a separate report to each vault.

**Important:** Grooming reports must NOT contain `[[wikilinks]]` or any other link syntax. Use plain text for all file names and note references. Links in reports create noise in the knowledge graph — every mention would show up as a backlink on the target note.

**Knowledge vault report:**
```
obsidian vault=Knowledge create path="00_system/grooming-reports/{YYYY-MM-DD}.md" content="# Grooming Report — {YYYY-MM-DD}\n\n## Summary\n\n- {N} issues found, {M} fixed, {P} backlog notes promoted, {C} collections created\n\n## Fixed\n\n- ...\n\n## Promoted to Projects\n\n- 02_backlog/{file} → 03_active/{project}.md\n- ...\n\n## Collections Created\n\n- 07_knowledge/knowledge-index.md (aggregates: note-a, note-b, note-c)\n- ...\n\n## Needs Review\n\n- ..."
```

**Memory vault report** (write via filesystem for backtick safety):
Write to `~/Vaults/Memory/system/grooming-reports/{YYYY-MM-DD}.md`:
```markdown
# Grooming Report — {YYYY-MM-DD}

## Summary

- {N} issues found, {M} fixed, {K} files deleted, {C} collections created

## Fixed

- ...

## Deleted

- ...

## Collections Created

- tools/shell-environment.md (aggregates: node-nvm-bun-zshrc-setup, shell-optimization, terminal-setup)
- ...

## Needs Review

- ...
```

### 5. Print technical log

Print all actions taken to stdout (captured by launchd to `logs/vault-grooming.out.log`).

## Rules

- Always include `vault=Knowledge` or `vault=Memory` in every `obsidian` command.
- Knowledge vault: ONLY delete `02_backlog/` notes that were successfully promoted into a `03_active/` project note. Never delete anything else.
- Memory vault: ONLY delete truly empty/artifact files (zero content below frontmatter). Everything else is reported.
- When fixing broken wikilinks, log the before and after in the grooming report so changes can be reviewed.
- **Tree-graph linking policy:** Links must build a traversable tree, not a dense mesh.
  - Every note gets exactly **1 parent link** — the broader topic or collection it belongs under.
  - Plus **0-3 dependency links** — notes required to understand this one.
  - No sibling links. Notes at the same level share a parent; that's enough for traversal.
  - No bidirectional links unless there's a true mutual dependency (A requires B AND B requires A).
  - Cross-vault links only through hub notes (`MEMORY.md`, project notes in `03_active/`).
  - Max outgoing links per leaf note: 4 (1 parent + 3 deps). Collection/index notes have no cap (they link down to all children).
  - When in doubt, link less. A sparse tree is navigable; a dense mesh is noise.
- Frontmatter fixes in Memory vault: use the schema from `~/Vaults/AGENTS.md`. Use `stat` for `created` date, fall back to `unknown`.
- Memory vault file writes go through the filesystem (`~/Vaults/Memory/...`), not the obsidian CLI — backtick safety.
- Grooming reports go in each vault's own grooming-reports folder.
- If `qmd` is on PATH, use `qmd search` for finding related notes to link orphans. It provides better semantic matching than simple keyword search.
- When splitting multi-topic notes: delete the original only after all split notes are written and all incoming links are updated. Log the original path and all new paths in the grooming report.
