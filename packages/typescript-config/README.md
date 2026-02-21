# @repo/typescript-config

Shared TypeScript configuration presets for this monorepo.

## Installation

Add to a target workspace from repo root:

```bash
pnpm add -D @repo/typescript-config --filter <workspace-name>
```

## How to use

Create `tsconfig.json` in your app/package and extend the appropriate preset.

### Node library / service

```json
{
  "extends": "@repo/typescript-config/node-lib.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test", "**/*.test.ts"]
}
```

### React library

```json
{
  "extends": "@repo/typescript-config/react-library.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test", "**/*.test.ts"]
}
```

### Next.js app

```json
{
  "extends": "@repo/typescript-config/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## Presets

- `base.json`: strict defaults shared everywhere (`strict`, `noUncheckedIndexedAccess`, `incremental`, etc.).
- `node-lib.json`: NodeNext modules, Node types, declarations enabled.
- `react-library.json`: Bundler module resolution, React JSX, DOM libs.
- `nextjs.json`: Next plugin, bundler resolution, JSX preserve, `noEmit`.

## Notes

- Prefer extending `node-lib.json` for backend/worker/CLI packages.
- Prefer extending `react-library.json` for reusable browser UI libraries.
- Use `nextjs.json` only for Next.js applications.
