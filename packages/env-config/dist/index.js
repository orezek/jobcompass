import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { URL } from 'url'; // Built-in Node.js module
import {} from 'zod';
/**if
 * Loads and validates environment variables from .env files.
 *
 * @param schema - The Zod schema to validate against.
 * @param importMetaUrl - Pass `import.meta.url` from the calling file.
 * @returns The validated, type-safe environment object.
 */
export function loadEnv(schema, importMetaUrl) {
    // By using node file system functions create path/url strings - basically construct strings
    const appEnvDir = path.dirname(new URL(importMetaUrl).pathname);
    // Set NODE_ENV either by default or passed value
    const NODE_ENV = process.env.NODE_ENV || 'development';
    // Create an array literal and add three path/url strings that are one level less than the current directory
    // the resolve actually builds the string to make it a valid path
    const envFiles = [
        path.resolve(appEnvDir, '..', '.env'), // 1. Base .env
        path.resolve(appEnvDir, '..', `.env.${NODE_ENV}`), // 2. .env.development or .env.production
        path.resolve(appEnvDir, '..', '.env.local'), // 3. .env.local (highest priority)
    ];
    // For each path/url string in the array check if the path exists and if it does
    // load the .env file by dotenv and override any values in node.env if some already exists
    // dotenv loads data from file into process.env object in NODE!
    envFiles.forEach((filePath) => {
        if (fs.existsSync(filePath)) {
            dotenv.config({
                path: filePath,
                override: true,
            });
        }
    });
    // Zod parses the whole process.env object and validates it with zod
    const parsedEnv = schema.safeParse(process.env);
    // validated object that contains values from process.env is returned for further use
    if (!parsedEnv.success) {
        const errors = parsedEnv.error.issues
            .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
            .join('\n');
        throw new Error(`Environment variable validation failed:\n${errors}`);
    }
    return parsedEnv.data;
}
