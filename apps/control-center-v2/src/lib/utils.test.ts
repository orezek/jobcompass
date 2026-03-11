import { describe, expect, it } from 'vitest';
import { formatDateTime, formatRunStatusLabel } from '@/lib/utils';

describe('formatDateTime', () => {
  it('returns a deterministic date time pattern', () => {
    const formatted = formatDateTime('2026-03-10T19:27:00.000Z');
    expect(formatted).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} (AM|PM)$/u);
    expect(formatted).not.toContain(' at ');
  });

  it('returns em dash for null and invalid dates', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('—');
  });
});

describe('formatRunStatusLabel', () => {
  it('returns Canceled for operator-requested stopped runs', () => {
    expect(formatRunStatusLabel('stopped', 'cancelled_by_operator')).toBe('Canceled');
    expect(formatRunStatusLabel('stopped', 'canceled_by_operator')).toBe('Canceled');
  });

  it('keeps stopped label for non-operator stop reasons', () => {
    expect(formatRunStatusLabel('stopped', 'hard_timeout')).toBe('Stopped');
  });
});
