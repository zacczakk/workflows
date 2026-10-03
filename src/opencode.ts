import { randomUUID } from "node:crypto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function api(method: string, path: string, body?: object): Promise<unknown> {
  const args = ["opencode", "api", method, path];
  if (body) args.push("--data", JSON.stringify(body));
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill("SIGKILL"), 20_000);
  try {
    const [code, text, error] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    if (code !== 0) throw new Error(`OpenCode API failed: ${error.slice(0, 300)}`);
    const result: unknown = JSON.parse(text);
    return isRecord(result) && "data" in result ? result.data : result;
  } finally {
    clearTimeout(timer);
  }
}

export async function createSession(directory: string, name: string, model?: string): Promise<string> {
  const version = Bun.spawnSync(["opencode", "--version"], { stdout: "pipe", stderr: "pipe" }).stdout.toString();
  if (!/\bv?2\./.test(version)) throw new Error("OpenCode V2 is required; check the login-shell executable");
  const id = `ses_${randomUUID().replaceAll("-", "")}`;
  const result = await api("post", "/api/session", {
    id, title: `wf: ${name}`, location: { directory },
    ...(model ? { model: parseModel(model) } : {}),
  });
  if (!isRecord(result) || result.id !== id) throw new Error("OpenCode session creation returned no matching ID");
  return id;
}

function parseModel(value: string): { providerID: string; id: string; variant?: string } {
  const [base, variant] = value.split("#");
  const slash = base.indexOf("/");
  if (slash < 1 || slash === base.length - 1) throw new Error(`Invalid model: ${value}`);
  return { providerID: base.slice(0, slash), id: base.slice(slash + 1), ...(variant ? { variant } : {}) };
}

export async function sessionOutcome(id: string): Promise<string> {
  const result = await api("get", `/api/session/${id}`);
  if (!isRecord(result) || typeof result.outcome !== "string") throw new Error("Session has no final outcome");
  return result.outcome;
}

export async function interruptSession(id: string): Promise<void> {
  await api("post", `/api/session/${id}/interrupt`, {});
}
