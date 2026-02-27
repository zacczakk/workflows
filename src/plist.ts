import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";
import type { Config } from "./types";

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

// ── XML + schedule helpers ─────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Map our lowercase schedule keys to launchd PascalCase StartCalendarInterval keys */
function expandSchedule(
  sched: Config["workflows"][string]["schedule"],
): Record<string, number>[] {
  const base: Record<string, number> = {};
  if (sched.hour !== undefined) base.Hour = sched.hour;
  if (sched.minute !== undefined) base.Minute = sched.minute;
  if (sched.month !== undefined) base.Month = sched.month;
  if (sched.day !== undefined) base.Day = sched.day;

  const weekdays = sched.weekday;
  if (weekdays === undefined) return [base];
  if (typeof weekdays === "number") return [{ ...base, Weekday: weekdays }];
  return weekdays.map((d) => ({ ...base, Weekday: d }));
}

function scheduleDict(entry: Record<string, number>): string {
  const pairs = Object.entries(entry)
    .map(([k, v]) => `            <key>${k}</key><integer>${v}</integer>`)
    .join("\n");
  return `        <dict>\n${pairs}\n        </dict>`;
}

// ── Plist generation ───────────────────────────────────────────────

export function generatePlist(
  cfg: Config,
  name: string,
  wf: Config["workflows"][string],
  root: string,
  logPath: string,
): string {
  const lbl = `${cfg.meta.label_prefix}.${name}`;
  const dicts = expandSchedule(wf.schedule).map(scheduleDict).join("\n");
  const home = homedir();
  const timeout = wf.timeout ?? cfg.meta.default_timeout;

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
        <string>run</string>
        <string>${escapeXml(name)}</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
${dicts}
    </array>
    <key>StandardOutPath</key>
    <string>${escapeXml(resolve(logPath, `${name}.out.log`))}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(resolve(logPath, `${name}.err.log`))}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${escapeXml(buildEnvPath())}</string>
        <key>HOME</key>
        <string>${escapeXml(home)}</string>
        <key>NVM_DIR</key>
        <string>${escapeXml(resolve(home, ".nvm"))}</string>
    </dict>${timeout ? `\n    <key>TimeOut</key>\n    <integer>${timeout}</integer>` : ""}
</dict>
</plist>`;
}
