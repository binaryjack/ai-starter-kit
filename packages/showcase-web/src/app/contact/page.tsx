'use client'

import { GradientText } from '@/components/atoms/GradientText'
import { SectionLabel } from '@/components/atoms/SectionLabel'
import { SectionWrapper } from '@/components/layout/SectionWrapper'
import { Button, Divider, Heading, Text } from '@ai-agencee/ui/atoms'
import type { FormBridge, IFormularLike } from '@ai-agencee/ui/formular-bridge'
import { CheckBox, FormProvider, Input, Select, TextArea } from '@ai-agencee/ui/formular-bridge'
import { Icon } from '@ai-agencee/ui/icons'
import { createForm, DirectSubmissionStrategy, f } from '@pulsar-framework/formular.dev'
import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type SagaStep = 'idle' | 'sending' | 'success' | 'error'

interface SagaState {
  step:     SagaStep
  errorMsg: string | null
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const TOPIC_OPTIONS = [
  { value: 'general',   label: 'General enquiry' },
  { value: 'bug',       label: 'Bug report' },
  { value: 'feature',   label: 'Feature request' },
  { value: 'other',     label: 'Other' },
]

const contactSchema = f.object({
  name:             f.string().nonempty('Name is required'),
  email:            f.string().email('Must be a valid email').nonempty('Email is required'),
  topic:            f.enum(['general', 'bug', 'feature', 'other']),
  message:          f.string().min(10, 'Message must be at least 10 characters'),
  subscribeUpdates: f.boolean().default(false),
})

// ─── Submission SAGA ─────────────────────────────────────────────────────────

/**
 * Runs the contact-form submission as a linear saga:
 *   1. show spinner          (step → 'sending')
 *   2. send mail via /api/contact
 *   3. receive result
 *   4. store result
 *   5. show result message   (step → 'success' | 'error')
 *   6. hide spinner          (always, via finally)
 */
function useContactSaga(bridgeRef: React.RefObject<FormBridge | null>) {
  const [state, setState] = useState<SagaState>({ step: 'idle', errorMsg: null })

  const run = useCallback(async (data: Record<string, unknown>) => {
    // ── Step 1: show spinner ────────────────────────────────────────────
    setState({ step: 'sending', errorMsg: null })

    try {
      // ── Step 2: send mail ─────────────────────────────────────────────
      const res = await fetch('/api/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      })

      // ── Step 3: get result ────────────────────────────────────────────
      const json = await res.json() as { success?: boolean; error?: string }

      // ── Step 4: evaluate result ───────────────────────────────────────
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Server error (${res.status})`)
      }

      // ── Step 5a: show success ─────────────────────────────────────────
      setState({ step: 'success', errorMsg: null })
    } catch (err) {
      // ── Step 5b: show error ───────────────────────────────────────────
      setState({
        step:     'error',
        errorMsg: err instanceof Error ? err.message : 'Something went wrong.',
      })
    }
    // ── Step 6: spinner hidden by React re-render once step changes ─────
    //    (no explicit spinner state — step !== 'sending' hides it)
  }, [])

  const reset = useCallback(() => {
    setState({ step: 'idle', errorMsg: null })
    bridgeRef.current?.reset()
  }, [bridgeRef])

  return { state, run, reset }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContactPage() {
  const [form, setForm] = useState<IFormularLike | null>(null)

  // Hold the FormBridge ref so the saga can call reset() after success
  const bridgeRef = useRef<FormBridge | null>(null)

  const { state, run, reset } = useContactSaga(bridgeRef)
  const isSending = state.step === 'sending'

  useEffect(() => {
    let cancelled = false

    createForm({
      schema: contactSchema,
      defaultValues: {
        name: '', email: '', topic: 'general', message: '', subscribeUpdates: false,
      },
      // The DirectSubmissionStrategy receives validated data from FormProvider.
      // We hand it straight to the saga; formular.dev is only the orchestration shell.
      submissionStrategy: new DirectSubmissionStrategy(
        async (data: Record<string, unknown>) => { await run(data) }
      ) as never,
    }).then((f) => {
      if (!cancelled) setForm(f as unknown as IFormularLike)
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!form) {
    return (
      <SectionWrapper width="narrow">
        <div className="flex flex-col gap-6">
          <Heading level={2}>Contact Form</Heading>
          <div className="text-sm text-neutral-400">Initialising form…</div>
        </div>
      </SectionWrapper>
    )
  }

  return (
    <SectionWrapper width="narrow">
      {/* Page header */}
      <div className="mb-10 flex flex-col gap-2">
        <SectionLabel>Get in touch</SectionLabel>
        <h1 className="text-3xl font-extrabold text-neutral-100 sm:text-4xl">
          <GradientText>Contact us</GradientText>
        </h1>
        <p className="max-w-lg text-sm leading-relaxed text-neutral-400">
          Questions, feedback, enterprise trial requests — we read everything and respond
          within one business day.
        </p>
      </div>

      <div className="flex flex-col gap-6 max-w-lg">
        {state.step === 'success' ? (
          /* ── Success state ─────────────────────────────────────────── */
          <div className="rounded-node border border-green-700 bg-green-950/40 p-6 text-center flex flex-col gap-3">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-900/60" aria-hidden>
              <Icon name="check" theme="auto" size={28} />
            </span>
            <Heading level={2}>Message sent!</Heading>
            <Text variant="muted">
              Thanks for reaching out. You&apos;ll receive a confirmation email shortly
              and we&apos;ll reply within one business day.
            </Text>
            <Button variant="ghost" onClick={reset}>Send another message</Button>
          </div>
        ) : (
          /* ── Form state (idle / sending / error) ────────────────────── */
          <>
            {state.step === 'error' && state.errorMsg && (
              <div
                role="alert"
                className="rounded-node border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-300"
              >
                {state.errorMsg}
              </div>
            )}

            <FormProvider
              form={form}
              schema={contactSchema}
              onBridgeReady={(b) => { bridgeRef.current = b }}
            >
              {/* Spinner overlay while sending */}
              <div className="relative">
                {isSending && (
                  <div
                    aria-live="polite"
                    aria-label="Sending your message…"
                    className="absolute inset-0 z-10 flex items-center justify-center rounded-node bg-neutral-900/60 backdrop-blur-sm"
                  >
                    <span className="h-8 w-8 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
                  </div>
                )}

                <div className="flex flex-col gap-4 rounded-node border border-neutral-700 bg-neutral-800 p-6">
                  <Input    name="name"             label="Full name"    placeholder="Jane Doe"              disabled={isSending} />
                  <Input    name="email"            label="Email"        placeholder="jane@example.com"      type="email" disabled={isSending} />
                  <Select   name="topic"            label="Topic"        options={TOPIC_OPTIONS}              disabled={isSending} />
                  <TextArea name="message"          label="Message"      placeholder="Tell us something…"    rows={5} disabled={isSending} />
                  <CheckBox name="subscribeUpdates" label="Subscribe to project updates"                     disabled={isSending} />
                  <Divider />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => void bridgeRef.current?.submit()}
                      loading={isSending}
                      disabled={isSending}
                    >
                      {isSending ? 'Sending…' : 'Send message'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={reset}
                      disabled={isSending}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              </div>
            </FormProvider>
          </>
        )}
      </div>
    </SectionWrapper>
  )
}

