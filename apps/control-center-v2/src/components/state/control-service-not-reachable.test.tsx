import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlServiceNotReachable } from '@/components/state/control-service-not-reachable';

const refresh = vi.fn();
const writeClipboardText = vi.fn<(text: string) => Promise<void>>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh,
  }),
}));

describe('ControlServiceNotReachable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
    writeClipboardText.mockReset();
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { writeText: writeClipboardText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders message and retries every 5 seconds with 5->0 countdown reset', () => {
    render(<ControlServiceNotReachable />);

    expect(screen.getByText('Control Service Not Reachable')).toBeInTheDocument();
    expect(screen.getByText('Trying to connect in')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText('4')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4_000);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders diagnostics payload for operator support handoff', () => {
    render(
      <ControlServiceNotReachable
        diagnostic={{
          occurredAt: '2026-03-10T06:40:00.000Z',
          request: 'GET /v1/pipelines',
          errorName: 'ControlServiceRequestError',
          status: 400,
          code: 'INVALID_REQUEST',
          message: 'Request validation failed.',
          details: {
            issues: [{ path: ['items', 0, 'operatorSink'], message: 'Invalid input' }],
          },
        }}
      />,
    );

    expect(screen.getByText('Connection Diagnostics')).toBeInTheDocument();
    expect(screen.getByText(/"status": 400/)).toBeInTheDocument();
    expect(screen.getByText(/"code": "INVALID_REQUEST"/)).toBeInTheDocument();
    expect(screen.getByText(/"request": "GET \/v1\/pipelines"/)).toBeInTheDocument();
  });

  it('copies diagnostics payload to clipboard', async () => {
    writeClipboardText.mockResolvedValue(undefined);
    render(
      <ControlServiceNotReachable
        diagnostic={{
          occurredAt: '2026-03-10T06:40:00.000Z',
          request: 'GET /v1/pipelines',
          errorName: 'ControlServiceRequestError',
          status: 400,
          code: 'INVALID_REQUEST',
          message: 'Request validation failed.',
          details: {
            issues: [{ path: ['items', 0, 'operatorSink'], message: 'Invalid input' }],
          },
        }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Diagnostics' }));
    });

    expect(writeClipboardText).toHaveBeenCalledTimes(1);
    expect(writeClipboardText).toHaveBeenCalledWith(
      expect.stringContaining('"request": "GET /v1/pipelines"'),
    );
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});
