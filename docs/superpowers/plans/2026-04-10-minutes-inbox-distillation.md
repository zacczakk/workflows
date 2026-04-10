# Minutes Inbox Distillation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically turn each new Minutes transcript markdown file into one raw summary note in `~/Vaults/Knowledge/01_inbox/`.

**Architecture:** Add one interval-driven script workflow that polls `~/.minutes/meetings/`, skips unchanged transcripts, calls OpenCode `github-copilot/gpt-5.4` with a versioned prompt template, validates the returned markdown, and writes one inbox note through the `obsidian` CLI. Keep deterministic work in TypeScript helpers and state files, and keep reasoning in the prompt.

**Tech Stack:** Bun, TypeScript, OpenCode CLI, Obsidian CLI, launchd via existing `wf` schedule runner.

---

## File Map

- Create: `src/minutes-inbox-distillation.ts` — pure helper functions for transcript fingerprinting, filename normalization, project-context parsing, candidate selection, and inbox-note validation.
- Create: `tests/minutes-inbox-distillation.test.ts` — unit coverage for the pure helper module.
- Create: `prompts/minutes-inbox-distillation.md` — versioned LLM instructions and output contract for one transcript -> one inbox note.
- Create: `tests/minutes-prompt-template.test.ts` — guards that the prompt template still contains the required output contract.
- Create: `scripts/minutes-inbox-distillation.ts` — one-shot polling runner invoked by `wf`; discovers ready transcripts, builds prompt input, runs OpenCode, validates output, writes inbox notes, and records processed state.
- Create: `tests/minutes-workflow-config.test.ts` — validates the new workflow + interval schedule from `workflows.toml`.
- Modify: `workflows.toml` — register the new script workflow and 5-minute interval schedule.
- Modify: `README.md` — document the new workflow and operational model.

### Task 1: Add Pure Helper Module And Unit Tests

**Files:**
- Create: `src/minutes-inbox-distillation.ts`
- Create: `tests/minutes-inbox-distillation.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/minutes-inbox-distillation.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test tests/minutes-inbox-distillation.test.ts
```

Expected: FAIL with `Cannot find module '../src/minutes-inbox-distillation'`.

- [ ] **Step 3: Write the minimal helper implementation**

Create `src/minutes-inbox-distillation.ts`:

```ts
import { basename } from "path";

export interface ProjectContext {
  path: string;
  title: string;
  summary: string;
  content: string;
  score: number;
}

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;
const WORD_RE = /[a-z0-9]+/g;
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "this",
  "from",
  "have",
  "will",
  "into",
  "your",
  "about",
  "they",
  "them",
]);

export function fingerprintFor(input: { size: number; mtimeMs: number }): string {
  return `${input.size}:${Math.floor(input.mtimeMs)}`;
}

export function normalizeInboxName(name: string): string {
  const stripped = name.replace(/\.md$/i, "").replace(DATE_PREFIX, "");
  const normalized = stripped.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${normalized || "meeting"}-summary.md`;
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(WORD_RE) ?? [];
  return [...new Set(matches.filter((token) => token.length > 2 && !STOP_WORDS.has(token)))];
}

export function parseProjectContext(path: string, markdown: string): ProjectContext {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? basename(path, ".md");
  const summary = markdown.match(/^summary:\s*["']?(.+?)["']?$/m)?.[1]?.trim() ?? "";
  return { path, title, summary, content: markdown, score: 0 };
}

function scoreProjectContext(transcript: string, project: ProjectContext): number {
  const transcriptText = transcript.toLowerCase();
  const transcriptTokens = new Set(tokenize(transcript));
  let score = 0;

  for (const token of tokenize(project.title)) {
    if (transcriptTokens.has(token)) score += 5;
  }
  for (const token of tokenize(project.summary)) {
    if (transcriptTokens.has(token)) score += 2;
  }

  const stem = basename(project.path, ".md").toLowerCase();
  if (transcriptText.includes(stem)) score += 8;

  return score;
}

export function selectProjectContexts(
  transcript: string,
  projects: ProjectContext[],
  limit = 5,
): ProjectContext[] {
  return projects
    .map((project) => ({ ...project, score: scoreProjectContext(transcript, project) }))
    .filter((project) => project.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export function validateInboxNote(note: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!note.startsWith("---\n")) errors.push("missing frontmatter");
  if (!/type:\s*note/m.test(note)) errors.push("missing type: note");
  if (!/parent:\s*["']?\[\[Home\]\]["']?/m.test(note)) errors.push("missing parent");
  if (!/created:\s*\d{4}-\d{2}-\d{2}/m.test(note)) errors.push("missing created");
  if (!/summary:\s*["']?.{15,}["']?/m.test(note)) errors.push("missing summary");

  const requiredSections = [
    "# Meeting Summary:",
    "## Source",
    "## Main Findings",
    "## Actions",
    "## Related Projects",
    "## Merge Hints",
  ];

  for (const heading of requiredSections) {
    if (!note.includes(heading)) errors.push(`missing section ${heading}`);
  }

  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run:

```bash
bun test tests/minutes-inbox-distillation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the helper module**

Run:

```bash
git add src/minutes-inbox-distillation.ts tests/minutes-inbox-distillation.test.ts
git commit -m "feat: add minutes distillation helpers"
```

### Task 2: Add The Distillation Prompt Template

**Files:**
- Create: `prompts/minutes-inbox-distillation.md`
- Create: `tests/minutes-prompt-template.test.ts`

- [ ] **Step 1: Write the failing prompt-template test**

Create `tests/minutes-prompt-template.test.ts`:

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

test("minutes prompt template defines the markdown output contract", () => {
  const prompt = readFileSync(
    resolve(import.meta.dir, "../prompts/minutes-inbox-distillation.md"),
    "utf-8",
  );

  for (const phrase of [
    "Return only the final markdown note.",
    "## Main Findings",
    "## Actions",
    "## Related Projects",
    "## Merge Hints",
    "Do not invent commitments or facts.",
  ]) {
    expect(prompt).toContain(phrase);
  }
});
```

- [ ] **Step 2: Run the prompt test to verify it fails**

Run:

```bash
bun test tests/minutes-prompt-template.test.ts
```

Expected: FAIL with `ENOENT` because the prompt file does not exist yet.

- [ ] **Step 3: Write the prompt template**

Create `prompts/minutes-inbox-distillation.md`:

```md
# Minutes Inbox Distillation

Create one raw summary note for Phil's Knowledge vault inbox from one Minutes transcript.

## Output Contract

Return only the final markdown note.
Do not wrap it in code fences.
Do not add commentary before or after the note.

## Required Frontmatter

```yaml
---
type: note
parent: "[[Home]]"
created: YYYY-MM-DD
summary: "15-25 word plain-text summary"
tags: [minutes, meeting]
---
```

## Required Sections

- `# Meeting Summary: <title>`
- `## Source`
- `## Main Findings`
- `## Actions`
- `## Related Projects`
- `## Merge Hints`

## Rules

- Summarize facts and decisions, not polished meeting prose.
- Keep the note terse and reviewable.
- Infer related projects only from the project context provided to you.
- Use `[[project-name]]` wikilinks only when the project context clearly supports it.
- Prefer `## Notes` as the merge target unless the transcript strongly points to another section.
- If no project is clearly related, say so plainly in `## Related Projects` and `## Merge Hints`.
- Do not invent commitments or facts.
- Keep diarization discussion out of the meeting content unless it is actually discussed in the transcript.
```

- [ ] **Step 4: Run the prompt test to verify it passes**

Run:

```bash
bun test tests/minutes-prompt-template.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the prompt template**

Run:

```bash
git add prompts/minutes-inbox-distillation.md tests/minutes-prompt-template.test.ts
git commit -m "feat: add minutes distillation prompt"
```

### Task 3: Add The Polling Runner And Register It In `workflows.toml`

**Files:**
- Create: `scripts/minutes-inbox-distillation.ts`
- Create: `tests/minutes-workflow-config.test.ts`
- Modify: `workflows.toml`

- [ ] **Step 1: Write the failing workflow-config test**

Create `tests/minutes-workflow-config.test.ts`:

```ts
import { TOML } from "bun";
import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { validateConfig } from "../src/validate";

test("workflows config includes the minutes inbox distillation schedule", () => {
  const raw = readFileSync(resolve(import.meta.dir, "../workflows.toml"), "utf-8");
  const cfg = validateConfig(TOML.parse(raw));

  expect(cfg.workflows["minutes-inbox-distillation"]).toMatchObject({
    type: "script",
    script: "scripts/minutes-inbox-distillation.ts",
  });

  expect(cfg.schedules["minutes-inbox"]).toMatchObject({
    kind: "interval",
    interval: 300,
    enabled: true,
    workflows: ["minutes-inbox-distillation"],
  });
});
```

- [ ] **Step 2: Run the config test to verify it fails**

Run:

```bash
bun test tests/minutes-workflow-config.test.ts
```

Expected: FAIL because neither the workflow nor the schedule exists yet.

- [ ] **Step 3: Implement the one-shot polling runner**

Create `scripts/minutes-inbox-distillation.ts`:

```ts
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { basename, dirname, resolve } from "path";
import {
  fingerprintFor,
  normalizeInboxName,
  parseProjectContext,
  selectProjectContexts,
  validateInboxNote,
} from "../src/minutes-inbox-distillation";

interface DistillationState {
  processed: Record<string, { fingerprint: string; inboxPath: string; processedAt: string }>;
}

const ROOT = resolve(import.meta.dir, "..");
const MODEL = process.env.MINUTES_DISTILLATION_MODEL ?? "github-copilot/gpt-5.4";
const MEETINGS_DIR = process.env.MINUTES_MEETINGS_DIR ?? resolve(homedir(), ".minutes/meetings");
const STATE_PATH = process.env.MINUTES_STATE_PATH ?? resolve(ROOT, "state/minutes-inbox-distillation.json");
const KNOWLEDGE_ROOT = resolve(homedir(), "Vaults/Knowledge");
const ACTIVE_DIR = resolve(KNOWLEDGE_ROOT, "03_active");
const PROMPT_PATH = resolve(ROOT, "prompts/minutes-inbox-distillation.md");
const STABILIZE_MS = 2_000;

function loadState(): DistillationState {
  if (!existsSync(STATE_PATH)) return { processed: {} };
  return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as DistillationState;
}

function saveState(state: DistillationState): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

function readMarkdown(path: string): string {
  return readFileSync(path, "utf-8").trim();
}

async function stableFingerprint(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;

  const first = statSync(path);
  if (first.size === 0) return null;

  await Bun.sleep(STABILIZE_MS);

  const second = statSync(path);
  if (first.size !== second.size || first.mtimeMs !== second.mtimeMs) return null;

  return fingerprintFor({ size: second.size, mtimeMs: second.mtimeMs });
}

function readProjectIndex(): string {
  return readMarkdown(resolve(ACTIVE_DIR, "projects.md"));
}

function readProjectContexts() {
  return readdirSync(ACTIVE_DIR)
    .filter((name) => name.endsWith(".md") && !name.startsWith("projects"))
    .map((name) => {
      const path = resolve(ACTIVE_DIR, name);
      return parseProjectContext(path, readMarkdown(path));
    });
}

function buildPrompt(
  template: string,
  transcriptPath: string,
  transcriptMarkdown: string,
  projectIndex: string,
  candidateProjects: ReturnType<typeof readProjectContexts>,
): string {
  const projectContext = candidateProjects.length === 0
    ? "No strongly matching project notes were detected."
    : candidateProjects
        .map((project) => `### ${project.title}\nPath: ${project.path}\n\n${project.content}`)
        .join("\n\n");

  return [
    template,
    "## Configuration Facts",
    '- Current best-effort Minutes settings: `embedding_model = "cam++"`, `threshold = 0.58`, `voice.enabled = false`',
    "## Transcript Path",
    `\`${transcriptPath}\``,
    "## Transcript Markdown",
    transcriptMarkdown,
    "## Active Project Index",
    projectIndex,
    "## Candidate Active Project Notes",
    projectContext,
  ].join("\n\n");
}

async function runDistillation(prompt: string): Promise<string> {
  const proc = Bun.spawn(["opencode", "run", "-m", MODEL, prompt], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "inherit",
  });

  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;

  if (code !== 0) {
    throw new Error(`opencode exited ${code}`);
  }

  const markdown = stdout.trim();
  if (markdown.length === 0) {
    throw new Error("opencode returned empty output");
  }

  return markdown;
}

function writeInboxNote(relativePath: string, content: string): void {
  const result = Bun.spawnSync([
    "obsidian",
    "vault=Knowledge",
    "create",
    `path=${relativePath}`,
    `content=${content}`,
    "silent",
    "overwrite",
  ], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString().trim() || `obsidian exited ${result.exitCode}`);
  }
}

const template = readMarkdown(PROMPT_PATH);
const state = loadState();
const projectIndex = readProjectIndex();
const projectContexts = readProjectContexts();

let processed = 0;
let skipped = 0;
let failed = 0;

for (const name of readdirSync(MEETINGS_DIR).filter((entry) => entry.endsWith(".md"))) {
  const transcriptPath = resolve(MEETINGS_DIR, name);

  try {
    const fingerprint = await stableFingerprint(transcriptPath);
    if (!fingerprint) {
      console.log(`${new Date().toISOString()}: skip unstable ${name}`);
      skipped += 1;
      continue;
    }

    if (state.processed[transcriptPath]?.fingerprint === fingerprint) {
      console.log(`${new Date().toISOString()}: skip unchanged ${name}`);
      skipped += 1;
      continue;
    }

    const transcriptMarkdown = readMarkdown(transcriptPath);
    const candidateProjects = selectProjectContexts(transcriptMarkdown, projectContexts, 5);
    const prompt = buildPrompt(
      template,
      transcriptPath,
      transcriptMarkdown,
      projectIndex,
      candidateProjects,
    );
    const inboxMarkdown = await runDistillation(prompt);
    const validation = validateInboxNote(inboxMarkdown);

    if (!validation.ok) {
      throw new Error(`invalid inbox note: ${validation.errors.join(", ")}`);
    }

    const inboxName = normalizeInboxName(basename(transcriptPath));
    const inboxPath = `01_inbox/${inboxName}`;

    writeInboxNote(inboxPath, inboxMarkdown);
    state.processed[transcriptPath] = {
      fingerprint,
      inboxPath,
      processedAt: new Date().toISOString(),
    };
    saveState(state);

    console.log(`${new Date().toISOString()}: processed ${name} -> ${inboxPath}`);
    processed += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${new Date().toISOString()}: failed ${name}: ${message}`);
    failed += 1;
  }
}

console.log(`${new Date().toISOString()}: minutes-inbox-distillation processed=${processed} skipped=${skipped} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 4: Register the workflow in `workflows.toml`**

Add this schedule directly below `[schedules.sessions-export]`:

```toml
[schedules.minutes-inbox]
interval = 300
enabled = true
workflows = ["minutes-inbox-distillation"]
```

Add this workflow directly below `[workflows.sessions-export]`:

```toml
[workflows.minutes-inbox-distillation]
type = "script"
script = "scripts/minutes-inbox-distillation.ts"
description = "Poll Minutes transcripts and write raw Knowledge inbox summary notes"
timeout = 1800
```

- [ ] **Step 5: Run the config test and rebuild `wf`**

Run:

```bash
bun test tests/minutes-workflow-config.test.ts && bun build src/wf.ts --compile --outfile bin/wf
```

Expected: PASS, then successful Bun compile.

- [ ] **Step 6: Run a real one-transcript integration check**

Prepare a temp transcript copy:

```bash
mkdir -p "/tmp/minutes-inbox-distillation"
cp "$HOME/.minutes/meetings/2026-04-09-google-meet-campp-threshold-0-58-voice-off-philipp.md" \
  "/tmp/minutes-inbox-distillation/2026-04-10-team-sync.md"
```

Run the script once against the temp transcript dir:

```bash
MINUTES_MEETINGS_DIR="/tmp/minutes-inbox-distillation" \
MINUTES_STATE_PATH="/tmp/minutes-inbox-distillation/state.json" \
bun run scripts/minutes-inbox-distillation.ts
```

Expected:
- stdout includes `processed 2026-04-10-team-sync.md -> 01_inbox/team-sync-summary.md`
- `~/Vaults/Knowledge/01_inbox/team-sync-summary.md` exists and contains the required sections

Run the same command again.

Expected:
- stdout includes `skip unchanged 2026-04-10-team-sync.md`
- no duplicate inbox note is created

- [ ] **Step 7: Commit the workflow**

Run:

```bash
git add scripts/minutes-inbox-distillation.ts tests/minutes-workflow-config.test.ts workflows.toml
git commit -m "feat: add minutes inbox distillation workflow"
```

### Task 4: Document The New Workflow And Final Verification Path

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README workflow tables and setup notes**

Add this row under `### Sessions export (every 30 minutes)` or split the section into interval workflows:

```md
| `minutes-inbox-distillation` | script | 30m | Poll `~/.minutes/meetings` every 5 minutes and create one raw summary note per transcript in `Knowledge/01_inbox` |
```

Add a short configuration note near the configuration section:

```md
Environment overrides for manual testing:

- `MINUTES_MEETINGS_DIR` — alternate transcript directory
- `MINUTES_STATE_PATH` — alternate processed-state path
- `MINUTES_DISTILLATION_MODEL` — override default `github-copilot/gpt-5.4`
```

- [ ] **Step 2: Rebuild and verify the new schedule shows up in `wf list`**

Run:

```bash
bun build src/wf.ts --compile --outfile bin/wf && ./bin/wf list
```

Expected:
- output contains `minutes-inbox`
- output shows `minutes-inbox-distillation` as a script workflow

- [ ] **Step 3: Run the focused test suite as the final gate**

Run:

```bash
bun test tests/minutes-inbox-distillation.test.ts tests/minutes-prompt-template.test.ts tests/minutes-workflow-config.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the docs update**

Run:

```bash
git add README.md
git commit -m "docs: add minutes inbox distillation workflow"
```

## Spec Coverage Check

- New transcripts in `~/.minutes/meetings/` -> covered by Task 3 polling runner.
- One inbox note per transcript -> covered by Task 3 note creation + unchanged-skip verification.
- Related-project inference from Knowledge vault context -> covered by Task 1 project selection helpers + Task 3 prompt-building context.
- Merge hints in the note body -> covered by Task 2 prompt contract + Task 3 validation.
- Raw summary note shape with minimal frontmatter -> covered by Task 2 prompt contract + Task 1 validation.
- Best-effort Minutes settings used as context only -> covered by Task 3 `buildPrompt` configuration facts.
- No daemon/watcher; launchd-friendly poller -> covered by Task 3 `workflows.toml` interval schedule.

## Placeholder Scan

- No `TODO`, `TBD`, or omitted file paths remain.
- Every created or modified file is named explicitly.
- Every verification step has an exact command and expected outcome.

## Type Consistency Check

- `scripts/minutes-inbox-distillation.ts` imports helper names exactly as defined in `src/minutes-inbox-distillation.ts`.
- `workflows.toml` uses `type = "script"`, which matches `validate.ts` constraints.
- Note validation headings match the prompt template headings exactly.
