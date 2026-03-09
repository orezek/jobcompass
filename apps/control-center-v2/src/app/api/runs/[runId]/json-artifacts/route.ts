import { NextRequest, NextResponse } from 'next/server';
import { listRunJsonArtifactsQueryV2Schema } from '@repo/control-plane-contracts/v2';
import { listRunJsonArtifacts } from '@/lib/control-service-client';
import { toRouteErrorResponse } from '@/lib/route-responses';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const query = listRunJsonArtifactsQueryV2Schema.parse({
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
      cursor: request.nextUrl.searchParams.get('cursor') ?? undefined,
      sortBy: request.nextUrl.searchParams.get('sortBy') ?? undefined,
      sortDir: request.nextUrl.searchParams.get('sortDir') ?? undefined,
      fileNamePrefix: request.nextUrl.searchParams.get('fileNamePrefix') ?? undefined,
    });
    const response = await listRunJsonArtifacts(runId, query);
    return NextResponse.json(response);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
