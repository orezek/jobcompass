import type { FastifyBaseLogger } from 'fastify';

export class FakeLogger implements FastifyBaseLogger {
  public level = 'silent';

  public child(): FastifyBaseLogger {
    return this;
  }

  public fatal(): void {}

  public error(): void {}

  public warn(): void {}

  public info(): void {}

  public debug(): void {}

  public trace(): void {}

  public silent(): void {}
}
