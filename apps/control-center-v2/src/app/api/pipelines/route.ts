import { NextRequest, NextResponse } from 'next/server';
import { createControlPlanePipelineRequestV2Schema } from '@repo/control-plane-contracts/v2';
import { createPipeline } from '@/lib/control-service-client';
import { toRouteErrorResponse } from '@/lib/route-responses';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = createControlPlanePipelineRequestV2Schema.parse(await request.json());
    const pipeline = await createPipeline(body);
    return NextResponse.json(pipeline, { status: 201 });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
