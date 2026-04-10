import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

test("minutes prompt template defines the markdown output contract", () => {
  const prompt = readFileSync(
    resolve(import.meta.dir, "../prompts/minutes-inbox-distillation.md"),
    "utf-8",
  );

  for (const phrase of [
    "## Output Contract",
    "Return only the final markdown note.",
    "Do not wrap it in code fences.",
    "## Required Frontmatter",
    "```yaml",
    "type: note",
    'parent: "[[Home]]"',
    "created: YYYY-MM-DD",
    "summary:",
    "tags: [minutes, meeting]",
    "## Required Sections",
    "# Meeting Summary: <title>",
    "## Source",
    "## Main Findings",
    "## Actions",
    "## Related Projects",
    "## Merge Hints",
    "Prioritize the actual business core of the meeting over long product-demo detail.",
    "Do not invent commitments or facts.",
  ]) {
    expect(prompt).toContain(phrase);
  }
});
