import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

const dateTimeFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const formatDateTime = (value: string | null): string => {
  if (!value) {
    return '—';
  }

  return dateTimeFormatter.format(new Date(value));
};

export const formatNullableCount = (value: number | null | undefined): string => {
  if (value == null) {
    return '—';
  }

  return new Intl.NumberFormat('en').format(value);
};

export const titleCaseFromToken = (value: string): string =>
  value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

export const splitTextareaLines = (value: string): string[] =>
  value
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
