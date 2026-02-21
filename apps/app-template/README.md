# App Template

This folder is the base template for creating new apps in `apps/`.

Use the scaffold command by default. Manual copy is fallback-only.

## Scaffold command

You can scaffold a new app from repo root with:

```bash
pnpm scaffold <name>
```

Example:

```bash
pnpm scaffold billing-service
```

This command creates `apps/<name>` from `apps/app-template`, excludes copied build artifacts (`node_modules`, `dist`, `.turbo`, `tsconfig.tsbuildinfo`), copies `AGENTS.md`, and updates the new app's `package.json` `"name"` field.

### `-C` vs `-F` (`--filter`)

- `-C` (uppercase) changes the working directory for the command.
- `-F` / `--filter` targets a workspace package by name from repo root.

Both are valid in this monorepo. Examples for an app named `billing-service`:

```bash
# with -C
pnpm -C apps/billing-service lint
pnpm -C apps/billing-service check-types
pnpm -C apps/billing-service build

# with -F / --filter
pnpm -F billing-service lint
pnpm -F billing-service check-types
pnpm -F billing-service build
```

## Important warning

Do not delete `apps/app-template`. It is the base template used to create new apps.

## Fallback only: manual app creation

Use this section only when `pnpm scaffold <name>` is unavailable or when you explicitly need a manual flow.

1. Pick a new app name in kebab-case, for example `billing-service`.
2. Copy the template:

```bash
cp -R apps/app-template apps/billing-service
```

3. Remove copied build artifacts and local dependencies:

```bash
rm -rf apps/billing-service/node_modules \
       apps/billing-service/dist \
       apps/billing-service/.turbo \
       apps/billing-service/tsconfig.tsbuildinfo
```

4. Update `apps/billing-service/package.json`:
   - Set `"name"` to your new app name.
   - Update `"description"` and `"author"` as needed.
   - Keep workspace dependencies (`workspace:*`) and catalog dependencies (`catalog:`) unchanged unless there is a reason to change them.

5. Update app-specific files:
   - `apps/billing-service/README.md`
   - `apps/billing-service/.env`
   - `apps/billing-service/src/app.ts`

6. Install and validate from repository root:

```bash
pnpm install
pnpm -C apps/billing-service lint
pnpm -C apps/billing-service check-types
pnpm -C apps/billing-service build

# equivalent filter form
pnpm -F billing-service lint
pnpm -F billing-service check-types
pnpm -F billing-service build
```

7. Start the app locally:

```bash
pnpm -C apps/billing-service dev
```

The new app is automatically included in the workspace because `pnpm-workspace.yaml` already includes `apps/*`.
