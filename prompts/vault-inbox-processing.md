# Triage Inbox

Autonomously process all raw captures in `01_inbox/` into enriched `02_backlog/` notes.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Steps

1. **List inbox:** `obsidian vault=Knowledge files folder=01_inbox`
   - If empty, say "Inbox empty — nothing to triage." and stop.

2. **Process each file autonomously.** For each:

   a. `obsidian vault=Knowledge read path="01_inbox/{file}"` — understand what it is.

   b. **If it contains multiple distinct topics, URLs, or unrelated items:**
      - Split into separate items and process each independently through steps c–j below.
      - Each item becomes its own backlog note with its own filename, task line, and tags.
      - Examples: a note with 3 pasted URLs → 3 backlog notes. A note mixing a tool link, a personal reminder, and a project idea → 3 backlog notes.

   c. **If it contains a URL:**
      - Fetch the URL (WebFetch or Tavily).
      - Extract: title, author if available, key content.
      - Write a 2-4 sentence summary capturing the core insight.
      - **Check for duplicates:** `obsidian vault=Knowledge search query="{url}"` — scan results for any `02_backlog/` note that already contains this URL.
        - **If a match exists:** read the existing note, merge any new information (better summary, additional context), append if useful. Do NOT create a new note. Skip to step j.
        - **If no match:** proceed to steps d–i as normal.

   d. **If it's a sloppy/raw note (no URL):**
      - Clean up formatting: fix capitalization, punctuation, incomplete sentences.
      - Preserve the original intent — don't add meaning that isn't there.
      - Add a one-line summary at the top if the note lacks one.

   e. **Derive a kebab-case filename** from the content/title. Never reuse the original messy filename.

   f. **Compose a `- [ ]` task line** — telegraph style, tag required:
      - `#try` — noun-only. No verbs. No dashes. Capitalize first letter.
        - `- [ ] Skillshare #try`
        - `- [ ] Kaku terminal #try`
        - `- [ ] Fractal journaling #try`
      - `#personal` — brief noun-phrase; verb ok if action is non-obvious.
        - `- [ ] Career goals note #personal`
        - `- [ ] Expand career goals note #personal`

   g. **Tag every task line.** Auto-detect from content:
      - URL articles, tools, things to evaluate — `#try`
      - Personal life, admin, career, reflections — `#personal`
      - Project-specific items — use the relevant project tag (derived from `03_active/` filenames)

   h. **Project-specific items — merge into active project note instead of backlog:**
      - If the item is tagged with a project tag (match against `03_active/` filenames) or explicitly links to / mentions an active project:
        1. Find the matching project note: `obsidian vault=Knowledge files folder=03_active` — match by project name.
        2. Read the project note.
        3. Append the task line(s) to the project's `## Tasks` section.
        4. If the item has a URL or summary worth preserving, add a `See also:` line or brief note under the relevant section.
        5. Skip step i — do NOT create a standalone backlog note.
        6. Jump to step j (delete original).
      - If no matching `03_active/` project note exists, fall through to step i (create in backlog as normal).

   i. **Create enriched note in backlog** (non-project items only):
      ```
      obsidian vault=Knowledge create path="02_backlog/{kebab-name}.md" content="# {Title}\n\n{summary or cleaned content}\n\n{original URL if present}\n\n## Tasks\n\n- [ ] {action item} #{tag}"
      ```

   j. **Delete the original:** `obsidian vault=Knowledge delete path="01_inbox/{file}"`

3. **Print summary** when done:
   ```
   Triaged {N} items ({M} backlog, {P} integrated into projects):
   - {filename} -> 02_backlog/{new-name}.md
   - {filename} -> split into 02_backlog/{a}.md, 02_backlog/{b}.md, ...
   - {filename} -> merged into 02_backlog/{existing}.md
   - {filename} -> integrated into 03_active/{project}.md
   ```

## Rules

- Fully autonomous — no per-item confirmation. Just process and summarize.
- No frontmatter. Content only.
- Every backlog note MUST have at least one `- [ ]` task line.
- Always include `vault=Knowledge` in every `obsidian` command.
- Use `obsidian vault=Knowledge` CLI for all vault operations (create, read, delete, files).
- Use WebFetch or Tavily to fetch URLs — never skip URL enrichment.
- Kebab-case filenames derived from content, not original filename.
- No duplicates. If a URL already exists in `02_backlog/`, enhance the existing note.
- Include `[[wikilinks]]` to related notes in either vault where meaningful.
- Do NOT delete any files in `02_backlog/`, `03_active/`, or `07_knowledge/`. Only delete processed `01_inbox/` originals.
- Project-specific items go directly into `03_active/` project notes — not `02_backlog/`. Only create backlog notes for items with no matching active project.
