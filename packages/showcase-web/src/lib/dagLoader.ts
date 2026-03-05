/**
 * dagLoader.ts
 * Converts agents/dag.json into ReactFlow nodes + edges for the showcase viewer.
 * Mirrors the logic in dag-editor/dagSerializer.ts but is read-only / no-edit.
 */
import type { DagEdge, DagNode } from '@ai-agencee/ui/dag'

interface RawNode {
  id:            string
  agentFile?:    string
  model?:        string
  laneId?:       string
  retries?:      number
  budgetUSD?:    number
  timeoutMs?:    number
  continueOnFail?: boolean
}

interface RawLane {
  laneId:          string
  parallel?:       boolean
  maxConcurrency?: number
  nodes?:          string[]
}

interface RawEdge {
  from: string
  to:   string
  label?: string
}

interface RawDagJson {
  nodes?: RawNode[]
  lanes?: RawLane[]
  edges?: RawEdge[]
}

const COL_WIDTH  = 220
const ROW_HEIGHT = 100

export function jsonToDagFlow(raw: RawDagJson): { nodes: DagNode[]; edges: DagEdge[] } {
  const nodes: DagNode[] = []
  const edges: DagEdge[] = []

  // ── Lane nodes ──────────────────────────────────────────────────
  const lanes = raw.lanes ?? []
  lanes.forEach((lane, li) => {
    nodes.push({
      id:       `lane-${lane.laneId}`,
      type:     'lane',
      position: { x: 40, y: li * ROW_HEIGHT },
      data: {
        nodeType:       'lane',
        label:          lane.laneId,
        laneId:         lane.laneId,
        parallel:       lane.parallel ?? false,
        maxConcurrency: lane.maxConcurrency,
      },
    })
  })

  // ── Worker nodes ────────────────────────────────────────────────
  const rawNodes = raw.nodes ?? []
  rawNodes.forEach((n, ni) => {
    nodes.push({
      id:       n.id,
      type:     'worker',
      position: { x: COL_WIDTH + ni * COL_WIDTH, y: 40 },
      data: {
        nodeType:       'worker',
        label:          n.id,
        agentFile:      n.agentFile,
        model:          n.model,
        laneId:         n.laneId,
        retries:        n.retries ?? 2,
        budgetUSD:      n.budgetUSD,
        timeoutMs:      n.timeoutMs ?? 120000,
        continueOnFail: n.continueOnFail ?? false,
      },
    })
  })

  // ── Edges ────────────────────────────────────────────────────────
  ;(raw.edges ?? []).forEach((e, ei) => {
    edges.push({
      id:     `e-${ei}`,
      source: e.from,
      target: e.to,
      label:  e.label,
    })
  })

  return { nodes, edges }
}
