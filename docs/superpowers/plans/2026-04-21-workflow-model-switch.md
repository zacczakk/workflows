# Workflow Model Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch agent workflow runs from GitHub Copilot Claude Opus 4.6 to GitHub Copilot GPT-5.4 without changing scheduling or runtime behavior.

**Architecture:** Keep the change config-only at runtime. Update the explicit `model` fields in `workflows.toml`, then bring live docs back in sync so operator-facing docs match actual behavior. Verification stays lightweight: repo search plus `wf status` to confirm config still parses.

**Tech Stack:** Bun, TypeScript, TOML workflow config, markdown docs, `wf` CLI

---

### Task 1: Update workflow config

**Files:**
- Modify: `workflows.toml`

- [ ] **Step 1: Replace agent workflow model values**

Update every agent workflow entry from:

```toml
model = "github-copilot/claude-opus-4.6"
```

to:

```toml
model = "github-copilot/gpt-5.4"
```

Required targets in `workflows.toml`:

- `workflows.vault-inbox-processing`
- `workflows.vault-session-processing`
- `workflows.vault-grooming`
- `workflows.vault-backlog-triage`
- `workflows.vault-knowledge-distillation`
- `workflows.vault-consolidation`
- `workflows.vault-retrieval-practice`

- [ ] **Step 2: Verify old model string is gone from config**

Run: `rg 'github-copilot/claude-opus-4.6|github-copilot/gpt-5.4' workflows.toml`
Expected: only `github-copilot/gpt-5.4` matches in agent workflow entries

### Task 2: Update live docs

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/PLAN.md`

- [ ] **Step 1: Update README runtime model reference**

Change this sentence in `README.md`:

```md
Agent workflows use `github-copilot/claude-opus-4.6` as the model.
```

to:

```md
Agent workflows use `github-copilot/gpt-5.4` as the model.
```

- [ ] **Step 2: Update plan doc model rows**

Change these rows in `docs/plans/PLAN.md`:

```md
| Model | `github-copilot/claude-opus-4.6` |
```

to:

```md
| Model | `github-copilot/gpt-5.4` |
```

Update both documented workflow sections that still carry the old value.

- [ ] **Step 3: Verify no stale live doc references remain**

Run: `rg 'github-copilot/claude-opus-4.6' README.md docs/plans/PLAN.md workflows.toml`
Expected: no matches

### Task 3: Smoke verification

**Files:**
- Modify: none

- [ ] **Step 1: Confirm workflow CLI still reads config**

Run: `wf status`
Expected: command succeeds and prints workflow status table

- [ ] **Step 2: Optional focused sanity check**

Run: `rg 'github-copilot/gpt-5.4' workflows.toml README.md docs/plans/PLAN.md`
Expected: matches appear in config and updated docs

- [ ] **Step 3: Commit**

```bash
git add workflows.toml README.md docs/plans/PLAN.md docs/superpowers/specs/2026-04-21-workflow-model-switch-design.md docs/superpowers/plans/2026-04-21-workflow-model-switch.md
git commit -m "build: switch workflow models to gpt-5.4"
```

Only if the user explicitly asks for a commit.
