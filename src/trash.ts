import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import { sep } from "node:path";

// Agents queue deletions as `shasum -a 256 <path>` lines; the runner moves them itself
// because macOS checks the Trash permission of the process that runs `trash`.
export function applyTrashRequests(file: string, roots: string[]): string[] {
  if (!existsSync(file)) return [];
  const allowed = roots.filter((root) => existsSync(root)).map((root) => realpathSync(root) + sep);
  const lines = [...new Set(readFileSync(file, "utf8").split("\n").map((line) => line.trim()).filter(Boolean))];
  const paths = lines.map((line) => {
    const match = /^([0-9a-f]{64}) [ *](\/.+)$/.exec(line);
    if (!match) throw new Error(`Trash request malformed: ${line.slice(0, 160)}`);
    const [, hash, path] = match;
    if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`Trash request is not a regular file: ${path}`);
    if (!allowed.some((root) => realpathSync(path).startsWith(root))) throw new Error(`Trash request outside allowed folders: ${path}`);
    if (createHash("sha256").update(readFileSync(path)).digest("hex") !== hash) throw new Error(`Trash request changed since it was queued: ${path}`);
    return path;
  });
  const moved: string[] = [];
  for (const path of paths) {
    const result = Bun.spawnSync(["/usr/bin/trash", "--stopOnError", path], { stdout: "ignore", stderr: "pipe" });
    if (result.exitCode !== 0 || existsSync(path)) {
      throw new Error(`Trash failed after ${moved.length} of ${paths.length} moves (exit ${result.exitCode}): ${path} ${result.stderr.toString().trim().slice(-200)}`);
    }
    moved.push(path);
    console.log(`trashed ${path}`);
  }
  unlinkSync(file);
  return moved;
}
