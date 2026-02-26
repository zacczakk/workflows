# Triage Inbox

Autonomously process all raw captures in `01_inbox/` into enriched `02_backlog/` notes.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Steps

1. **List inbox:** `obsidian vault=Knowledge files folder=01_inbox`
   - If empty, say "Inbox empty — nothing to triage." and stop.

2. **Process each file autonomously.** For each:

   a. `obsidian vault=Knowledge read path="01_inbox/{file}"` — understand what it is.

   b. **If it contains a URL:**
      - Fetch the URL (WebFetch or Tavily).
      - Extract: title, author if available, key content.
      - Write a 2-4 sentence summary capturing the core insight.
      - **Check for duplicates:** `obsidian vault=Knowledge search query="{url}"` — scan results for any `02_backlog/` note that already contains this URL.
        - **If a match exists:** read the existing note, merge any new information (better summary, additional context), append if useful. Do NOT create a new note. Skip to step h.
        - **If no match:** proceed to steps c-g as normal.

   c. **If it's a sloppy/raw note (no URL):**
      - Clean up formatting: fix capitalization, punctuation, incomplete sentences.
      - Preserve the original intent — don't add meaning that isn't there.
      - Add a one-line summary at the top if the note lacks one.

   d. **Derive a kebab-case filename** from the content/title. Never reuse the original messy filename.

   e. **Compose a `- [ ]` task line** — telegraph style, tag required:
      - `#try` — noun-only. No verbs. No dashes. Capitalize first letter.
        - `- [ ] Skillshare #try`
        - `- [ ] Kaku terminal #try`
        - `- [ ] Fractal journaling #try`
      - `#personal` — brief noun-phrase; verb ok if action is non-obvious.
        - `- [ ] Career goals note #personal`
        - `- [ ] Expand career goals note #personal`

   f. **Tag every task line.** Auto-detect from content:
      - URL articles, tools, things to evaluate — `#try`
      - Personal life, admin, career, reflections — `#personal`
      - Project-specific items — `#esgenius`, `#linai`, or the relevant project tag

   g. **Create enriched note in backlog:**
      ```
      obsidian vault=Knowledge create path="02_backlog/{kebab-name}.md" content="# {Title}\n\n{summary or cleaned content}\n\n{original URL if present}\n\n## Tasks\n\n- [ ] {action item} #{tag}"
      ```

   h. **Delete the original:** `obsidian vault=Knowledge delete path="01_inbox/{file}"`

3. **Print summary** when done:
   ```
   Triaged {N} items:
   - {filename} -> 02_backlog/{new-name}.md
   - {filename} -> merged into 02_backlog/{existing}.md
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
- Do NOT delete any files in `02_backlog/` or `07_knowledge/`. Only delete processed `01_inbox/` originals.
