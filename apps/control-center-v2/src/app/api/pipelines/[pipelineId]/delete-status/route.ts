import { NextRequest, NextResponse } from 'next/server';
import { getPipelineDeleteStatus } from '@/lib/control-service-client';
import { toRouteErrorResponse } from '@/lib/route-responses';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ pipelineId: string }> },
) {
  try {
    const { pipelineId } = await context.params;
    const response = await getPipelineDeleteStatus(pipelineId);
    return NextResponse.json(response);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
