'use client';

import {
  controlServiceSseRunEventAppendedEventV2Schema,
  controlServiceSseRunUpsertedEventV2Schema,
} from '@repo/control-plane-contracts/v2';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ControlPlaneRun, ControlPlaneRunEventIndex } from '@/lib/contracts';

export type LiveConnectionState = 'connecting' | 'live' | 'stale';

export const upsertRun = (runs: ControlPlaneRun[], nextRun: ControlPlaneRun): ControlPlaneRun[] => {
  const existingIndex = runs.findIndex((run) => run.runId === nextRun.runId);
  if (existingIndex === -1) {
    return [nextRun, ...runs].sort((left, right) =>
      right.requestedAt.localeCompare(left.requestedAt),
    );
  }

  const copy = [...runs];
  copy.splice(existingIndex, 1, nextRun);
  return copy;
};

export const appendRunEvent = (
  events: ControlPlaneRunEventIndex[],
  nextEvent: ControlPlaneRunEventIndex,
): ControlPlaneRunEventIndex[] => {
  if (events.some((event) => event.eventId === nextEvent.eventId)) {
    return events;
  }

  return [nextEvent, ...events].sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  );
};

const buildStreamUrl = (filters: { pipelineId?: string; runId?: string }): string => {
  const params = new URLSearchParams();
  if (filters.pipelineId) {
    params.set('pipelineId', filters.pipelineId);
  }
  if (filters.runId) {
    params.set('runId', filters.runId);
  }

  const query = params.toString();
  return query.length > 0 ? `/api/stream?${query}` : '/api/stream';
};

export type UseControlStreamOptions = {
  pipelineId?: string;
  runId?: string;
  onRunUpserted?: (run: ControlPlaneRun) => void;
  onRunEventAppended?: (event: ControlPlaneRunEventIndex) => void;
};

export const useControlStream = (options: UseControlStreamOptions): LiveConnectionState => {
  const router = useRouter();
  const [connectionState, setConnectionState] = useState<LiveConnectionState>('connecting');
  const didDisconnectRef = useRef(false);
  const onRunUpsertedRef = useRef(options.onRunUpserted);
  const onRunEventAppendedRef = useRef(options.onRunEventAppended);

  onRunUpsertedRef.current = options.onRunUpserted;
  onRunEventAppendedRef.current = options.onRunEventAppended;

  const streamUrl = useMemo(
    () => buildStreamUrl({ pipelineId: options.pipelineId, runId: options.runId }),
    [options.pipelineId, options.runId],
  );

  useEffect(() => {
    const source = new EventSource(streamUrl);

    source.onopen = () => {
      setConnectionState('live');
      if (didDisconnectRef.current) {
        didDisconnectRef.current = false;
        router.refresh();
      }
    };

    source.onerror = () => {
      didDisconnectRef.current = true;
      setConnectionState('stale');
    };

    const handleRunUpserted = (message: MessageEvent<string>) => {
      const parsed = controlServiceSseRunUpsertedEventV2Schema.parse({
        id: message.lastEventId || `run-upserted-${Date.now()}`,
        event: 'run.upserted',
        data: JSON.parse(message.data) as unknown,
      });

      onRunUpsertedRef.current?.(parsed.data.run);
    };

    const handleRunEventAppended = (message: MessageEvent<string>) => {
      const parsed = controlServiceSseRunEventAppendedEventV2Schema.parse({
        id: message.lastEventId || `run-event-appended-${Date.now()}`,
        event: 'run.event.appended',
        data: JSON.parse(message.data) as unknown,
      });

      onRunEventAppendedRef.current?.(parsed.data.event);
    };

    const noopListener = () => undefined;

    source.addEventListener('stream.hello', noopListener);
    source.addEventListener('stream.heartbeat', noopListener);
    source.addEventListener('run.upserted', handleRunUpserted as EventListener);
    source.addEventListener('run.event.appended', handleRunEventAppended as EventListener);

    return () => {
      source.removeEventListener('stream.hello', noopListener);
      source.removeEventListener('stream.heartbeat', noopListener);
      source.removeEventListener('run.upserted', handleRunUpserted as EventListener);
      source.removeEventListener('run.event.appended', handleRunEventAppended as EventListener);
      source.close();
    };
  }, [router, streamUrl]);

  return connectionState;
};
