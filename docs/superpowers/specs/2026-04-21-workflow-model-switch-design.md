---
title: Workflow Model Switch Design
date: 2026-04-21
status: proposed
summary: Switch nightly agent workflows from GitHub Copilot Claude Opus 4.6 to GitHub Copilot GPT-5.4 by updating config and live docs only.
---

# Workflow Model Switch Design

## Goal

Switch the model used by agent-based workflows from `github-copilot/claude-opus-4.6` to `github-copilot/gpt-5.4`.

## Scope

- Update agent workflow model entries in `workflows.toml`
- Update live documentation that states the workflow model
- Leave script workflows unchanged
- Leave runtime logic, validation, cadence, and scheduling unchanged

## Approach

Use the smallest possible change:

1. Replace each agent workflow `model` value in `workflows.toml` with `github-copilot/gpt-5.4`
2. Update `README.md` and `docs/plans/PLAN.md` where they still describe the old model
3. Verify no remaining live config/docs references to `github-copilot/claude-opus-4.6` remain in active workflow surfaces

## Alternatives Considered

### Shared default model setting

Add a top-level default model config and let workflows inherit it.

Rejected for now:

- larger schema and validation change
- unnecessary for seven explicit entries
- adds migration surface with no immediate payoff

## Risks

- Stale docs if any live references are missed
- Runtime compatibility risk if OpenCode or provider naming differs, mitigated by using the already-documented `github-copilot/gpt-5.4` model string already present elsewhere in this repo

## Verification

- Search repo for `github-copilot/claude-opus-4.6`
- Run `wf status` to ensure config remains readable and workflow status still renders

## Non-Goals

- Changing script workflows
- Refactoring config structure
- Changing prompts, timeouts, or schedule ordering
