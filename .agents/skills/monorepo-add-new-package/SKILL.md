---
name: monorepo-add-new-package
description: Create a new shared package in this pnpm + Turborepo workspace with the correct `packages/<name>` layout, `@repo/<name>` naming, catalog/workspace dependency policy, TypeScript + ESLint setup, docs updates, and validation commands. Trigger when a user asks to add, scaffold, generate, or bootstrap a package under `packages/` or introduces a new `@repo/*` internal library.
---

# Add New Package

Follow this workflow to add a package that matches this repository's standards.

## 1) Collect Required Inputs

Decide these before creating files:

- Directory name in kebab-case: `packages/<name>`
- Package name: `@repo/<name>`
- Package type:
  - `node-lib` (default for shared runtime utilities)
  - `react-library` (for UI/shared React code)
  - `config-only` (for config exports like eslint/tsconfig packages)
- Short description and initial public API surface
- Required dependencies (internal and external)

If any of these are unclear, ask the user before writing files.

## 2) Create the Package Skeleton

Default to a TypeScript library unless the user explicitly wants `config-only`.

Create:

- `packages/<name>/package.json`
- `packages/<name>/tsconfig.json` (skip for `config-only` if not needed)
- `packages/<name>/eslint.config.js` (for TS/JS source packages)
- `packages/<name>/src/index.ts` (for source packages)
- `packages/<name>/README.md`

Use this baseline for standard shared libraries:

```json
{
  "name": "@repo/<name>",
  "version": "1.0.0",
  "description": "<description>",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.13.1",
  "engines": { "node": ">=24" },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "types": "./dist/index.d.ts",
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -w -p tsconfig.json",
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {},
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "typescript": "catalog:"
  }
}
```

Use this baseline `tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/node-lib.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"],
    "verbatimModuleSyntax": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test", "**/*.test.ts"]
}
```

For React libraries, switch to:

- `"extends": "@repo/typescript-config/react-library.json"`

Use this `eslint.config.js` for source packages:

```js
import { config as base } from '@repo/eslint-config/base';
export default [...base];
```

For `config-only` packages, follow the nearest existing pattern in:

- `packages/eslint-config`
- `packages/typescript-config`

Do not force a `dist` build pipeline if the package only exports static config files.

## 3) Apply Dependency Policy

Follow these rules exactly:

- Use `pnpm` only.
- Use `workspace:*` for internal packages (`@repo/*`).
- Use `catalog:` for external dependencies already listed in `pnpm-workspace.yaml`.
- If an external dependency is missing from catalogs, add it to `pnpm-workspace.yaml` first, then reference it with `catalog:`.
- Update `pnpm-lock.yaml` only when dependency graph changes.

## 4) Enforce Monorepo Boundaries

- Keep package in `packages/<name>`.
- Import shared internal code via `@repo/*` package imports.
- Never use deep relative imports across packages (forbidden: `../../packages/...`).

## 5) Update Documentation

After adding a new package, update:

- `packages/README.md` package table
- Other docs that list repository structure when affected (for example `README.md`)

If release metadata is involved, keep `CHANGELOG.md` synchronized.

## 6) Validate Before Completion

Run at minimum:

```bash
pnpm format
pnpm lint
pnpm check-types
```

Run package-level checks when scripts exist:

```bash
pnpm -C packages/<name> lint
pnpm -C packages/<name> check-types
pnpm -C packages/<name> build
```

Run affected tests if the changed area has test coverage.

## 7) Done Checklist

Before finishing, confirm:

- New package is in `packages/<name>` and named `@repo/<name>`
- Dependencies follow `workspace:*` and `catalog:` policy
- Docs are updated
- Formatting, linting, and type checks pass
- No runtime artifacts are committed (for example `.turbo/**`)
