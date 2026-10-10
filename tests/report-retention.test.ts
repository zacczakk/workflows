import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOML } from "bun";
import { validateConfig } from "../src/validate";

test("weekly report maintenance follows producers and gates final consumers", () => {
  const config = validateConfig(TOML.parse(readFileSync("workflows.toml", "utf8")));
  const names = config.schedules.nightly.workflows;
  const maintenance = config.workflows["vault-report-maintenance"];
  expect(maintenance).toBeDefined();
  expect(maintenance.type).toBe("agent");
  expect(maintenance.cadence_days).toBe(7);
  expect(maintenance.outputs).toEqual([
    "~/Vaults/Knowledge/00_system/grooming-reports/report-retention.md",
    "~/Vaults/Memory/system/report-retention.md",
  ]);
  for (const name of ["skill-sync", "vault-consolidation", "vault-grooming", "vault-backlog-triage", "vault-retrieval-practice"]) {
    expect(names.indexOf(name)).toBeLessThan(names.indexOf("vault-report-maintenance"));
    expect(maintenance.depends_on).toContain(name);
  }
  for (const name of ["vault-knowledge-distillation", "vault-embeddings-final"]) {
    expect(names.indexOf("vault-report-maintenance")).toBeLessThan(names.indexOf(name));
  }
  expect(config.workflows["vault-embeddings-final"].depends_on).toContain("vault-report-maintenance");
  expect(config.workflows["vault-knowledge-distillation"].depends_on ?? []).not.toContain("vault-report-maintenance");
});

test("report maintenance contract protects source knowledge and requires recoverable verified cleanup", () => {
  const prompt = readFileSync("prompts/vault-report-maintenance.md", "utf8");
  for (const rule of [
    "30 calendar days", "newest report", "trash", "unique findings", "sha256",
    "Knowledge/00_system/grooming-reports/", "Memory/system/grooming-reports/",
    "Memory/system/consolidation-reports/", "Memory/system/retrieval-reports/",
    "Memory/system/skill-sync-YYYY-MM-DD.md", "session notes", "backlog", "GitHub audit",
    "external references", "tags: []", "unreadable", "No candidates",
    "perform no global vault scan", "Unrelated iCloud placeholders cannot block a zero-move run",
  ]) expect(prompt).toContain(rule);
});

test("weekly cadence satisfies consumers and partial cleanup fails real output checks", () => {
  const root = mkdtempSync(join(tmpdir(), "wf-report-cadence-"));
  try {
    cpSync("src", join(root, "src"), { recursive: true });
    writeFileSync(join(root, "maintenance.ts"), `await Bun.write("findings.md", "---\\nretention_status: complete\\n---\\ncovered");`);
    writeFileSync(join(root, "consumer.ts"), `await Bun.write("consumer.md", "indexed");`);
    writeFileSync(join(root, "workflows.toml"), `
[meta]
label_prefix = "test.reports"
log_dir = "logs"
plist_dir = "plists"
state_dir = "state"
[schedules.nightly]
interval = 60
enabled = true
workflows = ["vault-report-maintenance", "consumer"]
[workflows.vault-report-maintenance]
type = "script"
script = "maintenance.ts"
description = "weekly report maintenance"
cadence_days = 7
outputs = ["findings.md"]
[workflows.consumer]
type = "script"
script = "consumer.ts"
description = "final indexing"
depends_on = ["vault-report-maintenance"]
outputs = ["consumer.md"]
`);
    const run = (name = "nightly") => Bun.spawnSync(["bun", join(root, "src/wf.ts"), "run", name], {
      cwd: root, env: { ...process.env, WF_NOTIFICATIONS: "0" },
    });
    expect(run().exitCode).toBe(0);
    const checkpoint = readFileSync(join(root, "state/vault-report-maintenance.json"), "utf8");
    writeFileSync(join(root, "maintenance.ts"), "process.exit(1);");
    const next = run();
    expect(next.exitCode).toBe(0);
    expect(next.stdout.toString()).toContain("skip vault-report-maintenance: cadence 7d");
    expect(next.stdout.toString()).toContain("ok consumer");
    expect(readFileSync(join(root, "state/vault-report-maintenance.json"), "utf8")).toBe(checkpoint);
    writeFileSync(join(root, "maintenance.ts"), `await Bun.write("findings.md", "---\\nretention_status: partial\\n---\\nretention_status: complete");`);
    const partial = run("vault-report-maintenance");
    expect(partial.exitCode).toBe(1);
    expect(partial.stderr.toString()).toContain("Report maintenance incomplete");
  } finally {
    expect(Bun.spawnSync(["trash", root]).exitCode).toBe(0);
  }
});
