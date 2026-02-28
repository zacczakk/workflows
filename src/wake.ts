import type { Config } from "./types";

// ── ANSI (shared subset) ───────────────────────────────────────────

const R = "\x1b[0m";
const c = {
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  bRed: "\x1b[1;31m",
  bYellow: "\x1b[1;33m",
};

// ── Schedule math ──────────────────────────────────────────────────

function earliestMinute(cfg: Config, exclude?: string): number | null {
  let earliest: number | null = null;
  for (const [name, wf] of Object.entries(cfg.workflows)) {
    if (!wf.enabled || name === exclude) continue;
    const mins = (wf.schedule.hour ?? 0) * 60 + (wf.schedule.minute ?? 0);
    if (earliest === null || mins < earliest) earliest = mins;
  }
  return earliest;
}

function wakeTime(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

// ── pmset helpers ──────────────────────────────────────────────────

function runSudo(args: string[]): { ok: boolean; stderr: string } {
  const result = Bun.spawnSync(["sudo", ...args], {
    stdout: "ignore",
    stderr: "pipe",
  });
  return {
    ok: result.exitCode === 0,
    stderr: result.stderr.toString().trim(),
  };
}

/** Read current `pmset repeat` schedule, if any. */
export function currentRepeatWake(): string | null {
  const result = Bun.spawnSync(["pmset", "-g", "sched"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = result.stdout.toString();
  const match = output.match(
    /Repeating power events:\s*\n\s*wakeorpoweron\s+at\s+(\d{2}:\d{2}:\d{2})\s+(.+)/,
  );
  return match ? `${match[1]} ${match[2].trim()}` : null;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Set `pmset repeat wakeorpoweron` to LEAD_MINUTES before the earliest
 * enabled workflow schedule. Clears if no enabled workflows.
 */
export function configureScheduledWake(cfg: Config, exclude?: string): void {
  const earliest = earliestMinute(cfg, exclude);

  if (earliest === null) {
    clearScheduledWake();
    return;
  }

  const time = wakeTime(earliest);
  const { ok, stderr } = runSudo([
    "pmset",
    "repeat",
    "wakeorpoweron",
    "MTWRFSU",
    time,
  ]);

  if (ok) {
    console.log(
      `  ${c.green}⏰${R} scheduled wake ${c.dim}${time} daily${R}`,
    );
  } else {
    console.log(
      `  ${c.bYellow}warn${R} failed to set scheduled wake: ${c.dim}${stderr}${R}`,
    );
  }
}

/** Clear any `pmset repeat` schedule. */
export function clearScheduledWake(): void {
  const { ok } = runSudo(["pmset", "repeat", "cancel"]);
  if (ok) {
    console.log(`  ${c.green}-${R} ${c.dim}cleared scheduled wake${R}`);
  }
}

/** Print current wake schedule for status display. */
export function printWakeStatus(): void {
  const current = currentRepeatWake();
  if (current) {
    console.log(
      `  ${c.green}⏰${R} ${c.dim}scheduled wake: ${current}${R}`,
    );
  } else {
    console.log(
      `  ${c.yellow}⏰${R} ${c.dim}no scheduled wake configured — workflows may miss during sleep${R}`,
    );
  }
  console.log("");
}
