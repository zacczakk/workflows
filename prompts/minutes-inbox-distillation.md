# Minutes Inbox Distillation

Create one raw summary note for Phil's Knowledge vault inbox from one Minutes transcript.

## Output Contract

Return only the final markdown note.
Do not wrap it in code fences.
Do not add commentary before or after the note.

## Required Frontmatter

```yaml
---
type: note
parent: "[[Home]]"
created: YYYY-MM-DD
summary: "15-25 word plain-text summary"
tags: [minutes, meeting]
---
```

## Required Sections

- `# Meeting Summary: <title>`
- `## Source`
- `## Main Findings`
- `## Actions`
- `## Related Projects`
- `## Merge Hints`

## Rules

- Summarize facts and decisions, not polished meeting prose.
- Keep the note terse and reviewable.
- Infer related projects only from the project context provided to you.
- Use `[[project-name]]` wikilinks only when the project context clearly supports it.
- Prefer `## Notes` as the merge target unless the transcript strongly points to another section.
- If no project is clearly related, say so plainly in `## Related Projects` and `## Merge Hints`.
- Do not invent commitments or facts.
- Keep diarization discussion out of the meeting content unless it is actually discussed in the transcript.
