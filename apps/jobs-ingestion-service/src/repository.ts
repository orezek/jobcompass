import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { MongoClient } from 'mongodb';

import type { AppLogger } from './logger.js';

export const writeOutputToFile = async (
  outputJsonPath: string,
  documents: unknown[],
  logger: AppLogger,
): Promise<void> => {
  const absolutePath = path.resolve(outputJsonPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(documents, null, 2)}\n`, 'utf8');
  logger.info(
    { outputJsonPath: absolutePath, recordsWritten: documents.length },
    'Wrote normalized output file',
  );
};

export type MongoWriteConfig = {
  mongoUri: string;
  dbName: string;
  collectionName: string;
};

type MongoCollectionConfig = {
  mongoUri: string;
  dbName: string;
};

export const writeOutputToMongo = async (
  config: MongoWriteConfig,
  documents: Array<{ id: string }>,
  logger: AppLogger,
): Promise<number> => {
  if (documents.length === 0) {
    logger.info('No documents to persist to MongoDB');
    return 0;
  }

  const client = new MongoClient(config.mongoUri);
  logger.info(
    {
      dbName: config.dbName,
      collectionName: config.collectionName,
      recordsToWrite: documents.length,
    },
    'Connecting to MongoDB for bulk upsert',
  );
  await client.connect();

  try {
    const collection = client.db(config.dbName).collection<{ id: string }>(config.collectionName);

    const operations = documents.map((document) => ({
      updateOne: {
        filter: { id: document.id },
        update: { $set: document },
        upsert: true,
      },
    }));

    const result = await collection.bulkWrite(operations, { ordered: false });
    const applied = result.upsertedCount + result.modifiedCount;
    logger.info(
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
        appliedCount: applied,
      },
      'Completed MongoDB bulk upsert',
    );
    return applied;
  } finally {
    await client.close();
    logger.info('Closed MongoDB connection');
  }
};

export type CrawlStatePruneConfig = MongoCollectionConfig & {
  crawlJobsCollectionName: string;
};

export const pruneCrawlStateByDocIds = async (
  config: CrawlStatePruneConfig,
  crawlStateDocIds: string[],
  logger: AppLogger,
): Promise<number> => {
  const uniqueIds = Array.from(new Set(crawlStateDocIds.filter((id) => id.length > 0)));
  if (uniqueIds.length === 0) {
    logger.info('No crawl-state documents to prune');
    return 0;
  }

  const client = new MongoClient(config.mongoUri);
  logger.info(
    {
      dbName: config.dbName,
      collectionName: config.crawlJobsCollectionName,
      recordsToDelete: uniqueIds.length,
    },
    'Connecting to MongoDB for crawl-state prune',
  );
  await client.connect();

  try {
    const collection = client
      .db(config.dbName)
      .collection<{ _id: string }>(config.crawlJobsCollectionName);

    const result = await collection.deleteMany({ _id: { $in: uniqueIds } });
    logger.info(
      {
        requestedCount: uniqueIds.length,
        deletedCount: result.deletedCount,
      },
      'Completed crawl-state prune for non-success ingestion records',
    );
    return result.deletedCount;
  } finally {
    await client.close();
    logger.info('Closed MongoDB connection');
  }
};

export type AlignCrawlStateConfig = MongoCollectionConfig & {
  crawlJobsCollectionName: string;
  normalizedJobsCollectionName: string;
  batchSize?: number;
};

export type AlignCrawlStateResult = {
  crawlStateDocsScanned: number;
  orphanedCrawlStateDocsFound: number;
  orphanedCrawlStateDocsDeleted: number;
  batchSize: number;
};

export const alignCrawlStateWithNormalizedJobs = async (
  config: AlignCrawlStateConfig,
  logger: AppLogger,
): Promise<AlignCrawlStateResult> => {
  const batchSize = Math.max(100, config.batchSize ?? 1000);
  const client = new MongoClient(config.mongoUri);
  logger.info(
    {
      dbName: config.dbName,
      crawlJobsCollectionName: config.crawlJobsCollectionName,
      normalizedJobsCollectionName: config.normalizedJobsCollectionName,
      batchSize,
    },
    'Connecting to MongoDB for crawl-state alignment',
  );
  await client.connect();

  try {
    const db = client.db(config.dbName);
    const crawlCollection = db.collection<{ _id: string }>(config.crawlJobsCollectionName);
    const normalizedCollection = db.collection<{ id: string }>(config.normalizedJobsCollectionName);

    const cursor = crawlCollection.find({}, { projection: { _id: 1 } });

    let crawlStateDocsScanned = 0;
    let orphanedCrawlStateDocsFound = 0;
    let orphanedCrawlStateDocsDeleted = 0;
    let currentBatchIds: string[] = [];

    const processBatch = async (): Promise<void> => {
      if (currentBatchIds.length === 0) {
        return;
      }

      const normalizedDocs = await normalizedCollection
        .find({ id: { $in: currentBatchIds } }, { projection: { _id: 0, id: 1 } })
        .toArray();
      const normalizedIds = new Set(normalizedDocs.map((doc) => doc.id));
      const orphanedIds = currentBatchIds.filter((id) => !normalizedIds.has(id));

      orphanedCrawlStateDocsFound += orphanedIds.length;
      if (orphanedIds.length > 0) {
        const deleteResult = await crawlCollection.deleteMany({ _id: { $in: orphanedIds } });
        orphanedCrawlStateDocsDeleted += deleteResult.deletedCount;
      }

      currentBatchIds = [];
    };

    for await (const doc of cursor) {
      crawlStateDocsScanned += 1;
      currentBatchIds.push(doc._id);

      if (currentBatchIds.length >= batchSize) {
        await processBatch();
      }
    }

    await processBatch();

    const result: AlignCrawlStateResult = {
      crawlStateDocsScanned,
      orphanedCrawlStateDocsFound,
      orphanedCrawlStateDocsDeleted,
      batchSize,
    };
    logger.info(result, 'Completed crawl-state alignment against normalized jobs');
    return result;
  } finally {
    await client.close();
    logger.info('Closed MongoDB connection');
  }
};
