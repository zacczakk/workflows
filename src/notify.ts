export function notifyFailure(name: string, text: string): void {
  console.error(`${name}: ${text}`);
  if (process.env.WF_NOTIFICATIONS === "0") return;
  const literal = (value: string) => JSON.stringify(value).replaceAll("\\n", " ");
  const result = Bun.spawnSync(["/usr/bin/osascript", "-e", `display notification ${literal(text.slice(0, 180))} with title ${literal(`Workflow failed: ${name}`)}`], { stdout: "ignore", stderr: "pipe" });
  if (result.exitCode !== 0) console.error(`Notification delivery failed for ${name}`);
}
