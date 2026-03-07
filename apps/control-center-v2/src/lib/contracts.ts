import { z } from 'zod';
import {
  controlPlanePipelineV2Schema,
  controlPlaneRunEventIndexV2Schema,
  controlPlaneRunV2Schema,
  controlServiceHeartbeatResponseV2Schema,
  createControlPlanePipelineRequestV2Schema,
  listControlPlanePipelinesResponseV2Schema,
  listControlPlaneRunEventsQueryV2Schema,
  listControlPlaneRunEventsResponseV2Schema,
  listControlPlaneRunsQueryV2Schema,
  listControlPlaneRunsResponseV2Schema,
  updateControlPlanePipelineRequestV2Schema,
} from '@repo/control-plane-contracts/v2';

export type CreateControlPlanePipelineRequest = z.infer<
  typeof createControlPlanePipelineRequestV2Schema
>;
export type UpdateControlPlanePipelineRequest = z.infer<
  typeof updateControlPlanePipelineRequestV2Schema
>;
export type ControlPlanePipeline = z.infer<typeof controlPlanePipelineV2Schema>;
export type ControlPlaneRun = z.infer<typeof controlPlaneRunV2Schema>;
export type ControlPlaneRunEventIndex = z.infer<typeof controlPlaneRunEventIndexV2Schema>;
export type ControlServiceHeartbeat = z.infer<typeof controlServiceHeartbeatResponseV2Schema>;
export type ListControlPlaneRunsQuery = z.infer<typeof listControlPlaneRunsQueryV2Schema>;
export type ListControlPlaneRunEventsQuery = z.infer<typeof listControlPlaneRunEventsQueryV2Schema>;
export type ListControlPlanePipelinesResponse = z.infer<
  typeof listControlPlanePipelinesResponseV2Schema
>;
export type ListControlPlaneRunsResponse = z.infer<typeof listControlPlaneRunsResponseV2Schema>;
export type ListControlPlaneRunEventsResponse = z.infer<
  typeof listControlPlaneRunEventsResponseV2Schema
>;
