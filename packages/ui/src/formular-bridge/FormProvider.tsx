'use client'

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ErrorLike {
  message: string
  code?:   string
}

/**
 * Duck-typed interface matching formular.dev's field schema objects returned by
 * f.string(), f.number(), f.boolean(), etc.  ObjectSchema.shape values all satisfy this.
 *
 * `error.issues` is the Zod-compatible array of validation failures — the
 * human-readable message (e.g. 'Name is required') lives in `issues[0].message`.
 * `error.message` is the full JSON-stringified issues array and should NOT be
 * used for display.
 */
export interface FieldSchemaLike {
  safeParse(value: unknown): {
    success: boolean
    error?: {
      /** Zod issues array — use issues[0].message for the human-readable message. */
      issues?: Array<{ message: string; code?: string }>
      /** Fallback code if issues is unavailable. */
      code?:   string
    }
  }
}

/**
 * Duck-typed interface matching formular.dev's f.object() schema.
 * Pass the same schema object used in createForm({ schema }) here so FormProvider
 * can run field-level validation (formular.dev skips validation when using the
 * schema API — see schemaToDescriptors which always sets validationOptions: {}).
 */
export interface SchemaLike {
  shape: Record<string, FieldSchemaLike>
}

/** Minimal surface of a formular.dev IFormular object */
export interface IFormularLike {
  getErrors():                           Record<string, ErrorLike[]>
  updateField(name: string, value: unknown): void
  validateForm():                        Promise<boolean>
  submit():                              Promise<unknown>
  reset():                               void
  clear():                               void
  isValid:     boolean
  isDirty:     boolean
  isBusy:      boolean
  submitCount: number
  /** Internal — used to seed initial values */
  fields?: Array<{ input: { name: string; value: unknown } }>
}

/**
 * React-backed form bridge.
 * Components read values / errors from React state so controlled inputs
 * re-render correctly on every keystroke.  formular.dev is used only for
 * submit orchestration and error retrieval.
 */
export interface FormBridge {
  getValue<T = unknown>(name: string): T
  getErrors(name: string):             ErrorLike[]
  updateField(name: string, value: unknown): void
  validate(name: string):              Promise<void>
  submit():                            Promise<unknown>
  reset():                             void
  isValid:     boolean
  isDirty:     boolean
  isBusy:      boolean
  submitCount: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the first human-readable message from a safeParse error.
 * Zod-compatible errors store individual messages in `issues[0].message`.
 * `error.message` is the full JSON-stringified issues array — never use it for display.
 */
function extractErrorMessage(
  error: NonNullable<ReturnType<FieldSchemaLike['safeParse']>['error']>
): string {
  return error.issues?.[0]?.message ?? error.code ?? 'Invalid value'
}

// ─── Context ─────────────────────────────────────────────────────────────────

const FormContext = createContext<FormBridge | null>(null)

// ─── Provider ────────────────────────────────────────────────────────────────

export function FormProvider({
  form,
  schema,
  onBridgeReady,
  children,
}: Readonly<{
  form:           IFormularLike
  schema?:        SchemaLike
  /** Called once with the bridge instance so callers can hold a ref for reset() etc. */
  onBridgeReady?: (bridge: FormBridge) => void
  children:       ReactNode
}>) {
  // Seed initial values from formular.dev's internal field list when available
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    if (Array.isArray(form.fields)) {
      for (const field of form.fields) {
        if (field?.input?.name != null) init[field.input.name] = field.input.value
      }
    }
    return init
  })

  const [errors,      setErrors]      = useState<Record<string, ErrorLike[]>>({})
  const [isDirty,     setIsDirty]     = useState(false)
  const [isValid,     setIsValid]     = useState(true)
  const [isBusy,      setIsBusy]      = useState(false)
  const [submitCount, setSubmitCount] = useState(0)

  const formRef = useRef(form)
  formRef.current = form

  // Keep latest values + schema accessible inside callbacks without stale closures
  const valuesRef = useRef(values)
  valuesRef.current = values
  const schemaRef  = useRef(schema)
  schemaRef.current = schema

  // Intercept form.reset() so React state is cleared in sync with formular state
  useEffect(() => {
    const original = form.reset.bind(form)
    ;(form as unknown as Record<string, unknown>)['reset'] = () => {
      original()
      const next: Record<string, unknown> = {}
      if (Array.isArray(form.fields)) {
        for (const field of form.fields) {
          if (field?.input?.name != null) next[field.input.name] = field.input.value
        }
      }
      setValues(next)
      setErrors({})
      setIsDirty(false)
      setIsValid(true)
    }
    return () => { ;(form as unknown as Record<string, unknown>)['reset'] = original }
  }, [form])

  const syncErrors = useCallback(() => {
    const raw = formRef.current.getErrors()
    setErrors(raw)
    setIsValid(Object.values(raw).every(arr => (arr as ErrorLike[]).length === 0))
  }, [])

  const updateField = useCallback((name: string, value: unknown) => {
    // 1. React state update → controlled inputs re-render immediately
    setValues((prev: Record<string, unknown>) => ({ ...prev, [name]: value }))
    setIsDirty(true)
    // 2. Keep formular.dev in sync so submit() reads correct values
    formRef.current.updateField(name, value)
  }, [])

  const validate = useCallback(async (name: string) => {
    const sc = schemaRef.current
    if (sc) {
      // formular.dev's validateForm() skips all fields when created via createForm({ schema })
      // because schemaToDescriptors hard-codes validationOptions: {}.
      // We validate directly against each field's schema instead.
      const fieldSchema = sc.shape[name]
      if (!fieldSchema) return
      const result = fieldSchema.safeParse(valuesRef.current[name])
      const fieldErrors: ErrorLike[] = (!result.success && result.error)
        ? [{ message: extractErrorMessage(result.error), code: result.error.issues?.[0]?.code ?? result.error.code }]
        : []
      setErrors(prev => {
        const next = { ...prev, [name]: fieldErrors }
        setIsValid(Object.values(next).every(arr => (arr as ErrorLike[]).length === 0))
        return next
      })
    } else {
      try { await formRef.current.validateForm() } catch { /* ignore */ }
      syncErrors()
    }
  }, [syncErrors])

  const validateAll = useCallback((): Record<string, ErrorLike[]> => {
    const sc = schemaRef.current
    const result: Record<string, ErrorLike[]> = {}
    if (!sc) return result
    for (const [fieldName, fieldSchema] of Object.entries(sc.shape)) {
      const r = fieldSchema.safeParse(valuesRef.current[fieldName])
      result[fieldName] = (!r.success && r.error)
        ? [{ message: extractErrorMessage(r.error), code: r.error.issues?.[0]?.code ?? r.error.code }]
        : []
    }
    return result
  }, [])

  const submit = useCallback(async () => {
    // If we have a schema, validate all fields first — formular.dev won't.
    if (schemaRef.current) {
      const allErrors = validateAll()
      setErrors(allErrors)
      const valid = Object.values(allErrors).every(arr => arr.length === 0)
      setIsValid(valid)
      if (!valid) return null
    }

    setIsBusy(true)
    setSubmitCount((c: number) => c + 1)
    try {
      // formular.dev's submit() iterates fields looking for validationOptions.
      // When the form was created via createForm({ schema }), those are always empty,
      // so it logs an info message for every field.  We've already validated above
      // via the schema, so these logs are noise — suppress them for this call only.
      const originalInfo = schemaRef.current ? console.info : null
      if (originalInfo) console.info = () => {}
      try {
        const result = await formRef.current.submit()
        if (!schemaRef.current) syncErrors()
        return result
      } finally {
        if (originalInfo) console.info = originalInfo
      }
    } finally {
      setIsBusy(false)
    }
  }, [syncErrors, validateAll])

  const bridge: FormBridge = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getValue:  (name) => values[name] as any,
    getErrors: (name) => errors[name] ?? [],
    updateField,
    validate,
    submit,
    reset: () => formRef.current.reset(),
    get isValid()      { return isValid },
    get isDirty()      { return isDirty },
    get isBusy()       { return isBusy },
    get submitCount()  { return submitCount },
  }

  // Notify caller once the bridge is ready (stable ref identity matters here)
  const onBridgeReadyRef = useRef(onBridgeReady)
  onBridgeReadyRef.current = onBridgeReady
  useEffect(() => { onBridgeReadyRef.current?.(bridge) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <FormContext.Provider value={bridge}>{children}</FormContext.Provider>
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useForm(): FormBridge {
  const ctx = useContext(FormContext)
  if (!ctx) throw new Error('useForm must be called inside <FormProvider>')
  return ctx
}

// ─── Backward-compat re-export ───────────────────────────────────────────────

/** @deprecated kept for type imports only; internals now live on FormBridge */
export interface FieldLike {
  input: {
    value:        unknown
    isDirty:      boolean
    isTouched:    boolean
    errors:       ErrorLike[]
    isValid:      boolean
    defaultValue?: unknown
  }
}
