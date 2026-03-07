import type { Collection } from 'mongodb';

export type NormalizedJobDoc = {
  id: string;
  source: string;
  sourceId: string;
  searchSpaceId: string;
  isActive: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  firstSeenRunId: string;
  lastSeenRunId: string;
  adUrl?: string;
  scrapedAt?: string;
  listing?: {
    jobTitle: string;
    companyName: string | null;
    locationText: string | null;
    salaryText: string | null;
    publishedInfoText: string | null;
  };
  updatedAt?: string;
};

export type CrawlListingRecord = import('./listing-card-parser.js').CrawlListingRecord;

export type ReconcileListingsInput = {
  source: string;
  searchSpaceId: string;
  crawlRunId: string;
  observedAtIso: string;
  listings: CrawlListingRecord[];
  allowInactiveMarking: boolean;
  listPhaseTrustworthy: boolean;
  listPhaseSkipReason?: string;
  massInactivationGuardMinActiveCount: number;
  massInactivationGuardMinSeenRatio: number;
};

export type ReconcileListingsResult = {
  totalSeen: number;
  newListings: CrawlListingRecord[];
  existingCount: number;
  activeBeforeCount: number;
  inactiveMarkedCount: number;
  inactiveMarkingSkipped: boolean;
  inactiveMarkingSkipReason: string | null;
  existingSeenUpdatedCount: number;
};

const DEFAULT_IN_QUERY_CHUNK_SIZE = 1000;

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (items.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

export class NormalizedJobsRepository {
  public constructor(private readonly collection: Collection<NormalizedJobDoc>) {}

  public async ensureIndexes(): Promise<void> {
    await this.collection.createIndexes([
      { key: { id: 1 }, name: 'id_unique', unique: true },
      { key: { source: 1, sourceId: 1 }, name: 'source_sourceId' },
      { key: { searchSpaceId: 1, isActive: 1 }, name: 'searchSpaceId_isActive' },
      { key: { searchSpaceId: 1, lastSeenRunId: 1 }, name: 'searchSpaceId_lastSeenRunId' },
      { key: { searchSpaceId: 1, updatedAt: 1 }, name: 'searchSpaceId_updatedAt' },
    ]);
  }

  public async reconcileListings(input: ReconcileListingsInput): Promise<ReconcileListingsResult> {
    const { source, searchSpaceId, crawlRunId, observedAtIso, listings } = input;
    const activeFilter = { source, searchSpaceId, isActive: true };
    const activeBeforeCount = await this.collection.countDocuments(activeFilter);

    const seenSourceIds = listings.map((item) => item.sourceId);
    const existingSourceIds = new Set<string>();

    for (const sourceIdsChunk of chunkArray(seenSourceIds, DEFAULT_IN_QUERY_CHUNK_SIZE)) {
      const docs = await this.collection
        .find(
          {
            source,
            searchSpaceId,
            sourceId: { $in: sourceIdsChunk },
          },
          { projection: { _id: 0, sourceId: 1 } },
        )
        .toArray();

      for (const doc of docs) {
        if (typeof doc.sourceId === 'string') {
          existingSourceIds.add(doc.sourceId);
        }
      }
    }

    const newListings = listings.filter((listing) => !existingSourceIds.has(listing.sourceId));
    const existingListings = listings.filter((listing) => existingSourceIds.has(listing.sourceId));

    if (existingListings.length > 0) {
      await this.collection.bulkWrite(
        existingListings.map((listing) => ({
          updateOne: {
            filter: { source, searchSpaceId, sourceId: listing.sourceId },
            update: {
              $set: {
                isActive: true,
                lastSeenAt: observedAtIso,
                lastSeenRunId: crawlRunId,
                adUrl: listing.adUrl,
                scrapedAt: observedAtIso,
                listing: {
                  jobTitle: listing.jobTitle,
                  companyName: listing.companyName || null,
                  locationText: listing.location || null,
                  salaryText: listing.salary,
                  publishedInfoText: listing.publishedInfoText || null,
                },
                updatedAt: observedAtIso,
              },
            },
          },
        })),
        { ordered: false },
      );
    }

    let inactiveMarkedCount = 0;
    let inactiveMarkingSkipped = false;
    let inactiveMarkingSkipReason: string | null = null;

    if (!input.allowInactiveMarking) {
      inactiveMarkingSkipped = true;
      inactiveMarkingSkipReason = 'inactive_marking_disabled';
    } else if (!input.listPhaseTrustworthy) {
      inactiveMarkingSkipped = true;
      inactiveMarkingSkipReason = input.listPhaseSkipReason ?? 'list_phase_untrustworthy';
    } else {
      const seenRatio = activeBeforeCount > 0 ? listings.length / activeBeforeCount : 1;
      const massGuardTriggered =
        activeBeforeCount >= input.massInactivationGuardMinActiveCount &&
        seenRatio < input.massInactivationGuardMinSeenRatio;

      if (massGuardTriggered) {
        inactiveMarkingSkipped = true;
        inactiveMarkingSkipReason = 'mass_inactivation_guard';
      } else {
        const result = await this.collection.updateMany(
          {
            ...activeFilter,
            sourceId: { $nin: seenSourceIds },
          },
          {
            $set: {
              isActive: false,
              updatedAt: observedAtIso,
            },
          },
        );
        inactiveMarkedCount = result.modifiedCount;
      }
    }

    return {
      totalSeen: listings.length,
      newListings,
      existingCount: existingListings.length,
      activeBeforeCount,
      inactiveMarkedCount,
      inactiveMarkingSkipped,
      inactiveMarkingSkipReason,
      existingSeenUpdatedCount: existingListings.length,
    };
  }
}
