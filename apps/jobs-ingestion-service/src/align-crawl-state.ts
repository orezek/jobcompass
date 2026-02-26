import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { envs, logger } from './app.js';
import { alignCrawlStateWithNormalizedJobs } from './repository.js';

async function main(): Promise<void> {
  if (!envs.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to align crawl state with normalized jobs.');
  }

  const result = await alignCrawlStateWithNormalizedJobs(
    {
      mongoUri: envs.MONGODB_URI,
      dbName: envs.MONGODB_DB_NAME,
      crawlJobsCollectionName: envs.MONGODB_CRAWL_JOBS_COLLECTION,
      normalizedJobsCollectionName: envs.MONGODB_JOBS_COLLECTION,
    },
    logger.child({ component: 'CrawlStateAlignment' }),
  );

  logger.info(
    {
      mongoDbName: envs.MONGODB_DB_NAME,
      crawlJobsCollectionName: envs.MONGODB_CRAWL_JOBS_COLLECTION,
      normalizedJobsCollectionName: envs.MONGODB_JOBS_COLLECTION,
      ...result,
    },
    'Completed crawl-state alignment command',
  );
}

const isEntrypoint = (importMetaUrl: string): boolean => {
  const argvPath = process.argv[1];
  if (!argvPath) {
    return false;
  }

  return importMetaUrl === pathToFileURL(argvPath).href;
};

if (isEntrypoint(import.meta.url)) {
  void main().catch((error) => {
    logger.fatal({ err: error }, 'Unhandled fatal error in crawl-state alignment command');
    process.exit(1);
  });
}
