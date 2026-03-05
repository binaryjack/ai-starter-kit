'use client'

import { useForm } from './FormProvider.js'

export interface FormSnapshot {
  isValid:     boolean
  isDirty:     boolean
  isBusy:      boolean
  submitCount: number
}

/**
 * Returns whole-form state from the React-backed FormBridge context.
 * The `form` parameter is kept for backward API compatibility but ignored —
 * state is always read from the nearest <FormProvider>.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useFormularForm(_form?: any): FormSnapshot {
  const bridge = useForm()
  return {
    isValid:     bridge.isValid,
    isDirty:     bridge.isDirty,
    isBusy:      bridge.isBusy,
    submitCount: bridge.submitCount,
  }
}
