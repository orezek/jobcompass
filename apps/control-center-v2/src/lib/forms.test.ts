import { describe, expect, it } from 'vitest';
import {
  PIPELINE_NAME_MAX_LENGTH,
  buildCreatePipelinePayload,
  buildUpdatePipelinePayload,
  pipelineCreateFormSchema,
  pipelineUpdateFormSchema,
} from '@/lib/forms';

describe('forms', () => {
  it('builds a v2.2 create payload without operator-provided IDs', () => {
    const values = pipelineCreateFormSchema.parse({
      name: ' Prague Tech ',
      source: 'jobs.cz',
      mode: 'crawl_and_ingest',
      searchSpaceName: 'Prague Tech',
      searchSpaceDescription: '  curated roles  ',
      startUrlsText: ' https://example.com/one \n\n https://example.com/two ',
      maxItems: '200',
      allowInactiveMarking: true,
      runtimeProfileName: 'Runtime Prague',
      crawlerMaxConcurrency: '3',
      crawlerMaxRequestsPerMinute: '60',
      ingestionConcurrency: '4',
      includeMongoOutput: true,
      includeDownloadableJson: true,
      operatorMongoUri: 'mongodb://localhost:27017',
      operatorDbName: 'pl_prague_tech_01',
    });

    expect(buildCreatePipelinePayload(values)).toEqual({
      name: 'Prague Tech',
      source: 'jobs.cz',
      mode: 'crawl_and_ingest',
      searchSpace: {
        name: 'Prague Tech',
        description: 'curated roles',
        startUrls: ['https://example.com/one', 'https://example.com/two'],
        maxItems: 200,
        allowInactiveMarking: true,
      },
      runtimeProfile: {
        name: 'Runtime Prague',
        crawlerMaxConcurrency: 3,
        crawlerMaxRequestsPerMinute: 60,
        ingestionConcurrency: 4,
      },
      structuredOutput: {
        destinations: [{ type: 'mongodb' }, { type: 'downloadable_json' }],
      },
      operatorSink: {
        mongodbUri: 'mongodb://localhost:27017',
        dbName: 'pl_prague_tech_01',
      },
    });
  });

  it('forces allowInactiveMarking=false when mongodb destination is not selected', () => {
    const values = pipelineUpdateFormSchema.parse({
      name: 'Crawler Only',
      mode: 'crawl_only',
      searchSpaceName: 'Crawler Only',
      searchSpaceDescription: '',
      startUrlsText: 'https://example.com/jobs',
      maxItems: 50,
      allowInactiveMarking: true,
      runtimeProfileName: 'Crawler Runtime',
      crawlerMaxConcurrency: 2,
      crawlerMaxRequestsPerMinute: 30,
      ingestionConcurrency: 9,
      includeMongoOutput: false,
      includeDownloadableJson: true,
      operatorMongoUri: 'mongodb://localhost:27017',
      operatorDbName: 'pl_crawler_only_01',
    });

    expect(buildUpdatePipelinePayload(values)).toMatchObject({
      mode: 'crawl_only',
      searchSpace: {
        allowInactiveMarking: false,
      },
      runtimeProfile: {
        ingestionConcurrency: undefined,
      },
      structuredOutput: {
        destinations: [],
      },
    });
  });

  it('rejects pipeline names longer than the shared UI limit', () => {
    expect(() =>
      pipelineCreateFormSchema.parse({
        name: 'x'.repeat(PIPELINE_NAME_MAX_LENGTH + 1),
        source: 'jobs.cz',
        mode: 'crawl_only',
        searchSpaceName: 'Crawler Only',
        searchSpaceDescription: '',
        startUrlsText: 'https://example.com/jobs',
        maxItems: 50,
        allowInactiveMarking: false,
        runtimeProfileName: 'Crawler Runtime',
        crawlerMaxConcurrency: 2,
        crawlerMaxRequestsPerMinute: 30,
        ingestionConcurrency: 9,
        includeMongoOutput: true,
        includeDownloadableJson: true,
        operatorMongoUri: 'mongodb://localhost:27017',
        operatorDbName: 'pl_crawler_only_01',
      }),
    ).toThrow(new RegExp(`at most ${PIPELINE_NAME_MAX_LENGTH} characters`, 'i'));
  });
});
