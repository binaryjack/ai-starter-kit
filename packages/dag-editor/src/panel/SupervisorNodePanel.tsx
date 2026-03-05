import { Button } from '@ai-agencee/ui/atoms'
import type { SupervisorNodeData } from '@ai-agencee/ui/dag'
import type { IFormularLike } from '@ai-agencee/ui/formular-bridge'
import { FormProvider, Input, Select } from '@ai-agencee/ui/formular-bridge'
import { createForm, DirectSubmissionStrategy, f } from '@pulsar-framework/formular.dev'
import { useEffect, useState } from 'react'

const FAIL_BEHAVIOR_OPTIONS = [
  { value: 'halt', label: 'Halt (stop DAG)' },
  { value: 'warn', label: 'Warn (continue)' },
]

const supervisorSchema = f.object({
  label:         f.string().nonempty(),
  passThreshold: f.number().min(0).max(1).default(1),
  failBehavior:  f.enum(['halt', 'warn']).default('halt'),
})

interface SupervisorNodePanelProps {
  nodeId:   string
  data:     SupervisorNodeData
  onUpdate: (id: string, data: SupervisorNodeData) => void
}

export function SupervisorNodePanel({ nodeId, data, onUpdate }: SupervisorNodePanelProps) {
  const [form, setForm] = useState<IFormularLike | null>(null)

  useEffect(() => {
    let cancelled = false
    createForm({
      schema:        supervisorSchema,
      defaultValues: data as Record<string, unknown>,
      submissionStrategy: new DirectSubmissionStrategy(async (values: Record<string, unknown>) => {
        onUpdate(nodeId, { ...data, ...values } as SupervisorNodeData)
      }) as never,
    }).then((f) => {
      if (!cancelled) setForm(f as unknown as IFormularLike)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId])

  if (!form) {
    return <div className="p-4 text-xs text-neutral-400">Initialising form…</div>
  }

  return (
    <FormProvider form={form}>
      <div className="flex flex-col gap-3 p-4">
        <Input  name="label"         label="Label" />
        <Input  name="passThreshold" label="Pass threshold (0–1)" type="number" />
        <Select name="failBehavior"  label="On fail" options={FAIL_BEHAVIOR_OPTIONS} />
      </div>
      <div className="flex gap-2 px-4 pt-2 border-t border-neutral-700">
        <Button size="sm" onClick={() => form.submit()}>Apply</Button>
        <Button size="sm" variant="ghost" onClick={() => form.reset()}>Reset</Button>
      </div>
    </FormProvider>
  )
}
