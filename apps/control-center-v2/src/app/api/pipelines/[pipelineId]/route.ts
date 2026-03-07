import { NextRequest, NextResponse } from 'next/server';
import { updateControlPlanePipelineRequestV2Schema } from '@repo/control-plane-contracts/v2';
import { renamePipeline } from '@/lib/control-service-client';
import { toRouteErrorResponse } from '@/lib/route-responses';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ pipelineId: string }> },
) {
  try {
    const { pipelineId } = await context.params;
    const body = updateControlPlanePipelineRequestV2Schema.parse(await request.json());
    const pipeline = await renamePipeline(pipelineId, body);
    return NextResponse.json(pipeline);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
