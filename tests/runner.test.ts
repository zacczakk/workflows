import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("wf skips failed dependencies and preserves its last successful checkpoint", () => {
  const root = mkdtempSync(join(tmpdir(), "wf-runner-"));
  cpSync("src", join(root, "src"), { recursive: true });
  writeFileSync(join(root, "pass.ts"), "console.log('real script completed');");
  writeFileSync(join(root, "fail.ts"), "process.exit(1);");
  writeFileSync(join(root, "workflows.toml"), `
[meta]
label_prefix = "test.wf"
log_dir = "logs"
plist_dir = "plists"
state_dir = "state"
[schedules.test]
interval = 60
enabled = true
workflows = ["fail", "dependent"]
[workflows.pass]
type = "script"
script = "pass.ts"
description = "pass"
[workflows.fail]
type = "script"
script = "fail.ts"
description = "fail"
[workflows.dependent]
type = "script"
script = "pass.ts"
description = "dependent"
depends_on = ["fail"]
[workflows.output]
type = "script"
script = "fail.ts"
description = "required output"
outputs = ["required.md"]
[workflows.slow]
type = "script"
script = "slow.ts"
description = "slow descendant"
timeout = 1
`);
  const cli = resolve(root, "src/wf.ts");
  const env = { ...process.env, WF_NOTIFICATIONS: "0" };
  const success = Bun.spawnSync(["bun", cli, "run", "pass"], { env });
  expect(success.exitCode).toBe(0);
  const statePath = join(root, "state/pass.json");
  const first = JSON.parse(readFileSync(statePath, "utf8"));
  expect(first.lastSuccess).toBe(first.lastRun);
  writeFileSync(join(root, "pass.ts"), "process.exit(1);");
  const failure = Bun.spawnSync(["bun", cli, "run", "pass"], { env });
  expect(failure.exitCode).toBe(1);
  expect(JSON.parse(readFileSync(statePath, "utf8")).lastSuccess).toBe(first.lastSuccess);
  const schedule = Bun.spawnSync(["bun", cli, "run", "test"], { env });
  expect(schedule.exitCode).toBe(1);
  expect(schedule.stdout.toString()).toContain("skip dependent");
  expect(schedule.stdout.toString()).not.toContain("running dependent");
  writeFileSync(join(root, "fail.ts"), "console.log('exited without writing');");
  const missingOutput = Bun.spawnSync(["bun", cli, "run", "output"], { env });
  expect(missingOutput.exitCode).toBe(1);
  expect(missingOutput.stderr.toString()).toContain("Required output missing or stale");
  writeFileSync(join(root, "slow.ts"), `Bun.spawn(["bun", "-e", "setTimeout(() => {}, 60000)"], {stdout:"inherit"}); await Bun.sleep(60000);`);
  const slow = Bun.spawnSync(["bun", cli, "run", "slow"], { env });
  expect(slow.exitCode).toBe(1);
  expect(slow.stderr.toString()).toContain("Workflow timed out");
  Bun.spawnSync(["trash", root]);
}, 15_000);

test("wf reports actual local timezone and only nightly owns sleep", () => {
  const cli = Bun.spawnSync(["bun", "src/wf.ts", "list"], { env: { ...process.env, TZ: "Europe/Berlin" } });
  expect(cli.exitCode).toBe(0);
  expect(cli.stdout.toString()).toContain("Europe/Berlin");
  expect(cli.stdout.toString().match(/sleep owner/g)).toHaveLength(1);
  expect(cli.stdout.toString()).toContain("github-copilot/gpt-6.1-sol#high");
});
