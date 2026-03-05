'use client'

import { Button, Divider, Heading, Text } from '@ai-agencee/ui/atoms'
import { CheckBox, FormProvider, Input, Select } from '@ai-agencee/ui/formular-bridge'
import type { IFormularLike } from '@ai-agencee/ui/formular-bridge'
import { createForm, DirectSubmissionStrategy, f } from '@pulsar-framework/formular.dev'
import { useEffect, useState } from 'react'

const TOPIC_OPTIONS = [
  { value: 'general',   label: 'General enquiry' },
  { value: 'bug',       label: 'Bug report' },
  { value: 'feature',   label: 'Feature request' },
  { value: 'other',     label: 'Other' },
]

const contactSchema = f.object({
  name:             f.string().nonempty('Name is required'),
  email:            f.string().email('Must be a valid email'),
  topic:            f.enum(['general', 'bug', 'feature', 'other']),
  message:          f.string().min(10, 'Message must be at least 10 characters'),
  subscribeUpdates: f.boolean().default(false),
})

export default function ContactPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<IFormularLike | null>(null)

  useEffect(() => {
    let cancelled = false
    createForm({
      schema: contactSchema,
      defaultValues: {
        name: '', email: '', topic: 'general', message: '', subscribeUpdates: false,
      },
      submissionStrategy: new DirectSubmissionStrategy(async (data: Record<string, unknown>) => {
        console.info('Contact form submitted', data)
        alert(`Thanks, ${data['name']}! (demo — nothing was sent)`)
      }) as never,
    }).then((f) => {
      if (!cancelled) setForm(f as unknown as IFormularLike)
    })
    return () => { cancelled = true }
  }, [])

  if (!form) {
    return (
      <div className="flex flex-col gap-6 max-w-lg">
        <Heading level={2}>Contact Form</Heading>
        <div className="text-sm text-neutral-400">Initialising form…</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div>
        <Heading level={2}>Contact Form</Heading>
        <Text variant="muted">
          Demonstrates <code className="text-brand-400">FormProvider</code> +{' '}
          <code className="text-brand-400">Input / Select / CheckBox</code> from{' '}
          <code className="text-brand-400">@ai-agencee/ui/formular-bridge</code>.
        </Text>
      </div>

      <FormProvider form={form}>
        <div className="flex flex-col gap-4 rounded-node border border-neutral-700 bg-neutral-800 p-6">
          <Input     name="name"             label="Full name"    placeholder="Jane Doe" />
          <Input     name="email"            label="Email"        placeholder="jane@example.com" type="email" />
          <Select    name="topic"            label="Topic"        options={TOPIC_OPTIONS} />
          <Input     name="message"          label="Message"      placeholder="Tell us something…" />
          <CheckBox  name="subscribeUpdates" label="Subscribe to project updates" />
          <Divider />
          <div className="flex gap-2">
            <Button onClick={() => form.submit()}>Send message</Button>
            <Button variant="ghost" onClick={() => form.reset()}>Reset</Button>
          </div>
        </div>
      </FormProvider>
    </div>
  )
}
