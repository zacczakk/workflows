const identity = process.env.WF_CODESIGN_IDENTITY;
const identifier = "com.zacczakk.workflows.wf";

if (!identity) {
  console.error("WF_CODESIGN_IDENTITY must name an installed code-signing identity");
  process.exit(1);
}

function run(args: string[]): void {
  const result = Bun.spawnSync(args, { stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

run(["bun", "build", "src/wf.ts", "--compile", "--outfile", "bin/wf"]);
run([
  "/usr/bin/codesign",
  "--force",
  "--sign",
  identity,
  "--identifier",
  identifier,
  "bin/wf",
]);
