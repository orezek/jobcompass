import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  buildActorInputFromSearchSpace,
  deriveMongoDbName,
  searchSpaceConfigSchema,
  searchSpaceIdSchema,
  type ActorInputOverrides,
  type ActorRuntimeInput,
  type SearchSpaceConfig,
} from '@repo/job-search-spaces';

const appRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultSearchSpacesDir = path.join(appRootDir, 'search-spaces');
const defaultInputOutputPath = path.join(
  appRootDir,
  'storage',
  'key_value_stores',
  'default',
  'INPUT.json',
);

export type LocalCliOptions = {
  searchSpaceId: string;
  maxItems?: number;
  maxConcurrency?: number;
  maxRequestsPerMinute?: number;
  debugLog?: boolean;
  useApifyProxy?: boolean;
  allowInactiveMarkingOnPartialRuns?: boolean;
  outputPath?: string;
};

export const parseLocalCliOptions = (argv: string[]): LocalCliOptions => {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;
  const parsed = parseArgs({
    args: normalizedArgv,
    options: {
      'search-space': { type: 'string', default: 'default' },
      'max-items': { type: 'string' },
      'max-concurrency': { type: 'string' },
      'max-requests-per-minute': { type: 'string' },
      'debug-log': { type: 'boolean' },
      'use-apify-proxy': { type: 'boolean' },
      'allow-inactive-marking-on-partial-runs': { type: 'boolean' },
      output: { type: 'string' },
    },
    allowPositionals: false,
  });

  const parseOptionalPositiveInt = (
    value: string | undefined,
    flagName: string,
  ): number | undefined => {
    if (value === undefined) {
      return undefined;
    }

    const parsedValue = Number.parseInt(value, 10);
    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new Error(`${flagName} must be a positive integer.`);
    }

    return parsedValue;
  };

  return {
    searchSpaceId: searchSpaceIdSchema.parse(parsed.values['search-space']),
    maxItems: parseOptionalPositiveInt(parsed.values['max-items'], '--max-items'),
    maxConcurrency: parseOptionalPositiveInt(parsed.values['max-concurrency'], '--max-concurrency'),
    maxRequestsPerMinute: parseOptionalPositiveInt(
      parsed.values['max-requests-per-minute'],
      '--max-requests-per-minute',
    ),
    debugLog: parsed.values['debug-log'],
    useApifyProxy: parsed.values['use-apify-proxy'],
    allowInactiveMarkingOnPartialRuns: parsed.values['allow-inactive-marking-on-partial-runs'],
    outputPath: parsed.values.output,
  };
};

export const getDefaultInputOutputPath = (): string => defaultInputOutputPath;

export const loadSearchSpaceConfig = async (searchSpaceId: string): Promise<SearchSpaceConfig> => {
  const normalizedSearchSpaceId = searchSpaceIdSchema.parse(searchSpaceId);
  const filePath = path.join(defaultSearchSpacesDir, `${normalizedSearchSpaceId}.json`);
  const raw = await readFile(filePath, 'utf8');
  return searchSpaceConfigSchema.parse(JSON.parse(raw) as unknown);
};

export const createActorInputForSearchSpace = async (
  cliOptions: LocalCliOptions,
): Promise<{ searchSpace: SearchSpaceConfig; actorInput: ActorRuntimeInput }> => {
  const searchSpace = await loadSearchSpaceConfig(cliOptions.searchSpaceId);

  const overrides: ActorInputOverrides = {
    maxItems: cliOptions.maxItems,
    maxConcurrency: cliOptions.maxConcurrency,
    maxRequestsPerMinute: cliOptions.maxRequestsPerMinute,
    debugLog: cliOptions.debugLog,
    allowInactiveMarkingOnPartialRuns: cliOptions.allowInactiveMarkingOnPartialRuns,
    proxyConfiguration:
      cliOptions.useApifyProxy !== undefined
        ? { useApifyProxy: cliOptions.useApifyProxy }
        : undefined,
  };

  return {
    searchSpace,
    actorInput: buildActorInputFromSearchSpace(searchSpace, overrides),
  };
};

export const writeLocalActorInput = async (
  input: ActorRuntimeInput,
  outputPath?: string,
): Promise<string> => {
  const resolvedOutputPath = path.resolve(outputPath ?? defaultInputOutputPath);
  await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
  return resolvedOutputPath;
};

export const resolveSearchSpaceMongoDbName = (input: {
  dbPrefix: string;
  searchSpaceId: string;
  explicitDbName?: string | null;
}): string => deriveMongoDbName(input);
