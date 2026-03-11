import {
  createControlPlanePipelineRequestV2Schema,
  updateControlPlanePipelineRequestV2Schema,
} from '@repo/control-plane-contracts/v2';
import { z } from 'zod';
import type {
  CreateControlPlanePipelineRequest,
  UpdateControlPlanePipelineRequest,
} from '@/lib/contracts';
import { splitTextareaLines } from '@/lib/utils';

export const PIPELINE_NAME_MIN_LENGTH = 3;
export const PIPELINE_NAME_MAX_LENGTH = 64;
export const SEARCH_SPACE_NAME_MIN_LENGTH = 3;
export const SEARCH_SPACE_NAME_MAX_LENGTH = 65;
export const RUNTIME_PROFILE_NAME_MIN_LENGTH = 3;
export const RUNTIME_PROFILE_NAME_MAX_LENGTH = 64;
export const SEARCH_SPACE_DESCRIPTION_MAX_LENGTH = 1000;
export const START_URLS_MAX_COUNT = 10;
export const START_URL_MAX_LENGTH = 2048;
export const MAX_ITEMS_MIN = 1;
export const MAX_ITEMS_MAX = 5000;
export const CRAWLER_MAX_CONCURRENCY_MIN = 1;
export const CRAWLER_MAX_CONCURRENCY_MAX = 4;
export const CRAWLER_RPM_MIN = 1;
export const CRAWLER_RPM_MAX = 20;
export const INGESTION_CONCURRENCY_MIN = 1;
export const INGESTION_CONCURRENCY_MAX = 32;
export const MONGO_DB_NAME_MIN_LENGTH = 3;
export const MONGODB_URI_MAX_LENGTH = 2048;

const safeNameCharsetRegex = /^[A-Za-z0-9 ._-]+$/u;
const mongoDbNameCharsetRegex = /^[A-Za-z0-9_-]+$/u;
const mongoUriSchemeRegex = /^mongodb(?:\+srv)?:\/\//iu;
export const MONGO_DB_NAME_MAX_BYTES = 38;

const pipelineNameSchema = z
  .string()
  .min(PIPELINE_NAME_MIN_LENGTH, `Name must be at least ${PIPELINE_NAME_MIN_LENGTH} characters.`)
  .max(PIPELINE_NAME_MAX_LENGTH, `Name must be at most ${PIPELINE_NAME_MAX_LENGTH} characters.`)
  .regex(
    safeNameCharsetRegex,
    'Name may contain only letters, numbers, spaces, dot, underscore, and hyphen.',
  );

const searchSpaceNameSchema = z
  .string()
  .min(
    SEARCH_SPACE_NAME_MIN_LENGTH,
    `Search space name must be at least ${SEARCH_SPACE_NAME_MIN_LENGTH} characters.`,
  )
  .max(
    SEARCH_SPACE_NAME_MAX_LENGTH,
    `Search space name must be at most ${SEARCH_SPACE_NAME_MAX_LENGTH} characters.`,
  )
  .regex(
    safeNameCharsetRegex,
    'Search space name may contain only letters, numbers, spaces, dot, underscore, and hyphen.',
  );

const runtimeProfileNameSchema = z
  .string()
  .min(
    RUNTIME_PROFILE_NAME_MIN_LENGTH,
    `Runtime profile name must be at least ${RUNTIME_PROFILE_NAME_MIN_LENGTH} characters.`,
  )
  .max(
    RUNTIME_PROFILE_NAME_MAX_LENGTH,
    `Runtime profile name must be at most ${RUNTIME_PROFILE_NAME_MAX_LENGTH} characters.`,
  )
  .regex(
    safeNameCharsetRegex,
    'Runtime profile name may contain only letters, numbers, spaces, dot, underscore, and hyphen.',
  );

const mongoDbNameSchema = z
  .string()
  .min(
    MONGO_DB_NAME_MIN_LENGTH,
    `MongoDB database name must be at least ${MONGO_DB_NAME_MIN_LENGTH} characters.`,
  )
  .regex(
    mongoDbNameCharsetRegex,
    'MongoDB database name may contain only letters, numbers, underscore, and hyphen.',
  )
  .refine((value) => Buffer.byteLength(value, 'utf8') <= MONGO_DB_NAME_MAX_BYTES, {
    message: `MongoDB database name must be at most ${MONGO_DB_NAME_MAX_BYTES} bytes.`,
  });

const mongoUriSchema = z
  .string()
  .min(1, 'MongoDB URI is required.')
  .max(MONGODB_URI_MAX_LENGTH, `MongoDB URI must be at most ${MONGODB_URI_MAX_LENGTH} characters.`)
  .url('MongoDB URI must be a valid URI.')
  .refine((value) => mongoUriSchemeRegex.test(value), {
    message: 'MongoDB URI must start with mongodb:// or mongodb+srv://.',
  });

const optionalMongoUriSchema = z.preprocess((value) => {
  if (value === '') {
    return undefined;
  }

  return value;
}, mongoUriSchema.optional());

const startUrlsTextSchema = z
  .string()
  .min(1, 'At least one start URL is required.')
  .refine((value) => splitTextareaLines(value).length <= START_URLS_MAX_COUNT, {
    message: `At most ${START_URLS_MAX_COUNT} start URLs are allowed.`,
  })
  .refine(
    (value) =>
      splitTextareaLines(value).every((url) => {
        if (url.length > START_URL_MAX_LENGTH) {
          return false;
        }

        if (!z.url().safeParse(url).success) {
          return false;
        }

        try {
          const parsed = new URL(url);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      }),
    {
      message: `Each start URL must be a valid absolute http(s) URL up to ${START_URL_MAX_LENGTH} characters.`,
    },
  );

const searchSpaceDescriptionSchema = z
  .string()
  .max(
    SEARCH_SPACE_DESCRIPTION_MAX_LENGTH,
    `Description must be at most ${SEARCH_SPACE_DESCRIPTION_MAX_LENGTH} characters.`,
  )
  .default('');

const sourceSchema = z.literal('jobs.cz');

const crawlerMaxConcurrencySchema = z.coerce
  .number()
  .int()
  .min(
    CRAWLER_MAX_CONCURRENCY_MIN,
    `Crawler max concurrency must be at least ${CRAWLER_MAX_CONCURRENCY_MIN}.`,
  )
  .max(
    CRAWLER_MAX_CONCURRENCY_MAX,
    `Crawler max concurrency must be at most ${CRAWLER_MAX_CONCURRENCY_MAX}.`,
  );

const crawlerRpmSchema = z.coerce
  .number()
  .int()
  .min(CRAWLER_RPM_MIN, `Crawler RPM must be at least ${CRAWLER_RPM_MIN}.`)
  .max(CRAWLER_RPM_MAX, `Crawler RPM must be at most ${CRAWLER_RPM_MAX}.`);

const ingestionConcurrencySchema = z.coerce
  .number()
  .int()
  .min(
    INGESTION_CONCURRENCY_MIN,
    `Ingestion concurrency must be at least ${INGESTION_CONCURRENCY_MIN}.`,
  )
  .max(
    INGESTION_CONCURRENCY_MAX,
    `Ingestion concurrency must be at most ${INGESTION_CONCURRENCY_MAX}.`,
  );

const maxItemsSchema = z.coerce
  .number()
  .int()
  .min(MAX_ITEMS_MIN, `Max items must be at least ${MAX_ITEMS_MIN}.`)
  .max(MAX_ITEMS_MAX, `Max items must be at most ${MAX_ITEMS_MAX}.`);

export const pipelineCreateFormSchema = z.object({
  name: pipelineNameSchema,
  source: sourceSchema,
  mode: z.enum(['crawl_only', 'crawl_and_ingest']),
  searchSpaceName: searchSpaceNameSchema,
  searchSpaceDescription: searchSpaceDescriptionSchema,
  startUrlsText: startUrlsTextSchema,
  maxItems: maxItemsSchema,
  allowInactiveMarking: z.boolean().default(true),
  runtimeProfileName: runtimeProfileNameSchema,
  crawlerMaxConcurrency: crawlerMaxConcurrencySchema.optional(),
  crawlerMaxRequestsPerMinute: crawlerRpmSchema.optional(),
  ingestionConcurrency: ingestionConcurrencySchema.optional(),
  includeMongoOutput: z.boolean().default(true),
  includeDownloadableJson: z.boolean().default(false),
  operatorMongoUri: mongoUriSchema,
  operatorDbName: mongoDbNameSchema,
});

export type PipelineCreateFormValues = z.input<typeof pipelineCreateFormSchema>;
export type PipelineCreateFormData = z.output<typeof pipelineCreateFormSchema>;

export const pipelineUpdateFormSchema = z.object({
  name: pipelineNameSchema,
  mode: z.enum(['crawl_only', 'crawl_and_ingest']),
  searchSpaceName: searchSpaceNameSchema,
  searchSpaceDescription: searchSpaceDescriptionSchema,
  startUrlsText: startUrlsTextSchema,
  maxItems: maxItemsSchema,
  allowInactiveMarking: z.boolean().default(true),
  runtimeProfileName: runtimeProfileNameSchema,
  crawlerMaxConcurrency: crawlerMaxConcurrencySchema.optional(),
  crawlerMaxRequestsPerMinute: crawlerRpmSchema.optional(),
  ingestionConcurrency: ingestionConcurrencySchema.optional(),
  includeMongoOutput: z.boolean().default(true),
  includeDownloadableJson: z.boolean().default(false),
  operatorMongoUri: optionalMongoUriSchema,
  operatorDbName: mongoDbNameSchema.optional(),
});

export type PipelineUpdateFormValues = z.input<typeof pipelineUpdateFormSchema>;
export type PipelineUpdateFormData = z.output<typeof pipelineUpdateFormSchema>;

export const buildCreatePipelinePayload = (
  values: PipelineCreateFormData,
): CreateControlPlanePipelineRequest => {
  const startUrls = splitTextareaLines(values.startUrlsText);
  const destinations =
    values.mode === 'crawl_only'
      ? []
      : [
          ...(values.includeMongoOutput ? [{ type: 'mongodb' as const }] : []),
          ...(values.includeDownloadableJson ? [{ type: 'downloadable_json' as const }] : []),
        ];
  const hasMongoDestination = destinations.some((destination) => destination.type === 'mongodb');

  return createControlPlanePipelineRequestV2Schema.parse({
    name: values.name,
    source: values.source,
    mode: values.mode,
    searchSpace: {
      name: values.searchSpaceName,
      description: values.searchSpaceDescription,
      startUrls,
      maxItems: values.maxItems,
      allowInactiveMarking: hasMongoDestination ? values.allowInactiveMarking : false,
    },
    runtimeProfile: {
      name: values.runtimeProfileName,
      crawlerMaxConcurrency: values.crawlerMaxConcurrency,
      crawlerMaxRequestsPerMinute: values.crawlerMaxRequestsPerMinute,
      ingestionConcurrency: values.mode === 'crawl_only' ? undefined : values.ingestionConcurrency,
    },
    structuredOutput: {
      destinations,
    },
    operatorSink: {
      mongodbUri: values.operatorMongoUri,
      dbName: values.operatorDbName,
    },
  });
};

export const buildUpdatePipelinePayload = (
  values: PipelineUpdateFormData,
): UpdateControlPlanePipelineRequest => {
  const startUrls = splitTextareaLines(values.startUrlsText);
  const destinations =
    values.mode === 'crawl_only'
      ? []
      : [
          ...(values.includeMongoOutput ? [{ type: 'mongodb' as const }] : []),
          ...(values.includeDownloadableJson ? [{ type: 'downloadable_json' as const }] : []),
        ];
  const hasMongoDestination = destinations.some((destination) => destination.type === 'mongodb');
  const operatorMongoUri = values.operatorMongoUri;
  const operatorDbName = values.operatorDbName;
  const operatorSink =
    operatorMongoUri || operatorDbName
      ? {
          ...(operatorMongoUri ? { mongodbUri: operatorMongoUri } : {}),
          ...(operatorDbName ? { dbName: operatorDbName } : {}),
        }
      : undefined;

  return updateControlPlanePipelineRequestV2Schema.parse({
    name: values.name,
    mode: values.mode,
    searchSpace: {
      name: values.searchSpaceName,
      description: values.searchSpaceDescription,
      startUrls,
      maxItems: values.maxItems,
      allowInactiveMarking: hasMongoDestination ? values.allowInactiveMarking : false,
    },
    runtimeProfile: {
      name: values.runtimeProfileName,
      crawlerMaxConcurrency: values.crawlerMaxConcurrency,
      crawlerMaxRequestsPerMinute: values.crawlerMaxRequestsPerMinute,
      ingestionConcurrency: values.mode === 'crawl_only' ? undefined : values.ingestionConcurrency,
    },
    structuredOutput: {
      destinations,
    },
    ...(operatorSink ? { operatorSink } : {}),
  });
};
