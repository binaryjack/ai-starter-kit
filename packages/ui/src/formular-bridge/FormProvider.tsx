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
  isValid:     boolean
  isDirty:     boolean
  isBusy:      boolean
  submitCount: number
}

// ─── Context ─────────────────────────────────────────────────────────────────

const FormContext = createContext<FormBridge | null>(null)

// ─── Provider ────────────────────────────────────────────────────────────────

export function FormProvider({
  form,
  children,
}: Readonly<{
  form:     IFormularLike
  children: ReactNode
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

  const validate = useCallback(async (_name: string) => {
    try { await formRef.current.validateForm() } catch { /* ignore */ }
    syncErrors()
  }, [syncErrors])

  const submit = useCallback(async () => {
    setIsBusy(true)
    setSubmitCount((c: number) => c + 1)
    try {
      const result = await formRef.current.submit()
      syncErrors()
      return result
    } finally {
      setIsBusy(false)
    }
  }, [syncErrors])

  const bridge: FormBridge = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getValue:  (name) => values[name] as any,
    getErrors: (name) => errors[name] ?? [],
    updateField,
    validate,
    submit,
    get isValid()      { return isValid },
    get isDirty()      { return isDirty },
    get isBusy()       { return isBusy },
    get submitCount()  { return submitCount },
  }

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
