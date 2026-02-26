import { resolve, dirname } from "path";

const root = resolve(dirname(import.meta.filename), "..");
const prompt = await Bun.file(
  resolve(root, "prompts/vault-knowledge-distillation.md"),
).text();

const proc = Bun.spawn(["opencode", "run", prompt], {
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(await proc.exited);
