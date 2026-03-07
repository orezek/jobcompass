import { NextResponse } from 'next/server';
import { startPipelineRun } from '@/lib/control-service-client';
import { toRouteErrorResponse } from '@/lib/route-responses';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: Promise<{ pipelineId: string }> },
) {
  try {
    const { pipelineId } = await context.params;
    const result = await startPipelineRun(pipelineId);
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
