# Session Processing

Process raw session notes in `sessions/` — extract durable knowledge into the right Memory folders, then archive or delete the session note.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Steps

### 1. List session notes

`obsidian vault=Memory files folder=sessions`

- If empty, say "No session notes to process." and stop.

### 2. Process each session note

For each file in `sessions/`:

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
     tags: []
     created: YYYY-MM-DD
     related: ["[[note-name]]"]
     depends-on: []
     ---

     # {Title}

     {Distilled content — concise, actionable, with [[wikilinks]]}
     ```
   - For merged notes: preserve existing frontmatter, append or update content sections.

e. **Delete the session note:** `obsidian vault=Memory delete path="sessions/{file}"`
   - Only delete after all extracted knowledge has been written successfully.

### 3. Print summary

```
Processed {N} session notes:
- sessions/{file} → {M} items extracted
  → new: patterns/{a}.md, tools/{b}.md
  → updated: projects/{c}.md
- sessions/{file} → no extractable knowledge (deleted)
```

## Rules

- Distill, don't transcribe. Future agents should get the point in 30 seconds.
- One note per topic. If a session covers 5 topics, that's up to 5 target notes.
- Merge over create. Always check for existing notes first — extend them rather than creating near-duplicates.
- Skip noise. Routine back-and-forth, dead ends, and obvious things are not worth extracting.
- Every extracted note MUST have valid frontmatter (`type`, `tags`, `created`, `related`).
- Populate `related:` from detected connections — search both vaults. Don't leave it empty.
- Include `[[wikilinks]]` to related notes in both Knowledge and Memory vaults.
- Always include `vault=Memory` in every `obsidian` command.
- Write notes via filesystem (`~/Vaults/Memory/...`), not `obsidian create` — backtick safety.
- If a session note has zero extractable knowledge (purely routine, everything already captured elsewhere), delete it and note "no extractable knowledge" in the summary.
- Do NOT modify notes outside the Memory vault. This workflow is write-only to Memory.
