const proc = Bun.spawn(["bash", "-c", "qmd update && qmd embed"], {
  stdout: "inherit",
  stderr: "inherit",
});

const code = await proc.exited;
console.log(`${new Date().toISOString()}: vault-embeddings complete`);
process.exit(code);
