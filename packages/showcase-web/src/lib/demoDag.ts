/**
 * demoDag.ts — static demo DAG for the showcase page.
 * No file-system access required (works in both server + client Next.js components).
 */
import type { DagNode, DagEdge } from '@ai-agencee/ui/dag'

export const DEMO_NODES: DagNode[] = [
  {
    id: 'business-analyst',
    type: 'worker',
    position: { x: 80, y: 40 },
    data: { nodeType: 'worker', label: 'Business Analyst', agentFile: '01-business-analyst.agent.json', model: 'claude-sonnet-4-5' },
  },
  {
    id: 'sup-requirements',
    type: 'supervisor',
    position: { x: 360, y: 40 },
    data: { nodeType: 'supervisor', label: 'Requirements OK?', passThreshold: 1 },
  },
  {
    id: 'architecture',
    type: 'worker',
    position: { x: 80, y: 180 },
    data: { nodeType: 'worker', label: 'Architecture', agentFile: '02-architecture.agent.json', model: 'claude-opus-4-5' },
  },
  {
    id: 'backend',
    type: 'worker',
    position: { x: 80, y: 320 },
    data: { nodeType: 'worker', label: 'Backend', agentFile: '03-backend.agent.json', model: 'claude-sonnet-4-5' },
  },
  {
    id: 'frontend',
    type: 'worker',
    position: { x: 360, y: 320 },
    data: { nodeType: 'worker', label: 'Frontend', agentFile: '04-frontend.agent.json', model: 'claude-sonnet-4-5' },
  },
  {
    id: 'budget',
    type: 'budget',
    position: { x: 640, y: 180 },
    data: { nodeType: 'budget', label: 'Budget Guard', limitUSD: 5, scope: 'run', onExceed: 'halt' },
  },
]

export const DEMO_EDGES: DagEdge[] = [
  { id: 'e1', source: 'business-analyst',  target: 'sup-requirements' },
  { id: 'e2', source: 'sup-requirements',  target: 'architecture' },
  { id: 'e3', source: 'architecture',      target: 'backend' },
  { id: 'e4', source: 'architecture',      target: 'frontend' },
  { id: 'e5', source: 'budget',            target: 'backend',  label: 'guard' },
  { id: 'e6', source: 'budget',            target: 'frontend', label: 'guard' },
]
