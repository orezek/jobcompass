# @repo/env-config

Typed environment variable loading and validation for monorepo apps.

This package provides one utility:

- `loadEnv(schema, import.meta.url)`

It loads app-local `.env` files, validates values with `zod`, and returns a typed object.

## Why use it

- Centralized env-loading behavior across apps.
- Fail-fast startup when required variables are missing or invalid.
- Type-safe env access in app code.

## Load Order

Files are loaded in this order (later overrides earlier):

1. `.env`
2. `.env.${NODE_ENV}`
3. `.env.local`

`NODE_ENV` defaults to `development` when not set.

## Usage

```ts
import { z } from 'zod';
import { loadEnv } from '@repo/env-config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = loadEnv(envSchema, import.meta.url);
```

## API

```ts
loadEnv<T extends z.ZodTypeAny>(schema: T, importMetaUrl: string): z.infer<T>
```

- `schema`: app-specific `zod` schema.
- `importMetaUrl`: pass `import.meta.url` from the calling file.

## Best Practices

- Keep secrets in `.env.local` and ignore it in Git.
- Commit `.env.example` files with non-secret placeholders.
- Access env values only through the parsed object returned by `loadEnv`.
