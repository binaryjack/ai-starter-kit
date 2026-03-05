import dagre from 'dagre'
import { useMemo } from 'react'
import type { DagEdge, DagNode } from './types.js'

const NODE_WIDTH  = 160
const NODE_HEIGHT = 72

/**
 * Pure (non-hook) dagre layout helper.
 * Use this in callbacks/load handlers where hooks are not allowed.
 */
export function applyDagLayout(
  nodes:     DagNode[],
  edges:     DagEdge[],
  direction: 'TB' | 'LR' = 'TB',
): { nodes: DagNode[]; edges: DagEdge[] } {
  if (nodes.length === 0) return { nodes, edges }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 })

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }))
  edges.forEach((e) => g.setEdge(e.source, e.target))

  dagre.layout(g)

  const layouted = nodes.map((n) => {
    const { x, y } = g.node(n.id)
    return {
      ...n,
      position: {
        x: x - NODE_WIDTH  / 2,
        y: y - NODE_HEIGHT / 2,
      },
    }
  })

  return { nodes: layouted, edges }
}

/**
 * Auto-layout DAG nodes using dagre (top-down).
 * Returns new node array with `position` populated.
 * Edges are returned unchanged (dagre only positions nodes).
 *
 * @param enabled - When false (edit mode), nodes/edges are returned as-is so
 *                  React Flow can manage positions freely without dagre overriding drags.
 */
export function useDagLayout(
  nodes:     DagNode[],
  edges:     DagEdge[],
  direction: 'TB' | 'LR' = 'TB',
  enabled:   boolean      = true,
): { nodes: DagNode[]; edges: DagEdge[] } {
  return useMemo(() => {
    if (!enabled) return { nodes, edges }
    return applyDagLayout(nodes, edges, direction)
  }, [nodes, edges, direction, enabled])
}


