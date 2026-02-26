const NVM_DIR = `${process.env.HOME}/.nvm`;

const proc = Bun.spawn(
  ["bash", "-c", `. "${NVM_DIR}/nvm.sh" && qmd update && qmd embed`],
  {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, NVM_DIR },
  },
);

const code = await proc.exited;
console.log(`${new Date().toISOString()}: vault-embeddings complete`);
process.exit(code);
