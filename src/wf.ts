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
import { readState, writeState, relativeTime, formatDuration, lastSuccessDate } from "./state";
import {
  generateRunnerPlist,
  generateWatchdogPlist,
  scheduleRunnerLabel,
  scheduleWatchdogLabel,
} from "./plist";
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

// ── Environment ────────────────────────────────────────────────────

// Capture full login-shell PATH so all child processes (including
// subagent shells that don't source .zprofile) inherit it.
const loginPath = Bun.spawnSync(["/bin/zsh", "-lc", "echo $PATH"], {
  stdout: "pipe", stderr: "ignore",
}).stdout.toString().trim();

if (loginPath) process.env.PATH = loginPath;

// ── launchd helpers ────────────────────────────────────────────────

function loadedLabels(): Set<string> {
  const result = Bun.spawnSync(["launchctl", "list"], {
    stdout: "pipe", stderr: "ignore",
  });
  const labels = new Set<string>();
  for (const line of result.stdout.toString().split("\n")) {
    const parts = line.split("\t");
    if (parts.length >= 3) labels.add(parts[2]);
  }
  return labels;
}

function bootoutLabel(lbl: string) {
  Bun.spawnSync(["launchctl", "bootout", `gui/${UID}/${lbl}`], {
    stdout: "ignore", stderr: "ignore",
  });
}

function bootstrapPlist(agentPath: string): boolean {
  const r = Bun.spawnSync(
    ["launchctl", "bootstrap", `gui/${UID}`, agentPath],
    { stdout: "ignore", stderr: "pipe" },
  );
  return r.exitCode === 0;
}

// ── Sleep management ───────────────────────────────────────────────

function disableSleep(): boolean {
  const r = Bun.spawnSync(
    ["sudo", "-n", "/usr/bin/pmset", "-a", "disablesleep", "1"],
    { stdout: "ignore", stderr: "pipe" },
  );
  if (r.exitCode !== 0) {
    console.error(
      `${c.bYellow}warn${R} ${c.dim}failed to disable sleep — sudo pmset not configured?${R}`,
    );
    return false;
  }
  return true;
}

function enableSleep() {
  Bun.spawnSync(
    ["sudo", "-n", "/usr/bin/pmset", "-a", "disablesleep", "0"],
    { stdout: "ignore", stderr: "ignore" },
  );
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

// ── Formatting ─────────────────────────────────────────────────────

function fmtTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Workflow execution ─────────────────────────────────────────────

const KILL_GRACE = 5_000;

async function runWorkflow(
  cfg: Config,
  name: string,
  wf: Workflow,
): Promise<number> {
  const sd = stateDir(cfg);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const timeout = (wf.timeout ?? cfg.meta.default_timeout ?? 3600) * 1000;

  let proc: ReturnType<typeof Bun.spawn>;

  if (wf.type === "agent") {
    const promptPath = resolve(ROOT, wf.prompt!);
    if (!existsSync(promptPath)) {
      console.error(`${c.bRed}error${R} prompt not found: ${promptPath}`);
      return 1;
    }

    const promptText = readFileSync(promptPath, "utf-8");
    const args = ["opencode", "run"];
    if (wf.model) args.push("-m", wf.model);
    args.push(promptText);

    console.log(`\n${c.cyan}>${R} running ${c.bold}${name}${R} ${c.dim}(agent)${R}`);
    proc = Bun.spawn(args, { stdout: "inherit", stderr: "inherit", cwd: ROOT });
  } else {
    const scriptPath = resolve(ROOT, wf.script!);
    if (!existsSync(scriptPath)) {
      console.error(`${c.bRed}error${R} script not found: ${scriptPath}`);
      return 1;
    }

    console.log(`\n${c.cyan}>${R} running ${c.bold}${name}${R} ${c.dim}(script)${R}`);
    proc = Bun.spawn(["bun", "run", scriptPath], {
      stdout: "inherit", stderr: "inherit", cwd: ROOT,
    });
  }

  const timedOut = await Promise.race([
    proc.exited.then(() => false),
    new Promise<true>((r) => setTimeout(() => r(true), timeout)),
  ]);

  if (timedOut) {
    console.error(
      `${c.bYellow}timeout${R} ${c.bold}${name}${R} ${c.dim}exceeded ${formatDuration(timeout)} — sending SIGTERM${R}`,
    );
    proc.kill("SIGTERM");
    const killed = await Promise.race([
      proc.exited.then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), KILL_GRACE)),
    ]);
    if (!killed) {
      console.error(
        `${c.bRed}timeout${R} ${c.bold}${name}${R} ${c.dim}did not exit — sending SIGKILL${R}`,
      );
      proc.kill("SIGKILL");
      await proc.exited;
    }
  }

  const code = proc.exitCode ?? 143;
  const durationMs = Date.now() - t0;
  const entry: RunEntry = { startedAt, exitCode: code, durationMs };
  writeState(sd, name, entry, readState(sd, name));

  const dur = formatDuration(durationMs);
  if (code === 0) {
    console.log(`${c.green}ok${R} ${c.bold}${name}${R} ${c.dim}completed in ${dur}${R}`);
  } else {
    console.error(`${c.bRed}failed${R} ${c.bold}${name}${R} ${c.dim}after ${dur}${R}`);
  }

  return code;
}

// ── Commands ───────────────────────────────────────────────────────

function cmdList() {
  const cfg = loadConfig();

  console.log("");
  for (const [name, sched] of Object.entries(cfg.schedules)) {
    const enabledTag = sched.enabled
      ? `${c.green}enabled${R}`
      : `${c.dim}disabled${R}`;
    const time = fmtTime(sched.time.hour, sched.time.minute);

    console.log(`  ${c.bold}${name}${R}  ${enabledTag}  ${c.dim}${time}${R}`);
    for (const wfName of sched.workflows) {
      const wf = cfg.workflows[wfName];
      const typeTag = wf.type === "agent" ? `${c.cyan}agent${R}` : `${c.yellow}script${R}`;
      const dur = wf.timeout ? formatDuration(wf.timeout * 1000) : "default";
      console.log(`    ${c.dim}→${R} ${wfName}  ${typeTag}  ${c.dim}timeout ${dur}${R}`);
    }
    console.log("");
  }
}

async function cmdRun(name: string) {
  const cfg = loadConfig();
  const sched = cfg.schedules[name];

  // Schedule name → run all workflows in that schedule
  if (sched) {
    const t0 = Date.now();
    const sleepDisabled = disableSleep();
    const cleanup = () => { if (sleepDisabled) enableSleep(); };

    process.on("SIGTERM", () => { cleanup(); process.exit(143); });
    process.on("SIGINT", () => { cleanup(); process.exit(130); });
    process.on("SIGHUP", () => { cleanup(); process.exit(129); });

    console.log(`\n${c.bold}${name}${R} ${c.dim}${sched.workflows.length} workflows${R}`);

    let passed = 0;
    let failed = 0;

    try {
      for (const wfName of sched.workflows) {
        const wf = cfg.workflows[wfName];
        if (wf.cadence_days) {
          const last = lastSuccessDate(stateDir(cfg), wfName);
          if (last) {
            const daysSince = (Date.now() - last.getTime()) / 86_400_000;
            if (daysSince < wf.cadence_days) {
              console.log(
                `\n${c.dim}skip${R} ${c.bold}${wfName}${R} ${c.dim}cadence ${wf.cadence_days}d, last success ${relativeTime(last.toISOString())}${R}`,
              );
              passed++;
              continue;
            }
          }
        }
        const code = await runWorkflow(cfg, wfName, wf);
        if (code === 0) passed++;
        else failed++;
      }
    } finally {
      cleanup();
    }

    const dur = formatDuration(Date.now() - t0);
    console.log("");
    if (failed === 0) {
      console.log(`${c.green}all ${passed} workflows passed${R} ${c.dim}in ${dur}${R}`);
    } else {
      console.log(
        `${c.green}${passed} passed${R}, ${c.bRed}${failed} failed${R} ${c.dim}in ${dur}${R}`,
      );
    }

    process.exit(failed > 0 ? 1 : 0);
  }

  // Workflow name → run single workflow
  const wf = cfg.workflows[name];
  if (!wf) {
    console.error(`${c.bRed}error${R} unknown schedule or workflow: ${c.bold}${name}${R}`);
    process.exit(1);
  }

  const sleepDisabled = disableSleep();
  const cleanup = () => { if (sleepDisabled) enableSleep(); };

  process.on("SIGTERM", () => { cleanup(); process.exit(143); });
  process.on("SIGINT", () => { cleanup(); process.exit(130); });
  process.on("SIGHUP", () => { cleanup(); process.exit(129); });

  let code: number;
  try {
    code = await runWorkflow(cfg, name, wf);
  } finally {
    cleanup();
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

  // clean up legacy per-workflow plists
  const loaded = loadedLabels();
  for (const name of Object.keys(cfg.workflows)) {
    const lbl = `${cfg.meta.label_prefix}.${name}`;
    if (loaded.has(lbl)) bootoutLabel(lbl);
    const legacy = resolve(LAUNCH_AGENTS, `${lbl}.plist`);
    if (existsSync(legacy)) {
      unlinkSync(legacy);
      console.log(`  ${c.dim}-${R}  ${name}  ${c.dim}removed legacy plist${R}`);
    }
  }
  // clean up old single-runner plists
  for (const oldLbl of [`${cfg.meta.label_prefix}.wf-runner`, `${cfg.meta.label_prefix}.wf-sleep-watchdog`]) {
    if (loaded.has(oldLbl)) bootoutLabel(oldLbl);
    const old = resolve(LAUNCH_AGENTS, `${oldLbl}.plist`);
    if (existsSync(old)) unlinkSync(old);
  }

  console.log("");

  for (const [name, sched] of Object.entries(cfg.schedules)) {
    if (!sched.enabled) {
      console.log(`  ${c.dim}-${R}  ${name}  ${c.dim}skipped (disabled)${R}`);
      continue;
    }

    // runner plist
    const rnLbl = scheduleRunnerLabel(cfg, name);
    const rnPlist = generateRunnerPlist(cfg, name, sched.time, ROOT, logs);
    const rnLocal = resolve(dir, `${rnLbl}.plist`);
    const rnAgent = resolve(LAUNCH_AGENTS, `${rnLbl}.plist`);
    writeFileSync(rnLocal, rnPlist);
    writeFileSync(rnAgent, rnPlist);
    bootoutLabel(rnLbl);
    if (bootstrapPlist(rnAgent)) {
      const time = fmtTime(sched.time.hour, sched.time.minute);
      console.log(
        `  ${c.green}+${R}  ${c.bold}${name}${R}  ${c.dim}${time} → ${sched.workflows.length} workflows${R}`,
      );
    } else {
      console.log(`  ${c.red}x${R}  ${c.bold}${name}${R}  ${c.red}failed to install${R}`);
    }

    // watchdog plist
    const wdTime = sched.watchdog ?? defaultWatchdogTime(cfg, sched);
    const wdLbl = scheduleWatchdogLabel(cfg, name);
    const wdPlist = generateWatchdogPlist(cfg, name, wdTime, logs);
    const wdLocal = resolve(dir, `${wdLbl}.plist`);
    const wdAgent = resolve(LAUNCH_AGENTS, `${wdLbl}.plist`);
    writeFileSync(wdLocal, wdPlist);
    writeFileSync(wdAgent, wdPlist);
    bootoutLabel(wdLbl);
    if (bootstrapPlist(wdAgent)) {
      const time = fmtTime(wdTime.hour, wdTime.minute);
      console.log(
        `  ${c.green}+${R}  ${c.bold}${name}-watchdog${R}  ${c.dim}${time} → disablesleep 0${R}`,
      );
    } else {
      console.log(`  ${c.red}x${R}  ${c.bold}${name}-watchdog${R}  ${c.red}failed to install${R}`);
    }
  }

  configureScheduledWake(cfg);

  const enabled = Object.values(cfg.schedules).filter((s) => s.enabled).length;
  console.log(`\n${c.green}installed${R} ${c.dim}${enabled} schedule(s)${R}\n`);
}

function defaultWatchdogTime(
  cfg: Config,
  sched: Config["schedules"][string],
): { hour: number; minute: number } {
  let totalSeconds = 0;
  for (const wfName of sched.workflows) {
    totalSeconds += cfg.workflows[wfName].timeout ?? cfg.meta.default_timeout ?? 3600;
  }
  const bufferMinutes = 15;
  const totalMinutes = Math.ceil(totalSeconds / 60) + bufferMinutes;
  const startMinutes = sched.time.hour * 60 + sched.time.minute;
  const wdMinutes = (startMinutes + totalMinutes) % (24 * 60);
  return {
    hour: Math.floor(wdMinutes / 60),
    minute: wdMinutes % 60,
  };
}

function cmdUninstall() {
  const cfg = loadConfig();

  console.log("");

  const loaded = loadedLabels();

  for (const name of Object.keys(cfg.schedules)) {
    const rnLbl = scheduleRunnerLabel(cfg, name);
    const rnAgent = resolve(LAUNCH_AGENTS, `${rnLbl}.plist`);
    bootoutLabel(rnLbl);
    if (existsSync(rnAgent)) {
      unlinkSync(rnAgent);
      console.log(`  ${c.green}-${R}  ${c.bold}${name}${R}  ${c.dim}removed${R}`);
    }

    const wdLbl = scheduleWatchdogLabel(cfg, name);
    const wdAgent = resolve(LAUNCH_AGENTS, `${wdLbl}.plist`);
    bootoutLabel(wdLbl);
    if (existsSync(wdAgent)) {
      unlinkSync(wdAgent);
      console.log(`  ${c.green}-${R}  ${c.bold}${name}-watchdog${R}  ${c.dim}removed${R}`);
    }
  }

  // clean up legacy per-workflow plists
  for (const name of Object.keys(cfg.workflows)) {
    const lbl = `${cfg.meta.label_prefix}.${name}`;
    if (loaded.has(lbl)) bootoutLabel(lbl);
    const legacy = resolve(LAUNCH_AGENTS, `${lbl}.plist`);
    if (existsSync(legacy)) {
      unlinkSync(legacy);
      console.log(`  ${c.green}-${R}  ${c.bold}${name}${R}  ${c.dim}removed legacy plist${R}`);
    }
  }
  // clean up old single-runner plists
  for (const oldLbl of [`${cfg.meta.label_prefix}.wf-runner`, `${cfg.meta.label_prefix}.wf-sleep-watchdog`]) {
    if (loaded.has(oldLbl)) bootoutLabel(oldLbl);
    const old = resolve(LAUNCH_AGENTS, `${oldLbl}.plist`);
    if (existsSync(old)) unlinkSync(old);
  }

  const dir = plistDir(cfg);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) unlinkSync(resolve(dir, f));
  }

  clearScheduledWake();
  console.log("");
}

function cmdStatus() {
  const cfg = loadConfig();
  const loaded = loadedLabels();
  const sd = stateDir(cfg);

  console.log("");

  for (const [name, sched] of Object.entries(cfg.schedules)) {
    const rnRegistered = loaded.has(scheduleRunnerLabel(cfg, name));
    const wdRegistered = loaded.has(scheduleWatchdogLabel(cfg, name));
    const enabledTag = sched.enabled
      ? `${c.green}enabled${R}`
      : `${c.dim}disabled${R}`;
    const rnTag = rnRegistered
      ? `${c.green}scheduled${R}`
      : `${c.red}not scheduled${R}`;
    const wdTag = wdRegistered
      ? `${c.green}ok${R}`
      : `${c.red}missing${R}`;
    const time = fmtTime(sched.time.hour, sched.time.minute);

    console.log(
      `  ${c.bold}${name}${R}  ${enabledTag}  ${rnTag}  ${c.dim}${time}${R}  ${c.dim}watchdog ${wdTag}${R}`,
    );

    if (sched.enabled && !rnRegistered) {
      console.log(`  ${c.bYellow}run wf install to register${R}`);
    }

    for (const wfName of sched.workflows) {
      const state = readState(sd, wfName);
      if (state) {
        const ago = relativeTime(state.lastRun);
        const dur = formatDuration(state.lastDurationMs);
        const healthTag = state.lastExitCode === 0
          ? `${c.green}ok${R}`
          : `${c.red}failed${R}`;
        let detail = `    ${c.dim}→${R} ${wfName}  ${healthTag}  ${c.dim}${ago}, took ${dur}${R}`;
        if (state.consecutiveFailures > 1) {
          detail += `  ${c.bRed}${state.consecutiveFailures}x${R}`;
        }
        console.log(detail);
      } else {
        console.log(`    ${c.dim}→${R} ${wfName}  ${c.dim}no runs yet${R}`);
      }
    }
    console.log("");
  }

  printWakeStatus();
}

function cmdLogs(name: string) {
  const cfg = loadConfig();
  const logs = logDir(cfg);

  // check if it's a schedule name
  if (cfg.schedules[name]) {
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
    if (!found) console.log(`\n${c.dim}no logs for ${name}${R}`);
    return;
  }

  if (!cfg.workflows[name]) {
    console.error(`${c.bRed}error${R} unknown workflow or schedule: ${c.bold}${name}${R}`);
    process.exit(1);
  }

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
    console.log(`\n${c.dim}no logs for ${name}${R}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────

const B = c.bold, D = c.dim, C = c.cyan;
const USAGE = `
  ${B}wf${R} ${D}— workflow scheduler${R}

  ${B}wf list${R}                    ${D}show schedules + workflows${R}
  ${B}wf status${R}                  ${D}show runtime health${R}
  ${B}wf run${R} ${C}<name>${R}              ${D}run a schedule or single workflow${R}
  ${B}wf logs${R} ${C}<name>${R}             ${D}show logs (schedule or workflow name)${R}

  ${B}wf install${R}                 ${D}install schedules into launchd${R}
  ${B}wf uninstall${R}               ${D}remove all from launchd${R}
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
  case "list":      cmdList(); break;
  case "status":    cmdStatus(); break;
  case "install":   cmdInstall(); break;
  case "uninstall": cmdUninstall(); break;
  case "run":       await cmdRun(requireArg("run")); break;
  case "logs":      cmdLogs(requireArg("logs")); break;
  default:          console.log(USAGE); break;
}
