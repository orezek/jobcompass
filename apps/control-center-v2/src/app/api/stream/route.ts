import { buildControlServiceStreamRequest } from '@/lib/control-service-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const upstream = await fetch(buildControlServiceStreamRequest(new URL(request.url).searchParams));

  if (!upstream.ok || !upstream.body) {
    return new Response('Unable to open upstream stream.', { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
