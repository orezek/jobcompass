import { NextRequest, NextResponse } from 'next/server';
import { updateControlPlanePipelineRequestV2Schema } from '@repo/control-plane-contracts/v2';
import { deletePipeline, updatePipeline } from '@/lib/control-service-client';
import { toRouteErrorResponse } from '@/lib/route-responses';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ pipelineId: string }> },
) {
  try {
    const { pipelineId } = await context.params;
    const body = updateControlPlanePipelineRequestV2Schema.parse(await request.json());
    const pipeline = await updatePipeline(pipelineId, body);
    return NextResponse.json(pipeline);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ pipelineId: string }> },
) {
  try {
    const { pipelineId } = await context.params;
    const response = await deletePipeline(pipelineId);
    return NextResponse.json(response, { status: 202 });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
