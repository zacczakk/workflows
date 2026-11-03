const proc = Bun.spawn(
  [process.execPath, "/Users/m332023/Repos/zacczakk/metronome/src/cli/index.ts", "sync-desktop"],
  { stdout: "inherit", stderr: "inherit" },
);

const code = await proc.exited;
console.log(`${new Date().toISOString()}: desktop-sync complete`);
process.exit(code);
