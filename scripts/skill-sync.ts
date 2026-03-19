const NVM_DIR = `${process.env.HOME}/.nvm`;

const proc = Bun.spawn(
  ["bash", "-c", `. "${NVM_DIR}/nvm.sh" && npx tsx /Users/m332023/Repos/acsync/scripts/sync-upstream-skills.ts`],
  {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, NVM_DIR },
  },
);

const code = await proc.exited;
console.log(`${new Date().toISOString()}: skill-sync complete`);
process.exit(code);
