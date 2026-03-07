'use client';

import { FormProvider, type FieldValues, type UseFormReturn } from 'react-hook-form';

export function Form<TFieldValues extends FieldValues>({
  children,
  ...form
}: UseFormReturn<TFieldValues> & { children: React.ReactNode }) {
  return <FormProvider {...form}>{children}</FormProvider>;
}
