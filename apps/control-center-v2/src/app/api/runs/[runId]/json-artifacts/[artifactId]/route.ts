import { NextResponse } from 'next/server';
import { getRunJsonArtifact } from '@/lib/control-service-client';
import { toRouteErrorResponse } from '@/lib/route-responses';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string; artifactId: string }> },
) {
  try {
    const { runId, artifactId } = await context.params;
    const response = await getRunJsonArtifact(runId, artifactId);
    return NextResponse.json(response);
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
