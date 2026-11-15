import { expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function setup(name: string, queue: string): { root: string; run: () => ReturnType<typeof Bun.spawnSync> } {
  const root = mkdtempSync(join(tmpdir(), "wf-trash-"));
  cpSync("src", join(root, "src"), { recursive: true });
  mkdirSync(join(root, "vault"));
  writeFileSync(join(root, "vault/old.md"), "old report");
  writeFileSync(join(root, "outside.md"), "keep");
  writeFileSync(join(root, "job.ts"), `
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
const line = (path: string, body = readFileSync(path)) => createHash("sha256").update(body).digest("hex") + "  " + path + "\\n";
${queue}
await Bun.write("findings.md", "---\\nretention_status: complete\\n---\\nqueued");`);
  writeFileSync(join(root, "workflows.toml"), `
[meta]
label_prefix = "test.trash"
log_dir = "logs"
plist_dir = "plists"
state_dir = "state"
trash_roots = ["vault"]
[schedules.nightly]
interval = 60
enabled = true
workflows = ["${name}"]
[workflows.${name}]
type = "script"
script = "job.ts"
description = "queues deletions"
outputs = ["findings.md"]
`);
  const run = () => Bun.spawnSync(["bun", join(root, "src/wf.ts"), "run", name], { cwd: root, env: { ...process.env, WF_NOTIFICATIONS: "0" } });
  return { root, run };
}

test("the runner moves queued vault files to the Trash after a successful job", () => {
  const { root, run } = setup("cleanup", `appendFileSync(process.env.WF_TRASH_FILE!, line(process.cwd() + "/vault/old.md"));`);
  try {
    const result = run();
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(root, "vault/old.md"))).toBe(false);
    expect(existsSync(join(root, "state/cleanup.trash"))).toBe(false);
  } finally {
    expect(Bun.spawnSync(["trash", root]).exitCode).toBe(0);
  }
});

test("one bad request moves nothing and marks report maintenance partial", () => {
  const { root, run } = setup("vault-report-maintenance", `appendFileSync(process.env.WF_TRASH_FILE!, line(process.cwd() + "/vault/old.md") + line(process.cwd() + "/outside.md"));`);
  try {
    const result = run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("Trash request outside allowed folders");
    expect(existsSync(join(root, "vault/old.md"))).toBe(true);
    expect(existsSync(join(root, "outside.md"))).toBe(true);
    expect(readFileSync(join(root, "findings.md"), "utf8")).toContain("retention_status: partial");
  } finally {
    expect(Bun.spawnSync(["trash", root]).exitCode).toBe(0);
  }
});
