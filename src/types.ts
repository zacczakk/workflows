// ── Schedule ────────────────────────────────────────────────────────

export interface Schedule {
  hour?: number;
  minute?: number;
  month?: number;
  day?: number;
  weekday?: number | number[];
}

// ── Workflow ────────────────────────────────────────────────────────

export interface Workflow {
  type: "agent" | "script";
  prompt?: string;
  script?: string;
  description: string;
  enabled: boolean;
  timeout?: number;
  schedule: Schedule;
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
