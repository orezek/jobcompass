import { NextResponse } from 'next/server';
import { cancelRun } from '@/lib/control-service-client';
import { toRouteErrorResponse } from '@/lib/route-responses';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const result = await cancelRun(runId);
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
