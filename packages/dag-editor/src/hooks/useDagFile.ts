import type { DagEdge, DagNode } from '@ai-agencee/ui/dag'
import { applyDagLayout } from '@ai-agencee/ui/dag'
import { addEdge, type Connection } from '@xyflow/react'
import { useCallback, useState } from 'react'
import { dagFlowToJson, jsonToDagFlow } from '../canvas/dagSerializer.js'

const INITIAL_NODES: DagNode[] = []
const INITIAL_EDGES: DagEdge[] = []

export function useDagFile() {
  const [nodes, setNodesRaw] = useState<DagNode[]>(INITIAL_NODES)
  const [edges, setEdgesRaw] = useState<DagEdge[]>(INITIAL_EDGES)

  const setNodes = useCallback(
    (updater: DagNode[] | ((prev: DagNode[]) => DagNode[])) =>
      setNodesRaw(typeof updater === 'function' ? updater : () => updater),
    [],
  )

  const setEdges = useCallback(
    (updater: DagEdge[] | ((prev: DagEdge[]) => DagEdge[])) =>
      setEdgesRaw(typeof updater === 'function' ? updater : () => updater),
    [],
  )

  const handleConnect = useCallback(
    (params: Connection) =>
      setEdgesRaw((eds) => addEdge({ ...params, type: 'default' }, eds)),
    [],
  )

  const loadFile = useCallback(() => {
    const input = document.createElement('input')
    input.type  = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      file.text().then((text) => {
        try {
          const { nodes: n, edges: ed } = jsonToDagFlow(JSON.parse(text))
          // Apply dagre layout once so nodes start with real positions
          // (jsonToDagFlow sets all positions to {x:0, y:0}).
          const { nodes: ln, edges: le } = applyDagLayout(n, ed)
          setNodesRaw(ln)
          setEdgesRaw(le)
        } catch {
          alert('Invalid DAG JSON file')
        }
      })
    }
    input.click()
  }, [])

  const exportFile = useCallback(() => {
    const json = dagFlowToJson(nodes, edges)
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'dag.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [nodes, edges])

  return { nodes, edges, setNodes, setEdges, handleConnect, loadFile, exportFile }
}
