import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fingerprintFor } from "../src/minutes-inbox-distillation";

import {
  acquireLease,
  collectUnprocessedTranscripts,
  loadState,
  releaseLease,
} from "../scripts/minutes-inbox-distillation";

test("loadState recovers to empty state on corrupt json", () => {
  const dir = mkdtempSync(join(tmpdir(), "minutes-state-"));
  const warnings: string[] = [];
  const path = join(dir, "state.json");

  writeFileSync(path, "{not valid json\n");

  const state = loadState(path, (message) => warnings.push(message));

  expect(state).toEqual({ processed: {} });
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("failed to read state");
});

test("acquireLease prevents overlap until released", () => {
  const dir = mkdtempSync(join(tmpdir(), "minutes-lock-"));
  const lockPath = join(dir, "runner.lock");

  const first = acquireLease(lockPath, 30_000);
  const second = acquireLease(lockPath, 30_000);

  expect(first.acquired).toBe(true);
  expect(second.acquired).toBe(false);

  if (first.acquired) releaseLease(lockPath);
});

test("acquireLease replaces stale lock files", () => {
  const dir = mkdtempSync(join(tmpdir(), "minutes-stale-lock-"));
  const lockPath = join(dir, "runner.lock");

  writeFileSync(lockPath, JSON.stringify({ acquiredAt: new Date(0).toISOString() }));

  const result = acquireLease(lockPath, 1);

  expect(result.acquired).toBe(true);
  expect(readFileSync(lockPath, "utf-8")).toContain("acquiredAt");

  if (result.acquired) releaseLease(lockPath);
});

test("releaseLease does not remove a lease owned by another run", () => {
  const dir = mkdtempSync(join(tmpdir(), "minutes-owner-lock-"));
  const lockPath = join(dir, "runner.lock");

  const first = acquireLease(lockPath, 30_000);
  expect(first.acquired).toBe(true);

  writeFileSync(lockPath, JSON.stringify({ owner: "new-owner", acquiredAt: new Date().toISOString() }) + "\n");

  if (first.acquired) releaseLease(lockPath, first.owner);

  expect(readFileSync(lockPath, "utf-8")).toContain("new-owner");
});

test("runner skips cleanly when the meetings directory is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "minutes-missing-meetings-"));
  const homeDir = join(dir, "home");
  const activeDir = join(homeDir, "Vaults/Knowledge/03_active");
  const missingMeetingsDir = join(dir, "missing-meetings");
  const statePath = join(dir, "state.json");

  mkdirSync(activeDir, { recursive: true });
  writeFileSync(join(activeDir, "projects.md"), "# Projects\n");

  const result = Bun.spawnSync([process.execPath, "scripts/minutes-inbox-distillation.ts"], {
    cwd: join(import.meta.dir, ".."),
    env: {
      ...process.env,
      HOME: homeDir,
      MINUTES_MEETINGS_DIR: missingMeetingsDir,
      MINUTES_STATE_PATH: statePath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain("skip meetings dir missing");
  expect(result.stdout.toString()).toContain(missingMeetingsDir);
  expect(result.stderr.toString()).toBe("");
});

test("first run seeds existing transcripts instead of processing the backlog", () => {
  const dir = mkdtempSync(join(tmpdir(), "minutes-bootstrap-"));
  const meetingsDir = join(dir, "meetings");
  const now = Date.now();

  mkdirSync(meetingsDir, { recursive: true });
  writeFileSync(join(meetingsDir, "2026-04-09-old.md"), "old");
  writeFileSync(join(meetingsDir, "2026-04-10-new.md"), "new");

  const oldPath = join(meetingsDir, "2026-04-09-old.md");
  const newPath = join(meetingsDir, "2026-04-10-new.md");

  const oldTime = new Date(now - 60_000);
  const newTime = new Date(now + 60_000);
  Bun.file(oldPath);
  Bun.file(newPath);

  const firstState = { processed: {} };
  const firstRun = collectUnprocessedTranscripts(meetingsDir, firstState, now);
  expect(firstRun.pending).toEqual([]);
  expect(Object.keys(firstRun.seeded.processed).sort()).toEqual([oldPath, newPath].sort());

  const secondState = firstRun.seeded;
  writeFileSync(join(meetingsDir, "2026-04-10-latest.md"), "latest");
  const latestPath = join(meetingsDir, "2026-04-10-latest.md");
  const secondRun = collectUnprocessedTranscripts(meetingsDir, secondState, now + 120_000);
  expect(secondRun.pending).toContain(latestPath);
});

test("existing state seeds older unknown transcripts and only processes newer arrivals", () => {
  const dir = mkdtempSync(join(tmpdir(), "minutes-cutoff-"));
  const meetingsDir = join(dir, "meetings");
  mkdirSync(meetingsDir, { recursive: true });

  const anchorPath = join(meetingsDir, "2026-04-09-anchor.md");
  const oldPath = join(meetingsDir, "2026-04-09-old.md");
  const newPath = join(meetingsDir, "2026-04-10-new.md");
  writeFileSync(anchorPath, "anchor");
  writeFileSync(oldPath, "old");
  writeFileSync(newPath, "new");
  utimesSync(oldPath, new Date(100_000), new Date(100_000));
  utimesSync(anchorPath, new Date(150_000), new Date(150_000));
  utimesSync(newPath, new Date(250_000), new Date(250_000));

  const state = {
    processed: {
      [anchorPath]: {
        fingerprint: fingerprintFor({ size: statSync(anchorPath).size, mtimeMs: statSync(anchorPath).mtimeMs }),
        inboxPath: "01_inbox/kept-summary.md",
        processedAt: new Date(200_000).toISOString(),
      },
    },
  };

  const result = collectUnprocessedTranscripts(meetingsDir, state, 300_000);

  expect(result.pending).toEqual([newPath]);
  expect(result.seeded.processed[oldPath]?.inboxPath).toBe("");
  expect(result.seeded.processed[newPath]).toBeUndefined();
});
