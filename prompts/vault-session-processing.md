# Session Processing

Process raw session notes in `sessions/` — extract durable knowledge into the right Memory folders. Leave session notes in place for the consolidation workflow to cross-reference later.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Steps

### 1. List unconsolidated session notes

Find session notes that haven't been processed yet:

```bash
# Files with consolidated: false
rg -l '^consolidated: false' ~/Vaults/Memory/sessions/ --glob '*.md' 2>/dev/null > /tmp/sessions_false.txt

# Files missing consolidated field entirely (new notes)
rg -L '^consolidated:' ~/Vaults/Memory/sessions/ --glob '*.md' 2>/dev/null >> /tmp/sessions_false.txt

# Exclude the index file
grep -v 'sessions\.md$' /tmp/sessions_false.txt | sort -u > /tmp/sessions_to_process.txt
```

- If empty, say "No unconsolidated session notes to process." and stop.

### 2. Process each unconsolidated session note

For each file in `/tmp/sessions_to_process.txt`:

a. Read the full note: `obsidian vault=Memory read path="sessions/{file}"`

b. **Classify extractable knowledge.** For each distinct insight, decision, or discovery in the note, determine its type:

| Content is about... | Target folder | Target `type` |
|---------------------|---------------|---------------|
| A reusable implementation approach, convention, or workflow | `patterns/` | `pattern` |
| A CLI tool, setup gotcha, environment config | `tools/` | `tool` |
| A specific project's status, decisions, architecture | `projects/` | `project` |
| Vault structure, agent config, system knowledge | root (`~/Vaults/Memory/`) | `reference` |

c. **Check for existing notes.** Before creating a new note, search for existing ones that cover the same topic:
   - `obsidian vault=Memory search query="{topic keywords}"`
   - If `qmd` is on PATH, prefer `qmd search "{topic}" --json` for semantic matching.
   - **If a match exists:** read the existing note and merge — append new information, update stale content. Do NOT create a duplicate.
   - **If no match:** create a new note (step d).

d. **Create or update target notes.** For each extractable item:
   - Derive a kebab-case filename from the topic.
   - Write via filesystem (`~/Vaults/Memory/{folder}/{kebab-name}.md`) — backtick safety.
   - Format for new notes:
     ```markdown
     ---
     type: {pattern | tool | project | reference}
     summary: "{one-line plain-text summary, 15-25 words, no wikilinks}"
     tags: []
     created: YYYY-MM-DD
     related: ["[[note-name]]"]
     depends-on: []
     ---

     # {Title}

     {Distilled content — concise, actionable, with [[wikilinks]]}
     ```
   - The `summary` field is mandatory on all new notes. It must be a single line of plain text that captures the core insight — what an agent needs to know without reading the body. No wikilinks, no markdown.
   - For merged notes: preserve existing frontmatter, append or update content sections. Add `summary` if missing.

e. **Leave the session note in place.** Do NOT delete it. The consolidation workflow will read unconsolidated session notes for cross-cutting pattern synthesis, then handle cleanup.
   - If the session note has `consolidated: false` in frontmatter (or no `consolidated` field), leave it as-is.
   - If the session note lacks a `consolidated` field entirely, add `consolidated: false` to its frontmatter.

### 3. Print summary

```
Processed {N} session notes:
- sessions/{file} → {M} items extracted
  → new: patterns/{a}.md, tools/{b}.md
  → updated: projects/{c}.md
- sessions/{file} → no extractable knowledge (kept for consolidation)
```

## Rules

- Distill, don't transcribe. Future agents should get the point in 30 seconds.
- One note per topic. If a session covers 5 topics, that's up to 5 target notes.
- Merge over create. Always check for existing notes first — extend them rather than creating near-duplicates.
- Skip noise. Routine back-and-forth, dead ends, and obvious things are not worth extracting.
- Every extracted note MUST have valid frontmatter (`type`, `summary`, `tags`, `created`, `related`).
- **Tree-graph linking.** Populate `related:` with the note's **folder parent first** and up to 2 direct dependencies. Max 3 entries. Folder parents by folder: `tools/` → `[[tools]]`, `patterns/` → `[[patterns]]`, `projects/` → `[[projects]]`, `sessions/` → `[[sessions]]`. If a collection exists in the same folder for this topic, use the collection instead. Don't pad with tangential connections. If only a parent exists, `["[[parent]]"]` is fine.
- **No body `[[wikilinks]]` to other leaf notes.** Use plain text for references to other Memory vault notes within body content. The only allowed body wikilinks are from parent/collection notes listing their children.
- Always include `vault=Memory` in every `obsidian` command.
- Write notes via filesystem (`~/Vaults/Memory/...`), not `obsidian create` — backtick safety.
- If a session note has zero extractable knowledge (purely routine, everything already captured elsewhere), leave it in place for consolidation and note "no extractable knowledge" in the summary.
- Do NOT modify notes outside the Memory vault. This workflow is write-only to Memory.
