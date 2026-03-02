import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";
import type { Config, TimeSpec } from "./types";

// ── NVM resolution ─────────────────────────────────────────────────

function resolveNvmNode(): string {
  const home = homedir();
  const nvmDir = resolve(home, ".nvm");
  const aliasDir = resolve(nvmDir, "alias");
  const versionsDir = resolve(nvmDir, "versions/node");

  let target = "default";
  for (let i = 0; i < 5; i++) {
    const aliasPath = resolve(aliasDir, target);
    if (!existsSync(aliasPath)) break;
    target = readFileSync(aliasPath, "utf-8").trim();
    if (target.startsWith("v")) break;
    if (target.startsWith("lts/")) {
      const ltsAlias = resolve(aliasDir, target.replace("/", "-"));
      if (existsSync(ltsAlias)) {
        target = readFileSync(ltsAlias, "utf-8").trim();
        if (target.startsWith("v")) break;
      }
    }
  }

  if (existsSync(versionsDir)) {
    const installed = readdirSync(versionsDir)
      .filter((d) => d.startsWith("v"))
      .sort();

    if (target.startsWith("v")) {
      const match = installed.find((d) => d === target);
      if (match) return resolve(versionsDir, match, "bin");
    }

    const prefix = `v${target.replace(/^v/, "")}.`;
    const matches = installed.filter((d) => d.startsWith(prefix));
    if (matches.length > 0) {
      return resolve(versionsDir, matches[matches.length - 1], "bin");
    }

    if (installed.length > 0) {
      const fallback = installed[installed.length - 1];
      console.error(`nvm: could not resolve '${target}', using ${fallback}`);
      return resolve(versionsDir, fallback, "bin");
    }
  }

  console.error("nvm: no node versions found, using hardcoded v22 path");
  return resolve(nvmDir, "versions/node/v22.22.0/bin");
}

function buildEnvPath(): string {
  const home = homedir();
  return [
    resolveNvmNode(),
    `${home}/.bun/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].join(":");
}

// ── XML helpers ────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Labels ─────────────────────────────────────────────────────────

export function scheduleRunnerLabel(cfg: Config, name: string): string {
  return `${cfg.meta.label_prefix}.wf-${name}`;
}

export function scheduleWatchdogLabel(cfg: Config, name: string): string {
  return `${cfg.meta.label_prefix}.wf-${name}-watchdog`;
}

// ── Plist generation ───────────────────────────────────────────────

export function generateRunnerPlist(
  cfg: Config,
  scheduleName: string,
  time: TimeSpec,
  root: string,
  logPath: string,
): string {
  const lbl = scheduleRunnerLabel(cfg, scheduleName);
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
        <string>${escapeXml(resolve(root, "bin/wf"))}</string>
        <string>run-all</string>
        <string>${escapeXml(scheduleName)}</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Hour</key><integer>${time.hour}</integer>
            <key>Minute</key><integer>${time.minute}</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>${escapeXml(resolve(logPath, `${scheduleName}.out.log`))}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(resolve(logPath, `${scheduleName}.err.log`))}</string>
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

export function generateWatchdogPlist(
  cfg: Config,
  scheduleName: string,
  time: TimeSpec,
  logPath: string,
): string {
  const lbl = scheduleWatchdogLabel(cfg, scheduleName);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${escapeXml(lbl)}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/sudo</string>
        <string>/usr/bin/pmset</string>
        <string>-a</string>
        <string>disablesleep</string>
        <string>0</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Hour</key><integer>${time.hour}</integer>
            <key>Minute</key><integer>${time.minute}</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>${escapeXml(resolve(logPath, `${scheduleName}-watchdog.out.log`))}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(resolve(logPath, `${scheduleName}-watchdog.err.log`))}</string>
</dict>
</plist>`;
}
