// ── Time ────────────────────────────────────────────────────────────

export interface TimeSpec {
  hour: number;
  minute: number;
}

// ── Workflow ────────────────────────────────────────────────────────

export interface Workflow {
  type: "agent" | "script";
  prompt?: string;
  script?: string;
  model?: string;
  description: string;
  timeout?: number;
  cadence_days?: number;
}

// ── Schedule ────────────────────────────────────────────────────────

export interface ScheduleDef {
  time: TimeSpec;
  watchdog?: TimeSpec;
  enabled: boolean;
  workflows: string[];
}

// ── Config ──────────────────────────────────────────────────────────

export interface Config {
  meta: {
    label_prefix: string;
    log_dir: string;
    plist_dir: string;
    state_dir: string;
    default_timeout?: number;
  };
  workflows: Record<string, Workflow>;
  schedules: Record<string, ScheduleDef>;
}

// ── Run state ───────────────────────────────────────────────────────

export interface RunEntry {
  startedAt: string;
  exitCode: number;
  durationMs: number;
}

export interface RunState {
  lastRun: string;
  lastExitCode: number;
  lastDurationMs: number;
  consecutiveFailures: number;
  history: RunEntry[];
}
