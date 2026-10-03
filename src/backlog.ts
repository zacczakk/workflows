import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { atomicWrite } from "./state";

interface Checkpoint { files: Record<string, number>; lastFullDate?: string }
export interface BacklogSelection { mode: "full" | "delta"; date: string; files: { path: string; modified: number }[] }

function checkpoint(path: string): Checkpoint {
  if (!existsSync(path)) return { files: {} };
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null || !("files" in value) || typeof value.files !== "object" || value.files === null) throw new Error("Invalid backlog checkpoint");
  const files: Record<string, number> = {};
  for (const [key, modified] of Object.entries(value.files)) {
    if (typeof modified !== "number") throw new Error("Invalid backlog checkpoint timestamp");
    files[key] = modified;
  }
  return { files, lastFullDate: "lastFullDate" in value && typeof value.lastFullDate === "string" ? value.lastFullDate : undefined };
}

export function prepareBacklog(directory: string, date: string, vault = resolve(homedir(), "Vaults/Knowledge")): BacklogSelection {
  const state = checkpoint(resolve(directory, "backlog-triage.json"));
  const full = Object.keys(state.files).length === 0 || (new Date(`${date}T12:00:00`).getDay() === 0 && state.lastFullDate !== date);
  const folder = resolve(vault, "02_backlog");
  const files = readdirSync(folder).filter((file) => file.endsWith(".md") && file !== "backlog.md").flatMap((file) => {
    const path = resolve(folder, file);
    const text = readFileSync(path, "utf8");
    const frontmatter = text.startsWith("---\n") ? text.split("---", 3)[1] : "";
    if (/^type:\s*(index|collection|query|report|sync-report)\s*$/m.test(frontmatter)) return [];
    const modified = statSync(path).mtimeMs;
    return full || state.files[file] !== modified ? [{ path, modified }] : [];
  });
  const selection: BacklogSelection = { mode: full ? "full" : "delta", date, files };
  atomicWrite(resolve(directory, "backlog-selection.json"), JSON.stringify(selection, null, 2));
  return selection;
}

export function commitBacklog(directory: string, selection: BacklogSelection): void {
  const completion = resolve(directory, "backlog-completion.json");
  if (!existsSync(completion)) throw new Error("Missing backlog completion manifest");
  const value: unknown = JSON.parse(readFileSync(completion, "utf8"));
  if (typeof value !== "object" || value === null || !("date" in value) || value.date !== selection.date || !("results" in value) || !Array.isArray(value.results)) throw new Error("Invalid backlog completion manifest");
  const selected = new Set(selection.files.map((file) => file.path));
  const completed = new Set<string>();
  for (const item of value.results) {
    if (typeof item !== "object" || item === null || !("path" in item) || typeof item.path !== "string" || !("classification" in item) || typeof item.classification !== "string" || !["quick-win", "high-impact", "stale", "holding"].includes(item.classification) || !("reason" in item) || typeof item.reason !== "string" || item.reason.trim().length < 10 || !selected.has(item.path) || completed.has(item.path)) throw new Error("Invalid backlog completion coverage");
    completed.add(item.path);
  }
  if (completed.size !== selected.size) throw new Error("Incomplete backlog completion coverage");
  const path = resolve(directory, "backlog-triage.json");
  const state = checkpoint(path);
  for (const file of selection.files) state.files[file.path.split("/").pop() ?? file.path] = file.modified;
  if (selection.mode === "full") state.lastFullDate = selection.date;
  atomicWrite(path, JSON.stringify(state, null, 2));
}
