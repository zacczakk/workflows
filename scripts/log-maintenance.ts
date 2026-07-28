import { closeSync, existsSync, openSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function rotateLogs(directory: string, maxBytes: number, archiveCount: number): void {
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".log")) continue;

    const current = join(directory, name);
    if (statSync(current).size <= maxBytes) continue;

    const oldest = `${current}.${archiveCount}`;
    if (existsSync(oldest)) rmSync(oldest);
    for (let index = archiveCount - 1; index >= 1; index--) {
      const source = `${current}.${index}`;
      if (existsSync(source)) renameSync(source, `${current}.${index + 1}`);
    }
    renameSync(current, `${current}.1`);
    closeSync(openSync(current, "a"));
    console.log(`rotated ${name}`);
  }
}

if (import.meta.main) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  rotateLogs(join(root, "logs"), 10 * 1024 * 1024, 5);
}
