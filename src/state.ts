import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, openSync, closeSync } from "fs";
import { resolve } from "path";
import type { RunEntry, RunState } from "./types";

const MAX_HISTORY = 10;

export function readState(stateDir: string, name: string): RunState | null {
  const path = resolve(stateDir, `${name}.json`);
  if (!existsSync(path)) return null;
  try {
    const data: unknown = JSON.parse(readFileSync(path, "utf-8"));
    if (!isRunState(data)) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeState(
  stateDir: string,
  name: string,
  entry: RunEntry,
  prev: RunState | null,
): void {
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });

  const failures =
    entry.exitCode !== 0
      ? (prev?.consecutiveFailures ?? 0) + 1
      : 0;

  const history = [entry, ...(prev?.history ?? [])].slice(0, MAX_HISTORY);

  const state: RunState = {
    lastRun: entry.startedAt,
    lastExitCode: entry.exitCode,
    lastDurationMs: entry.durationMs,
    consecutiveFailures: failures,
    history,
    lastSuccess: entry.exitCode === 0 ? entry.startedAt : prev?.lastSuccess ?? prev?.history.find((run) => run.exitCode === 0)?.startedAt,
  };

  atomicWrite(resolve(stateDir, `${name}.json`), JSON.stringify(state, null, 2) + "\n");
}

export function lastSuccessDate(stateDir: string, name: string): Date | null {
  const state = readState(stateDir, name);
  if (!state) return null;
  if (state.lastSuccess) return new Date(state.lastSuccess);
  for (const entry of state.history) {
    if (entry.exitCode === 0) return new Date(entry.startedAt);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRunEntry(value: unknown): value is RunEntry {
  return isRecord(value) && typeof value.startedAt === "string" && typeof value.exitCode === "number" && typeof value.durationMs === "number";
}

function isRunState(value: unknown): value is RunState {
  return isRecord(value) && typeof value.lastRun === "string" && typeof value.lastExitCode === "number" && typeof value.lastDurationMs === "number" && typeof value.consecutiveFailures === "number" && Array.isArray(value.history) && value.history.every(isRunEntry) && (value.lastSuccess === undefined || typeof value.lastSuccess === "string");
}

export function atomicWrite(path: string, text: string): void {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, text);
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function acquireLock(directory: string, name: string): (() => void) | null {
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, `${name}.lock`);
  if (existsSync(path)) {
    const pid = Number(readFileSync(path, "utf8"));
    try {
      process.kill(pid, 0);
      return null;
    } catch (error) {
      if (!isRecord(error) || error.code !== "ESRCH") return null;
      unlinkSync(path);
    }
  }
  try {
    const file = openSync(path, "wx");
    writeFileSync(file, String(process.pid));
    closeSync(file);
  } catch {
    return null;
  }
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    if (existsSync(path)) unlinkSync(path);
  };
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m${s}s` : `${m}m`;

  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h${rm}m` : `${h}h`;
}
