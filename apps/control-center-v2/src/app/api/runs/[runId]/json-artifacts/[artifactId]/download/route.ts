import { downloadRunJsonArtifact } from '@/lib/control-service-client';
import { toRouteErrorResponse } from '@/lib/route-responses';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string; artifactId: string }> },
) {
  try {
    const { runId, artifactId } = await context.params;
    const file = await downloadRunJsonArtifact(runId, artifactId);
    return new Response(file.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
      },
    });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
