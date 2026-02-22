import { loadEnv } from '@repo/env-config';
import { z } from 'zod';

const crawleeLogLevels = z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'OFF']);

const envSchema = z.object({
  CRAWLEE_LOG_LEVEL: crawleeLogLevels.describe(
    'Crawlee logger constant for setting up logging levels.',
  ),
});

type EnvSchema = z.infer<typeof envSchema>;

export const envs: EnvSchema = loadEnv(envSchema, import.meta.url);
