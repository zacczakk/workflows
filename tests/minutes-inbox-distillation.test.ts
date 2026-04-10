import { describe, expect, test } from "bun:test";
import {
  fingerprintFor,
  normalizeInboxName,
  parseProjectContext,
  selectProjectContexts,
  validateInboxNote,
} from "../src/minutes-inbox-distillation";

describe("normalizeInboxName", () => {
  test("strips the Minutes date prefix and appends -summary", () => {
    expect(normalizeInboxName("2026-04-10-team-sync.md")).toBe("team-sync-summary.md");
  });

  test("falls back to meeting-summary for an empty stem", () => {
    expect(normalizeInboxName("2026-04-10-.md")).toBe("meeting-summary.md");
  });
});

describe("fingerprintFor", () => {
  test("uses size and mtime to detect transcript changes", () => {
    expect(fingerprintFor({ size: 128, mtimeMs: 42_000 })).toBe("128:42000");
  });
});

describe("parseProjectContext", () => {
  test("extracts title and summary from a project note", () => {
    const note = `---\nsummary: "Launchd-based vault automation"\n---\n# workflows\n\nScheduled runs.`;
    const parsed = parseProjectContext("/tmp/workflows.md", note);

    expect(parsed.title).toBe("workflows");
    expect(parsed.summary).toBe("Launchd-based vault automation");
  });
});

describe("selectProjectContexts", () => {
  test("ranks projects mentioned in the transcript ahead of unrelated notes", () => {
    const transcript = "We should land this in workflows and keep the launchd poller simple.";
    const projects = [
      parseProjectContext("/tmp/workflows.md", `---\nsummary: "Launchd automation for vault maintenance"\n---\n# workflows`),
      parseProjectContext("/tmp/verion.md", `---\nsummary: "Policy review app"\n---\n# verion`),
    ];

    const selected = selectProjectContexts(transcript, projects, 5);

    expect(selected).toHaveLength(1);
    expect(selected[0].title).toBe("workflows");
  });
});

describe("validateInboxNote", () => {
  test("accepts a valid inbox note shape", () => {
    const note = `---\ntype: note\nparent: "[[Home]]"\ncreated: 2026-04-10\nsummary: "Minutes transcript distilled into findings, actions, and merge hints for active Knowledge vault project notes."\ntags: [minutes, meeting]\n---\n# Meeting Summary: Team Sync\n\n## Source\n- Transcript: \`~/.minutes/meetings/team-sync.md\`\n\n## Main Findings\n- Poll every 5 minutes.\n\n## Actions\n- Add the workflow.\n\n## Related Projects\n- [[workflows]] - schedule and prompt home\n\n## Merge Hints\n- [[workflows]] -> \`## Notes\` - captures the new automation design`;

    expect(validateInboxNote(note)).toEqual({ ok: true, errors: [] });
  });

  test("rejects missing required sections", () => {
    const result = validateInboxNote("# Meeting Summary: Broken");
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("missing frontmatter");
    expect(result.errors).toContain("missing section ## Related Projects");
  });
});
