import { PubSub } from '@google-cloud/pubsub';
import Fastify from 'fastify';
import {
  crawlerStartRunRequestV2Schema,
  startRunRejectedResponseV2Schema,
} from '@repo/control-plane-contracts/v2';
import { AuthError, assertControlAuth } from './auth.js';
import { envs } from './env.js';
import { ConflictError, CrawlerWorkerRuntime, NotFoundError } from './runtime.js';

function isAuthExemptPath(pathname: string): boolean {
  return pathname === '/healthz' || pathname === '/readyz';
}

async function main(): Promise<void> {
  const app = Fastify({
    logger:
      envs.LOG_PRETTY && process.stdout.isTTY
        ? {
            level: envs.LOG_LEVEL,
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
                singleLine: false,
              },
            },
          }
        : {
            level: envs.LOG_LEVEL,
          },
  });

  const pubsub = new PubSub({ projectId: envs.GCP_PROJECT_ID });
  const eventsTopic = pubsub.topic(envs.PUBSUB_EVENTS_TOPIC);

  const runtime = new CrawlerWorkerRuntime({
    env: envs,
    logger: app.log,
    eventsTopic,
  });
  await runtime.initialize();

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    if (isAuthExemptPath(pathname)) {
      return;
    }

    try {
      assertControlAuth(request, envs);
    } catch (error) {
      if (error instanceof AuthError) {
        await reply.code(401).send({
          ok: false,
          error: error.message,
        });
        return;
      }

      throw error;
    }
  });

  app.get('/healthz', async () => ({
    ok: true,
    serviceName: envs.SERVICE_NAME,
    serviceVersion: envs.SERVICE_VERSION,
  }));

  app.get('/readyz', async () => ({
    ok: runtime.isReady(),
    serviceName: envs.SERVICE_NAME,
  }));

  app.post('/v1/runs', async (request, reply) => {
    const parsed = crawlerStartRunRequestV2Schema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        ok: false,
        error: 'Invalid StartRun payload.',
        issues: parsed.error.issues,
      };
    }

    try {
      const response = await runtime.startRun(parsed.data);
      reply.code(response.deduplicated ? 200 : response.state === 'queued' ? 202 : 202);
      return response;
    } catch (error) {
      if (error instanceof ConflictError) {
        const isSinkCapacityError = error.message.startsWith('MONGODB_SINK_CAPACITY_EXCEEDED');
        const message = isSinkCapacityError
          ? error.message.replace(/^MONGODB_SINK_CAPACITY_EXCEEDED:\s*/u, '')
          : error.message;
        const rejected = startRunRejectedResponseV2Schema.parse({
          contractVersion: 'v2',
          ok: false,
          accepted: false,
          deduplicated: false,
          state: 'rejected',
          workerType: 'crawler',
          runId: parsed.data.runId,
          error: {
            code: isSinkCapacityError ? 'MONGODB_SINK_CAPACITY_EXCEEDED' : 'RUN_ID_CONFLICT',
            message,
          },
        });
        reply.code(isSinkCapacityError ? 429 : error.statusCode);
        return rejected;
      }

      throw error;
    }
  });

  app.post('/v1/runs/:runId/cancel', async (request, reply) => {
    try {
      return await runtime.cancelRun((request.params as { runId: string }).runId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        reply.code(error.statusCode);
        return {
          ok: false,
          error: error.message,
        };
      }

      throw error;
    }
  });

  app.addHook('onClose', async () => {
    await runtime.shutdown();
  });

  await app.listen({ host: '0.0.0.0', port: envs.PORT });
  app.log.info(
    {
      port: envs.PORT,
      serviceName: envs.SERVICE_NAME,
      serviceVersion: envs.SERVICE_VERSION,
      topic: envs.PUBSUB_EVENTS_TOPIC,
    },
    'Crawler worker v2 started.',
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
