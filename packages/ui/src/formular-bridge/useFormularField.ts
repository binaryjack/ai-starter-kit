'use client'

import type { ErrorLike } from './FormProvider.js'
import { useForm } from './FormProvider.js'

export interface FieldSnapshot<T = unknown> {
  value:     T
  errors:    ErrorLike[]
  isDirty:   boolean
  isTouched: boolean
}

/**
 * Returns the current snapshot of a single field from the React-backed
 * FormBridge context.  No useSyncExternalStore needed — the bridge uses
 * plain useState so React's normal diffing handles re-renders.
 *
 * The `form` parameter is accepted for backward API compatibility but
 * is ignored; state is read from the nearest <FormProvider>.
 */
export function useFormularField<T = unknown>(
  _form:     unknown,   // kept for backwards compat — ignored
  fieldName: string,
): FieldSnapshot<T> {
  const bridge = useForm()

  return {
    value:     bridge.getValue<T>(fieldName),
    errors:    bridge.getErrors(fieldName),
    isDirty:   bridge.isDirty,
    isTouched: false, // field-level touch not tracked yet
  }}