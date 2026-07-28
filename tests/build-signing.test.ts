import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("build script gives wf a stable signing identity", () => {
  const source = readFileSync("scripts/build.ts", "utf8");

  expect(source).toContain("com.zacczakk.workflows.wf");
  expect(source).toContain("WF_CODESIGN_IDENTITY");
  expect(source).toContain("codesign");
});
