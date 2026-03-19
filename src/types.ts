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

export interface CalendarSchedule {
  kind: "calendar";
  time: TimeSpec;
  watchdog?: TimeSpec;
  enabled: boolean;
  workflows: string[];
}

export interface IntervalSchedule {
  kind: "interval";
  interval: number; // seconds
  enabled: boolean;
  workflows: string[];
}

export type ScheduleDef = CalendarSchedule | IntervalSchedule;

// ── Service (long-running daemon) ───────────────────────────────────

export interface Service {
  command: string;
  description: string;
  enabled: boolean;
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
  services: Record<string, Service>;
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
