import { loadEnv } from '@repo/env-config';
import { z } from 'zod';
export const envSchema = z.object({
    HELLO_STRING: z.string().describe('Just env vars holding arbitrary string.'),
});
export const envs = loadEnv(envSchema, import.meta.url);
for (let n = 0; n < 1000; n++) {
    console.log(envs.HELLO_STRING);
}
