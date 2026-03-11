'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

const RETRY_INTERVAL_SECONDS = 5;

type ControlServiceNotReachableProps = {
  diagnostic?: {
    occurredAt: string;
    request: string;
    message: string;
    errorName: string;
    status?: number;
    code?: string;
    details?: Record<string, unknown>;
  };
};

export function ControlServiceNotReachable({ diagnostic }: ControlServiceNotReachableProps) {
  const router = useRouter();
  const [secondsRemaining, setSecondsRemaining] = useState(RETRY_INTERVAL_SECONDS);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    const intervalHandle = setInterval(() => {
      setSecondsRemaining((current) => {
        if (current === 1) {
          router.refresh();
          return 0;
        }

        if (current === 0) {
          return RETRY_INTERVAL_SECONDS;
        }

        return current - 1;
      });
    }, 1_000);

    return () => {
      clearInterval(intervalHandle);
    };
  }, [router]);

  const progressDegrees = useMemo(
    () => ((RETRY_INTERVAL_SECONDS - secondsRemaining) / RETRY_INTERVAL_SECONDS) * 360,
    [secondsRemaining],
  );
  const diagnosticJson = useMemo(
    () => (diagnostic ? JSON.stringify(diagnostic, null, 2) : ''),
    [diagnostic],
  );

  useEffect(() => {
    setCopyState('idle');
  }, [diagnosticJson]);

  async function handleCopyDiagnostics() {
    if (!diagnosticJson) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable.');
      }

      await navigator.clipboard.writeText(diagnosticJson);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <section className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-xl rounded-sm border border-dashed border-border bg-card/30 px-8 py-10 text-center">
        <h2 className="text-2xl font-semibold tracking-tightest text-foreground">
          Control Service Not Reachable
        </h2>
        <p className="mt-2 font-mono text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground">
          Trying to connect in
        </p>
        <div className="mt-6 flex items-center justify-center">
          <div
            className="relative h-28 w-28 rounded-full"
            style={{
              background: `conic-gradient(hsl(var(--primary)) ${progressDegrees}deg, hsl(var(--border)) ${progressDegrees}deg)`,
            }}
            aria-live="polite"
            aria-label={`Retrying connection in ${secondsRemaining} seconds`}
          >
            <div className="absolute inset-[9px] flex items-center justify-center rounded-full border border-border bg-background">
              <span className="font-mono text-3xl font-semibold leading-none text-foreground">
                {secondsRemaining}
              </span>
            </div>
          </div>
        </div>
        {diagnostic ? (
          <div className="mt-8 rounded-sm border border-border/70 bg-background/70 p-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.15em] text-muted-foreground">
                Connection Diagnostics
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={handleCopyDiagnostics}>
                {copyState === 'copied' ? 'Copied' : 'Copy Diagnostics'}
              </Button>
            </div>
            <pre className="mt-3 max-h-60 overflow-auto rounded-sm border border-border/60 bg-muted/20 p-3 font-mono text-[0.72rem] leading-relaxed text-foreground">
              {diagnosticJson}
            </pre>
            {copyState === 'error' ? (
              <p className="mt-2 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-destructive">
                Clipboard unavailable. Copy manually.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
