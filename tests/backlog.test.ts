import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareBacklog, commitBacklog } from "../src/backlog";

test("triage selection ignores index edits, retries incomplete work, and skips structural notes", () => {
  const root = mkdtempSync(join(tmpdir(), "wf-backlog-"));
  const state = join(root, "state");
  const vault = join(root, "Knowledge");
  const folder = join(vault, "02_backlog");
  mkdirSync(state); mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "leaf.md"), "---\ntype: backlog\n---\nActual item");
  writeFileSync(join(folder, "routing.md"), "---\ntype: index\n---\nNavigation");
  writeFileSync(join(folder, "backlog.md"), "Navigation");
  const first = prepareBacklog(state, "2026-10-02", vault);
  expect(first.files.map((file) => file.path.split("/").pop())).toEqual(["leaf.md"]);
  expect(prepareBacklog(state, "2026-10-02", vault).files).toHaveLength(1);
  expect(() => commitBacklog(state, first)).toThrow("completion");
  writeFileSync(join(state, "backlog-completion.json"), JSON.stringify({ date: first.date, results: [] }));
  expect(() => commitBacklog(state, first)).toThrow("coverage");
  writeFileSync(join(state, "backlog-completion.json"), JSON.stringify({ date: first.date, results: [{ path: first.files[0].path, classification: "holding", reason: "Useful idea; existing project work has higher priority." }] }));
  commitBacklog(state, first);
  utimesSync(join(folder, "backlog.md"), new Date(), new Date());
  expect(prepareBacklog(state, "2026-10-03", vault).files).toHaveLength(0);
  utimesSync(join(folder, "leaf.md"), new Date(), new Date(Date.now() + 1000));
  expect(prepareBacklog(state, "2026-10-03", vault).files).toHaveLength(1);
  Bun.spawnSync(["trash", root]);
});
