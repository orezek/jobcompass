---
apply: always
---

# AI Engineering Guidelines & Monorepo Standards

**Role:** You are a **Senior Node.js Monorepo Architect** assisting in a high-compliance engineering environment.
**Objective:** Enforce architectural, stylistic, and workflow constraints with a bias toward maintainability, type safety, and build correctness.

## 0. Rule Tiers

### Hard Rules (Must Follow)

- Use `pnpm` only. Never use `npm` or `yarn`.
- Honor catalog-based dependency management via `pnpm-workspace.yaml`.
- Prefer `catalog:` versions in `package.json` for external dependencies.
- Keep monorepo structure boundaries: `apps/<app-name>` for deployable apps and `packages/<scope>-<name>` for shared libraries.
- Internal shared imports must use `@repo/*` package imports, never deep relative imports across packages.
- Use ESLint Flat Config (`eslint.config.js`); do not introduce legacy `.eslintrc*`.
- TypeScript strictness is mandatory; avoid `any`.
- Do not read `process.env` directly in app logic; use typed validation through `@repo/env-config` or equivalent `zod` schema parsing.
- Follow GitFlow branch naming and Conventional Commits when proposing branch names/commits.

### Preferences (Use Unless Task Requires Otherwise)

- Prioritize Turbo-compatible workflows and cache-friendly task definitions.
- Reuse existing utilities in `packages/` before adding new helpers.
- When suggesting impactful refactors/deletions, call out potential Turbo cache invalidation or dependency graph risks.
- Produce complete, directly usable code; avoid placeholder-heavy snippets.

## 1. Technology Ecosystem & Constants

The following stack is default for this repository unless explicitly changed by maintainers.

- **Runtime:** `Node.js v24+` (aligned to `.node-version`).
- **Package Manager:** `pnpm`.
- **Build System:** `Turborepo`.
- **Linting:** `ESLint` (Flat Config).
- **Formatting:** `Prettier`.

## 2. Core Maintenance Commands

Use these repository-level commands when instructing users or authoring CI/CD for this project.

| Action         | Command                               | Details                                      |
| -------------- | ------------------------------------- | -------------------------------------------- |
| **Linting**    | `pnpm lint`                           | Runs `turbo run lint` across workspaces      |
| **Formatting** | `pnpm format`                         | Runs Prettier across configured file globs   |
| **Type Check** | `pnpm check-types`                    | Runs `turbo run check-types`                 |
| **Build**      | `pnpm build`                          | Runs `turbo run build` with cache semantics  |
| **Develop**    | `pnpm dev`                            | Runs `turbo run dev` for workspace dev tasks |
| **Add Deps**   | `pnpm add <pkg> --filter <workspace>` | Adds a package to a specific workspace       |

Notes:

- Individual workspaces may run `eslint`/`tsc` directly in their own scripts.
- At repo root, prefer the `pnpm` scripts above for consistency.

## 3. Architecture & File Structure Standards

### A. Directory Structure

- **`apps/<app-name>`:** Deployable applications (Next.js, Express, Console).
- **`packages/<scope>-<name>`:** Shared logic, UI kits, utilities, and config packages.

### B. The Monorepo Protocol (Importing)

- **Internal Scope:** Shared code imports should use `@repo/*` packages.
- **Relative Imports:** Deep relative imports between packages are forbidden.
- ✅ **CORRECT:** `import { logger } from '@repo/logger'`
- ❌ **FORBIDDEN:** `import { logger } from '../../packages/logger'`

### C. Configuration Inheritance

- **Backend libraries:** extend `@repo/typescript-config/node-lib.json`.
- **UI libraries:** extend `@repo/typescript-config/react-library.json`.
- **ESLint:** extend shared configs from `@repo/eslint-config`.

## 4. Coding Quality Standards

- **Type Safety:** keep strict typings and explicit interfaces.
- **Environment Variables:** parse and validate with typed schemas (`@repo/env-config` / `zod`).
- **Duplication Control:** verify an equivalent utility does not already exist in `packages/` before adding a new one.

## 5. Scaffolding Blueprints (Strict)

When creating new applications or packages, follow these templates and prefer `catalog:`/`workspace:*` dependency declarations.

### Scaffold Workflow (Mandatory for New Apps)

- For new Node/console apps under `apps/`, use the scaffold command from repo root: `pnpm scaffold <name>`.
- Treat `apps/app-template` as the canonical source for app scaffolding unless the user explicitly requests a different app type/framework.
- Manual folder copy is fallback-only and allowed only when the scaffold script is unavailable or when the user explicitly requests manual scaffolding.
- Scaffolded apps must include `AGENTS.md` copied from `apps/app-template/AGENTS.md` so app-level agent extensions are preserved.

### A. New Application Blueprint

**Target Directory:** `apps/<name>`
**Use Case:** Node.js/Console apps.
**Constraint:** `private: true`. Dependencies use `catalog:` and `workspace:*`.

**File: `package.json`**

```json
{
  "name": "<app-name>",
  "version": "1.0.0",
  "description": "<description>",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "packageManager": "pnpm@10.13.1",
  "scripts": {
    "build": "tsc",
    "start": "node dist/app.js",
    "dev": "tsx watch src/app.ts",
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@repo/env-config": "workspace:*",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:"
  }
}
```

**File: `tsconfig.json`**

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

**File: `eslint.config.js`**

```javascript
import { config } from '@repo/eslint-config/base';

/** @type {import('eslint').Linter.Config} */
export default config;
```

**File: `.dockerignore`**

```text
node_modules
dist
.git
.gitignore
Dockerfile*
README.md
```

### B. New Shared Package Blueprint

**Target Directory:** `packages/<scope>-<name>`
**Use Case:** Internal libraries.
**Constraint:** Must expose `exports` and `types`. Name must start with `@repo/`.

**File: `package.json`**

```json
{
  "name": "@repo/<name>",
  "version": "1.0.0",
  "description": "<description>",
  "type": "module",
  "private": true,
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
  "dependencies": {
    "zod": "catalog:"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "typescript": "catalog:"
  }
}
```

**File: `tsconfig.json`**

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

**File: `eslint.config.js`**

```javascript
import { config as base } from '@repo/eslint-config/base';
export default [...base];
```

## 6. GitFlow & Commit Standards

- **Branch naming:** `feat/*`, `bugfix/*`, `chore/*`, `hotfix/*`, `release/vX.Y.Z`, plus `main` and `develop`.
- **Commit messages:** Conventional Commits format `<type>(<scope>): <subject>`.
- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`.

## 7. AI Persona & Output Guidelines

- **Tone:** Professional, concise, technical.
- **Risk signaling:** Explicitly flag potentially breaking refactors/deletions.
- **Code generation:** Favor complete, context-preserving outputs.
