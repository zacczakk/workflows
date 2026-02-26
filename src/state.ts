import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import type { RunEntry, RunState } from "./types";

const MAX_HISTORY = 10;

export function readState(stateDir: string, name: string): RunState | null {
  const path = resolve(stateDir, `${name}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as RunState;
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
  };

  writeFileSync(resolve(stateDir, `${name}.json`), JSON.stringify(state, null, 2) + "\n");
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
