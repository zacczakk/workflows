import { TOML } from "bun";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateConfig } from "./validate";
import { readState, relativeTime, formatDuration } from "./state";
import { install, uninstall, loadedLabels } from "./install";
import { scheduleRunnerLabel, scheduleWatchdogLabel, serviceLabel } from "./plist";
import { printWakeStatus } from "./wake";
import { run } from "./run";
import { notifyFailure } from "./notify";

const bundled = import.meta.filename.startsWith("/$bunfs");
const root = bundled ? resolve(dirname(process.execPath), "..") : resolve(import.meta.dir, "..");
const loginPath = Bun.spawnSync(["/bin/zsh", "-lc", "echo $PATH"], { stdout: "pipe", stderr: "ignore" }).stdout.toString().trim();
if (loginPath) process.env.PATH = loginPath;

async function main(): Promise<void> {
  const cfg = validateConfig(TOML.parse(readFileSync(resolve(root, "workflows.toml"), "utf8")));
  const command = process.argv[2];
  const name = process.argv[3];
  if (command === "run") {
    if (!name) throw new Error("usage: wf run <schedule|workflow>");
    process.exit(await run(cfg, root, name));
  }
  if (command === "install") { install(cfg, root); return; }
  if (command === "uninstall") { uninstall(cfg, root); return; }
  if (command === "list" || command === "status") {
    const labels = loadedLabels();
    console.log(`\nTimezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}; calendar times are local`);
    for (const [scheduleName, schedule] of Object.entries(cfg.schedules)) {
      const time = schedule.kind === "interval" ? `every ${formatDuration(schedule.interval * 1000)}` : `${String(schedule.time.hour).padStart(2, "0")}:${String(schedule.time.minute).padStart(2, "0")}`;
      console.log(`\n${scheduleName} ${schedule.enabled ? "enabled" : "disabled"} ${time} ${labels.has(scheduleRunnerLabel(cfg, scheduleName)) ? "scheduled" : "not scheduled"}${schedule.prevent_sleep ? `; sleep owner, watchdog ${labels.has(scheduleWatchdogLabel(cfg, scheduleName)) ? "ok" : "missing"}` : ""}`);
      for (const workflow of schedule.workflows) {
        const wf = cfg.workflows[workflow];
        const state = readState(resolve(root, cfg.meta.state_dir), workflow);
        console.log(`  ${workflow} ${wf.model ?? "script"}${command === "status" ? state ? ` ${state.lastExitCode === 0 ? "ok" : "failed"} ${relativeTime(state.lastRun)}, took ${formatDuration(state.lastDurationMs)}${state.consecutiveFailures ? ` (${state.consecutiveFailures} failures)` : ""}` : " no runs yet" : ""}`);
      }
    }
    for (const [serviceName, service] of Object.entries(cfg.services)) console.log(`${serviceName} ${service.enabled ? "enabled" : "disabled"} ${labels.has(serviceLabel(cfg, serviceName)) ? "registered" : "stopped"}`);
    printWakeStatus();
    return;
  }
  if (command === "logs") {
    if (!name || (!cfg.schedules[name] && !cfg.workflows[name])) throw new Error("usage: wf logs <schedule|workflow>");
    const schedule = cfg.schedules[name] ? name : Object.entries(cfg.schedules).find(([, item]) => item.workflows.includes(name))?.[0] ?? name;
    for (const stream of ["out", "err"]) {
      const path = resolve(root, cfg.meta.log_dir, `${schedule}.${stream}.log`);
      if (existsSync(path)) console.log(`${path}\n${readFileSync(path, "utf8").split("\n").slice(-200).join("\n")}`);
    }
    return;
  }
  console.log("wf list | status | run <name> | logs <name> | install | uninstall");
}

main().catch((error: unknown) => {
  notifyFailure(process.argv[3] ?? process.argv[2] ?? "startup", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
