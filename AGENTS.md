# Agent Instructions

This repository uses project-specific AI guidance.

## Required Rule Source

- Primary rules file: `.aiassistant/rules/monorepo.md`
- Agents working in this repository must apply those rules for code generation, edits, and workflow guidance.

## Precedence

- System and tool safety instructions always take precedence.
- Then follow this file and `.aiassistant/rules/monorepo.md`.
- If there is a conflict with repository reality, prefer the actual repository configuration (`package.json`, `turbo.json`, `pnpm-workspace.yaml`) and update docs/rules to match.

## Scope

- These instructions apply to the entire repository.
- A deeper `AGENTS.md` may add scoped constraints for a subdirectory, but must not weaken root or monorepo rules.

## Agent Operating Rules

### 1) Definition of Done

- Run `pnpm format` before finalizing changes (for code, config, docs, and other supported file types where applicable).
- For source/config/script changes, run `pnpm lint` and `pnpm check-types`.
- Run affected tests when test coverage exists for the changed area.
- Update related documentation when behavior, workflows, or standards change.
- If a release tag is pushed to GitHub, ensure the corresponding `CHANGELOG.md` entry is added or updated in the same release change set.

### 2) Generated Artifact Policy

- Do not commit local runtime artifacts or caches (for example `.turbo/**` logs/state).
- Update `pnpm-lock.yaml` only when dependency graphs change.
- Commit generated `dist/**` files only when explicitly required by repository policy.

### 3) Commit and PR Hygiene

- Keep commits focused and use Conventional Commits.
- For non-trivial infra/workflow changes, include a concise commit body explaining intent and impact.

### 4) Uncertainty and Escalation

- If requirements are ambiguous or a change is risky/disruptive, ask before proceeding.
- Do not silently guess around unclear constraints.

### 5) Dependency Policy

- Prefer existing dependencies already used in the monorepo.
- When adding a dependency, justify why it is needed and align versions with `catalog:` / `workspace:*` standards.

### 6) Testing Expectations by Change Type

- Docs-only changes: run `pnpm format`; run code checks only if code/config was also touched.
- Code/config/script changes: run `pnpm format`, `pnpm lint`, `pnpm check-types`, and relevant tests.
- Release/workflow changes: run `pnpm format`, `pnpm lint`, `pnpm check-types`, and verify CI/ruleset/docs alignment.

### 7) Release Policy

- Keep release metadata synchronized: `package.json` version, `CHANGELOG.md` entry, and git tag.
- Do not retag existing versions unless explicitly requested.
