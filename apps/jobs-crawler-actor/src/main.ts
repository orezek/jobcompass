import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PlaywrightCrawler, Dataset, createPlaywrightRouter, log, type LogLevel } from 'crawlee';
import { Actor, type ProxyConfigurationOptions } from 'apify';
import { MongoClient } from 'mongodb';
import {
  actorRuntimeInputSchema,
  deriveMongoDbName,
  type ActorRuntimeInput,
} from '@repo/job-search-spaces';
import { envs } from './env-setup.js';
import {
  CrawlStateRepository,
  type CrawlDetailSnapshot,
  type CrawlListingRecord,
} from './crawl-state.js';
import {
  buildSharedRunOutputPaths,
  prepareSharedRunOutput,
  writeSharedDatasetJson,
  writeSharedDetailHtml,
  type SharedRunOutputPaths,
} from './local-shared-output.js';
import {
  waitForDetailRenderReadiness,
  type DetailRenderSignal,
  type DetailRenderType,
} from './detail-rendering.js';
import { extractListingFromCard } from './listing-card-parser.js';

// ------------------ 1. Definition of Schemas & Types ------------------ //

// Output Schema (Zod) for Validation
const internalJobAdSchema = z.object({
  sourceId: z.string().describe('The ID of the job ad as encoded on the website.'),
  adUrl: z.string().describe('Url for the details page of the ad.'),
  requestedDetailUrl: z
    .string()
    .describe('Canonical jobs.cz details URL requested by the crawler before redirects.'),
  finalDetailUrl: z
    .string()
    .describe('Final page URL after redirects where the HTML snapshot was captured.'),
  finalDetailHost: z
    .string()
    .describe('Hostname derived from finalDetailUrl for grouping/debugging custom-hosted pages.'),
  detailRedirected: z
    .boolean()
    .describe('Whether the final detail URL differs from the requested jobs.cz detail URL.'),
  detailRenderType: z
    .enum(['jobscz-template', 'widget', 'vacancy-detail', 'unknown'])
    .describe('Heuristic rendering pattern detected for the detail page before HTML snapshot.'),
  detailRenderSignal: z
    .enum(['none', 'widget_container_text', 'vacancy_detail_text'])
    .describe('Render completeness signal that was used before snapshotting HTML.'),
  detailRenderTextChars: z
    .number()
    .int()
    .nonnegative()
    .describe(
      'Character count measured in the render target element used for completeness checks.',
    ),
  detailRenderWaitMs: z
    .number()
    .int()
    .nonnegative()
    .describe(
      'Milliseconds spent waiting for dynamic detail page content to render before snapshot.',
    ),
  detailRenderComplete: z
    .boolean()
    .describe('Whether the selected render completeness condition was satisfied before snapshot.'),
  jobTitle: z.string().describe('The title name of the job position.'),
  companyName: z.string().describe('The name of the company.'),
  location: z.string().describe('The location of the company as extracted from the list page.'),
  salary: z.string().nullable().describe('Salary as advertised on the site.'),
  publishedInfoText: z.string().describe("Information appended to search card (e.g. 'New')."),
  scrapedAt: z.coerce.date().describe('The date in ISO format when the ad was scraped.'),
  source: z.string().default('jobs.cz').describe('The source domain name.'),
  htmlDetailPageKey: z
    .string()
    .describe('Key that identifies the html blob from the details page.'),
  detailHtmlByteSize: z
    .number()
    .int()
    .positive()
    .describe('UTF-8 byte size of the rendered HTML snapshot saved to the key-value store.'),
  detailHtmlSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .describe('SHA-256 hash of the rendered HTML snapshot saved to the key-value store.'),
});

// Helper for cleaning text
function normalizeWhitespace(input: string): string {
  return input
    .replace(/\u00A0/g, ' ') // NBSP → space
    .replace(/\u200D/g, '') // zero-width joiner → gone
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

function getHostnameFromUrl(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return 'unknown';
  }
}

const CZECH_LISTING_RESULTS_COUNT_REGEX = /(Našli jsme\s+([\d\s]+)\s+nabídek)/i;

function parseListingResultsCount(input: string): { rawText: string; count: number } | null {
  const normalized = normalizeWhitespace(input);
  const match = normalized.match(CZECH_LISTING_RESULTS_COUNT_REGEX);
  if (!match) {
    return null;
  }

  const rawText = match[1];
  const countText = match[2];
  if (!rawText || !countText) {
    return null;
  }

  const count = Number.parseInt(countText.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(count)) {
    return null;
  }

  return {
    rawText,
    count,
  };
}

type SeedListSummary = {
  startUrl: string;
  firstObservedListUrl: string | null;
  listPagesVisited: number;
  parsedResultsCount: number | null;
  parsedResultsText: string | null;
};

type CrawlRunStatus = 'running' | 'succeeded' | 'completed_with_errors' | 'failed';

type CrawlRunSummaryDocument = {
  _id: string;
  crawlRunId: string;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
};

type CrawlRunSummaryMongoConfig = {
  enabled: boolean;
  mongoUri?: string;
  dbName: string;
  collectionName: string;
};

type IngestionTriggerConfig = {
  enabled: boolean;
  url: string;
  timeoutMs: number;
};

type IngestionTriggerResult = {
  enabled: boolean;
  attempted: boolean;
  skippedReason?: string;
  ok?: boolean;
  responseStatus?: number;
  accepted?: boolean;
  deduplicated?: boolean;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  responseBody?: unknown;
};

function serializeErrorForSummary(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : JSON.stringify(error),
  };
}

async function upsertRunSummaryToMongo(
  config: CrawlRunSummaryMongoConfig,
  crawlRunId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!config.enabled) {
    return;
  }

  if (!config.mongoUri) {
    log.warning(
      'ENABLE_MONGO_RUN_SUMMARY_WRITE=true but MONGODB_URI is not configured. Skipping Mongo run summary write.',
    );
    return;
  }

  const client = new MongoClient(config.mongoUri);
  try {
    await client.connect();
    const now = new Date();
    const collection = client
      .db(config.dbName)
      .collection<CrawlRunSummaryDocument>(config.collectionName);
    await collection.updateOne(
      { _id: crawlRunId },
      {
        $set: {
          ...payload,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: crawlRunId,
          crawlRunId,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  } finally {
    await client.close();
  }
}

async function upsertRunSummaryToMongoBestEffort(
  config: CrawlRunSummaryMongoConfig,
  crawlRunId: string,
  payload: Record<string, unknown>,
  phase: 'start' | 'final',
): Promise<void> {
  try {
    await upsertRunSummaryToMongo(config, crawlRunId, payload);
    if (config.enabled && config.mongoUri) {
      log.info('Persisted crawl run summary to MongoDB', {
        crawlRunId,
        phase,
        mongoDbName: config.dbName,
        mongoCollection: config.collectionName,
      });
    }
  } catch (error) {
    log.warning('Failed to persist crawl run summary to MongoDB (best effort)', {
      crawlRunId,
      phase,
      error,
      mongoDbName: config.dbName,
      mongoCollection: config.collectionName,
    });
  }
}

async function triggerIngestionStartBestEffort(
  config: IngestionTriggerConfig,
  payload: { source: string; crawlRunId: string; searchSpaceId: string; mongoDbName: string },
): Promise<IngestionTriggerResult> {
  if (!config.enabled) {
    return {
      enabled: false,
      attempted: false,
      skippedReason: 'disabled',
    };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let responseBody: unknown = null;
    const responseText = await response.text();
    if (responseText) {
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }
    }

    const result: IngestionTriggerResult = {
      enabled: true,
      attempted: true,
      ok: response.ok,
      responseStatus: response.status,
      responseBody,
    };

    if (responseBody && typeof responseBody === 'object') {
      const record = responseBody as Record<string, unknown>;
      if (typeof record.accepted === 'boolean') {
        result.accepted = record.accepted;
      }
      if (typeof record.deduplicated === 'boolean') {
        result.deduplicated = record.deduplicated;
      }
    }

    if (response.ok) {
      log.info('Triggered ingestion service after crawl completion', {
        source: payload.source,
        crawlRunId: payload.crawlRunId,
        searchSpaceId: payload.searchSpaceId,
        mongoDbName: payload.mongoDbName,
        ingestionTriggerUrl: config.url,
        responseStatus: response.status,
        accepted: result.accepted,
        deduplicated: result.deduplicated,
      });
    } else {
      log.warning('Ingestion trigger request returned non-OK response (best effort)', {
        source: payload.source,
        crawlRunId: payload.crawlRunId,
        searchSpaceId: payload.searchSpaceId,
        mongoDbName: payload.mongoDbName,
        ingestionTriggerUrl: config.url,
        responseStatus: response.status,
        responseBody,
      });
    }

    return result;
  } catch (error) {
    const normalizedError = serializeErrorForSummary(error);
    log.warning('Failed to trigger ingestion service after crawl completion (best effort)', {
      source: payload.source,
      crawlRunId: payload.crawlRunId,
      searchSpaceId: payload.searchSpaceId,
      mongoDbName: payload.mongoDbName,
      ingestionTriggerUrl: config.url,
      timeoutMs: config.timeoutMs,
      error,
    });
    return {
      enabled: true,
      attempted: true,
      ok: false,
      error: normalizedError,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

const JOB_CARD_SELECTOR = 'article.SearchResultCard, article[data-jobad-id]';
const NEXT_PAGE_SELECTOR = '.Pagination__button--next, [data-test="pagination-next"]';

// ------------------ 2. Router & Handler Logic ------------------ //

const router = createPlaywrightRouter();
let enqueuedDetailRequests = 0;
let storedDetailPages = 0;
let listPagesVisited = 0;
let detailPagesVisited = 0;
let totalJobCardsSeen = 0;
let cardsSkippedMissingHrefOrId = 0;
const duplicateOrAlreadyHandledDetailRequests = 0;
let paginationNextPagesEnqueued = 0;
let detailsValidationSucceeded = 0;
let detailsValidationFailed = 0;
let htmlSnapshotsSaved = 0;
let detailRedirects = 0;
let totalDetailHtmlBytes = 0;
let totalDetailRenderWaitMs = 0;
let maxDetailRenderWaitMs = 0;
let maxItemsAbortTriggered = false;
let maxItemsEnqueueGuardTriggered = false;
let failedRequests = 0;
let failedListRequests = 0;
let failedDetailRequests = 0;
const failedRequestUrls: string[] = [];
let listListingsCollectedUnique = 0;
let listListingsDuplicateSourceIds = 0;
let reconcileNewJobsCount = 0;
let reconcileExistingJobsCount = 0;
let inactiveMarkedCount = 0;
let inactiveMarkingSkipped = false;
let inactiveMarkingSkipReason: string | null = null;
let activeJobsCountBeforeReconcile = 0;
let detailStateSnapshotsApplied = 0;
let localSharedHtmlFilesWritten = 0;
let localSharedDatasetRecordsWritten = 0;
let localSharedDatasetJsonPath: string | null = null;
const detailRenderTypeCounts: Record<DetailRenderType, number> = {
  'jobscz-template': 0,
  widget: 0,
  'vacancy-detail': 0,
  unknown: 0,
};
const detailRenderSignalCounts: Record<DetailRenderSignal, number> = {
  none: 0,
  widget_container_text: 0,
  vacancy_detail_text: 0,
};
const seedListSummaries = new Map<string, SeedListSummary>();
const collectedListingsBySourceId = new Map<string, CrawlListingRecord>();
const sharedDatasetRecords: z.infer<typeof internalJobAdSchema>[] = [];
const detailSnapshotsForState: CrawlDetailSnapshot[] = [];
let sharedRunOutputPaths: SharedRunOutputPaths | null = null;

router.addHandler('DETAILS', async ({ request, page, log, crawler }) => {
  const routerDetailsLog = log.child({ prefix: 'DETAILS' });
  const requestedDetailUrl = request.url;
  detailPagesVisited += 1;
  routerDetailsLog.debug(`Processing DETAILS page request: ${requestedDetailUrl}`);

  await page.waitForLoadState('load');
  const finalDetailUrl = page.url();
  const finalDetailHost = getHostnameFromUrl(finalDetailUrl);
  const redirectedToDifferentHost = finalDetailUrl !== requestedDetailUrl;

  if (redirectedToDifferentHost) {
    detailRedirects += 1;
    routerDetailsLog.info('DETAILS page redirected before HTML snapshot', {
      sourceId: request.userData.jobId,
      requestedDetailUrl,
      finalDetailUrl,
    });
  }

  const detailRenderAssessment = await waitForDetailRenderReadiness({
    page,
    sourceId: String(request.userData.jobId),
    requestedDetailUrl,
    finalDetailUrl,
    finalDetailHost,
    log: {
      debug: (message, data) => routerDetailsLog.debug(message, data),
      warning: (message, data) => routerDetailsLog.warning(message, data),
    },
  });
  const {
    detailRenderType,
    detailRenderSignal,
    detailRenderTextChars,
    detailRenderWaitMs,
    detailRenderComplete,
    isWidgetHostedPage,
    widgetContainerTextChars,
    isVacancyLoaderPage,
    vacancyDetailTextChars,
  } = detailRenderAssessment;

  const jobDetailHtml = await page.content();
  const detailHtmlByteSize = Buffer.byteLength(jobDetailHtml, 'utf8');
  const detailHtmlSha256 = createHash('sha256').update(jobDetailHtml, 'utf8').digest('hex');
  const htmlDetailPageKey = `job-html-${request.userData.jobId}.html`;
  detailRenderTypeCounts[detailRenderType] += 1;
  detailRenderSignalCounts[detailRenderSignal] += 1;
  totalDetailHtmlBytes += detailHtmlByteSize;
  totalDetailRenderWaitMs += detailRenderWaitMs;
  maxDetailRenderWaitMs = Math.max(maxDetailRenderWaitMs, detailRenderWaitMs);
  const result = {
    sourceId: request.userData.jobId,
    adUrl: request.url,
    requestedDetailUrl,
    finalDetailUrl,
    finalDetailHost,
    detailRedirected: redirectedToDifferentHost,
    detailRenderType,
    detailRenderSignal,
    detailRenderTextChars,
    detailRenderWaitMs,
    detailRenderComplete,
    jobTitle: request.userData.jobTitle,
    companyName: request.userData.companyName,
    location: request.userData.location,
    salary: request.userData.salary,
    publishedInfoText: request.userData.publishedInfoText,
    scrapedAt: new Date(), // Generates a Date object
    source: 'jobs.cz',
    htmlDetailPageKey,
    detailHtmlByteSize,
    detailHtmlSha256,
  };

  const safeResult = internalJobAdSchema.safeParse(result);

  await Actor.setValue(htmlDetailPageKey, jobDetailHtml, {
    contentType: 'text/html',
  });
  htmlSnapshotsSaved += 1;
  if (sharedRunOutputPaths) {
    await writeSharedDetailHtml(sharedRunOutputPaths, htmlDetailPageKey, jobDetailHtml);
    localSharedHtmlFilesWritten += 1;
  }

  if (safeResult.success) {
    detailsValidationSucceeded += 1;
    sharedDatasetRecords.push(safeResult.data);
    detailSnapshotsForState.push({
      sourceId: safeResult.data.sourceId,
      requestedDetailUrl: safeResult.data.requestedDetailUrl,
      finalDetailUrl: safeResult.data.finalDetailUrl,
      finalDetailHost: safeResult.data.finalDetailHost,
      detailRedirected: safeResult.data.detailRedirected,
      detailRenderType: safeResult.data.detailRenderType,
      detailRenderSignal: safeResult.data.detailRenderSignal,
      detailRenderTextChars: safeResult.data.detailRenderTextChars,
      detailRenderWaitMs: safeResult.data.detailRenderWaitMs,
      detailRenderComplete: safeResult.data.detailRenderComplete,
      htmlDetailPageKey: safeResult.data.htmlDetailPageKey,
      detailHtmlByteSize: safeResult.data.detailHtmlByteSize,
      detailHtmlSha256: safeResult.data.detailHtmlSha256,
      scrapedAt: safeResult.data.scrapedAt.toISOString(),
    });
    routerDetailsLog.info(`✅ Saved job: ${result.sourceId} | ${result.jobTitle}`, {
      sourceId: result.sourceId,
      requestedDetailUrl,
      finalDetailUrl,
      redirectedToDifferentHost,
      detailRenderType,
      detailRenderSignal,
      detailRenderWaitMs,
      isWidgetHostedPage,
      widgetContainerTextChars,
      isVacancyLoaderPage,
      vacancyDetailTextChars,
      detailHtmlByteSize,
    });
    await Dataset.pushData(safeResult.data);
  } else {
    detailsValidationFailed += 1;
    routerDetailsLog.error(`⚠️ Validation failed for ${result.sourceId}`, {
      errors: safeResult.error,
      requestedDetailUrl,
      finalDetailUrl,
      redirectedToDifferentHost,
      detailRenderType,
      detailRenderSignal,
      detailRenderWaitMs,
      isWidgetHostedPage,
      widgetContainerTextChars,
      isVacancyLoaderPage,
      vacancyDetailTextChars,
      detailHtmlByteSize,
    });
    await Dataset.pushData({ ...result, _validationErrors: safeResult.error });
  }

  storedDetailPages += 1;
  if (storedDetailPages >= input.maxItems) {
    maxItemsAbortTriggered = true;
    routerDetailsLog.info(
      `Reached maxItems (${input.maxItems}) after storing ${storedDetailPages} job detail pages. Stopping crawl.`,
    );
    await crawler.autoscaledPool?.abort();
  }
});

router.addHandler('LIST', async ({ request, enqueueLinks, page, log }) => {
  const routerListLog = log.child({ prefix: 'LIST' });
  listPagesVisited += 1;
  routerListLog.info(`📂 Scanning List: ${request.url}`);

  const startUrlSeed =
    typeof request.userData?.startUrlSeed === 'string'
      ? request.userData.startUrlSeed
      : request.url;
  const isSeedListRequest = request.userData?.isSeedList !== false;
  const seedSummary = seedListSummaries.get(startUrlSeed) ?? {
    startUrl: startUrlSeed,
    firstObservedListUrl: null,
    listPagesVisited: 0,
    parsedResultsCount: null,
    parsedResultsText: null,
  };
  seedSummary.listPagesVisited += 1;
  if (!seedSummary.firstObservedListUrl) {
    seedSummary.firstObservedListUrl = request.url;
  }
  seedListSummaries.set(startUrlSeed, seedSummary);

  try {
    await page.waitForSelector(JOB_CARD_SELECTOR, { timeout: 5000 });
  } catch (e) {
    routerListLog.warning(
      `Timed out waiting for job cards on page ${request.url}. Letting Crawlee retry this page. ${e}`,
    );
    throw e;
  }

  const jobCards = await page.locator(JOB_CARD_SELECTOR).all();
  totalJobCardsSeen += jobCards.length;
  routerListLog.info(`Found ${jobCards.length} job cards.`);

  if (isSeedListRequest && seedSummary.parsedResultsCount === null) {
    const bodyText = await page
      .evaluate(() => document.body?.innerText ?? document.body?.textContent ?? '')
      .catch(() => '');
    const parsedResultsCount = parseListingResultsCount(bodyText);
    if (parsedResultsCount) {
      seedSummary.parsedResultsCount = parsedResultsCount.count;
      seedSummary.parsedResultsText = parsedResultsCount.rawText;
      seedListSummaries.set(startUrlSeed, seedSummary);
      routerListLog.info('Parsed list-page total results count', {
        startUrlSeed,
        currentListUrl: request.url,
        parsedResultsCount: parsedResultsCount.count,
        parsedResultsText: parsedResultsCount.rawText,
      });
    } else {
      routerListLog.debug('Could not parse list-page total results count text', {
        startUrlSeed,
        currentListUrl: request.url,
      });
    }
  }

  for (const card of jobCards) {
    const listingRecord = await extractListingFromCard(card, request.url);
    if (!listingRecord) {
      cardsSkippedMissingHrefOrId += 1;
      continue;
    }

    if (collectedListingsBySourceId.size >= input.maxItems) {
      maxItemsEnqueueGuardTriggered = true;
      routerListLog.info(
        `Reached maxItems (${input.maxItems}) while collecting listing records. Stopping pagination scan.`,
      );
      break;
    }

    if (collectedListingsBySourceId.has(listingRecord.sourceId)) {
      listListingsDuplicateSourceIds += 1;
    } else {
      collectedListingsBySourceId.set(listingRecord.sourceId, listingRecord);
      listListingsCollectedUnique = collectedListingsBySourceId.size;
    }
  }

  // Pagination
  const nextButton = await page.locator(NEXT_PAGE_SELECTOR);
  if (
    collectedListingsBySourceId.size < input.maxItems &&
    (await nextButton.count()) > 0 &&
    (await nextButton.isEnabled())
  ) {
    paginationNextPagesEnqueued += 1;
    await enqueueLinks({
      label: 'LIST',
      selector: NEXT_PAGE_SELECTOR,
      transformRequestFunction: (nextRequest) => {
        nextRequest.userData = {
          ...(nextRequest.userData ?? {}),
          startUrlSeed,
          isSeedList: false,
        };
        return nextRequest;
      },
    });
  }
});

// ------------------ 3. Main Execution Block ------------------ //

await Actor.init();
// Sanity Check for local run!
const actorAppRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultLocalInputPath = path.join(
  actorAppRootDir,
  'storage',
  'key_value_stores',
  'default',
  'INPUT.json',
);
const rawInput = await Actor.getInput<unknown>();
if (!rawInput) {
  throw new Error(
    [
      'Input is missing (Actor.getInput() returned null).',
      `Local Apify input expected at: ${defaultLocalInputPath}`,
      'If using temp storage, create key_value_stores/default/INPUT.json under CRAWLEE_STORAGE_DIR.',
    ].join(' '),
  );
}
const input = actorRuntimeInputSchema.parse(rawInput) as ActorRuntimeInput & {
  proxyConfiguration?: ProxyConfigurationOptions;
};

const crawlRunId = randomUUID();
const startUrls = input.startUrls;
const mongoDbName = deriveMongoDbName({
  dbPrefix: envs.JOB_COMPASS_DB_PREFIX,
  searchSpaceId: input.searchSpaceId,
  explicitDbName: envs.MONGODB_DB_NAME,
});
const runStartedAt = new Date();
const runStartedAtMs = Date.now();
const appRootDir = actorAppRootDir;
const localSharedScrapedJobsDir = path.resolve(appRootDir, envs.LOCAL_SHARED_SCRAPED_JOBS_DIR);
sharedRunOutputPaths = buildSharedRunOutputPaths(localSharedScrapedJobsDir, crawlRunId);
const mongoRunSummaryConfig: CrawlRunSummaryMongoConfig = {
  enabled: envs.ENABLE_MONGO_RUN_SUMMARY_WRITE,
  mongoUri: envs.MONGODB_URI,
  dbName: mongoDbName,
  collectionName: envs.MONGODB_CRAWL_RUN_SUMMARIES_COLLECTION,
};
const ingestionTriggerConfig: IngestionTriggerConfig = {
  enabled: envs.ENABLE_INGESTION_TRIGGER,
  url: envs.INGESTION_TRIGGER_URL,
  timeoutMs: envs.INGESTION_TRIGGER_TIMEOUT_MS,
};
if (!envs.MONGODB_URI) {
  throw new Error(
    'MONGODB_URI is required for incremental crawl reconciliation (crawl state collection).',
  );
}
const crawlStateRepo = new CrawlStateRepository({
  mongoUri: envs.MONGODB_URI,
  dbName: mongoDbName,
  collectionName: envs.MONGODB_CRAWL_JOBS_COLLECTION,
});

await prepareSharedRunOutput(sharedRunOutputPaths);
await crawlStateRepo.connect();
await crawlStateRepo.ensureIndexes();

for (const startUrl of startUrls) {
  if (!seedListSummaries.has(startUrl.url)) {
    seedListSummaries.set(startUrl.url, {
      startUrl: startUrl.url,
      firstObservedListUrl: null,
      listPagesVisited: 0,
      parsedResultsCount: null,
      parsedResultsText: null,
    });
  }
}

// B. Configure Logging
if (input.debugLog) {
  log.setLevel(log.LEVELS.DEBUG);
  log.debug('Debug logging enabled via input.');
} else {
  const envLevel = envs.CRAWLEE_LOG_LEVEL || 'INFO';
  const levelKey = envLevel.toUpperCase() as keyof typeof LogLevel;
  log.setLevel(log.LEVELS[levelKey]);
}

log.debug('Environment configured for actor run.', {
  crawleeLogLevel: envs.CRAWLEE_LOG_LEVEL,
  debugLog: input.debugLog ?? false,
});

// C. Configure Proxy (Store Standard)
const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfiguration);

// D. Initialize Crawlers (list phase, then detail phase for new jobs only)
const createCrawler = (maxRequestsPerCrawlSafetyCap: number) =>
  new PlaywrightCrawler({
    proxyConfiguration,
    headless: true,
    requestHandler: router,
    failedRequestHandler: async ({ request, error }) => {
      failedRequests += 1;
      failedRequestUrls.push(request.url);
      if (request.label === 'LIST') {
        failedListRequests += 1;
      } else if (request.label === 'DETAILS') {
        failedDetailRequests += 1;
      }
      log.error('Failed request after retries', {
        url: request.url,
        label: request.label,
        sourceId:
          typeof request.userData?.jobId === 'string'
            ? request.userData.jobId
            : request.userData?.jobId,
        error,
      });
    },
    maxConcurrency: input.maxConcurrency,
    maxRequestsPerMinute: input.maxRequestsPerMinute,
    maxRequestsPerCrawl: maxRequestsPerCrawlSafetyCap,
    launchContext: {
      launchOptions: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    },
  });

log.info(`🚀 Starting scraper with limit: ${input.maxItems} items.`);

await upsertRunSummaryToMongoBestEffort(
  mongoRunSummaryConfig,
  crawlRunId,
  {
    source: 'jobs.cz',
    searchSpaceId: input.searchSpaceId,
    mongoDbName,
    status: 'running',
    startedAt: runStartedAt.toISOString(),
    input: {
      searchSpaceId: input.searchSpaceId,
      startUrlsCount: startUrls.length,
      startUrls: startUrls.map((item: ActorRuntimeInput['startUrls'][number]) => item.url),
      maxItems: input.maxItems,
      maxRequestsPerCrawlSafetyCap: Math.max(input.maxItems * 5, 50),
      maxConcurrency: input.maxConcurrency,
      maxRequestsPerMinute: input.maxRequestsPerMinute,
      debugLog: input.debugLog ?? false,
      allowInactiveMarkingOnPartialRuns: input.allowInactiveMarkingOnPartialRuns,
      proxyConfigured: Boolean(input.proxyConfiguration),
      localSharedScrapedJobsDir,
      mongoDbName,
    },
  },
  'start',
);

let crawlerRunError: unknown = null;
let listPhaseCompleted = false;
let detailPhaseStarted = false;
let detailPhaseCompleted = false;
let partialRunInactiveMarkingBlocked = false;
try {
  const listCrawler = createCrawler(Math.max(input.maxItems * 5, 50));
  await listCrawler.run(
    startUrls.map((req: ActorRuntimeInput['startUrls'][number]) => ({
      ...req,
      label: 'LIST',
      userData: {
        startUrlSeed: req.url,
        isSeedList: true,
      },
    })),
  );
  listPhaseCompleted = true;
  partialRunInactiveMarkingBlocked =
    maxItemsEnqueueGuardTriggered && !input.allowInactiveMarkingOnPartialRuns;

  const reconcileObservedAtIso = new Date().toISOString();
  const reconcileResult = await crawlStateRepo.reconcileListings({
    source: 'jobs.cz',
    crawlRunId,
    observedAtIso: reconcileObservedAtIso,
    listings: Array.from(collectedListingsBySourceId.values()),
    forceSkipInactiveMarking: failedListRequests > 0 || partialRunInactiveMarkingBlocked,
    forceSkipInactiveMarkingReason:
      failedListRequests > 0
        ? 'failed_list_requests'
        : partialRunInactiveMarkingBlocked
          ? 'partial_list_scan'
          : undefined,
    massInactivationGuardMinActiveCount: envs.CRAWL_INACTIVE_GUARD_MIN_ACTIVE_COUNT,
    massInactivationGuardMinSeenRatio: envs.CRAWL_INACTIVE_GUARD_MIN_SEEN_RATIO,
  });

  reconcileNewJobsCount = reconcileResult.newListings.length;
  reconcileExistingJobsCount = reconcileResult.existingCount;
  activeJobsCountBeforeReconcile = reconcileResult.activeBeforeCount;
  inactiveMarkedCount = reconcileResult.inactiveMarkedCount;
  inactiveMarkingSkipped = reconcileResult.inactiveMarkingSkipped;
  inactiveMarkingSkipReason = reconcileResult.inactiveMarkingSkipReason;
  enqueuedDetailRequests = reconcileResult.newListings.length;

  log.info('Reconciled listings against crawl state collection', {
    crawlRunId,
    totalSeen: reconcileResult.totalSeen,
    newJobs: reconcileNewJobsCount,
    existingJobs: reconcileExistingJobsCount,
    activeJobsCountBeforeReconcile,
    inactiveMarkedCount,
    inactiveMarkingSkipped,
    inactiveMarkingSkipReason,
    failedListRequests,
    searchSpaceId: input.searchSpaceId,
    mongoDbName,
    mongoCollection: envs.MONGODB_CRAWL_JOBS_COLLECTION,
  });

  if (reconcileResult.newListings.length > 0) {
    detailPhaseStarted = true;
    const detailCrawler = createCrawler(Math.max(reconcileResult.newListings.length * 5, 50));
    await detailCrawler.run(
      reconcileResult.newListings.map((listing) => ({
        url: listing.adUrl,
        label: 'DETAILS',
        userData: {
          jobTitle: listing.jobTitle,
          jobId: listing.sourceId,
          companyName: listing.companyName,
          location: listing.location,
          salary: listing.salary,
          publishedInfoText: listing.publishedInfoText,
        },
      })),
    );
    detailPhaseCompleted = true;
  } else {
    detailPhaseCompleted = true;
    log.info('Skipping detail crawl phase because no new jobs were discovered in reconciliation', {
      crawlRunId,
    });
  }

  if (detailSnapshotsForState.length > 0) {
    detailStateSnapshotsApplied = await crawlStateRepo.updateDetailSnapshots({
      source: 'jobs.cz',
      detailSnapshots: detailSnapshotsForState,
      updatedAtIso: new Date().toISOString(),
    });
  }

  localSharedDatasetRecordsWritten = sharedDatasetRecords.length;
  localSharedDatasetJsonPath = await writeSharedDatasetJson(
    sharedRunOutputPaths,
    sharedDatasetRecords,
  );
} catch (error) {
  crawlerRunError = error;
  log.error('Crawler run failed before completion', {
    crawlRunId,
    error,
  });
}

const runEndedAt = new Date();
const runDurationMs = Date.now() - runStartedAtMs;
const seedListSummaryArray = Array.from(seedListSummaries.values()).sort((a, b) =>
  a.startUrl.localeCompare(b.startUrl),
);
const parsedListingResultsCounts = seedListSummaryArray
  .map((item) => item.parsedResultsCount)
  .filter((value): value is number => value !== null);
const parsedListingResultsCountTotal = parsedListingResultsCounts.reduce(
  (sum, value) => sum + value,
  0,
);
const dynamicRenderedPagesCount =
  detailRenderTypeCounts.widget + detailRenderTypeCounts['vacancy-detail'];
const averageDetailRenderWaitMs =
  detailPagesVisited > 0 ? Math.round(totalDetailRenderWaitMs / detailPagesVisited) : 0;
const averageDetailHtmlByteSize =
  htmlSnapshotsSaved > 0 ? Math.round(totalDetailHtmlBytes / htmlSnapshotsSaved) : 0;

const runHadNonFatalErrors = failedRequests > 0 || detailsValidationFailed > 0;
const runStatus: CrawlRunStatus = crawlerRunError
  ? 'failed'
  : runHadNonFatalErrors
    ? 'completed_with_errors'
    : 'succeeded';
const runStopReason = crawlerRunError
  ? 'crawler_error'
  : reconcileNewJobsCount === 0
    ? 'no_new_jobs'
    : maxItemsAbortTriggered
      ? 'max_items_reached'
      : 'completed';

const shouldTriggerIngestion = runStatus === 'succeeded' || runStatus === 'completed_with_errors';
const ingestionTrigger = shouldTriggerIngestion
  ? await triggerIngestionStartBestEffort(ingestionTriggerConfig, {
      source: 'jobs.cz',
      crawlRunId,
      searchSpaceId: input.searchSpaceId,
      mongoDbName,
    })
  : ({
      enabled: ingestionTriggerConfig.enabled,
      attempted: false,
      skippedReason: 'run_failed',
    } satisfies IngestionTriggerResult);

const runSummary = {
  crawlRunId,
  source: 'jobs.cz',
  searchSpaceId: input.searchSpaceId,
  mongoDbName,
  status: runStatus,
  startedAt: runStartedAt.toISOString(),
  finishedAt: runEndedAt.toISOString(),
  runDurationSeconds: Number((runDurationMs / 1000).toFixed(3)),
  input: {
    searchSpaceId: input.searchSpaceId,
    startUrlsCount: startUrls.length,
    startUrls: startUrls.map((item: ActorRuntimeInput['startUrls'][number]) => item.url),
    maxItems: input.maxItems,
    maxRequestsPerCrawlSafetyCap: Math.max(input.maxItems * 5, 50),
    maxConcurrency: input.maxConcurrency,
    maxRequestsPerMinute: input.maxRequestsPerMinute,
    debugLog: input.debugLog ?? false,
    allowInactiveMarkingOnPartialRuns: input.allowInactiveMarkingOnPartialRuns,
    proxyConfigured: Boolean(input.proxyConfiguration),
    mongoDbName,
  },
  outcome: {
    stopReason: runStopReason,
    listPhaseCompleted,
    detailPhaseStarted,
    detailPhaseCompleted,
    partialRunInactiveMarkingBlocked,
    maxItemsAbortTriggered,
    maxItemsEnqueueGuardTriggered,
    failedRequests,
    failedListRequests,
    failedDetailRequests,
    inactiveMarkingSkipped,
    inactiveMarkingSkipReason,
  },
  counters: {
    listPagesVisited,
    paginationNextPagesEnqueued,
    totalJobCardsSeen,
    cardsSkippedMissingHrefOrId,
    listListingsCollectedUnique,
    listListingsDuplicateSourceIds,
    reconcileNewJobsCount,
    reconcileExistingJobsCount,
    activeJobsCountBeforeReconcile,
    inactiveMarkedCount,
    detailsEnqueuedUnique: enqueuedDetailRequests,
    duplicateOrAlreadyHandledDetailRequests,
    detailPagesVisited,
    htmlSnapshotsSaved,
    localSharedHtmlFilesWritten,
    localSharedDatasetRecordsWritten,
    datasetRecordsStored: storedDetailPages,
    detailsValidationSucceeded,
    detailsValidationFailed,
    detailRedirects,
    dynamicRenderedPagesCount,
    detailStateSnapshotsApplied,
  },
  listPageResults: {
    parsedSeedCountsFound: parsedListingResultsCounts.length,
    parsedSeedCountsMissing: seedListSummaryArray.length - parsedListingResultsCounts.length,
    parsedListingResultsCountTotal,
    byStartUrl: seedListSummaryArray,
  },
  detailRendering: {
    renderTypeCounts: detailRenderTypeCounts,
    renderSignalCounts: detailRenderSignalCounts,
    averageDetailRenderWaitMs,
    maxDetailRenderWaitMs,
    averageDetailHtmlByteSize,
    totalDetailHtmlBytes,
  },
  localSharedOutput: {
    baseDir: sharedRunOutputPaths.baseDir,
    runDir: sharedRunOutputPaths.runDir,
    recordsDir: sharedRunOutputPaths.recordsDir,
    datasetJsonPath: localSharedDatasetJsonPath,
  },
  ingestionTrigger,
  crawlState: {
    searchSpaceId: input.searchSpaceId,
    mongoDbName,
    mongoCollection: envs.MONGODB_CRAWL_JOBS_COLLECTION,
  },
  failedRequestUrls,
  error: crawlerRunError ? serializeErrorForSummary(crawlerRunError) : null,
};

await Actor.setValue('RUN_SUMMARY', runSummary);
log.info('📊 Crawl run summary', runSummary);

await upsertRunSummaryToMongoBestEffort(
  mongoRunSummaryConfig,
  crawlRunId,
  {
    source: 'jobs.cz',
    searchSpaceId: input.searchSpaceId,
    mongoDbName,
    status: runStatus,
    startedAt: runSummary.startedAt,
    finishedAt: runSummary.finishedAt,
    stopReason: runSummary.outcome.stopReason,
    parsedListingResultsCountTotal: runSummary.listPageResults.parsedListingResultsCountTotal,
    newJobsCount: runSummary.counters.reconcileNewJobsCount,
    existingJobsCount: runSummary.counters.reconcileExistingJobsCount,
    inactiveMarkedCount: runSummary.counters.inactiveMarkedCount,
    datasetRecordsStored: runSummary.counters.datasetRecordsStored,
    failedRequests: runSummary.outcome.failedRequests,
    runSummary,
  },
  'final',
);

await crawlStateRepo.close();

if (crawlerRunError) {
  throw crawlerRunError;
}

await Actor.exit();
