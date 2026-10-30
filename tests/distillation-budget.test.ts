import { expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const markers = (names: string[]) => names.map((name) => `<!-- auto:${name}:start -->\nx\n<!-- auto:${name}:end -->`).join("\n");

test("distillation prompt keeps Phil-owned text and caps injected files", () => {
  const prompt = readFileSync("prompts/vault-knowledge-distillation.md", "utf8");
  for (const rule of ["auto:setup", "auto:preferences", "auto:focus", "auto:learned-preferences", "Phil-owned: never edit it", "never append dated sections", "USER ≤ 700 words"]) {
    expect(prompt).toContain(rule);
  }
  expect(prompt).not.toContain("Only append");
});

test("distillation fails when injected files exceed budgets or lose markers", () => {
  const root = mkdtempSync(join(tmpdir(), "wf-distill-budget-"));
  try {
    cpSync("src", join(root, "src"), { recursive: true });
    const memory = join(root, "Vaults/Memory");
    mkdirSync(memory, { recursive: true });
    writeFileSync(join(root, "distill.ts"), `await Bun.write("MEMORY.md", "hub");`);
    writeFileSync(join(root, "workflows.toml"), `
[meta]
label_prefix = "test.distill"
log_dir = "logs"
plist_dir = "plists"
state_dir = "state"
[schedules.nightly]
interval = 60
enabled = true
workflows = ["vault-knowledge-distillation"]
[workflows.vault-knowledge-distillation]
type = "script"
script = "distill.ts"
description = "distillation"
outputs = ["MEMORY.md"]
`);
    const write = (user: string, soul: string, style = "style") => {
      writeFileSync(join(memory, "USER.md"), user);
      writeFileSync(join(memory, "SOUL.md"), soul);
      writeFileSync(join(memory, "MEMORY.md"), "hub");
      writeFileSync(join(memory, "STYLE.md"), style);
    };
    const run = () => Bun.spawnSync(["bun", join(root, "src/wf.ts"), "run", "vault-knowledge-distillation"], {
      cwd: root, env: { ...process.env, HOME: root, WF_NOTIFICATIONS: "0" },
    });
    const user = markers(["setup", "preferences", "focus"]);
    const soul = markers(["learned-preferences"]);

    write(user, soul);
    expect(run().exitCode).toBe(0);

    write(user, soul, "word ".repeat(1300));
    const style = run();
    expect(style.exitCode).toBe(1);
    expect(style.stderr.toString()).toContain("STYLE.md over word budget");

    write(`${user}\n${"word ".repeat(700)}`, soul);
    const over = run();
    expect(over.exitCode).toBe(1);
    expect(over.stderr.toString()).toContain("over word budget");

    write(markers(["setup", "preferences"]), soul);
    const lost = run();
    expect(lost.exitCode).toBe(1);
    expect(lost.stderr.toString()).toContain("missing auto:focus markers");
  } finally {
    expect(Bun.spawnSync(["trash", root]).exitCode).toBe(0);
  }
});

test("distillation may move STYLE quotes and corrections to the archive but never drop them", () => {
  const root = mkdtempSync(join(tmpdir(), "wf-distill-style-"));
  try {
    cpSync("src", join(root, "src"), { recursive: true });
    const memory = join(root, "Vaults/Memory");
    mkdirSync(join(memory, "system"), { recursive: true });
    writeFileSync(join(root, "workflows.toml"), `
[meta]
label_prefix = "test.style"
log_dir = "logs"
plist_dir = "plists"
state_dir = "state"
[schedules.nightly]
interval = 60
enabled = true
workflows = ["vault-knowledge-distillation"]
[workflows.vault-knowledge-distillation]
type = "script"
script = "distill.ts"
description = "distillation"
outputs = ["MEMORY.md"]
`);
    const reset = () => {
      writeFileSync(join(memory, "USER.md"), markers(["setup", "preferences", "focus"]));
      writeFileSync(join(memory, "SOUL.md"), markers(["learned-preferences"]));
      writeFileSync(join(memory, "MEMORY.md"), "hub");
      writeFileSync(join(memory, "STYLE.md"), '## Core\n- Requests: "Can you…?", "Kindly…"\n## Corrections\n- 2026-10-30: rule. before: "x" → after: "y"\n');
      writeFileSync(join(memory, "system/style-archive.md"), "## Corrections log\n- 2026-10-01: old rule.\n");
    };
    const run = (script: string) => {
      writeFileSync(join(root, "distill.ts"), `${script}\nawait Bun.write("MEMORY.md", "hub");`);
      return Bun.spawnSync(["bun", join(root, "src/wf.ts"), "run", "vault-knowledge-distillation"], {
        cwd: root, env: { ...process.env, HOME: root, WF_NOTIFICATIONS: "0" },
      });
    };
    const style = JSON.stringify(join(memory, "STYLE.md"));
    const archive = JSON.stringify(join(memory, "system/style-archive.md"));

    reset();
    const folded = run(`
await Bun.write(${style}, '## Core\\n- Requests: "Can you…?"\\n- Rule from correction.\\n## Corrections\\n');
await Bun.write(${archive}, '## Corrections log\\n- 2026-10-01: old rule.\\n- 2026-10-30: rule. before: "x" → after: "y" Folded into: Core.\\n## Examples moved out\\n- 2026-10-30, Core > Requests: "Kindly…"\\n');`);
    expect(folded.exitCode).toBe(0);

    reset();
    const dropped = run(`await Bun.write(${style}, '## Core\\n- Requests: "Can you…?"\\n## Corrections\\n');`);
    expect(dropped.exitCode).toBe(1);
    expect(dropped.stderr.toString()).toContain("STYLE information lost");
  } finally {
    expect(Bun.spawnSync(["trash", root]).exitCode).toBe(0);
  }
});
