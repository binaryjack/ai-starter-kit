import type { AnyNodeData, DagEdge, DagNode, DagNodeKind } from '@ai-agencee/ui/dag'

/** Minimal dag.json structure (mirrors agents/dag.json) */
interface RawDagJson {
  lanes?:   RawLane[]
  nodes?:   RawNode[]
  edges?:   { source: string; target: string; label?: string }[]
}

interface RawLane { id: string; label?: string; parallel?: boolean }
interface RawNode {
  id:            string
  type?:         string
  agentFile?:    string
  model?:        string
  lane?:         string
  retries?:      number
  budgetUSD?:    number
  timeoutMs?:    number
  continueOnFail?: boolean
  label?:        string
}

export function jsonToDagFlow(raw: RawDagJson): {
  nodes: DagNode[]
  edges: DagEdge[]
} {
  const nodes: DagNode[] = []
  const edges: DagEdge[] = []

  // Lane nodes
  ;(raw.lanes ?? []).forEach((lane) => {
    nodes.push({
      id:       `lane-${lane.id}`,
      type:     'lane',
      position: { x: 0, y: 0 },
      data: {
        nodeType: 'lane' as DagNodeKind,
        label:    lane.label ?? lane.id,
        laneId:   lane.id,
        parallel: lane.parallel ?? false,
      },
    })
  })

  // Worker nodes
  ;(raw.nodes ?? []).forEach((node) => {
    nodes.push({
      id:       node.id,
      type:     (node.type ?? 'worker') as DagNodeKind,
      position: { x: 0, y: 0 },
      data: {
        nodeType:       (node.type ?? 'worker') as DagNodeKind,
        label:          node.label ?? node.id,
        agentFile:      node.agentFile,
        model:          node.model,
        laneId:         node.lane,
        retries:        node.retries,
        budgetUSD:      node.budgetUSD,
        timeoutMs:      node.timeoutMs,
        continueOnFail: node.continueOnFail,
      } as AnyNodeData,
    })
  })

  // Edges
  ;(raw.edges ?? []).forEach((e, i) => {
    edges.push({
      id:     `e-${i}`,
      source: e.source,
      target: e.target,
      label:  e.label,
      type:   'default',
    })
  })

  return { nodes, edges }
}

export function dagFlowToJson(
  nodes: DagNode[],
  edges: DagEdge[],
): RawDagJson {
  const lanes: RawLane[] = []
  const rawNodes: RawNode[] = []

  nodes.forEach((n) => {
    const d = n.data as AnyNodeData
    if (d.nodeType === 'lane') {
      lanes.push({ id: (d as { laneId?: string }).laneId ?? n.id, label: d.label })
    } else {
      const w = d as { agentFile?: string; model?: string; laneId?: string; retries?: number; budgetUSD?: number; timeoutMs?: number; continueOnFail?: boolean }
      rawNodes.push({
        id:            n.id,
        type:          d.nodeType,
        label:         d.label,
        agentFile:     w.agentFile,
        model:         w.model,
        lane:          w.laneId,
        retries:       w.retries,
        budgetUSD:     w.budgetUSD,
        timeoutMs:     w.timeoutMs,
        continueOnFail: w.continueOnFail,
      })
    }
  })

  return {
    lanes,
    nodes: rawNodes,
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      ...(e.label ? { label: String(e.label) } : {}),
    })),
  }
}
