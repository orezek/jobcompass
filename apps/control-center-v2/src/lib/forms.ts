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

export const PIPELINE_NAME_MAX_LENGTH = 20;

const mongoDbNameCharsetRegex = /^[A-Za-z0-9_-]+$/u;
const mongoDbNameMaxBytes = 38;

const mongoDbNameSchema = z
  .string()
  .trim()
  .min(1, 'MongoDB database name is required.')
  .regex(
    mongoDbNameCharsetRegex,
    'MongoDB database name may contain only letters, numbers, underscore, and hyphen.',
  )
  .refine((value) => Buffer.byteLength(value, 'utf8') <= mongoDbNameMaxBytes, {
    message: `MongoDB database name must be at most ${mongoDbNameMaxBytes} bytes.`,
  });

export const pipelineCreateFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(PIPELINE_NAME_MAX_LENGTH, `Name must be at most ${PIPELINE_NAME_MAX_LENGTH} characters.`),
  source: z.string().trim().min(1, 'Source is required.'),
  mode: z.enum(['crawl_only', 'crawl_and_ingest']),
  searchSpaceName: z.string().trim().min(1, 'Search space name is required.'),
  searchSpaceDescription: z.string().trim().default(''),
  startUrlsText: z.string().trim().min(1, 'At least one start URL is required.'),
  maxItems: z.coerce.number().int().positive('Max items must be positive.'),
  allowInactiveMarking: z.boolean().default(true),
  runtimeProfileName: z.string().trim().min(1, 'Runtime profile name is required.'),
  crawlerMaxConcurrency: z.coerce.number().int().positive().optional(),
  crawlerMaxRequestsPerMinute: z.coerce.number().int().positive().optional(),
  ingestionConcurrency: z.coerce.number().int().positive().optional(),
  includeMongoOutput: z.boolean().default(true),
  includeDownloadableJson: z.boolean().default(false),
  operatorMongoUri: z.string().trim().url('MongoDB URI must be a valid URI.'),
  operatorDbName: mongoDbNameSchema,
});

export type PipelineCreateFormValues = z.input<typeof pipelineCreateFormSchema>;
export type PipelineCreateFormData = z.output<typeof pipelineCreateFormSchema>;

export const pipelineUpdateFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(PIPELINE_NAME_MAX_LENGTH, `Name must be at most ${PIPELINE_NAME_MAX_LENGTH} characters.`),
  mode: z.enum(['crawl_only', 'crawl_and_ingest']),
  searchSpaceName: z.string().trim().min(1, 'Search space name is required.'),
  searchSpaceDescription: z.string().trim().default(''),
  startUrlsText: z.string().trim().min(1, 'At least one start URL is required.'),
  maxItems: z.coerce.number().int().positive('Max items must be positive.'),
  allowInactiveMarking: z.boolean().default(true),
  runtimeProfileName: z.string().trim().min(1, 'Runtime profile name is required.'),
  crawlerMaxConcurrency: z.coerce.number().int().positive().optional(),
  crawlerMaxRequestsPerMinute: z.coerce.number().int().positive().optional(),
  ingestionConcurrency: z.coerce.number().int().positive().optional(),
  includeMongoOutput: z.boolean().default(true),
  includeDownloadableJson: z.boolean().default(false),
  operatorMongoUri: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || z.url().safeParse(value).success, {
      message: 'MongoDB URI must be a valid URI.',
    }),
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
  const operatorMongoUri = values.operatorMongoUri?.trim();
  const operatorDbName = values.operatorDbName?.trim();
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
