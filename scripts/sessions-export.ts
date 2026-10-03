const proc = Bun.spawn(
  ["sessions", "export"],
  { stdout: "inherit", stderr: "inherit" },
);

const code = await proc.exited;
console.log(`${new Date().toISOString()}: sessions-export complete`);
process.exit(code);
