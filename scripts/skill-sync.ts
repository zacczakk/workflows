const proc = Bun.spawn(
  [process.execPath, `${process.env.HOME}/Repos/zacczakk/metronome/scripts/sync-upstream-skills.ts`],
  { stdout: "inherit", stderr: "inherit" },
);

const code = await proc.exited;
console.log(`${new Date().toISOString()}: skill-sync complete`);
process.exit(code);
