import type { Config } from "./types";

// ── ANSI ───────────────────────────────────────────────────────────

const R = "\x1b[0m";
const c = {
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  bYellow: "\x1b[1;33m",
};

// ── Schedule math ──────────────────────────────────────────────────

function earliestMinute(cfg: Config): number | null {
  let earliest: number | null = null;
  for (const sched of Object.values(cfg.schedules)) {
    if (!sched.enabled) continue;
    const mins = sched.time.hour * 60 + sched.time.minute;
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

export function currentRepeatWake(): string | null {
  const result = Bun.spawnSync(["pmset", "-g", "sched"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = result.stdout.toString();
  const match = output.match(
    /Repeating power events:\s*\n\s*wake(?:or)?poweron\s+at\s+(.+?\S)\s+(.+)/,
  );
  return match ? `${match[1]} ${match[2].trim()}` : null;
}

// ── Public API ─────────────────────────────────────────────────────

export function configureScheduledWake(cfg: Config): void {
  const earliest = earliestMinute(cfg);

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
    console.log(`  ${c.green}⏰${R} scheduled wake ${c.dim}${time} daily${R}`);
  } else {
    console.log(
      `  ${c.bYellow}warn${R} failed to set scheduled wake: ${c.dim}${stderr}${R}`,
    );
  }
}

export function clearScheduledWake(): void {
  const { ok } = runSudo(["pmset", "repeat", "cancel"]);
  if (ok) {
    console.log(`  ${c.green}-${R} ${c.dim}cleared scheduled wake${R}`);
  }
}

export function printWakeStatus(): void {
  const current = currentRepeatWake();
  if (current) {
    console.log(`  ${c.green}⏰${R} ${c.dim}scheduled wake: ${current}${R}`);
  } else {
    console.log(
      `  ${c.yellow}⏰${R} ${c.dim}no scheduled wake configured — workflows may miss during sleep${R}`,
    );
  }
  console.log("");
}
