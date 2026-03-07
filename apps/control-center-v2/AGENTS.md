# control-center-v2 Agent Instructions

These instructions are app-local extensions of the repository root rules.

## Inheritance

- Apply the root `AGENTS.md` first.
- Apply `.aiassistant/rules/monorepo.md`.
- If a local rule conflicts with repo reality for this app, prefer the actual Next.js app configuration.

## App-Specific Constraints

- This app uses Next.js App Router.
- Preserve local script conventions in `package.json`:
  - `build`: `next build`
  - `start`: `next start`
  - `dev`: `next dev`
- Keep ESLint on `@repo/eslint-config/next-js`.
- Keep TypeScript on `@repo/typescript-config/nextjs.json`.
- Keep env parsing typed through `@repo/env-config` + `zod`.
- Server Components should call the backend through server-only helpers, not local Route Handlers.
- Route Handlers are for browser-side mutations and the SSE proxy only.
- Keep the browser free of `CONTROL_SHARED_TOKEN`.
