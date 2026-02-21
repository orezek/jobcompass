import { z } from 'zod';
export declare const envSchema: z.ZodObject<{
    HELLO_STRING: z.ZodString;
}, z.core.$strip>;
export type EnvSchema = z.infer<typeof envSchema>;
export declare const envs: EnvSchema;
//# sourceMappingURL=app.d.ts.map