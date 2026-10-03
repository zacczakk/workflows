import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Config } from "./types";
import { generateIntervalPlist, generateRunnerPlist, generateWatchdogPlist, generateServicePlist, scheduleRunnerLabel, scheduleWatchdogLabel, serviceLabel } from "./plist";
import { configureScheduledWake, clearScheduledWake } from "./wake";

const uid = Bun.spawnSync(["id", "-u"]).stdout.toString().trim();
const agents = resolve(homedir(), "Library/LaunchAgents");

export function loadedLabels(): Set<string> {
  const output = Bun.spawnSync(["launchctl", "list"], { stdout: "pipe", stderr: "ignore" }).stdout.toString();
  return new Set(output.split("\n").map((line) => line.split("\t")[2]).filter((name): name is string => Boolean(name)));
}

function remove(label: string, root: string, cfg: Config): void {
  Bun.spawnSync(["launchctl", "bootout", `gui/${uid}/${label}`], { stdout: "ignore", stderr: "ignore" });
  for (const path of [resolve(agents, `${label}.plist`), resolve(root, cfg.meta.plist_dir, `${label}.plist`)]) {
    if (existsSync(path)) unlinkSync(path);
  }
}

function register(label: string, text: string, root: string, cfg: Config): void {
  const path = resolve(agents, `${label}.plist`);
  writeFileSync(resolve(root, cfg.meta.plist_dir, `${label}.plist`), text);
  Bun.spawnSync(["launchctl", "bootout", `gui/${uid}/${label}`], { stdout: "ignore", stderr: "ignore" });
  writeFileSync(path, text);
  const result = Bun.spawnSync(["launchctl", "bootstrap", `gui/${uid}`, path], { stdout: "ignore", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`Cannot register ${label}: ${result.stderr.toString()}`);
  console.log(`installed ${label}`);
}

export function install(cfg: Config, root: string): void {
  const logs = resolve(root, cfg.meta.log_dir);
  for (const directory of [logs, resolve(root, cfg.meta.plist_dir), resolve(root, cfg.meta.state_dir), agents]) mkdirSync(directory, { recursive: true });
  for (const name of Object.keys(cfg.workflows)) remove(`${cfg.meta.label_prefix}.${name}`, root, cfg);
  for (const label of ["wf-runner", "wf-sleep-watchdog"]) remove(`${cfg.meta.label_prefix}.${label}`, root, cfg);
  for (const [name, schedule] of Object.entries(cfg.schedules)) {
    const runner = scheduleRunnerLabel(cfg, name);
    const watchdog = scheduleWatchdogLabel(cfg, name);
    if (!schedule.enabled) { remove(runner, root, cfg); remove(watchdog, root, cfg); continue; }
    register(runner, schedule.kind === "calendar" ? generateRunnerPlist(cfg, name, schedule.time, root, logs) : generateIntervalPlist(cfg, name, schedule.interval, root, logs), root, cfg);
    if (schedule.kind === "calendar" && schedule.prevent_sleep) {
      const minutes = schedule.time.hour * 60 + schedule.time.minute + Math.ceil(schedule.workflows.reduce((total, workflow) => total + (cfg.workflows[workflow].timeout ?? cfg.meta.default_timeout ?? 3600), 0) / 60) + 15;
      const time = schedule.watchdog ?? { hour: Math.floor(minutes / 60) % 24, minute: minutes % 60 };
      register(watchdog, generateWatchdogPlist(cfg, name, time, logs), root, cfg);
    } else remove(watchdog, root, cfg);
  }
  for (const [name, service] of Object.entries(cfg.services)) {
    if (service.enabled) register(serviceLabel(cfg, name), generateServicePlist(cfg, name, service, logs), root, cfg);
    else remove(serviceLabel(cfg, name), root, cfg);
  }
  configureScheduledWake(cfg);
}

export function uninstall(cfg: Config, root: string): void {
  for (const name of Object.keys(cfg.schedules)) { remove(scheduleRunnerLabel(cfg, name), root, cfg); remove(scheduleWatchdogLabel(cfg, name), root, cfg); }
  for (const name of Object.keys(cfg.services)) remove(serviceLabel(cfg, name), root, cfg);
  const directory = resolve(root, cfg.meta.plist_dir);
  if (existsSync(directory)) for (const file of readdirSync(directory)) if (file.startsWith(`${cfg.meta.label_prefix}.`)) unlinkSync(resolve(directory, file));
  clearScheduledWake();
}
