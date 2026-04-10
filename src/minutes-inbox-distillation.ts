import { basename } from "path";

export interface ProjectContext {
  path: string;
  title: string;
  summary: string;
  content: string;
  score: number;
}

export interface DistillationStateLike {
  processed: Record<string, { fingerprint: string; inboxPath: string; processedAt: string }>;
}

const WORD_RE = /[a-z0-9]+/g;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
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
  const stripped = name.replace(/\.md$/i, "");
  const normalized = stripped.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (DATE_ONLY.test(normalized)) return `${normalized}-meeting-summary.md`;
  return `${normalized || "meeting"}-summary.md`;
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(WORD_RE) ?? [];
  return [...new Set(matches.filter((token) => token.length > 2 && !STOP_WORDS.has(token)))];
}

export function parseProjectLinks(markdown: string): string[] {
  const links = markdown.match(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g) ?? [];
  return [...new Set(links.map((link) => link.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].split("#")[0].trim().toLowerCase()))];
}

export function parseProjectContext(path: string, markdown: string): ProjectContext {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? basename(path, ".md");
  const summary = markdown.match(/^summary:\s*["']?(.+?)["']?$/m)?.[1]?.trim() ?? "";
  return { path, title, summary, content: markdown, score: 0 };
}

function scoreProjectContext(transcript: string, project: ProjectContext): number {
  const transcriptText = transcript.toLowerCase();
  const transcriptTokens = new Set(tokenize(transcript));
  const projectTokens = new Set(tokenize(`${project.title} ${project.summary} ${project.content}`));
  let score = 0;

  for (const token of tokenize(project.title)) {
    if (transcriptTokens.has(token)) score += 5;
  }
  for (const token of tokenize(project.summary)) {
    if (transcriptTokens.has(token)) score += 2;
  }

  const stem = basename(project.path, ".md").toLowerCase();
  if (transcriptText.includes(stem)) score += 8;

  for (const token of transcriptTokens) {
    if (projectTokens.has(token)) score += 1;
  }

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
  const frontmatter = note.match(/^---\n[\s\S]*?\n---\n/);

  if (!frontmatter) {
    errors.push("missing frontmatter");
  } else {
    const block = frontmatter[0];
    if (!/\ntype:\s*note\s*(?:\n|$)/.test(block)) errors.push("missing type: note");
    if (!/\nparent:\s*["']?\[\[Home\]\]["']?\s*(?:\n|$)/.test(block)) errors.push("missing parent");
    if (!/\ncreated:\s*\d{4}-\d{2}-\d{2}\s*(?:\n|$)/.test(block)) errors.push("missing created");
    if (!/\nsummary:\s*["']?.{15,}["']?\s*(?:\n|$)/.test(block)) errors.push("missing summary");
  }

  const requiredSections = [
    /^# Meeting Summary:/m,
    /^## Source$/m,
    /^## Main Findings$/m,
    /^## Actions$/m,
    /^## Related Projects$/m,
    /^## Merge Hints$/m,
  ];

  for (const heading of requiredSections) {
    if (!heading.test(note)) errors.push(`missing section ${heading.source.replace(/[\^$]/g, "")}`);
  }

  return { ok: errors.length === 0, errors };
}

export function seedExistingTranscripts(
  transcriptPaths: string[],
  nowMs: number,
  fingerprintByPath: Record<string, string>,
): DistillationStateLike {
  const processed = Object.fromEntries(
    transcriptPaths.map((path) => [
      path,
      {
        fingerprint: fingerprintByPath[path] ?? "",
        inboxPath: "",
        processedAt: new Date(nowMs).toISOString(),
      },
    ]),
  );

  return { processed };
}
