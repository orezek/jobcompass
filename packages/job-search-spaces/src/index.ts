import { createHash } from 'node:crypto';
import { z } from 'zod';

export const searchSpaceIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'searchSpaceId must be kebab-case using lowercase letters, numbers, and hyphens.',
  });

const startUrlSchema = z.string().url();
const proxyConfigurationSchema = z
  .object({ useApifyProxy: z.boolean().optional() })
  .catchall(z.unknown());

export const searchSpaceConfigSchema = z
  .object({
    searchSpaceId: searchSpaceIdSchema,
    description: z.string().trim().min(1),
    startUrls: z.array(startUrlSchema).min(1),
    crawlDefaults: z
      .object({
        maxItems: z.number().int().positive(),
        maxConcurrency: z.number().int().positive().default(1),
        maxRequestsPerMinute: z.number().int().positive().default(30),
        debugLog: z.boolean().default(false),
        proxyConfiguration: proxyConfigurationSchema.optional(),
      })
      .strict(),
    reconciliation: z
      .object({
        allowInactiveMarkingOnPartialRuns: z.boolean().default(false),
      })
      .strict(),
    ingestion: z
      .object({
        triggerEnabledByDefault: z.boolean().default(false),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SearchSpaceConfig = z.infer<typeof searchSpaceConfigSchema>;

export const actorOperatorInputSchema = z
  .object({
    searchSpaceId: searchSpaceIdSchema,
    maxItems: z.coerce.number().int().positive().optional(),
    maxConcurrency: z.coerce.number().int().positive().optional(),
    maxRequestsPerMinute: z.coerce.number().int().positive().optional(),
    proxyConfiguration: proxyConfigurationSchema.optional(),
    debugLog: z.boolean().optional(),
    allowInactiveMarkingOnPartialRuns: z.boolean().optional(),
  })
  .strict();

export type ActorOperatorInput = z.infer<typeof actorOperatorInputSchema>;

export const resolvedActorRuntimeInputSchema = z
  .object({
    searchSpaceId: searchSpaceIdSchema,
    startUrls: z.array(z.object({ url: z.string().url() })).min(1),
    maxItems: z.coerce.number().int().positive(),
    maxConcurrency: z.coerce.number().int().positive(),
    maxRequestsPerMinute: z.coerce.number().int().positive(),
    proxyConfiguration: proxyConfigurationSchema.optional(),
    debugLog: z.boolean(),
    allowInactiveMarkingOnPartialRuns: z.boolean(),
  })
  .strict();

export type ResolvedActorRuntimeInput = z.infer<typeof resolvedActorRuntimeInputSchema>;

export type ActorInputOverrides = {
  maxItems?: number;
  maxConcurrency?: number;
  maxRequestsPerMinute?: number;
  debugLog?: boolean;
  proxyConfiguration?: Record<string, unknown>;
  allowInactiveMarkingOnPartialRuns?: boolean;
};

export const MONGO_DB_NAME_MAX_BYTES = 38;
const DERIVED_MONGO_DB_HASH_LENGTH = 8;

export const buildActorInputFromSearchSpace = (
  searchSpace: SearchSpaceConfig,
  overrides: ActorInputOverrides = {},
): ResolvedActorRuntimeInput =>
  resolvedActorRuntimeInputSchema.parse({
    searchSpaceId: searchSpace.searchSpaceId,
    startUrls: searchSpace.startUrls.map((url) => ({ url })),
    maxItems: overrides.maxItems ?? searchSpace.crawlDefaults.maxItems,
    maxConcurrency: overrides.maxConcurrency ?? searchSpace.crawlDefaults.maxConcurrency,
    maxRequestsPerMinute:
      overrides.maxRequestsPerMinute ?? searchSpace.crawlDefaults.maxRequestsPerMinute,
    debugLog: overrides.debugLog ?? searchSpace.crawlDefaults.debugLog,
    proxyConfiguration:
      overrides.proxyConfiguration ?? searchSpace.crawlDefaults.proxyConfiguration,
    allowInactiveMarkingOnPartialRuns:
      overrides.allowInactiveMarkingOnPartialRuns ??
      searchSpace.reconciliation.allowInactiveMarkingOnPartialRuns,
  });

export const deriveMongoDbName = (input: {
  dbPrefix: string;
  searchSpaceId: string;
  explicitDbName?: string | null | undefined;
}): string => {
  const explicitDbName = input.explicitDbName?.trim();
  if (explicitDbName) {
    if (Buffer.byteLength(explicitDbName, 'utf8') > MONGO_DB_NAME_MAX_BYTES) {
      throw new Error(
        `Database name ${explicitDbName} is too long. Max database name length is ${MONGO_DB_NAME_MAX_BYTES} bytes.`,
      );
    }

    return explicitDbName;
  }

  const dbPrefix = input.dbPrefix.trim();
  const searchSpaceId = searchSpaceIdSchema.parse(input.searchSpaceId);

  if (dbPrefix.length === 0) {
    throw new Error('dbPrefix must not be empty when deriving a MongoDB database name.');
  }

  const candidateName = `${dbPrefix}-${searchSpaceId}`;
  if (Buffer.byteLength(candidateName, 'utf8') <= MONGO_DB_NAME_MAX_BYTES) {
    return candidateName;
  }

  const hash = createHash('sha256')
    .update(candidateName)
    .digest('hex')
    .slice(0, DERIVED_MONGO_DB_HASH_LENGTH);
  const hashSuffix = `-${hash}`;
  const baseMaxBytes = MONGO_DB_NAME_MAX_BYTES - Buffer.byteLength(hashSuffix, 'utf8');

  let truncatedBase = '';
  for (const character of candidateName) {
    if (Buffer.byteLength(`${truncatedBase}${character}`, 'utf8') > baseMaxBytes) {
      break;
    }

    truncatedBase += character;
  }

  const normalizedBase = truncatedBase.replace(/-+$/u, '');
  if (normalizedBase.length === 0) {
    return hash.slice(0, MONGO_DB_NAME_MAX_BYTES);
  }

  return `${normalizedBase}${hashSuffix}`;
};
