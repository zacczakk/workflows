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
