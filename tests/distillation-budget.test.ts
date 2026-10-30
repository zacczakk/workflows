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

test("distillation fails when agent-written files exceed budgets or lose markers; Phil-owned STYLE only warns", () => {
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
    expect(style.exitCode).toBe(0);
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
