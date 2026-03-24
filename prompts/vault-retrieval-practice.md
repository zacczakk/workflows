# Vault Retrieval Practice

Spot-check Memory vault notes for accuracy. Sample random notes, verify against current reality, flag drift.

## HARD RULES — read these first

1. **You MUST write the retrieval report before exiting.** An exit without writing `~/Vaults/Memory/system/retrieval-reports/{date}.md` is a workflow failure regardless of exit code.
2. If any command fails or is rejected, **continue to the next step**. Never stop the workflow early.
3. You have read-only access to `~/Repos/**` and `~/Vaults/**`. You can use Read/Glob/Grep or bash on these paths. You **cannot** Edit/Write to `~/Repos/`. For paths outside these (like `/etc/`, `/private/`), use bash commands only.

## Context

Read `~/Vaults/AGENTS.md` for current vault conventions before starting.

## Purpose

Session processing captures facts. Grooming fixes structure. Consolidation finds patterns. **Retrieval practice verifies truth.** Notes drift — tools get updated, projects change architecture, patterns get superseded. This workflow catches it.

Runs weekly. Input = random sample of vault notes. Output = accuracy report + `verified` timestamp on checked notes.

## Performance Budget

This workflow has a 30-minute timeout. Sample 5-8 notes per run. Do not read the entire vault.

## Workflow

### Step 1: Sample notes

Build candidate pool:
```bash
rg -l '^type:' ~/Vaults/Memory/ --glob '*.md' 2>/dev/null
```

Exclude: root files (MEMORY/IDENTITY/SOUL/USER.md), folder parents (*/<folder>.md), collection notes (type: collection), report directories (grooming-reports/, consolidation-reports/, retrieval-reports/), session notes (sessions/).

From filtered pool, select **6 notes**. Priority: never-verified first, then oldest `verified` date.

```bash
rg '^verified:' ~/Vaults/Memory/ --glob '*.md' --no-heading 2>/dev/null
```

### Step 2: Initialize results file

Before any verification, create `/tmp/rp_results.md` with the report header:

```bash
cat > /tmp/rp_results.md << 'HEADER'
## Summary

- PLACEHOLDER

## Results

HEADER
```

### Step 3: Verify and record each note ONE AT A TIME

Process notes **sequentially**. For each note, complete ALL four sub-steps before starting the next note:

**3a.** Read the note via Read tool (~/Vaults/ paths are fine).

**3b.** Verify claims. You can use Read/Glob/Grep on `~/Vaults/` and `~/Repos/` paths, or bash commands for anything else. Example checks:
- Project: `git -C ~/Repos/{project} log -1`, Read `~/Repos/{project}/package.json`
- Tool: `which {tool}`, `{tool} --version`
- Pattern: Grep for the pattern in relevant repos
- Reference: Check paths exist, verify facts

If any check fails or is rejected, score as "unverifiable" and move on.

**3c.** Score: **accurate** | **minor drift** | **major drift** | **obsolete** | **unverifiable**

**3d.** **Record immediately** — append result AND update `verified` timestamp:

```bash
cat >> /tmp/rp_results.md << 'EOF'
- {folder}/{name}.md — **{score}** — {one-line finding}
EOF
```

Then Edit the note's frontmatter to add/update `verified: YYYY-MM-DD`.

**Only after 3d is complete, move to the next note.** This ensures results survive even if a later note causes errors.

### Step 4: Write report and verify — MANDATORY, DO NOT SKIP

**4a. Write the retrieval report:**

Read `/tmp/rp_results.md` to recall findings, then write the full report to `~/Vaults/Memory/system/retrieval-reports/{YYYY-MM-DD}.md`:

```markdown
---
type: sync-report
tags: []
created: YYYY-MM-DD
parent: "[[retrieval-reports]]"
---

# Retrieval Practice Report — YYYY-MM-DD

## Summary

- {N} notes sampled, {A} accurate, {D} minor drift, {M} major drift, {O} obsolete, {U} unverifiable

## Results

### Accurate
- {folder}/{name}.md — {one-line confirmation}

### Minor Drift
- {folder}/{name}.md — {what's outdated and what the current reality is}

### Major Drift
- {folder}/{name}.md — {what's wrong and what it should say}

### Obsolete
- {folder}/{name}.md — {why it's obsolete}

### Unverifiable
- {folder}/{name}.md — {what blocked verification}
```

**Important:** Retrieval reports must NOT contain `[[wikilinks]]` in body text. Use plain text for file references. Wikilinks in frontmatter `related` field are fine.

**4b. Print summary to stdout** (captured by launchd).

### Self-check before exiting

Before you finish, verify:
- [ ] `/tmp/rp_results.md` has entries for all sampled notes
- [ ] Each checked note has `verified: YYYY-MM-DD` in frontmatter (done in Step 3d)
- [ ] Report file exists at `~/Vaults/Memory/system/retrieval-reports/{YYYY-MM-DD}.md`

If any check fails, fix it before exiting. **An exit without writing the report is a workflow failure regardless of exit code.**

## Rules

- Memory vault file writes go through the filesystem (`~/Vaults/Memory/...`), not the obsidian CLI — backtick safety.
- **Report, don't fix.** Verify and report. Don't modify note content (except adding `verified` date).
- **Verify against reality, not other notes.** Check actual repos, installed tools, current configs.
- **Web search for external claims.** If a note claims something about an external tool/API/library, search the web. Prefer 2025-2026 sources.
- **Conservative scoring.** When in doubt, pick the less severe score. Catch real problems, not pedantic.
- **Skip if blocked.** Can't verify a claim? Score "unverifiable" and move on. Don't hang.
- Always include `vault=Memory` in every `obsidian` command.
- If `qmd` is on PATH, use `qmd search` for finding related context.
