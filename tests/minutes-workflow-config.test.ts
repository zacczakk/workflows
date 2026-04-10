import { TOML } from "bun";
import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { validateConfig } from "../src/validate";

test("workflows config includes the minutes inbox distillation schedule", () => {
  const raw = readFileSync(resolve(import.meta.dir, "../workflows.toml"), "utf-8");
  const cfg = validateConfig(TOML.parse(raw));

  expect(cfg.workflows["minutes-inbox-distillation"]).toMatchObject({
    type: "script",
    script: "scripts/minutes-inbox-distillation.ts",
  });

  expect(cfg.schedules["minutes-inbox"]).toMatchObject({
    kind: "interval",
    interval: 300,
    enabled: true,
    workflows: ["minutes-inbox-distillation"],
  });
});
