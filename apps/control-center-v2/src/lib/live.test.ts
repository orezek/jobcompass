import {
  controlPlaneRunEventIndexV2Fixture,
  controlPlaneRunV2Fixture,
} from '@repo/control-plane-contracts/v2';
import { describe, expect, it } from 'vitest';
import { appendRunEvent, upsertRun } from '@/lib/live';

describe('live helpers', () => {
  it('inserts and replaces runs while keeping newest requestedAt first', () => {
    const olderRun = {
      ...controlPlaneRunV2Fixture,
      runId: 'run-older',
      requestedAt: '2026-03-05T09:00:00.000Z',
    };
    const newestRun = {
      ...controlPlaneRunV2Fixture,
      runId: 'run-newest',
      requestedAt: '2026-03-05T11:00:00.000Z',
    };

    const inserted = upsertRun([olderRun], newestRun);
    expect(inserted.map((run) => run.runId)).toEqual(['run-newest', 'run-older']);

    const replacement = {
      ...newestRun,
      status: 'succeeded' as const,
      finishedAt: '2026-03-05T11:30:00.000Z',
    };
    expect(upsertRun(inserted, replacement)[0]).toEqual(replacement);
  });

  it('appends only new events and keeps newest occurredAt first', () => {
    const olderEvent = {
      ...controlPlaneRunEventIndexV2Fixture,
      eventId: 'event-older',
      occurredAt: '2026-03-05T09:00:00.000Z',
    };
    const newerEvent = {
      ...controlPlaneRunEventIndexV2Fixture,
      eventId: 'event-newer',
      occurredAt: '2026-03-05T09:05:00.000Z',
    };

    const appended = appendRunEvent([olderEvent], newerEvent);
    expect(appended.map((event) => event.eventId)).toEqual(['event-newer', 'event-older']);
    expect(appendRunEvent(appended, newerEvent)).toEqual(appended);
  });
});
