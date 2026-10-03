import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Config, Workflow } from "./types";
import { acquireLock, formatDuration, lastSuccessDate, readState, writeState } from "./state";
import { createSession, interruptSession, sessionOutcome } from "./opencode";
import { prepareBacklog, commitBacklog } from "./backlog";
import { descendants, signalProcesses } from "./process";
import { notifyFailure } from "./notify";

export function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function outputPath(root: string, path: string, date: string): string {
  return resolve(root, path.replace(/^~\//, `${homedir()}/`).replaceAll("{date}", date));
}

function archiveHealthy(): boolean {
  try {
    const value: unknown = JSON.parse(readFileSync(resolve(homedir(), ".local/share/sessions/archive-health.json"), "utf8"));
    if (typeof value !== "object" || value === null || !("completedAt" in value) || !("indexed" in value) || !("sources" in value) || !("failures" in value) || !("fullCoverage" in value) || value.fullCoverage !== true) return false;
    const sources = value.sources;
    return typeof value.completedAt === "string" && Date.now() - Date.parse(value.completedAt) >= 0 && Date.now() - Date.parse(value.completedAt) < 86_400_000 && value.indexed === true && Array.isArray(sources) && ["opencode", "claude", "codex"].every((source) => sources.includes(source)) && Array.isArray(value.failures) && value.failures.length === 0;
  } catch {
    return false;
  }
}

async function runWorkflow(cfg: Config, root: string, name: string, wf: Workflow, date: string): Promise<number> {
  const directory = resolve(root, cfg.meta.state_dir);
  const unlock = acquireLock(directory, name);
  if (!unlock) { console.error(`busy ${name}: already running`); return 1; }
  const startedAt = new Date().toISOString();
  const started = Date.now();
  let code = 1;
  let sessionId: string | undefined;
  let proc: ReturnType<typeof Bun.spawn> | undefined;
  let interrupted = false;
  let children: number[] = [];
  const outputs = (wf.outputs ?? []).map((path) => outputPath(root, path, date));
  const terminate = () => {
    if (!proc) return;
    children = descendants(proc.pid);
    signalProcesses(children, "SIGTERM");
    proc.kill("SIGTERM");
  };
  const interrupt = () => { interrupted = true; terminate(); };
  process.prependListener("SIGTERM", interrupt);
  process.prependListener("SIGINT", interrupt);
  try {
    console.log(`\n> running ${name} (${wf.type})`);
    const env = { ...process.env, WF_RUN_DATE: date, WF_ARCHIVE_HEALTHY: archiveHealthy() ? "1" : "0", WF_ROOT: root, WF_STATE_DIR: directory };
    if (name === "vault-consolidation" && env.WF_ARCHIVE_HEALTHY !== "1") throw new Error("Consolidation paused: complete archive export and indexes first");
    const selection = name === "vault-backlog-triage" ? prepareBacklog(directory, date) : undefined;
    let args: string[];
    if (wf.type === "agent") {
      if (!wf.prompt) throw new Error("Missing agent prompt");
      sessionId = await createSession(root, name, wf.model);
      const prompt = readFileSync(resolve(root, wf.prompt), "utf8");
      args = ["opencode", "run", "--session", sessionId];
      if (wf.model) args.push("-m", wf.model);
      args.push(`Run date: ${date}. Archive cleanup authorized: ${env.WF_ARCHIVE_HEALTHY === "1"}. Use this date for all reports. Workflow state directory: ${directory}. Backlog selection file: ${resolve(directory, "backlog-selection.json")}. Read these exact paths; shared-server shells may not inherit WF environment variables. Required outputs: ${outputs.join(", ") || "none"}. ${env.WF_ARCHIVE_HEALTHY !== "1" ? "Retain all session notes; archive health is unproven." : ""}\n\n${prompt}`);
      console.log(`session ${sessionId} model ${wf.model}`);
    } else {
      if (!wf.script) throw new Error("Missing script path");
      args = ["bun", "run", resolve(root, wf.script)];
    }
    if (interrupted) throw new Error("Workflow interrupted before launch");
    proc = Bun.spawn(args, { stdout: "inherit", stderr: "inherit", cwd: root, env });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; terminate(); }, (wf.timeout ?? cfg.meta.default_timeout ?? 3600) * 1000);
    const hardTimer = setTimeout(() => { signalProcesses(children, "SIGKILL"); proc?.kill("SIGKILL"); }, (wf.timeout ?? cfg.meta.default_timeout ?? 3600) * 1000 + 5000);
    try { code = await proc.exited; } finally { clearTimeout(timer); clearTimeout(hardTimer); }
    if (timedOut || interrupted) {
      signalProcesses(children, "SIGKILL");
      if (sessionId) await interruptSession(sessionId);
      throw new Error(interrupted ? "Workflow interrupted" : "Workflow timed out");
    }
    if (sessionId) {
      const outcome = await sessionOutcome(sessionId);
      if (outcome !== "succeeded") throw new Error(`OpenCode session outcome: ${outcome}`);
      if (code !== 0) console.warn(`Completed session ${sessionId}; CLI returned ${code}`);
      code = 0;
    }
    if (code === 0) {
      for (const path of outputs) {
        if (!existsSync(path) || statSync(path).mtimeMs < started || statSync(path).size === 0) throw new Error(`Required output missing or stale: ${path}`);
      }
      if (selection) {
        const manifest = resolve(directory, "backlog-completion.json");
        if (!existsSync(manifest) || statSync(manifest).mtimeMs < started) throw new Error("Backlog completion manifest missing or stale");
        commitBacklog(directory, selection);
      }
    }
  } catch (error) {
    code = 1;
    console.error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    process.off("SIGTERM", interrupt);
    process.off("SIGINT", interrupt);
    try {
      writeState(directory, name, { startedAt, exitCode: code, durationMs: Date.now() - started, sessionId }, readState(directory, name));
    } finally { unlock(); }
  }
  const duration = formatDuration(Date.now() - started);
  if (code === 0) console.log(`ok ${name} completed in ${duration}`);
  else notifyFailure(name, `Failed after ${duration}; inspect wf logs`);
  return code;
}

export async function run(cfg: Config, root: string, name: string): Promise<number> {
  const schedule = cfg.schedules[name];
  if (!schedule && !cfg.workflows[name]) throw new Error(`Unknown workflow or schedule: ${name}`);
  const directory = resolve(root, cfg.meta.state_dir);
  const unlock = acquireLock(directory, `schedule-${name}`);
  if (!unlock) throw new Error(`${name} is already running`);
  let sleepingDisabled = false;
  let restoreFailed = false;
  if (schedule?.prevent_sleep) {
    const result = Bun.spawnSync(["sudo", "-n", "/usr/bin/pmset", "-a", "disablesleep", "1"], { stdout: "ignore", stderr: "pipe" });
    sleepingDisabled = result.exitCode === 0;
    if (!sleepingDisabled) { unlock(); throw new Error("Cannot prevent sleep; repair passwordless pmset permission"); }
  }
  const cleanup = () => {
    if (sleepingDisabled) {
      const result = Bun.spawnSync(["sudo", "-n", "/usr/bin/pmset", "-a", "disablesleep", "0"], { stdout: "ignore", stderr: "pipe" });
      if (result.exitCode !== 0) {
        restoreFailed = true;
        notifyFailure(name, "Failed to restore sleep; run sudo pmset -a disablesleep 0");
      }
      sleepingDisabled = false;
    }
    unlock();
  };
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  const outcomes = new Map<string, number>();
  let failed = 0;
  let passed = 0;
  let skipped = 0;
  const started = Date.now();
  const date = localDate();
  console.log(`\n${name} started ${new Date().toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
  try {
    for (const workflow of schedule?.workflows ?? [name]) {
      if (stopped) { failed++; break; }
      const wf = cfg.workflows[workflow];
      if (schedule && wf.depends_on?.some((dependency) => outcomes.get(dependency) !== 0)) {
        console.log(`skip ${workflow}: dependency failed`);
        outcomes.set(workflow, 1); failed++; continue;
      }
      const last = lastSuccessDate(directory, workflow);
      if (schedule && wf.cadence_days && last && Date.now() - last.getTime() < wf.cadence_days * 86_400_000) {
        console.log(`skip ${workflow}: cadence ${wf.cadence_days}d`);
        outcomes.set(workflow, 0); skipped++; continue;
      }
      const code = await runWorkflow(cfg, root, workflow, wf, date);
      outcomes.set(workflow, code);
      if (code === 0) passed++; else failed++;
    }
  } finally {
    process.off("SIGTERM", stop); process.off("SIGINT", stop);
    cleanup();
  }
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped in ${formatDuration(Date.now() - started)}`);
  return stopped ? 143 : failed > 0 || restoreFailed ? 1 : 0;
}
