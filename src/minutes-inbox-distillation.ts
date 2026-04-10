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
