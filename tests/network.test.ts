import { expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("schedule with agent workflows stops once when the network host never resolves", () => {
  const root = mkdtempSync(join(tmpdir(), "wf-network-"));
  try {
    cpSync("src", join(root, "src"), { recursive: true });
    writeFileSync(join(root, "prompt.md"), "never sent");
    writeFileSync(join(root, "workflows.toml"), `
[meta]
label_prefix = "test.network"
log_dir = "logs"
plist_dir = "plists"
state_dir = "state"
network_host = "wf-offline.invalid"
network_wait = 0
[schedules.nightly]
interval = 60
enabled = true
workflows = ["agent"]
[workflows.agent]
type = "agent"
prompt = "prompt.md"
description = "agent"
`);
    const result = Bun.spawnSync(["bun", join(root, "src/wf.ts"), "run", "nightly"], {
      cwd: root, env: { ...process.env, WF_NOTIFICATIONS: "0" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("offline: wf-offline.invalid did not resolve");
    expect(existsSync(join(root, "state/agent.json"))).toBe(false);
  } finally {
    expect(Bun.spawnSync(["trash", root]).exitCode).toBe(0);
  }
});
