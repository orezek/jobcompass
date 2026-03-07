import {
  controlPlanePipelineV2Fixture,
  controlPlanePipelineV2Schema,
  controlPlaneRunEventIndexV2Fixture,
  controlPlaneRunEventIndexV2Schema,
  controlPlaneRunManifestV2Fixture,
  controlPlaneRunManifestV2Schema,
  controlPlaneRunV2Fixture,
  controlPlaneRunV2Schema,
  controlServiceCancelRunAcceptedResponseV2Fixture,
  controlServiceCancelRunAcceptedResponseV2Schema,
  controlServiceCancelRunRequestV2Fixture,
  controlServiceCancelRunRequestV2Schema,
  controlServiceHeartbeatResponseV2Fixture,
  controlServiceHeartbeatResponseV2Schema,
  controlServiceHealthzResponseV2Fixture,
  controlServiceHealthzResponseV2Schema,
  controlServicePubSubConfigV2Fixture,
  controlServicePubSubConfigV2Schema,
  controlServiceReadyzResponseV2Fixture,
  controlServiceReadyzResponseV2Schema,
  controlServiceSseEventV2Schema,
  controlServiceSseHeartbeatEventV2Fixture,
  controlServiceSseHelloEventV2Fixture,
  controlServiceSseRunEventAppendedEventV2Fixture,
  controlServiceSseRunUpsertedEventV2Fixture,
  controlServiceStartPipelineRunAcceptedResponseV2Fixture,
  controlServiceStartPipelineRunAcceptedResponseV2Schema,
  controlServiceStartPipelineRunRequestV2Fixture,
  controlServiceStartPipelineRunRequestV2Schema,
  controlServiceStreamQueryV2Fixture,
  controlServiceStreamQueryV2Schema,
  createControlPlanePipelineRequestV2Fixture,
  createControlPlanePipelineRequestV2Schema,
  crawlRunSummaryProjectionV2Fixture,
  crawlRunSummaryProjectionV2Schema,
  crawlerStartRunRequestV2Fixture,
  crawlerStartRunRequestV2Schema,
  ingestionRunSummaryProjectionV2Fixture,
  ingestionRunSummaryProjectionV2Schema,
  runtimeBrokerEventV2Fixtures,
  runtimeBrokerEventV2Schema,
  ingestionStartRunRequestV2Fixture,
  ingestionStartRunRequestV2Schema,
  listControlPlanePipelinesQueryV2Fixture,
  listControlPlanePipelinesQueryV2Schema,
  listControlPlanePipelinesResponseV2Fixture,
  listControlPlanePipelinesResponseV2Schema,
  listControlPlaneRunEventsQueryV2Fixture,
  listControlPlaneRunEventsQueryV2Schema,
  listControlPlaneRunEventsResponseV2Fixture,
  listControlPlaneRunEventsResponseV2Schema,
  listControlPlaneRunsQueryV2Fixture,
  listControlPlaneRunsQueryV2Schema,
  listControlPlaneRunsResponseV2Fixture,
  listControlPlaneRunsResponseV2Schema,
  startRunAcceptedResponseV2Fixture,
  startRunResponseV2Schema,
  updateControlPlanePipelineRequestV2Fixture,
  updateControlPlanePipelineRequestV2Schema,
  workerLifecycleEventV2Fixtures,
  workerLifecycleEventV2Schema,
} from '@repo/control-plane-contracts';
import { describe, expect, it } from 'vitest';

describe('v2 control-plane contracts', () => {
  it('validates crawler and ingestion StartRun fixtures', () => {
    expect(crawlerStartRunRequestV2Schema.parse(crawlerStartRunRequestV2Fixture)).toEqual(
      crawlerStartRunRequestV2Fixture,
    );
    expect(ingestionStartRunRequestV2Schema.parse(ingestionStartRunRequestV2Fixture)).toEqual(
      ingestionStartRunRequestV2Fixture,
    );
  });

  it('rejects ingestion StartRun payload missing inputRef', () => {
    const invalidRequest = {
      ...ingestionStartRunRequestV2Fixture,
      inputRef: undefined,
    };
    const result = ingestionStartRunRequestV2Schema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  it('rejects removed StartRun metadata fields on ingestion requests', () => {
    const invalidRequest = {
      ...ingestionStartRunRequestV2Fixture,
      workerType: 'ingestion',
      requestedAt: '2026-03-06T10:00:00.000Z',
      correlationId: 'corr-legacy-fixture',
    };
    const result = ingestionStartRunRequestV2Schema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  it('validates v2 StartRun response fixture', () => {
    expect(startRunResponseV2Schema.parse(startRunAcceptedResponseV2Fixture)).toEqual(
      startRunAcceptedResponseV2Fixture,
    );
  });

  it('validates v2 worker lifecycle event fixtures', () => {
    expect(workerLifecycleEventV2Fixtures).toHaveLength(2);
    for (const event of workerLifecycleEventV2Fixtures) {
      expect(workerLifecycleEventV2Schema.parse(event)).toEqual(event);
    }
  });

  it('validates v2 runtime broker event fixtures', () => {
    expect(runtimeBrokerEventV2Fixtures).toHaveLength(3);
    for (const event of runtimeBrokerEventV2Fixtures) {
      expect(runtimeBrokerEventV2Schema.parse(event)).toEqual(event);
    }
  });

  it('validates v2 control-service request fixtures', () => {
    expect(
      createControlPlanePipelineRequestV2Schema.parse(createControlPlanePipelineRequestV2Fixture),
    ).toEqual(createControlPlanePipelineRequestV2Fixture);
    expect(
      updateControlPlanePipelineRequestV2Schema.parse(updateControlPlanePipelineRequestV2Fixture),
    ).toEqual(updateControlPlanePipelineRequestV2Fixture);
    expect(
      controlServiceStartPipelineRunRequestV2Schema.parse(
        controlServiceStartPipelineRunRequestV2Fixture,
      ),
    ).toEqual(controlServiceStartPipelineRunRequestV2Fixture);
    expect(
      controlServiceCancelRunRequestV2Schema.parse(controlServiceCancelRunRequestV2Fixture),
    ).toEqual(controlServiceCancelRunRequestV2Fixture);
  });

  it('validates v2 control-service health and list fixtures', () => {
    expect(
      controlServiceHealthzResponseV2Schema.parse(controlServiceHealthzResponseV2Fixture),
    ).toEqual(controlServiceHealthzResponseV2Fixture);
    expect(
      controlServiceReadyzResponseV2Schema.parse(controlServiceReadyzResponseV2Fixture),
    ).toEqual(controlServiceReadyzResponseV2Fixture);
    expect(
      controlServiceHeartbeatResponseV2Schema.parse(controlServiceHeartbeatResponseV2Fixture),
    ).toEqual(controlServiceHeartbeatResponseV2Fixture);
    expect(controlServicePubSubConfigV2Schema.parse(controlServicePubSubConfigV2Fixture)).toEqual(
      controlServicePubSubConfigV2Fixture,
    );
    expect(
      listControlPlanePipelinesQueryV2Schema.parse(listControlPlanePipelinesQueryV2Fixture),
    ).toEqual(listControlPlanePipelinesQueryV2Fixture);
    expect(
      listControlPlanePipelinesResponseV2Schema.parse(listControlPlanePipelinesResponseV2Fixture),
    ).toEqual(listControlPlanePipelinesResponseV2Fixture);
    expect(listControlPlaneRunsQueryV2Schema.parse(listControlPlaneRunsQueryV2Fixture)).toEqual(
      listControlPlaneRunsQueryV2Fixture,
    );
    expect(
      listControlPlaneRunsResponseV2Schema.parse(listControlPlaneRunsResponseV2Fixture),
    ).toEqual(listControlPlaneRunsResponseV2Fixture);
    expect(
      listControlPlaneRunEventsQueryV2Schema.parse(listControlPlaneRunEventsQueryV2Fixture),
    ).toEqual(listControlPlaneRunEventsQueryV2Fixture);
    expect(
      listControlPlaneRunEventsResponseV2Schema.parse(listControlPlaneRunEventsResponseV2Fixture),
    ).toEqual(listControlPlaneRunEventsResponseV2Fixture);
  });

  it('validates v2 control-service sse fixtures', () => {
    expect(controlServiceStreamQueryV2Schema.parse(controlServiceStreamQueryV2Fixture)).toEqual(
      controlServiceStreamQueryV2Fixture,
    );

    for (const event of [
      controlServiceSseHelloEventV2Fixture,
      controlServiceSseRunUpsertedEventV2Fixture,
      controlServiceSseRunEventAppendedEventV2Fixture,
      controlServiceSseHeartbeatEventV2Fixture,
    ]) {
      expect(controlServiceSseEventV2Schema.parse(event)).toEqual(event);
    }
  });

  it('validates v2 control-service command response fixtures', () => {
    expect(
      controlServiceStartPipelineRunAcceptedResponseV2Schema.parse(
        controlServiceStartPipelineRunAcceptedResponseV2Fixture,
      ),
    ).toEqual(controlServiceStartPipelineRunAcceptedResponseV2Fixture);
    expect(
      controlServiceCancelRunAcceptedResponseV2Schema.parse(
        controlServiceCancelRunAcceptedResponseV2Fixture,
      ),
    ).toEqual(controlServiceCancelRunAcceptedResponseV2Fixture);
  });

  it('validates v2 control-plane collection fixtures', () => {
    expect(controlPlanePipelineV2Schema.parse(controlPlanePipelineV2Fixture)).toEqual(
      controlPlanePipelineV2Fixture,
    );
    expect(controlPlaneRunManifestV2Schema.parse(controlPlaneRunManifestV2Fixture)).toEqual(
      controlPlaneRunManifestV2Fixture,
    );
    expect(controlPlaneRunEventIndexV2Schema.parse(controlPlaneRunEventIndexV2Fixture)).toEqual(
      controlPlaneRunEventIndexV2Fixture,
    );
    expect(controlPlaneRunV2Schema.parse(controlPlaneRunV2Fixture)).toEqual(
      controlPlaneRunV2Fixture,
    );
  });

  it('validates v2 persistence projection fixtures', () => {
    expect(crawlRunSummaryProjectionV2Schema.parse(crawlRunSummaryProjectionV2Fixture)).toEqual(
      crawlRunSummaryProjectionV2Fixture,
    );
    expect(
      ingestionRunSummaryProjectionV2Schema.parse(ingestionRunSummaryProjectionV2Fixture),
    ).toEqual(ingestionRunSummaryProjectionV2Fixture);
  });
});
