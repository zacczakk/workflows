# Triage Inbox

Autonomously process all raw captures in `01_inbox/` into enriched `02_backlog/` notes.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Tool Access

The Knowledge vault is at `~/Vaults/Knowledge/`.

- **Primary:** use `obsidian` CLI (`obsidian vault=Knowledge files`, `read`, `create`, `delete`, `search`).
- **Fallback:** if `obsidian` CLI is unavailable or a command fails, use the filesystem directly:
  - List: `Read` tool on `~/Vaults/Knowledge/01_inbox/`
  - Read: `Read` tool on `~/Vaults/Knowledge/{path}`
  - Create: `Write` tool to `~/Vaults/Knowledge/{path}`
  - Delete: `bash trash ~/Vaults/Knowledge/{path}`
  - Search: `Grep` tool on `~/Vaults/Knowledge/`
- **Tweet extraction:** use `bird read <url>` (or `bird thread <url>` for threads) for `x.com`/`twitter.com` URLs. Auth via env vars (`AUTH_TOKEN`, `CT0`). If bird fails (expired cookies, rate limit), fall back to Tavily search with the tweet ID.
- Never silently skip the inbox. If listing fails, retry with the fallback method.

## Steps

1. **List inbox:** `obsidian vault=Knowledge files folder=01_inbox`
   - If empty, say "Inbox empty — nothing to triage." and stop.
   - If the command fails, fall back to reading the directory directly.

2. **Process each file autonomously.** For each:

   a. `obsidian vault=Knowledge read path="01_inbox/{file}"` — understand what it is.

   b. **If it contains multiple distinct topics, URLs, or unrelated items:**
      - Split into separate items and process each independently through steps c–k below.
      - Each item becomes its own backlog note with its own filename, task line, and tags.
      - Examples: a note with 3 pasted URLs → 3 backlog notes. A note mixing a tool link, a personal reminder, and a project idea → 3 backlog notes.

   c. **If it contains a URL:**
      - **Tweet URLs** (`x.com/*`, `twitter.com/*`):
        1. Run `bird read <url>` to extract full tweet text, author, engagement, and any quoted tweets.
        2. If it's a thread (multiple replies from the same author), use `bird thread <url>` instead.
        3. If bird fails, fall back to Tavily search with the numeric tweet ID for partial recovery.
        4. Include the extracted tweet content in a `## Tweet Context` section in the backlog note.
        5. Proceed to research (step e) on the topic/product/person identified in the tweet.
      - **All other URLs:**
        - Fetch the URL (WebFetch or Tavily).
        - Extract: title, author if available, key content.
      - Write a 2-4 sentence summary capturing the core insight.
      - **Check for duplicates:** `obsidian vault=Knowledge search query="{url}"` — scan results for any `02_backlog/` note that already contains this URL.
        - **If a match exists:** read the existing note, merge any new information (better summary, additional context), append if useful. Do NOT create a new note. Skip to step k.
        - **If no match:** proceed to steps d–j as normal.

   d. **If it's a sloppy/raw note (no URL):**
      - Clean up formatting: fix capitalization, punctuation, incomplete sentences.
      - Preserve the original intent — don't add meaning that isn't there.
      - Add a one-line summary at the top if the note lacks one.

   e. **Research the topic in depth:**
      - Use Tavily search to find 2-3 high-quality, recent sources about the topic, tool, or concept.
      - Extract and synthesize:
        - **What it is** — one-line definition or purpose.
        - **Key benefits** — what problems it solves, why people adopt it.
        - **Alternatives** — 2-3 competing tools/approaches and how they compare (strengths, weaknesses, tradeoffs).
        - **Fit for this system** — how would this benefit Phil's setup? Consider his stack (Python, TypeScript, Bun, Obsidian, agentic workflows), his active projects, and his engineering values (lean, simple, maintainable). Be specific — don't just say "could be useful."
        - **Caveats** — known limitations, maturity concerns, adoption signals (last release date, community size, maintenance status).
      - For tools/libraries: check GitHub activity, last release, and whether it's actively maintained.
      - Write the research as a concise briefing (4-8 sentences) — not raw search dumps. Integrate it into the note body as a `## Research` section.
      - Include source URLs as a `## References` section at the bottom of the note.
      - **Skip research** for personal/trivial items (reminders, reflections, admin tasks) — not everything needs it.

   f. **Derive a kebab-case filename** from the content/title. Never reuse the original messy filename.

   g. **Compose a `- [ ]` task line** — telegraph style, tag required:
      - `#try` — noun-only. No verbs. No dashes. Capitalize first letter.
        - `- [ ] Skillshare #try`
        - `- [ ] Kaku terminal #try`
        - `- [ ] Fractal journaling #try`
      - `#personal` — brief noun-phrase; verb ok if action is non-obvious.
        - `- [ ] Career goals note #personal`
        - `- [ ] Expand career goals note #personal`

   h. **Tag every task line.** Auto-detect from content:
      - URL articles, tools, things to evaluate — `#try`
      - Personal life, admin, career, reflections — `#personal`
      - Project-specific items — use the relevant project tag (derived from `03_active/` filenames)

   i. **Project-specific items — merge into active project note instead of backlog:**
      - If the item is tagged with a project tag (match against `03_active/` filenames) or explicitly links to / mentions an active project:
        1. Find the matching project note: `obsidian vault=Knowledge files folder=03_active` — match by project name.
        2. Read the project note.
        3. Append the task line(s) to the project's `## Tasks` section.
        4. If the item has a URL or summary worth preserving, add a `See also:` line or brief note under the relevant section.
        5. Skip step j — do NOT create a standalone backlog note.
        6. Jump to step k (delete original).
      - If no matching `03_active/` project note exists, fall through to step j (create in backlog as normal).

   j. **Create enriched note in backlog** (non-project items only):
      ```
       obsidian vault=Knowledge create path="02_backlog/{kebab-name}.md" content="# {Title}\n\n{summary or cleaned content}\n\n{original URL if present}\n\n## Tweet Context\n\n{only if source is a tweet — author, full text, engagement, quoted tweets}\n\n## Research\n\n{briefing — what it is, benefits, alternatives, fit for this system, caveats}\n\n## References\n\n- {source URLs from research}\n\n## Tasks\n\n- [ ] {action item} #{tag}"
      ```

   k. **Delete the original:** `obsidian vault=Knowledge delete path="01_inbox/{file}"`

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
- **Inline instructions from Phil:** Notes may contain direct instructions addressed to "Fred" or the processing agent (e.g., "Fred, file this under X" or "research this deeply" or "skip research, just save"). Respect these instructions — they override default processing behavior for that item.
- No frontmatter. Content only.
- Every backlog note MUST have at least one `- [ ]` task line.
- Always include `vault=Knowledge` in every `obsidian` command.
- Use `obsidian vault=Knowledge` CLI for all vault operations (create, read, delete, files).
- Use WebFetch or Tavily to fetch URLs — never skip URL enrichment.
- Use Tavily search for deep topic research on every non-personal item. Skip research only for personal/trivial items (or if Phil's inline instructions say otherwise).
- Kebab-case filenames derived from content, not original filename.
- No duplicates. If a URL already exists in `02_backlog/`, enhance the existing note.
- **Tree-graph linking.** Include `[[wikilinks]]` only to the note's nearest parent and direct dependencies (max 3 total). For `02_backlog/` notes, parent is `[[backlog]]`. For notes merged into `03_active/`, no extra links needed. Don't link siblings or tangentially related notes. Cross-vault links only through hub notes.
- Do NOT delete any files in `02_backlog/`, `03_active/`, or `07_knowledge/`. Only delete processed `01_inbox/` originals.
- Project-specific items go directly into `03_active/` project notes — not `02_backlog/`. Only create backlog notes for items with no matching active project.
