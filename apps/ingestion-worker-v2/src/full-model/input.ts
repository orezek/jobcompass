import type { SourceListingRecord } from './schema.js';

export type LocalInputRecord = {
  datasetFileName: string;
  datasetRecordIndex: number;
  listingRecord: SourceListingRecord;
  detailHtmlPath: string;
};
