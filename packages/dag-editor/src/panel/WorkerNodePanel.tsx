import { Button } from '@ai-agencee/ui/atoms'
import type { WorkerNodeData } from '@ai-agencee/ui/dag'
import { CheckBox, FormProvider, Input, Select } from '@ai-agencee/ui/formular-bridge'
import { createForm, DirectSubmissionStrategy, f } from '@pulsar-framework/formular.dev'
import { useEffect, useState } from 'react'

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-5',    label: 'Claude Opus 4.5' },
  { value: 'claude-sonnet-4-5',  label: 'Claude Sonnet 4.5' },
  { value: 'gpt-4o',             label: 'GPT-4o' },
  { value: 'mock',               label: 'Mock (free)' },
]

// ── Entity schema ────────────────────────────────────────────────────────────
const workerSchema = f.object({
  label:          f.string().nonempty(),
  agentFile:      f.string().nonempty(),
  model:          f.enum(['claude-opus-4-5', 'claude-sonnet-4-5', 'gpt-4o', 'mock']),
  laneId:         f.string().optional(),
  retries:        f.number().min(0).max(10).int().default(2),
  budgetUSD:      f.number().positive().optional(),
  timeoutMs:      f.number().min(1000).default(120000),
  continueOnFail: f.boolean().default(false),
})

interface WorkerNodePanelProps {
  nodeId:    string
  data:      WorkerNodeData
  onUpdate:  (id: string, data: WorkerNodeData) => void
}

export function WorkerNodePanel({ nodeId, data, onUpdate }: WorkerNodePanelProps) {
  // ── createForm is async — initialise via useEffect ──────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<any>(null)

  useEffect(() => {
    let cancelled = false
    createForm({
      schema:        workerSchema,
      defaultValues: data as Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      submissionStrategy: new DirectSubmissionStrategy(async (values: any) => {
        onUpdate(nodeId, { ...data, ...values } as WorkerNodeData)
      }) as never,
    }).then((f) => {
      if (!cancelled) setForm(f)
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
        <Input  name="label"          label="Label" />
        <Input  name="agentFile"      label="Agent file (.agent.json)" placeholder="agents/01-business-analyst.agent.json" />
        <Select name="model"          label="Model" options={MODEL_OPTIONS} />
        <Input  name="laneId"         label="Lane ID" placeholder="e.g. backend" />
        <Input  name="retries"        label="Retries"       type="number" />
        <Input  name="budgetUSD"      label="Budget (USD)"  type="number" />
        <Input  name="timeoutMs"      label="Timeout (ms)"  type="number" />
        <CheckBox name="continueOnFail" label="Continue on fail" />
      </div>
      <div className="flex gap-2 px-4 pt-2 border-t border-neutral-700">
        <Button size="sm" onClick={() => (form as any).submit()}>Apply</Button>
        <Button size="sm" variant="ghost" onClick={() => (form as any).reset()}>Reset</Button>
      </div>
    </FormProvider>
  )
}
