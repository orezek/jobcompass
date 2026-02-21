---
name: monorepo-add-new-app
description: Create a new deployable app in this pnpm + Turborepo workspace using the mandatory scaffold flow (`pnpm scaffold <app-name>`) and app-template conventions. Trigger when a user asks to add, bootstrap, scaffold, or generate an app under `apps/`, including setup, dependency policy, app-local updates, documentation updates, and validation.
---

# Add New App

Use this workflow to add a new app that strictly follows repository rules.

## 1) Collect Required Inputs

Confirm these before creating the app:

- App name in kebab-case (target path: `apps/<app-name>`)
- Purpose/description of the app
- Whether default app-template scaffold is acceptable (default: yes)
- Any required dependencies beyond template defaults

If naming or intent is unclear, ask before running scaffold.

## 2) Use Scaffold Workflow (Mandatory)

For new Node/console apps under `apps/`, run from repo root:

```bash
pnpm scaffold <app-name>
```

This is the default and required path unless the scaffold script is unavailable or the user explicitly asks for manual scaffolding.

The scaffold script:

- Copies from `apps/app-template` (canonical source)
- Excludes local artifacts (`node_modules`, `dist`, `.turbo`, `tsconfig.tsbuildinfo`)
- Verifies `AGENTS.md` is present and copied to the new app
- Rewrites `apps/<app-name>/package.json` `name` to `<app-name>`

## 3) Fallback Manual Flow (Fallback-Only)

Use manual copy only if:

- Scaffold script is unavailable, or
- User explicitly requests manual scaffolding

Fallback commands:

```bash
cp -R apps/app-template apps/<app-name>
rm -rf apps/<app-name>/node_modules \
       apps/<app-name>/dist \
       apps/<app-name>/.turbo \
       apps/<app-name>/tsconfig.tsbuildinfo
```

Then update:

- `apps/<app-name>/package.json` (`name`, description, metadata)
- `apps/<app-name>/README.md`
- `apps/<app-name>/.env` (if app requires env vars)
- `apps/<app-name>/src/app.ts`
- Keep `apps/<app-name>/AGENTS.md` inherited from template

## 4) Enforce App Conventions

Keep these app-level standards:

- `private: true` in `package.json`
- `type: "module"`
- `packageManager: "pnpm@10.13.1"`
- `engines.node: ">=24"`
- Scripts:
  - `build`: `tsc`
  - `start`: `node dist/app.js`
  - `dev`: `tsx watch src/app.ts`
  - `lint`: `eslint . --max-warnings 0`
  - `check-types`: `tsc --noEmit`
- TypeScript config extends `@repo/typescript-config/node-lib.json`
- ESLint uses flat config from `@repo/eslint-config`

Use app-template defaults unless user explicitly requests a different framework/app type.

## 5) Apply Dependency and Import Rules

Follow repository dependency policy:

- Use `pnpm` only
- Internal dependencies: `workspace:*` (for example `@repo/env-config`)
- External shared dependencies: `catalog:` from `pnpm-workspace.yaml`
- If external dependency is missing in catalogs, add it to `pnpm-workspace.yaml` first, then use `catalog:`

Follow import boundary policy:

- Import shared code via `@repo/*`
- Never use deep relative imports into `packages/` (forbidden: `../../packages/...`)

## 6) Keep Env Handling Type-Safe

Do not read `process.env` directly in app logic. Use typed parsing/validation:

- `@repo/env-config`
- `zod` schema validation

## 7) Update Docs When Needed

After creating the app, update relevant docs when behavior/workflow references change:

- `README.md` (if app listings/workflow details change)
- `apps/README.md` (if app scaffolding behavior changes)

Do not edit docs unnecessarily if nothing changed beyond adding a standard app.

## 8) Validate Before Completion

Run required checks for app creation changes:

```bash
pnpm format
pnpm lint
pnpm check-types
```

Run app-specific validation:

```bash
pnpm -C apps/<app-name> lint
pnpm -C apps/<app-name> check-types
pnpm -C apps/<app-name> build
```

Run affected tests when coverage exists for the changed area.

## 9) Done Checklist

Before finishing, confirm:

- App exists at `apps/<app-name>` and was scaffolded from template (or fallback was justified)
- `AGENTS.md` exists in the new app
- Script and config conventions are unchanged from template standards
- Dependencies follow `workspace:*` and `catalog:`
- Formatting/lint/type checks pass
- No local artifacts are committed (for example `.turbo/**`)
