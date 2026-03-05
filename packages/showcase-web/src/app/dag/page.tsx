'use client'

import { Heading, Text } from '@ai-agencee/ui/atoms'
import { DagCanvas } from '@ai-agencee/ui/dag'
import { ReactFlowProvider } from '@xyflow/react'
import { DEMO_EDGES, DEMO_NODES } from '../../lib/demoDag.js'

export default function DagPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading level={2}>DAG Canvas</Heading>
        <Text variant="muted">Read-only view of the demo multi-agent DAG.</Text>
      </div>

      <div className="h-[600px] rounded-lg border border-neutral-700 overflow-hidden">
        <ReactFlowProvider>
          <DagCanvas nodes={DEMO_NODES} edges={DEMO_EDGES} readonly={true} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
