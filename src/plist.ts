import { resolve } from "path";
import type { Config, TimeSpec } from "./types";

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
  const wfBin = resolve(root, "bin/wf");

  // Launch via login shell so ~/.zprofile is sourced automatically.
  // This gives child processes the full user env (PATH, secrets, certs)
  // without hardcoding paths in the plist.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${escapeXml(lbl)}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>-lc</string>
        <string>${escapeXml(wfBin)} run ${escapeXml(scheduleName)}</string>
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
