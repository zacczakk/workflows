# Vault Grooming

Sweep both vaults for structural issues. Fix what's safe, report the rest.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Scope

| Vault | Fix in-place | Can delete | Report only |
|-------|-------------|------------|-------------|
| Knowledge | Broken wikilinks | Inbox originals only | Orphans, stubs, other issues |
| Memory | Broken wikilinks, invalid frontmatter | Orphans, stubs | - |

## Steps

1. **Scan Knowledge vault:**
   - `obsidian vault=Knowledge files` — get full file list.
   - For each file, read and check for:
     - Broken `[[wikilinks]]` — links to notes that don't exist in either vault.
     - Orphaned files — no incoming links from any other note (exclude `Home.md`, `00_system/`).
     - Stub notes — fewer than 3 lines of actual content.
   - **Fix** broken wikilinks in-place where the target is obvious (typo, moved file). Use `obsidian vault=Knowledge append` or filesystem write.
   - **Report** everything else. Do NOT delete any Knowledge vault files (except `01_inbox/` processing artifacts if found).

2. **Scan Memory vault:**
   - `obsidian vault=Memory files` — get full file list.
   - For each file, read and check for:
     - Broken `[[wikilinks]]`.
     - Invalid or missing frontmatter (must have `type`, `tags`, `created` — see AGENTS.md schema).
     - Orphaned files — no incoming links and not referenced in any `related:` frontmatter.
     - Stub notes — fewer than 3 lines of actual content below frontmatter.
   - **Fix** broken wikilinks in-place.
   - **Fix** invalid frontmatter — add missing required fields with sensible defaults.
   - **Delete** obvious orphans and stubs. Use `obsidian vault=Memory delete path="..."`. Record every deletion.

3. **Write grooming report:**
   ```
   obsidian vault=Knowledge create path="00_system/grooming-reports/{YYYY-MM-DD}.md" content="# Vault Grooming Report — {YYYY-MM-DD}\n\n## Summary\n\n- Knowledge: {N} issues found, {M} fixed\n- Memory: {N} issues found, {M} fixed, {K} files deleted\n\n## Knowledge Vault\n\n### Fixed\n- ...\n\n### Needs Review\n- ...\n\n## Memory Vault\n\n### Fixed\n- ...\n\n### Deleted\n- ...\n\n### Needs Review\n- ..."
   ```

4. **Print technical log** to stdout with all actions taken.

## Rules

- Always include `vault=Knowledge` or `vault=Memory` in every `obsidian` command.
- Knowledge vault: NEVER delete files outside `01_inbox/`. Report-only for structural issues.
- Memory vault: CAN delete orphans and stubs. Record every deletion in the report.
- When fixing wikilinks, prefer the closest match by filename. If ambiguous, report instead of guessing.
- Frontmatter fixes in Memory vault: use the schema from `~/Vaults/AGENTS.md`. Set `created` to file creation date if available, otherwise today.
- Grooming report goes in `00_system/grooming-reports/` with today's date as filename.
