import type { FastifyBaseLogger } from 'fastify';

export type FakeLogEntry = {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  args: unknown[];
};

export class FakeLogger {
  public readonly entries: FakeLogEntry[] = [];

  public trace(...args: unknown[]): void {
    this.entries.push({ level: 'trace', args });
  }

  public debug(...args: unknown[]): void {
    this.entries.push({ level: 'debug', args });
  }

  public info(...args: unknown[]): void {
    this.entries.push({ level: 'info', args });
  }

  public warn(...args: unknown[]): void {
    this.entries.push({ level: 'warn', args });
  }

  public error(...args: unknown[]): void {
    this.entries.push({ level: 'error', args });
  }

  public fatal(...args: unknown[]): void {
    this.entries.push({ level: 'fatal', args });
  }

  public child(): FastifyBaseLogger {
    return this.asFastifyLogger();
  }

  public asFastifyLogger(): FastifyBaseLogger {
    return this as unknown as FastifyBaseLogger;
  }
}
