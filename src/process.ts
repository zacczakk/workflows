export function descendants(pid: number): number[] {
  const result = Bun.spawnSync(["ps", "-axo", "pid=,ppid="], { stdout: "pipe", stderr: "ignore" });
  const pairs = result.stdout.toString().trim().split("\n").map((line) => line.trim().split(/\s+/).map(Number));
  const children: number[] = [];
  const visit = (parent: number) => {
    for (const [child, owner] of pairs) if (owner === parent && child > 1 && child !== parent) { visit(child); children.push(child); }
  };
  visit(pid);
  return children;
}

export function signalProcesses(pids: number[], signal: NodeJS.Signals): void {
  for (const pid of pids) {
    try { process.kill(pid, signal); } catch {}
  }
}
