# control-center-v2

Mobile-first Next.js operator UI for `control-service-v2`.

## Stack

- Next.js App Router
- Tailwind CSS
- shadcn/ui-style component primitives
- `react-hook-form` + `zod`

## Runtime Contract

- initial page loads use a server-only backend client against `control-service`
- browser-side mutations use same-origin Next.js Route Handlers
- live updates use a same-origin SSE proxy route
- the browser must not hold `CONTROL_SHARED_TOKEN`
- V2 assumes trusted internal access enforced outside the app

## Env

See [`.env.example`](./.env.example).

Required:

- `CONTROL_SERVICE_BASE_URL`
- `CONTROL_SHARED_TOKEN`

## Development

```bash
pnpm install
pnpm -C apps/control-center-v2 dev
```

## Validation

```bash
pnpm -C apps/control-center-v2 lint
pnpm -C apps/control-center-v2 check-types
pnpm -C apps/control-center-v2 build
pnpm -C apps/control-center-v2 test
```
