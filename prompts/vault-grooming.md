# Vault Grooming

Sweep both vaults for structural issues. Fix what's safe, enrich the link graph, report the rest.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Scope

| Vault | Fix in-place | Can delete | Report only |
|-------|-------------|------------|-------------|
| Knowledge | Broken wikilinks, add missing links | Nothing | Stubs, structural issues |
| Memory | Broken wikilinks, add missing links, fix frontmatter | Empty/artifact files only | Stubs, structural issues |

## Steps

### 1. Scan Knowledge vault

- `obsidian vault=Knowledge files` — get full file list.
- For each file, read and check for:

**Broken wikilinks:**
- Links to notes that don't exist in either vault.
- Fix where the target is obvious (typo, moved file) — find the closest filename match.
- If ambiguous, report instead of guessing.

**Missing links:**
- Scan content for mentions of concepts, tools, projects, or topics that exist as notes in either vault but aren't linked.
- Add `[[wikilinks]]` to ALL relevant targets. Don't stop at one — link every meaningful connection.
- Cross-vault links are valid and encouraged.

**Orphaned files** (no incoming links from any other note, excluding `Home.md` and `00_system/`):
- Do NOT delete orphans.
- Read the orphan's content and find related notes using `obsidian vault=Knowledge search query="..."` and `obsidian vault=Memory search query="..."`.
- If `qmd` is available on PATH, prefer `qmd search "{note title or key concepts}" --json` for better semantic matching.
- Add `[[wikilinks]]` in both directions — link the orphan to related notes, and link related notes back to the orphan.
- Report what was linked in the grooming report.

**Stub notes** (fewer than 3 lines of actual content):
- Report only. Do NOT delete.

### 2. Scan Memory vault

- `obsidian vault=Memory files` — get full file list.
- For each file, read and check for:

**Broken wikilinks:**
- Same as Knowledge vault — fix obvious, report ambiguous.

**Missing links:**
- Same as Knowledge vault — scan content, add `[[wikilinks]]` to ALL relevant targets in both vaults.

**Invalid or missing frontmatter:**
- Must have `type`, `tags`, `created` at minimum (see AGENTS.md schema).
- Fix missing fields:
  - `type`: infer from folder (`tools/` → `tool`, `patterns/` → `pattern`, `projects/` → `project`, `sessions/` → `session`, root → `reference`).
  - `tags`: infer from content. Use `[]` if nothing obvious.
  - `created`: try to get the file's birth time via `stat -f %SB ~/Vaults/Memory/{path}`. Parse the date from the output. Fall back to `created: unknown` and flag in the report.
  - `related`: add `[[wikilinks]]` to any notes that are meaningfully connected.
- Write frontmatter fixes via filesystem (`~/Vaults/Memory/{path}`) — backtick safety.

**Orphaned files:**
- Same approach as Knowledge vault — find related notes, add links in both directions. Do NOT delete.
- Use `qmd search` if available for better semantic matching.

**Empty/artifact files:**
- If a file has zero meaningful lines of content (blank, or just frontmatter with no body text at all), delete it: `obsidian vault=Memory delete path="..."`.
- If a file has even one line of real content, report it as a stub instead of deleting.
- Record every deletion in the grooming report.

### 3. Write grooming reports

Write a separate report to each vault.

**Knowledge vault report:**
```
obsidian vault=Knowledge create path="00_system/grooming-reports/{YYYY-MM-DD}.md" content="# Grooming Report — {YYYY-MM-DD}\n\n## Summary\n\n- {N} issues found, {M} fixed\n\n## Fixed\n\n- ...\n\n## Needs Review\n\n- ..."
```

**Memory vault report** (write via filesystem for backtick safety):
Write to `~/Vaults/Memory/system/grooming-reports/{YYYY-MM-DD}.md`:
```markdown
# Grooming Report — {YYYY-MM-DD}

## Summary

- {N} issues found, {M} fixed, {K} files deleted

## Fixed

- ...

## Deleted

- ...

## Needs Review

- ...
```

### 4. Print technical log

Print all actions taken to stdout (captured by launchd to `logs/vault-grooming.out.log`).

## Rules

- Always include `vault=Knowledge` or `vault=Memory` in every `obsidian` command.
- Knowledge vault: NEVER delete any files. Fix links, add links, report everything else.
- Memory vault: ONLY delete truly empty/artifact files (zero content below frontmatter). Everything else is reported.
- When fixing broken wikilinks, log the before and after in the grooming report so changes can be reviewed.
- When adding new links, add to ALL relevant targets — prefer over-linking to under-linking.
- Frontmatter fixes in Memory vault: use the schema from `~/Vaults/AGENTS.md`. Use `stat` for `created` date, fall back to `unknown`.
- Memory vault file writes go through the filesystem (`~/Vaults/Memory/...`), not the obsidian CLI — backtick safety.
- Grooming reports go in each vault's own grooming-reports folder.
- If `qmd` is on PATH, use `qmd search` for finding related notes to link orphans. It provides better semantic matching than simple keyword search.
