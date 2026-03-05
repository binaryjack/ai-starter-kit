import {
    Badge, Button, CodeBlock, Divider,
    Heading, Text,
} from '@ai-agencee/ui/atoms'
import { StatBox } from '@ai-agencee/ui/molecules'
import type { StatusKey } from '@ai-agencee/ui/tokens'

const STATUSES: StatusKey[] = ['success', 'failed', 'warning', 'running', 'pending', 'partial']

export default function AtomsPage() {
  return (
    <div className="flex flex-col gap-10">
      <Heading level={2}>Atom Library</Heading>

      {/* ── Headings ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <Heading level={3}>Headings</Heading>
        <Heading level={1}>H1 — Dashboard</Heading>
        <Heading level={2}>H2 — Section title</Heading>
        <Heading level={3}>H3 — Sub-section</Heading>
        <Heading level={4}>H4 — Card header</Heading>
        <Heading level={5}>H5 — Panel label</Heading>
        <Heading level={6}>H6 — Caption</Heading>
      </section>

      <Divider />

      {/* ── Text variants ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <Heading level={3}>Text variants</Heading>
        <Text>Default — body copy.</Text>
        <Text variant="muted">Muted — secondary information.</Text>
        <Text variant="success">Success — confirming something worked.</Text>
        <Text variant="danger">Danger — destructive action or error notice.</Text>
      </section>

      <Divider />

      {/* ── Badges ────────────────────────────────────────────────── */}
      <section>
        <Heading level={3} className="mb-3">Badges</Heading>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Badge key={s} status={s} label={s} dot />
          ))}
        </div>
      </section>

      <Divider />

      {/* ── Buttons ───────────────────────────────────────────────── */}
      <section>
        <Heading level={3} className="mb-3">Buttons</Heading>
        <div className="flex flex-wrap gap-2 items-end">
          <Button size="sm">Primary sm</Button>
          <Button size="md">Primary md</Button>
          <Button size="lg">Primary lg</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
        </div>
      </section>

      <Divider />

      {/* ── StatBoxes ─────────────────────────────────────────────── */}
      <section>
        <Heading level={3} className="mb-3">Stat Boxes</Heading>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatBox label="Tokens used"     value={124_832} unit="tok" status="success" />
          <StatBox label="Budget consumed" value={0.38}    unit="USD" status="warning" />
          <StatBox label="Failed tasks"    value={2}                  status="failed"  />
        </div>
      </section>

      <Divider />

      {/* ── CodeBlock ─────────────────────────────────────────────── */}
      <section>
        <Heading level={3} className="mb-3">Code Block</Heading>
        <CodeBlock language="typescript" code={`import { DagCanvas } from '@ai-agencee/ui/dag'
import { ReactFlowProvider } from '@xyflow/react'

export function App() {
  return (
    <ReactFlowProvider>
      <DagCanvas nodes={nodes} edges={edges} readonly={false} />
    </ReactFlowProvider>
  )
}`} />
      </section>

      <Divider />

      {/* ── Dividers ──────────────────────────────────────────────── */}
      <section>
        <Heading level={3} className="mb-3">Dividers</Heading>
        <Divider />
        <Divider label="or continue with" />
        <div className="flex items-center gap-4 h-10">
          <span className="text-sm text-neutral-300">Left</span>
          <Divider orientation="vertical" />
          <span className="text-sm text-neutral-300">Right</span>
        </div>
      </section>
    </div>
  )
}
