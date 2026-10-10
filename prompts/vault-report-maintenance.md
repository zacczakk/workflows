# Operational Report Maintenance

Keep operational logs bounded without losing useful findings. Read ~/Vaults/AGENTS.md. Use the supplied run date and filesystem tools; do not launch Obsidian. This workflow runs weekly within nightly. The owner approved the exact cleanup scope below; report-log cleanup is independent of session-archive authorization.

## Exact scope

Only dated operational report leaves in:

- Knowledge/00_system/grooming-reports/YYYY-MM-DD.md, including historical single-letter date suffixes.
- Memory/system/grooming-reports/YYYY-MM-DD.md, including historical single-letter date suffixes.
- Memory/system/consolidation-reports/YYYY-MM-DD.md.
- Memory/system/retrieval-reports/YYYY-MM-DD.md.
- Memory/system/skill-sync-YYYY-MM-DD.md.

Match whole filenames and confirm report content/frontmatter. Legacy reference-typed files are eligible only when their bodies are clearly run reports. Keep unknown types, malformed dates, symlinks and non-report content. Report collections are navigation, not eligible leaves.

**No candidates fast path (mandatory):** when the five allowlisted report inventories contain no eligible old reports or obsolete report collections, perform no global vault scan. Read only both rolling records, the five family indexes and necessary system navigation. Verify exact report inventories, newest paths and navigation; hash the retained report files/indexes before and after, and preserve the rolling findings byte-for-byte. Refresh both output summaries and finish complete. Do not compare daily report bodies, scan removal references, hash unrelated protected notes/assets, or inspect workflow state/long-term archives. Unrelated iCloud placeholders cannot block a zero-move run; an unreadable report inventory or required rolling/index file still fails closed. Apply the broader removal gates below only when at least one removal is proposed.

Only the two grooming families allow single-letter suffixes. Skill date-range files such as skill-sync-2026-03-19-24.md are navigation collections, never daily report candidates.

Grooming filenames match `^\d{4}-\d{2}-\d{2}(?:-[a-z])?\.md$`; the historical suffix includes its separating hyphen, as in 2026-03-10-b.md.

## Retention and content gate

1. Inventory the five families. Retain dates within 30 calendar days of the supplied run date, future dates, and the newest report in each family even when older. Use date arithmetic, not file mtime. Never remove today's report.
2. Process at most ten older candidates per family per run, oldest first; retain and count additional candidates as deferred. Read selected candidates fully. Compare their unique findings, unresolved reviews, errors and manual-review requests with retained reports, rolling findings and current durable notes. Do not treat a warning's age as proof it was resolved.
3. Preserve useful findings before removing sources. Maintain ONE rolling record per vault:
   - Knowledge/00_system/grooming-reports/report-retention.md: type report, parent reports, created preserved, modified run date, summary, tags: [].
   - Memory/system/report-retention.md: type reference, parent system, created preserved, updated run date, summary, tags: [].
   Keep concise open findings with plain source paths/dates and uncertainty. Carry unique evidence into these records or retain its source. A durable note or newer receipt may supersede a claim; record why. Unverifiable, unreadable or unpreservable sources stay intact and are reported as retained exceptions. Never copy secrets.
4. For proposed removals, scan external references from outside report navigation, including wikilinks, Markdown links and plain qualified paths. Reference scope is visible vault Markdown notes and canvas/base/excalidraw sources; exclude hidden app/config/planning folders, exported HTML/CSS/PDF, binary attachments, repositories, workflow state and original archives. An unreadable reference-bearing source retains affected removal candidates as explicit exceptions; do not guess absence of references. Retain externally referenced sources unless their owned reference can safely be repaired without changing durable content. Do not rewrite other notes merely to enable deletion.
5. Before any move, record exact paths, sha256 values and original counts in stdout; recheck source and carry-forward bytes immediately before removal. Changed files stay intact. Move only reviewed, covered exact paths with trash --stopOnError. Verify source absence and command success; stop on a failed move. Never use recursive deletion or broad globs with trash.

## Navigation and tags

- Repair the existing report indexes to list retained files with vault-relative qualified links. Preserve their creation dates and parents; update modified/updated dates.
- Keep one index per report family. Memory daily skill reports use the existing system/skill-sync-reports.md, parent system. Reparent retained daily skill reports there, then retire obsolete date-range skill collections only after proving they are navigation-only and all their useful children remain reachable.
- Retrieval uses system/retrieval-reports/retrieval-reports.md. Dissolve obsolete date-range collections with the same proof. Retain uncertain/external-reference collections. Dated report indexes, including skill-sync, are fanout-exempt; do not create month/range clusters to satisfy the ten-child limit.
- Set operational report and report-index tags to tags: []. Clear report-only system/skill-sync/skill-syncs tag clutter, while preserving domain tags on durable notes.
- Update only the necessary navigation in Knowledge's grooming index and Memory's system.md/obsidian-vault-system.md. Preserve unrelated listings. Parent links remain; report bodies use plain paths, not wikilinks.

## Protected content

Keep all session notes, projects, patterns, tools, other durable knowledge, original transcripts/archives, Knowledge backlog reports/evaluations and the GitHub audit baseline. Tags alone never authorize removal. Do not modify MEMORY.md, USER.md, SOUL.md, repositories or workflow state. Do not run other workflows or exports; the runner owns final indexing.

## Completion

Always refresh BOTH rolling outputs, even when there are No candidates. Preserve existing open findings. Record run date, cutoff, per-family removed/retained counts, exceptions and validation; replace the previous run summary rather than appending daily history.

Both output frontmatters require retention_status: complete only after all selected operations and verification succeed. Keep this separate from the vault's normal active/deprecated status field. Deferred candidates and explicitly retained exceptions are valid completed outcomes when transparently recorded. On a failed move, incomplete inventory or unverified post-move state, preserve findings with retention_status: partial in both outputs and report failure; never claim complete. The runner rejects partial/missing completion status.

For a removal run, validate all edited navigation targets, exact retained/newest files, no dangling removed references and protected vault-note before/after sha256 values. For a zero-move run, use only the mandatory fast-path checks above. Partial or unreadable allowlisted report inventories must be stated; never claim complete cleanup from incomplete scans. Print every move and final counts. A no-op run is success only after both required outputs are refreshed and verified.

Keep hash detail in one temporary JSON manifest; print its path, aggregate digest and counts. Print per-file hashes only for proposed removal candidates, not a full ledger of unchanged protected files.
