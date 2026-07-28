import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rotateLogs } from "../scripts/log-maintenance";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "wf-logs-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("rotateLogs", () => {
  test("leaves logs below the threshold untouched", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "nightly.log"), "small");

    rotateLogs(dir, 10, 5);

    expect(readFileSync(join(dir, "nightly.log"), "utf8")).toBe("small");
  });

  test("rotates oversized logs and retains five archives", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "nightly.log"), "current-long");
    for (let i = 1; i <= 5; i++) writeFileSync(join(dir, `nightly.log.${i}`), `old-${i}`);

    rotateLogs(dir, 5, 5);

    expect(statSync(join(dir, "nightly.log")).size).toBe(0);
    expect(readFileSync(join(dir, "nightly.log.1"), "utf8")).toBe("current-long");
    expect(readFileSync(join(dir, "nightly.log.5"), "utf8")).toBe("old-4");
  });
});
