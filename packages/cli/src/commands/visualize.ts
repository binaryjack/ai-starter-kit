/**
 * E7 — DAG Visualizer CLI command
 *
 * Renders a DAG JSON file as a Mermaid `flowchart LR` diagram (default) or
 * a Graphviz DOT graph (--format dot), making architecture immediately readable
 * in GitHub PR descriptions, Notion pages, and Confluence docs.
 *
 * Usage:
 *   ai-kit dag:visualize agents/dag.json
 *   ai-kit dag:visualize agents/dag.json --output diagram.md
 *   ai-kit dag:visualize agents/dag.json --format dot
 *
 * Mermaid output example:
 *   ```mermaid
 *   flowchart LR
 *     BA["business-analyst"]:::lane
 *     ARCH["architecture"]:::lane
 *     BA --> ARCH
 *     BARRIER_0{{"── barrier ──"}}:::barrier
 *     ARCH --> BARRIER_0
 *   ```
 *
 * The output can be pasted directly into a GitHub PR description wrapped in
 * ```mermaid … ``` fences and GitHub will render it natively.
 */

import * as fs from 'fs/promises'
import * as path from 'path'

// ─── DAG schema (minimal — must match agents/dag.json structure) ─────────────

interface DagStep {
  id?: string;
  agent?: string;
  lane?: string;
  dependsOn?: string[];
  barrier?: boolean;
  parallel?: boolean;
}

interface DagDefinition {
  name?: string;
  description?: string;
  steps?: DagStep[];
  // alternative structure used in some agent JSON files
  lanes?: Array<{ id: string; agent?: string; dependsOn?: string[] }>;
  barriers?: Array<{ after: string[] }>;
}

// ─── Format types ─────────────────────────────────────────────────────────────

export type VisualizeFormat = 'mermaid' | 'dot';

export interface VisualizeOptions {
  format?: VisualizeFormat;
  output?: string;
}

// ─── Node helpers ─────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  isBarrier: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
}

function normId(raw: string): string {
  // Mermaid node IDs cannot contain spaces, dots, slashes, or hyphens in
  // certain positions — normalise to SCREAMING_SNAKE
  return raw.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
}

// ─── DAG → graph normalisation ────────────────────────────────────────────────

function parseDag(dag: DagDefinition): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  let barrierIdx = 0;

  const addNode = (id: string, label: string, isBarrier: boolean): void => {
    if (!seen.has(id)) {
      seen.add(id);
      nodes.push({ id, label, isBarrier });
    }
  };

  // Handle `steps` format (newer style)
  if (Array.isArray(dag.steps) && dag.steps.length > 0) {
    let lastNonBarrierId: string | null = null;

    for (const step of dag.steps) {
      if (step.barrier) {
        const barrierId = `BARRIER_${barrierIdx++}`;
        addNode(barrierId, '── barrier ──', true);
        if (lastNonBarrierId) {
          edges.push({ from: lastNonBarrierId, to: barrierId });
        }
        lastNonBarrierId = barrierId;
        continue;
      }

      const rawId = step.id ?? step.lane ?? step.agent ?? `step_${nodes.length}`;
      const nodeId = normId(rawId);
      const label = step.agent ?? step.lane ?? rawId;
      addNode(nodeId, label, false);

      if (Array.isArray(step.dependsOn) && step.dependsOn.length > 0) {
        for (const dep of step.dependsOn) {
          edges.push({ from: normId(dep), to: nodeId });
        }
      } else if (lastNonBarrierId) {
        edges.push({ from: lastNonBarrierId, to: nodeId });
      }

      lastNonBarrierId = nodeId;
    }
    return { nodes, edges };
  }

  // Handle `lanes` + `barriers` format (some older agent JSONs)
  if (Array.isArray(dag.lanes)) {
    for (const lane of dag.lanes) {
      const nodeId = normId(lane.id);
      addNode(nodeId, lane.agent ?? lane.id, false);
      if (Array.isArray(lane.dependsOn)) {
        for (const dep of lane.dependsOn) {
          edges.push({ from: normId(dep), to: nodeId });
        }
      }
    }
  }

  if (Array.isArray(dag.barriers)) {
    for (const barrier of dag.barriers) {
      const barrierId = `BARRIER_${barrierIdx++}`;
      addNode(barrierId, '── barrier ──', true);
      const afters = Array.isArray(barrier.after) ? barrier.after : [];
      for (const after of afters) {
        edges.push({ from: normId(after), to: barrierId });
      }
    }
  }

  // Fallback: if the dag is actually an array of steps directly
  if (nodes.length === 0 && Array.isArray(dag as unknown)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr = dag as unknown as any[];
    for (const item of arr) {
      if (typeof item === 'object' && item !== null) {
        const rawId = item.id ?? item.lane ?? item.agent ?? `node_${nodes.length}`;
        const nodeId = normId(String(rawId));
        addNode(nodeId, String(item.agent ?? item.lane ?? rawId), false);
      }
    }
  }

  return { nodes, edges };
}

// ─── Mermaid renderer ─────────────────────────────────────────────────────────

function renderMermaid(
  nodes: GraphNode[],
  edges: GraphEdge[],
  dagName?: string,
): string {
  const lines: string[] = [];
  if (dagName) {
    lines.push(`%% ${dagName}`);
  }
  lines.push('flowchart LR');

  // Styles
  lines.push('  classDef lane fill:#dbeafe,stroke:#3b82f6,color:#1e3a5f');
  lines.push('  classDef barrier fill:#fef9c3,stroke:#ca8a04,color:#713f12,shape:diamond');

  // Nodes
  for (const node of nodes) {
    if (node.isBarrier) {
      lines.push(`  ${node.id}{{"${node.label}"}}:::barrier`);
    } else {
      lines.push(`  ${node.id}["${node.label}"]:::lane`);
    }
  }

  // Edges
  for (const edge of edges) {
    lines.push(`  ${edge.from} --> ${edge.to}`);
  }

  return lines.join('\n');
}

// ─── Graphviz DOT renderer ────────────────────────────────────────────────────

function renderDot(
  nodes: GraphNode[],
  edges: GraphEdge[],
  dagName?: string,
): string {
  const lines: string[] = [];
  const graphName = (dagName ?? 'dag').replace(/[^a-zA-Z0-9]/g, '_');
  lines.push(`digraph ${graphName} {`);
  lines.push('  rankdir=LR;');
  lines.push('  node [fontname="Helvetica"];');

  for (const node of nodes) {
    if (node.isBarrier) {
      lines.push(`  ${node.id} [label="${node.label}", shape=diamond, style=filled, fillcolor="#fef9c3"];`);
    } else {
      lines.push(`  ${node.id} [label="${node.label}", shape=box, style=filled, fillcolor="#dbeafe"];`);
    }
  }

  for (const edge of edges) {
    lines.push(`  ${edge.from} -> ${edge.to};`);
  }

  lines.push('}');
  return lines.join('\n');
}

// ─── Main visualize function ──────────────────────────────────────────────────

/**
 * Read a DAG JSON file and emit a Mermaid or DOT graph.
 * Called directly from the CLI command handler.
 */
export async function runVisualize(
  dagFile: string,
  options: VisualizeOptions = {},
): Promise<void> {
  const format: VisualizeFormat = options.format ?? 'mermaid';
  const resolvedPath = path.resolve(dagFile);

  let raw: string;
  try {
    raw = await fs.readFile(resolvedPath, 'utf-8');
  } catch {
    console.error(`Error: Cannot read DAG file: ${resolvedPath}`);
    process.exit(1);
  }

  let dag: DagDefinition;
  try {
    dag = JSON.parse(raw) as DagDefinition;
  } catch {
    console.error(`Error: Invalid JSON in ${resolvedPath}`);
    process.exit(1);
  }

  const { nodes, edges } = parseDag(dag);

  if (nodes.length === 0) {
    console.warn(`Warning: No nodes found in ${resolvedPath}. Is this a valid DAG file?`);
  }

  let output: string;
  if (format === 'dot') {
    output = renderDot(nodes, edges, dag.name);
  } else {
    output = renderMermaid(nodes, edges, dag.name);
    // Wrap in markdown fences so output can be pasted directly
    output = '```mermaid\n' + output + '\n```';
  }

  if (options.output) {
    const outPath = path.resolve(options.output);
    await fs.writeFile(outPath, output + '\n', 'utf-8');
    console.log(`Diagram written to ${outPath}`);
  } else {
    console.log(output);
  }
}
