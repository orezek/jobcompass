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

export const actorRuntimeInputSchema = z
  .object({
    searchSpaceId: searchSpaceIdSchema.default('default'),
    startUrls: z.array(z.object({ url: z.string().url() })).min(1),
    maxItems: z.coerce.number().int().positive(),
    maxConcurrency: z.coerce.number().int().positive().default(1),
    maxRequestsPerMinute: z.coerce.number().int().positive().default(30),
    proxyConfiguration: proxyConfigurationSchema.optional(),
    debugLog: z.boolean().default(false),
    allowInactiveMarkingOnPartialRuns: z.boolean().default(false),
  })
  .strict();

export type ActorRuntimeInput = z.infer<typeof actorRuntimeInputSchema>;

export type ActorInputOverrides = {
  maxItems?: number;
  maxConcurrency?: number;
  maxRequestsPerMinute?: number;
  debugLog?: boolean;
  proxyConfiguration?: Record<string, unknown>;
  allowInactiveMarkingOnPartialRuns?: boolean;
};

export const buildActorInputFromSearchSpace = (
  searchSpace: SearchSpaceConfig,
  overrides: ActorInputOverrides = {},
): ActorRuntimeInput =>
  actorRuntimeInputSchema.parse({
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
    return explicitDbName;
  }

  const dbPrefix = input.dbPrefix.trim();
  const searchSpaceId = searchSpaceIdSchema.parse(input.searchSpaceId);

  if (dbPrefix.length === 0) {
    throw new Error('dbPrefix must not be empty when deriving a MongoDB database name.');
  }

  return `${dbPrefix}-${searchSpaceId}`;
};
