import { TOML } from "bun";
import { resolve, dirname } from "path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import type { Config, RunEntry, Workflow } from "./types";
import { validateConfig } from "./validate";
import { readState, writeState, relativeTime, formatDuration } from "./state";
import { generatePlist } from "./plist";
import { configureScheduledWake, clearScheduledWake, printWakeStatus } from "./wake";

// ── ANSI ───────────────────────────────────────────────────────────

const R = "\x1b[0m";
const c = {
  bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
  bRed: "\x1b[1;31m", bYellow: "\x1b[1;33m",
};

// ── Paths ──────────────────────────────────────────────────────────

const isBundled = import.meta.filename.startsWith("/$bunfs");
const ROOT = isBundled
  ? resolve(dirname(process.execPath), "..")
  : resolve(dirname(import.meta.filename), "..");
const TOML_PATH = resolve(ROOT, "workflows.toml");
const LAUNCH_AGENTS = resolve(homedir(), "Library/LaunchAgents");

const UID =
  process.env.UID ??
  Bun.spawnSync(["id", "-u"], { stdout: "pipe" }).stdout.toString().trim();

// ── launchd helpers ────────────────────────────────────────────────

function loadedLabels(): Set<string> {
  const result = Bun.spawnSync(["launchctl", "list"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const labels = new Set<string>();
  for (const line of result.stdout.toString().split("\n")) {
    const parts = line.split("\t");
    if (parts.length >= 3) labels.add(parts[2]);
  }
  return labels;
}

// ── Config ─────────────────────────────────────────────────────────

function loadConfig(): Config {
  let raw: string;
  try {
    raw = readFileSync(TOML_PATH, "utf-8");
  } catch {
    console.error(`${c.bRed}error${R} config not found: ${TOML_PATH}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = TOML.parse(raw);
  } catch (e) {
    console.error(
      `${c.bRed}error${R} failed to parse config: ${e instanceof Error ? e.message : e}`,
    );
    process.exit(1);
  }

  try {
    return validateConfig(parsed);
  } catch (e) {
    console.error(
      `${c.bRed}error${R} ${e instanceof Error ? e.message : `invalid config: ${e}`}`,
    );
    process.exit(1);
  }
}

function label(cfg: Config, name: string): string {
  return `${cfg.meta.label_prefix}.${name}`;
}

function logDir(cfg: Config): string {
  return resolve(ROOT, cfg.meta.log_dir);
}

function plistDir(cfg: Config): string {
  return resolve(ROOT, cfg.meta.plist_dir);
}

function stateDir(cfg: Config): string {
  return resolve(ROOT, cfg.meta.state_dir);
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ── Formatting helpers ─────────────────────────────────────────────

function weekdayName(d: number): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] ?? String(d);
}

function formatSchedule(
  sched: Config["workflows"][string]["schedule"],
): string {
  const time = `${String(sched.hour ?? 0).padStart(2, "0")}:${String(sched.minute ?? 0).padStart(2, "0")}`;
  const wd = sched.weekday;
  if (wd === undefined) return `daily ${time}`;
  if (typeof wd === "number") return `${weekdayName(wd)} ${time}`;
  return `${wd.map(weekdayName).join(",")} ${time}`;
}

// ── Sorting ────────────────────────────────────────────────────────

type SortKey = "schedule" | "name";
const SORT_KEYS: SortKey[] = ["schedule", "name"];

function scheduleMinutes(wf: Workflow): number {
  return (wf.schedule.hour ?? 0) * 60 + (wf.schedule.minute ?? 0);
}

function sortEntries(
  entries: [string, Workflow][],
  key: SortKey,
): [string, Workflow][] {
  return [...entries].sort((a, b) => {
    switch (key) {
      case "schedule":
        return scheduleMinutes(a[1]) - scheduleMinutes(b[1]);
      case "name":
        return a[0].localeCompare(b[0]);
    }
  });
}

function parseSortFlag(): SortKey {
  const idx = process.argv.indexOf("--sort");
  if (idx === -1) return "schedule";
  const val = process.argv[idx + 1] as SortKey | undefined;
  if (!val || !SORT_KEYS.includes(val)) {
    console.error(
      `${c.bRed}error${R} --sort must be one of: ${SORT_KEYS.join(", ")}`,
    );
    process.exit(1);
  }
  return val;
}

// ── Commands ───────────────────────────────────────────────────────

function cmdList() {
  const cfg = loadConfig();
  const entries = sortEntries(Object.entries(cfg.workflows), parseSortFlag());
  const loaded = loadedLabels();

  console.log("");
  for (const [name, wf] of entries) {
    const lbl = label(cfg, name);
    const registered = loaded.has(lbl);

    const enabledTag = wf.enabled
      ? `${c.green}enabled${R}`
      : `${c.dim}disabled${R}`;
    const registeredTag = registered
      ? `${c.green}registered${R}`
      : `${c.red}not registered${R}`;
    const typeTag = wf.type === "agent"
      ? `${c.cyan}agent${R}`
      : `${c.yellow}script${R}`;
    const sched = formatSchedule(wf.schedule);

    console.log(`  ${c.bold}${name}${R}`);
    console.log(`  ${enabledTag}  ${registeredTag}  ${typeTag}  ${c.dim}${sched}${R}`);
    console.log(`  ${c.dim}${wf.description}${R}`);
    console.log("");
  }
}

async function cmdRun(name: string) {
  const cfg = loadConfig();
  const wf = cfg.workflows[name];
  if (!wf) {
    console.error(
      `${c.bRed}error${R} unknown workflow: ${c.bold}${name}${R}`,
    );
    process.exit(1);
  }

  const sd = stateDir(cfg);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let code: number;

  if (wf.type === "agent") {
    const promptPath = resolve(ROOT, wf.prompt!);
    if (!existsSync(promptPath)) {
      console.error(
        `${c.bRed}error${R} prompt not found: ${promptPath}`,
      );
      process.exit(1);
    }

    const promptText = readFileSync(promptPath, "utf-8");
    console.log("");
    console.log(
      `${c.cyan}>${R} running ${c.bold}${name}${R} ${c.dim}(agent)${R}`,
    );
    const proc = Bun.spawn(["opencode", "run", promptText], {
      stdout: "inherit",
      stderr: "inherit",
      cwd: ROOT,
    });
    code = await proc.exited;
  } else {
    const scriptPath = resolve(ROOT, wf.script!);
    if (!existsSync(scriptPath)) {
      console.error(
        `${c.bRed}error${R} script not found: ${scriptPath}`,
      );
      process.exit(1);
    }

    console.log("");
    console.log(
      `${c.cyan}>${R} running ${c.bold}${name}${R} ${c.dim}(script)${R}`,
    );
    const proc = Bun.spawn(["bun", "run", scriptPath], {
      stdout: "inherit",
      stderr: "inherit",
      cwd: ROOT,
    });
    code = await proc.exited;
  }

  const durationMs = Date.now() - t0;
  const entry: RunEntry = { startedAt, exitCode: code, durationMs };
  const prev = readState(sd, name);
  writeState(sd, name, entry, prev);

  const dur = formatDuration(durationMs);
  if (code === 0) {
    console.log(
      `${c.green}ok${R} ${c.bold}${name}${R} ${c.dim}completed in ${dur}${R}`,
    );
  } else {
    console.error(
      `${c.bRed}failed${R} ${c.bold}${name}${R} ${c.dim}after ${dur}${R}`,
    );
  }
  process.exit(code);
}

function cmdInstall() {
  const cfg = loadConfig();
  const dir = plistDir(cfg);
  const logs = logDir(cfg);
  ensureDir(dir);
  ensureDir(logs);
  ensureDir(stateDir(cfg));

  console.log("");
  let ok = 0;
  let fail = 0;

  for (const [name, wf] of Object.entries(cfg.workflows)) {
    if (!wf.enabled) {
      console.log(
        `  ${c.dim}-${R}  ${name}  ${c.dim}skipped (disabled)${R}`,
      );
      continue;
    }

    const lbl = label(cfg, name);
    const plist = generatePlist(cfg, name, wf, ROOT, logs);
    const localPath = resolve(dir, `${lbl}.plist`);
    const agentPath = resolve(LAUNCH_AGENTS, `${lbl}.plist`);

    writeFileSync(localPath, plist);
    writeFileSync(agentPath, plist);

    Bun.spawnSync(["launchctl", "bootout", `gui/${UID}/${lbl}`], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const result = Bun.spawnSync(
      ["launchctl", "bootstrap", `gui/${UID}`, agentPath],
      { stdout: "ignore", stderr: "pipe" },
    );

    if (result.exitCode === 0) {
      console.log(
        `  ${c.green}+${R}  ${c.bold}${name}${R}  ${c.dim}installed${R}`,
      );
      ok++;
    } else {
      console.log(
        `  ${c.red}x${R}  ${c.bold}${name}${R}  ${c.red}failed to install${R}`,
      );
      fail++;
    }
  }

  configureScheduledWake(cfg);

  console.log("");
  if (fail === 0) {
    console.log(`${c.green}${ok} workflows installed${R}`);
  } else {
    console.log(
      `${c.green}${ok} installed${R}, ${c.red}${fail} failed${R}`,
    );
  }
  console.log("");
}

function cmdUninstall() {
  const cfg = loadConfig();

  console.log("");
  for (const [name] of Object.entries(cfg.workflows)) {
    const lbl = label(cfg, name);
    const agentPath = resolve(LAUNCH_AGENTS, `${lbl}.plist`);

    const bootout = Bun.spawnSync(
      ["launchctl", "bootout", `gui/${UID}/${lbl}`],
      { stdout: "ignore", stderr: "ignore" },
    );
    const wasLoaded = bootout.exitCode === 0;
    const hadPlist = existsSync(agentPath);

    if (hadPlist) unlinkSync(agentPath);

    if (wasLoaded && hadPlist) {
      console.log(
        `  ${c.green}-${R}  ${c.bold}${name}${R}  ${c.dim}removed${R}`,
      );
    } else if (hadPlist) {
      console.log(
        `  ${c.yellow}-${R}  ${c.bold}${name}${R}  ${c.dim}removed (was not active)${R}`,
      );
    } else if (wasLoaded) {
      console.log(
        `  ${c.yellow}-${R}  ${c.bold}${name}${R}  ${c.dim}stopped (no plist found)${R}`,
      );
    } else {
      console.log(
        `  ${c.dim}-${R}  ${name}  ${c.dim}not installed${R}`,
      );
    }
  }

  const dir = plistDir(cfg);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      unlinkSync(resolve(dir, f));
    }
  }

  clearScheduledWake();
  console.log("");
}

function cmdStatus() {
  const cfg = loadConfig();
  const loaded = loadedLabels();
  const sd = stateDir(cfg);
  const entries = sortEntries(Object.entries(cfg.workflows), parseSortFlag());

  console.log("");
  for (const [name, wf] of entries) {
    const lbl = label(cfg, name);
    const registered = loaded.has(lbl);

    const enabledTag = wf.enabled
      ? `${c.green}enabled${R}`
      : `${c.dim}disabled${R}`;
    const activeTag = registered
      ? `${c.green}scheduled${R}`
      : `${c.dim}not scheduled${R}`;

    const state = readState(sd, name);

    let warn = "";
    if (wf.enabled && !registered) {
      warn = `  ${c.bYellow}⚠ enabled but not registered — run wf install${R}`;
    } else if (!wf.enabled && registered) {
      warn = `  ${c.bYellow}⚠ disabled but still registered — run wf uninstall or wf disable ${name}${R}`;
    }

    console.log(`  ${c.bold}${name}${R}  ${enabledTag}  ${activeTag}`);

    if (warn) console.log(warn);

    if (state) {
      const ago = relativeTime(state.lastRun);
      const dur = formatDuration(state.lastDurationMs);
      const healthTag =
        state.lastExitCode === 0
          ? `${c.green}ok${R}`
          : `${c.red}failed${R}`;

      let detail = `  ${c.dim}last run ${ago}${R}  ${healthTag}  ${c.dim}took ${dur}${R}`;

      if (state.consecutiveFailures > 1) {
        detail += `  ${c.bRed}${state.consecutiveFailures} failures in a row${R}`;
      }
      console.log(detail);
    } else {
      console.log(`  ${c.dim}no runs yet${R}`);
    }

    console.log("");
  }

  printWakeStatus();
}

function cmdLogs(name: string) {
  const cfg = loadConfig();
  if (!cfg.workflows[name]) {
    console.error(
      `${c.bRed}error${R} unknown workflow: ${c.bold}${name}${R}`,
    );
    process.exit(1);
  }

  const logs = logDir(cfg);
  const outLog = resolve(logs, `${name}.out.log`);
  const errLog = resolve(logs, `${name}.err.log`);
  let found = false;

  if (existsSync(outLog)) {
    console.log(`\n${c.bold}stdout${R} ${c.dim}${name}${R}\n`);
    console.log(readFileSync(outLog, "utf-8"));
    found = true;
  }
  if (existsSync(errLog)) {
    console.log(`\n${c.bold}stderr${R} ${c.dim}${name}${R}\n`);
    console.log(readFileSync(errLog, "utf-8"));
    found = true;
  }
  if (!found) {
    console.log("");
    console.log(`${c.dim}no logs for ${name}${R}`);
  }
}

function cmdEnable(name: string) {
  const cfg = loadConfig();
  const wf = cfg.workflows[name];
  if (!wf) {
    console.error(
      `${c.bRed}error${R} unknown workflow: ${c.bold}${name}${R}`,
    );
    process.exit(1);
  }

  const lbl = label(cfg, name);
  const logs = logDir(cfg);
  const agentPath = resolve(LAUNCH_AGENTS, `${lbl}.plist`);

  if (!existsSync(agentPath)) {
    ensureDir(logs);
    const plist = generatePlist(cfg, name, wf, ROOT, logs);
    writeFileSync(agentPath, plist);
  }

  Bun.spawnSync(["launchctl", "bootout", `gui/${UID}/${lbl}`], {
    stdout: "ignore",
    stderr: "ignore",
  });
  const result = Bun.spawnSync(
    ["launchctl", "bootstrap", `gui/${UID}`, agentPath],
    { stdout: "ignore", stderr: "pipe" },
  );

  if (result.exitCode === 0) {
    console.log("");
    console.log(
      `${c.green}+${R} ${c.bold}${name}${R} ${c.dim}enabled${R}`,
    );
    configureScheduledWake(cfg);
  } else {
    console.log("");
    console.error(
      `${c.bRed}error${R} failed to enable ${c.bold}${name}${R}`,
    );
    process.exit(1);
  }
}

function cmdDisable(name: string) {
  const cfg = loadConfig();
  if (!cfg.workflows[name]) {
    console.error(
      `${c.bRed}error${R} unknown workflow: ${c.bold}${name}${R}`,
    );
    process.exit(1);
  }

  const lbl = label(cfg, name);
  const result = Bun.spawnSync(
    ["launchctl", "bootout", `gui/${UID}/${lbl}`],
    { stdout: "ignore", stderr: "pipe" },
  );

  if (result.exitCode === 0) {
    console.log("");
    console.log(
      `${c.green}-${R} ${c.bold}${name}${R} ${c.dim}disabled${R}`,
    );
    configureScheduledWake(cfg, name);
  } else {
    console.log("");
    console.error(
      `${c.bYellow}warn${R} ${c.bold}${name}${R} ${c.dim}was not active${R}`,
    );
  }
}

// ── Main ───────────────────────────────────────────────────────────

const B = c.bold, D = c.dim, C = c.cyan;
const USAGE = `
  ${B}wf${R} ${D}— workflow scheduler${R}

  ${B}wf list${R}              ${D}show all workflows${R}
  ${B}wf status${R}            ${D}show runtime health${R}
  ${B}wf run${R} ${C}<name>${R}        ${D}run a workflow now${R}
  ${B}wf logs${R} ${C}<name>${R}       ${D}show logs${R}

  ${B}wf install${R}           ${D}install all into launchd${R}
  ${B}wf uninstall${R}         ${D}remove all from launchd${R}
  ${B}wf enable${R} ${C}<name>${R}      ${D}activate a workflow${R}
  ${B}wf disable${R} ${C}<name>${R}     ${D}deactivate a workflow${R}

  ${D}options${R}
  ${B}--sort${R} ${C}<key>${R}         ${D}sort list/status (schedule, name) [default: schedule]${R}
`;

function requireArg(cmd: string): string {
  const arg = process.argv[3];
  if (!arg) {
    console.error(`${c.bRed}error${R} usage: wf ${cmd} <name>`);
    process.exit(1);
  }
  return arg;
}

const cmd = process.argv[2];

switch (cmd) {
  case "list":    cmdList(); break;
  case "status":  cmdStatus(); break;
  case "install": cmdInstall(); break;
  case "uninstall": cmdUninstall(); break;
  case "run":     await cmdRun(requireArg("run")); break;
  case "logs":    cmdLogs(requireArg("logs")); break;
  case "enable":  cmdEnable(requireArg("enable")); break;
  case "disable": cmdDisable(requireArg("disable")); break;
  default:        console.log(USAGE); break;
}
