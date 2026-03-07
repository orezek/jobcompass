import { strict as assert } from 'node:assert';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { runtimeBrokerEventV2Schema } from '@repo/control-plane-contracts';
import { MongoClient } from 'mongodb';
import type { EnvSchema } from '../../src/env.js';
import { CrawlerWorkerRuntime } from '../../src/runtime.js';
import { FakeLogger } from './stubs/fake-logger.js';
import { FakePubSubTopic } from './stubs/fake-topic.js';

const mongoUri = process.env.CRAWLER_WORKER_V2_E2E_MONGODB_URI ?? process.env.MONGODB_URI;
const skipReason = !mongoUri
  ? 'Set CRAWLER_WORKER_V2_E2E_MONGODB_URI (or MONGODB_URI) before running crawler-worker-v2 E2E tests.'
  : undefined;

const detailFixtures = new Map<string, string>([
  [
    '2001063102',
    buildDetailPageHtml({
      title: 'Technical Program Manager',
      company: 'Univerzita Karlova – Matematicko-fyzikální fakulta',
      body: 'OpenEuroLLM technical program manager role with coordination duties across work packages.',
    }),
  ],
  [
    '2001090812',
    buildDetailPageHtml({
      title: 'IT Manažer',
      company: 'Gas Storage CZ, a.s.',
      body: 'IT management role in regulated energy infrastructure with on-premise systems oversight.',
    }),
  ],
  [
    '2001095645',
    buildDetailPageHtml({
      title: 'Senior Data Scientist /ML Developer',
      company: 'DER Touristik CZ a.s',
      body: 'Senior ML and data science role focused on pricing and forecasting workflows.',
    }),
  ],
]);

let mongoClient: MongoClient | null = null;

before(async () => {
  if (skipReason) {
    return;
  }

  mongoClient = new MongoClient(mongoUri!);
  await mongoClient.connect();
  await mongoClient.db('admin').command({ ping: 1 });
});

after(async () => {
  if (!mongoClient) {
    return;
  }

  await mongoClient.close();
  mongoClient = null;
});

function getMongoClient(): MongoClient {
  assert.ok(mongoClient, 'Mongo client is not initialized.');
  return mongoClient;
}

function buildEnv(): EnvSchema {
  return {
    PORT: 0,
    SERVICE_NAME: 'crawler-worker-v2-e2e',
    SERVICE_VERSION: '2.0.0-test',
    LOG_LEVEL: 'silent',
    LOG_PRETTY: false,
    MAX_CONCURRENT_RUNS: 1,
    CONTROL_AUTH_MODE: 'token',
    CONTROL_SHARED_TOKEN: 'test-token',
    CONTROL_JWT_PUBLIC_KEY: undefined,
    GCP_PROJECT_ID: 'test-project',
    PUBSUB_EVENTS_TOPIC: 'test-run-events',
    MONGODB_URI: mongoUri!,
  };
}

function createFixtureSiteServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const handler = (request: IncomingMessage, response: ServerResponse): void => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/search') {
      const page = url.searchParams.get('page') ?? '1';
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(buildSearchPageHtml(page));
      return;
    }

    const detailMatch = url.pathname.match(/^\/rpd\/(\d+)\/?$/u);
    if (detailMatch) {
      const sourceId = detailMatch[1];
      const html = sourceId ? detailFixtures.get(sourceId) : undefined;
      if (html) {
        response.statusCode = 200;
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end(html);
        return;
      }
    }

    response.statusCode = 404;
    response.end('not found');
  };

  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to determine fixture server address.'));
        return;
      }

      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: async () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          }),
      });
    });
  });
}

function buildSearchPageHtml(page: string): string {
  const nextLink =
    page === '1' ? '<a class="Pagination__button--next" href="/search?page=2">Next</a>' : '';

  const cards =
    page === '1'
      ? [
          buildJobCardHtml({
            sourceId: '2001063102',
            jobTitle: 'Technical Program Manager',
            companyName: 'Univerzita Karlova – Matematicko-fyzikální fakulta',
            location: 'Praha – Malá Strana',
            publishedInfoText: 'Aktualizováno dnes',
          }),
          buildJobCardHtml({
            sourceId: '2001090812',
            jobTitle: 'IT Manažer',
            companyName: 'Gas Storage CZ, a.s.',
            location: 'Praha - Strašnice',
            publishedInfoText: 'Aktualizováno dnes',
          }),
        ].join('\n')
      : buildJobCardHtml({
          sourceId: '2001095645',
          jobTitle: 'Senior Data Scientist /ML Developer',
          companyName: 'DER Touristik CZ a.s',
          location: 'Praha - Chodov',
          publishedInfoText: 'Aktualizováno dnes',
        });

  return `<!doctype html>
<html lang="en">
  <body>
    ${cards}
    ${nextLink}
  </body>
</html>`;
}

function buildJobCardHtml(input: {
  sourceId: string;
  jobTitle: string;
  companyName: string;
  location: string;
  publishedInfoText: string;
}): string {
  return `<article class="SearchResultCard">
  <h2 data-test-ad-title="${input.jobTitle}">
    <a data-jobad-id="${input.sourceId}" href="/rpd/${input.sourceId}/">${input.jobTitle}</a>
  </h2>
  <span translate="no">${input.companyName}</span>
  <li data-test="serp-locality">${input.location}</li>
  <div data-test-ad-status>${input.publishedInfoText}</div>
</article>`;
}

function buildDetailPageHtml(input: { title: string; company: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>${input.title}</h1>
      <section>
        <h2>${input.company}</h2>
        <p>${input.body}</p>
      </section>
    </main>
  </body>
</html>`;
}

test('crawler worker v2 reconciles listings, writes artifacts, and emits v2 events', async (t) => {
  if (skipReason) {
    t.skip(skipReason);
    return;
  }

  const site = await createFixtureSiteServer();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawler-worker-v2-e2e-'));
  const crawleeStorageDir = path.join(tempDir, 'crawlee-storage');
  const dbName = `crawler_worker_v2_e2e_${Date.now()}`;
  const topic = new FakePubSubTopic();
  const previousCrawleeStorageDir = process.env.CRAWLEE_STORAGE_DIR;
  const previousApifyLocalStorageDir = process.env.APIFY_LOCAL_STORAGE_DIR;
  process.env.CRAWLEE_STORAGE_DIR = crawleeStorageDir;
  process.env.APIFY_LOCAL_STORAGE_DIR = crawleeStorageDir;
  const runtime = new CrawlerWorkerRuntime({
    env: buildEnv(),
    logger: new FakeLogger(),
    eventsTopic: topic,
    mongoClient: getMongoClient(),
  });

  await runtime.initialize();

  const db = getMongoClient().db(dbName);
  await db.collection('normalized_job_ads').insertMany([
    {
      id: 'jobs.cz:2001063102',
      source: 'jobs.cz',
      sourceId: '2001063102',
      searchSpaceId: 'prague-tech-jobs',
      isActive: true,
      firstSeenAt: '2026-03-01T10:00:00.000Z',
      lastSeenAt: '2026-03-01T10:00:00.000Z',
      firstSeenRunId: 'old-run',
      lastSeenRunId: 'old-run',
      adUrl: `${site.baseUrl}/rpd/2001063102/`,
      listing: {
        jobTitle: 'Technical Program Manager',
        companyName: 'Univerzita Karlova – Matematicko-fyzikální fakulta',
        locationText: 'Praha – Malá Strana',
        salaryText: null,
        publishedInfoText: 'Aktualizováno dnes',
      },
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'jobs.cz:9999999999',
      source: 'jobs.cz',
      sourceId: '9999999999',
      searchSpaceId: 'prague-tech-jobs',
      isActive: true,
      firstSeenAt: '2026-03-01T10:00:00.000Z',
      lastSeenAt: '2026-03-01T10:00:00.000Z',
      firstSeenRunId: 'old-run',
      lastSeenRunId: 'old-run',
      adUrl: `${site.baseUrl}/rpd/9999999999/`,
      listing: {
        jobTitle: 'Stale Listing',
        companyName: 'Obsolete Corp',
        locationText: 'Praha',
        salaryText: null,
        publishedInfoText: 'Aktualizováno dnes',
      },
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
  ]);

  try {
    const startResponse = await runtime.startRun({
      contractVersion: 'v2',
      runId: 'crawler-runtime-e2e-001',
      idempotencyKey: 'crawler-runtime-e2e-001',
      runtimeSnapshot: {
        crawlerMaxConcurrency: 1,
        crawlerMaxRequestsPerMinute: 60,
      },
      inputRef: {
        source: 'jobs.cz',
        searchSpaceId: 'prague-tech-jobs',
        searchSpaceSnapshot: {
          name: 'Prague Tech Jobs',
          description: 'Fixture search space',
          startUrls: [`${site.baseUrl}/search?page=1`],
          maxItems: 10,
          allowInactiveMarking: true,
        },
        emitDetailCapturedEvents: true,
      },
      persistenceTargets: {
        dbName,
      },
      artifactSink: {
        type: 'local_filesystem',
        basePath: tempDir,
      },
    });

    assert.equal(startResponse.ok, true);
    assert.equal(startResponse.state, 'accepted');

    await runtime.waitUntilSettled('crawler-runtime-e2e-001', 120_000);

    const summaryDoc = await db.collection('crawl_run_summaries').findOne<{
      status: string;
      newJobsCount: number;
      existingJobsCount: number;
      inactiveMarkedCount: number;
      datasetRecordsStored: number;
      failedRequests: number;
      runSummary: Record<string, unknown>;
    }>({
      crawlRunId: 'crawler-runtime-e2e-001',
    });

    assert.ok(summaryDoc);
    assert.equal(summaryDoc.status, 'succeeded');
    assert.equal(summaryDoc.newJobsCount, 2);
    assert.equal(summaryDoc.existingJobsCount, 1);
    assert.equal(summaryDoc.inactiveMarkedCount, 1);
    assert.equal(summaryDoc.datasetRecordsStored, 2);
    assert.equal(summaryDoc.failedRequests, 0);

    const existingSeen = await db
      .collection('normalized_job_ads')
      .findOne<{ isActive: boolean; lastSeenRunId: string }>({
        id: 'jobs.cz:2001063102',
      });
    const staleDoc = await db.collection('normalized_job_ads').findOne<{ isActive: boolean }>({
      id: 'jobs.cz:9999999999',
    });
    const insertedNew = await db.collection('normalized_job_ads').findOne({
      id: 'jobs.cz:2001090812',
    });

    assert.equal(existingSeen?.isActive, true);
    assert.equal(existingSeen?.lastSeenRunId, 'crawler-runtime-e2e-001');
    assert.equal(staleDoc?.isActive, false);
    assert.equal(insertedNew, null);

    const datasetPath = path.join(tempDir, 'runs', 'crawler-runtime-e2e-001', 'dataset.json');
    const datasetRaw = await readFile(datasetPath, 'utf8');
    const dataset = JSON.parse(datasetRaw) as Array<Record<string, unknown>>;
    assert.equal(dataset.length, 2);

    const artifactOne = path.join(
      tempDir,
      'runs',
      'crawler-runtime-e2e-001',
      'records',
      'job-html-2001090812.html',
    );
    const artifactTwo = path.join(
      tempDir,
      'runs',
      'crawler-runtime-e2e-001',
      'records',
      'job-html-2001095645.html',
    );
    const artifactOneRaw = await readFile(artifactOne, 'utf8');
    const artifactTwoRaw = await readFile(artifactTwo, 'utf8');
    assert.match(artifactOneRaw, /Gas Storage CZ/u);
    assert.match(artifactTwoRaw, /DER Touristik/u);

    const events = topic.published.map((entry) =>
      runtimeBrokerEventV2Schema.parse(JSON.parse(entry.payload) as unknown),
    );
    assert.deepEqual(
      events.map((event) => event.eventType),
      [
        'crawler.run.started',
        'crawler.detail.captured',
        'crawler.detail.captured',
        'crawler.run.finished',
      ],
    );

    const detailSourceIds = events
      .filter((event) => event.eventType === 'crawler.detail.captured')
      .map((event) => event.payload.sourceId)
      .sort();
    assert.deepEqual(detailSourceIds, ['2001090812', '2001095645']);
  } finally {
    if (previousCrawleeStorageDir === undefined) {
      delete process.env.CRAWLEE_STORAGE_DIR;
    } else {
      process.env.CRAWLEE_STORAGE_DIR = previousCrawleeStorageDir;
    }

    if (previousApifyLocalStorageDir === undefined) {
      delete process.env.APIFY_LOCAL_STORAGE_DIR;
    } else {
      process.env.APIFY_LOCAL_STORAGE_DIR = previousApifyLocalStorageDir;
    }

    await db.dropDatabase();
    await rm(tempDir, { recursive: true, force: true });
    await site.close();
  }
});
