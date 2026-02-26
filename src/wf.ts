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

// ── Types ──────────────────────────────────────────────────────────

interface Schedule {
  Hour?: number;
  Minute?: number;
  Month?: number;
  Day?: number;
  Weekday?: number | number[];
}

interface Workflow {
  script: string;
  description: string;
  enabled: boolean;
  schedule: Schedule;
}

interface Config {
  meta: {
    label_prefix: string;
    log_dir: string;
    plist_dir: string;
  };
  workflows: Record<string, Workflow>;
}

// ── Paths ──────────────────────────────────────────────────────────

// Compiled binary: import.meta.filename is /$bunfs/..., so use process.argv[1]
// Dev mode (bun run): import.meta.filename is the real path
const isBundled = import.meta.filename.startsWith("/$bunfs");
const ROOT = isBundled
  ? resolve(dirname(process.execPath), "..")
  : resolve(dirname(import.meta.filename), "..");
const TOML_PATH = resolve(ROOT, "workflows.toml");
const LAUNCH_AGENTS = resolve(homedir(), "Library/LaunchAgents");
const UID = process.env.UID ?? String(501);

// ── Config ─────────────────────────────────────────────────────────

function loadConfig(): Config {
  const raw = readFileSync(TOML_PATH, "utf-8");
  return TOML.parse(raw) as unknown as Config;
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

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ── Plist generation ───────────────────────────────────────────────

function buildEnvPath(): string {
  const home = homedir();
  const segments = [
    `${home}/.nvm/versions/node/v22.22.0/bin`,
    `${home}/.bun/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  return segments.join(":");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function expandSchedule(sched: Schedule): Record<string, number>[] {
  const weekdays = sched.Weekday;
  const base: Record<string, number> = {};
  if (sched.Hour !== undefined) base.Hour = sched.Hour;
  if (sched.Minute !== undefined) base.Minute = sched.Minute;
  if (sched.Month !== undefined) base.Month = sched.Month;
  if (sched.Day !== undefined) base.Day = sched.Day;

  if (weekdays === undefined) return [base];
  if (typeof weekdays === "number") return [{ ...base, Weekday: weekdays }];
  return weekdays.map((d) => ({ ...base, Weekday: d }));
}

function scheduleDict(entry: Record<string, number>): string {
  const pairs = Object.entries(entry)
    .map(
      ([k, v]) =>
        `            <key>${k}</key><integer>${v}</integer>`,
    )
    .join("\n");
  return `        <dict>\n${pairs}\n        </dict>`;
}

function generatePlist(
  cfg: Config,
  name: string,
  wf: Workflow,
): string {
  const lbl = label(cfg, name);
  const logs = logDir(cfg);
  const dicts = expandSchedule(wf.schedule).map(scheduleDict).join("\n");
  const home = homedir();

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${escapeXml(lbl)}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${escapeXml(resolve(ROOT, "bin/wf"))}</string>
        <string>run</string>
        <string>${escapeXml(name)}</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
${dicts}
    </array>
    <key>StandardOutPath</key>
    <string>${escapeXml(resolve(logs, `${name}.out.log`))}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(resolve(logs, `${name}.err.log`))}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${escapeXml(buildEnvPath())}</string>
        <key>HOME</key>
        <string>${escapeXml(home)}</string>
        <key>NVM_DIR</key>
        <string>${escapeXml(resolve(home, ".nvm"))}</string>
    </dict>
</dict>
</plist>`;
}

// ── Commands ───────────────────────────────────────────────────────

function weekdayName(d: number): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] ?? String(d);
}

function formatSchedule(sched: Schedule): string {
  const time = `${String(sched.Hour ?? 0).padStart(2, "0")}:${String(sched.Minute ?? 0).padStart(2, "0")}`;
  const wd = sched.Weekday;
  if (wd === undefined) return `daily ${time}`;
  if (typeof wd === "number") return `${weekdayName(wd)} ${time}`;
  return `${wd.map(weekdayName).join(",")} ${time}`;
}

function cmdList() {
  const cfg = loadConfig();
  console.log("\nWorkflows:\n");
  for (const [name, wf] of Object.entries(cfg.workflows)) {
    const status = wf.enabled ? "on " : "off";
    const sched = formatSchedule(wf.schedule);
    console.log(`  ${status}  ${name.padEnd(35)} ${sched.padEnd(20)} ${wf.description}`);
  }
  console.log();
}

async function cmdRun(name: string) {
  const cfg = loadConfig();
  const wf = cfg.workflows[name];
  if (!wf) {
    console.error(`Unknown workflow: ${name}`);
    process.exit(1);
  }

  const scriptPath = resolve(ROOT, wf.script);
  if (!existsSync(scriptPath)) {
    console.error(`Script not found: ${scriptPath}`);
    process.exit(1);
  }

  console.log(`Running ${name} ...`);
  const proc = Bun.spawn(["bun", "run", scriptPath], {
    stdout: "inherit",
    stderr: "inherit",
    cwd: ROOT,
  });

  const code = await proc.exited;
  if (code !== 0) {
    console.error(`${name} exited with code ${code}`);
  }
  process.exit(code);
}

function cmdInstall() {
  const cfg = loadConfig();
  const dir = plistDir(cfg);
  ensureDir(dir);
  ensureDir(logDir(cfg));

  const installed: string[] = [];

  for (const [name, wf] of Object.entries(cfg.workflows)) {
    if (!wf.enabled) continue;

    const lbl = label(cfg, name);
    const plist = generatePlist(cfg, name, wf);
    const localPath = resolve(dir, `${lbl}.plist`);
    const agentPath = resolve(LAUNCH_AGENTS, `${lbl}.plist`);

    writeFileSync(localPath, plist);
    writeFileSync(agentPath, plist);

    // bootout first (ignore errors if not loaded)
    Bun.spawnSync(["launchctl", "bootout", `gui/${UID}/${lbl}`], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const result = Bun.spawnSync(
      ["launchctl", "bootstrap", `gui/${UID}`, agentPath],
      { stdout: "inherit", stderr: "inherit" },
    );

    if (result.exitCode === 0) {
      installed.push(name);
    } else {
      console.error(`Failed to bootstrap ${lbl}`);
    }
  }

  console.log(`Installed ${installed.length} workflows: ${installed.join(", ")}`);
}

function cmdUninstall() {
  const cfg = loadConfig();

  for (const [name] of Object.entries(cfg.workflows)) {
    const lbl = label(cfg, name);
    const agentPath = resolve(LAUNCH_AGENTS, `${lbl}.plist`);

    Bun.spawnSync(["launchctl", "bootout", `gui/${UID}/${lbl}`], {
      stdout: "ignore",
      stderr: "ignore",
    });

    if (existsSync(agentPath)) unlinkSync(agentPath);
  }

  // Clean local plists
  const dir = plistDir(cfg);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      unlinkSync(resolve(dir, f));
    }
  }

  console.log("All workflows uninstalled.");
}

function cmdStatus() {
  const cfg = loadConfig();
  const result = Bun.spawnSync(["launchctl", "list"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = result.stdout.toString();

  console.log("\nWorkflow status:\n");
  for (const [name, wf] of Object.entries(cfg.workflows)) {
    const lbl = label(cfg, name);
    const line = output.split("\n").find((l) => l.includes(lbl));
    let state = "not loaded";
    let lastExit = "-";
    if (line) {
      const parts = line.trim().split(/\s+/);
      lastExit = parts[1] ?? "-";
      state = "loaded";
    }
    const enabled = wf.enabled ? "on " : "off";
    console.log(
      `  ${enabled}  ${name.padEnd(35)} ${state.padEnd(14)} exit: ${lastExit.padEnd(6)} ${formatSchedule(wf.schedule)}`,
    );
  }
  console.log();
}

function cmdLogs(name: string) {
  const cfg = loadConfig();
  if (!cfg.workflows[name]) {
    console.error(`Unknown workflow: ${name}`);
    process.exit(1);
  }

  const logs = logDir(cfg);
  const outLog = resolve(logs, `${name}.out.log`);
  const errLog = resolve(logs, `${name}.err.log`);

  if (existsSync(outLog)) {
    console.log(`=== stdout (${name}) ===`);
    console.log(readFileSync(outLog, "utf-8"));
  }
  if (existsSync(errLog)) {
    console.log(`=== stderr (${name}) ===`);
    console.log(readFileSync(errLog, "utf-8"));
  }
  if (!existsSync(outLog) && !existsSync(errLog)) {
    console.log(`No logs found for ${name}`);
  }
}

function cmdEnable(name: string) {
  const cfg = loadConfig();
  const wf = cfg.workflows[name];
  if (!wf) {
    console.error(`Unknown workflow: ${name}`);
    process.exit(1);
  }

  const lbl = label(cfg, name);
  const agentPath = resolve(LAUNCH_AGENTS, `${lbl}.plist`);

  if (!existsSync(agentPath)) {
    // Generate and copy plist first
    ensureDir(logDir(cfg));
    const plist = generatePlist(cfg, name, wf);
    writeFileSync(agentPath, plist);
  }

  Bun.spawnSync(["launchctl", "bootout", `gui/${UID}/${lbl}`], {
    stdout: "ignore",
    stderr: "ignore",
  });
  const result = Bun.spawnSync(
    ["launchctl", "bootstrap", `gui/${UID}`, agentPath],
    { stdout: "inherit", stderr: "inherit" },
  );

  if (result.exitCode === 0) {
    console.log(`Enabled ${name}`);
  } else {
    console.error(`Failed to enable ${name}`);
    process.exit(1);
  }
}

function cmdDisable(name: string) {
  const cfg = loadConfig();
  if (!cfg.workflows[name]) {
    console.error(`Unknown workflow: ${name}`);
    process.exit(1);
  }

  const lbl = label(cfg, name);
  const result = Bun.spawnSync(
    ["launchctl", "bootout", `gui/${UID}/${lbl}`],
    { stdout: "inherit", stderr: "inherit" },
  );

  if (result.exitCode === 0) {
    console.log(`Disabled ${name}`);
  } else {
    console.error(`Failed to disable ${name} (may not be loaded)`);
  }
}

// ── Main ───────────────────────────────────────────────────────────

const USAGE = `wf — workflow scheduler

Usage:
  wf list                Show all workflows
  wf run <name>          Run a workflow immediately
  wf install             Install all enabled workflows into launchd
  wf uninstall           Remove all workflows from launchd
  wf status              Show loaded state of all workflows
  wf logs <name>         Show logs for a workflow
  wf enable <name>       Load a single workflow into launchd
  wf disable <name>      Unload a single workflow from launchd`;

const [cmd, arg] = process.argv.slice(2);

switch (cmd) {
  case "list":
    cmdList();
    break;
  case "run":
    if (!arg) { console.error("Usage: wf run <name>"); process.exit(1); }
    await cmdRun(arg);
    break;
  case "install":
    cmdInstall();
    break;
  case "uninstall":
    cmdUninstall();
    break;
  case "status":
    cmdStatus();
    break;
  case "logs":
    if (!arg) { console.error("Usage: wf logs <name>"); process.exit(1); }
    cmdLogs(arg);
    break;
  case "enable":
    if (!arg) { console.error("Usage: wf enable <name>"); process.exit(1); }
    cmdEnable(arg);
    break;
  case "disable":
    if (!arg) { console.error("Usage: wf disable <name>"); process.exit(1); }
    cmdDisable(arg);
    break;
  default:
    console.log(USAGE);
    break;
}
