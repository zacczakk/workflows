import { expect, test } from "bun:test";
import { createSession, sessionOutcome } from "../src/opencode";

test.skipIf(process.env.WF_LIVE_TEST !== "1")("exact V2 session records completed model work", async () => {
  const id = await createSession(process.cwd(), "smoke", "github-copilot/gpt-6.1-sol#medium");
  const proc = Bun.spawn(["opencode", "run", "--session", id, "-m", "github-copilot/gpt-6.1-sol#medium", "Reply WF_SMOKE_OK. Use no tools; make no edits."], { stdout: "pipe", stderr: "pipe" });
  const [code, text] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  expect(code).toBe(0);
  expect(text).toContain("WF_SMOKE_OK");
  expect(await sessionOutcome(id)).toBe("succeeded");
}, 60_000);
