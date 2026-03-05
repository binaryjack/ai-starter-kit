import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import { runVisualize } from '../src/commands/visualize'

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function writeDag(dir: string, name: string, content: object): Promise<string> {
  const p = path.join(dir, name)
  await fs.writeFile(p, JSON.stringify(content), 'utf-8')
  return p
}

// â”€â”€â”€ runVisualize â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('runVisualize', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'viz-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('writes a mermaid diagram to --output file', async () => {
    const dag = {
      name: 'my-dag',
      steps: [
        { id: 'ba', agent: 'business-analyst' },
        { id: 'arch', agent: 'architecture', dependsOn: ['ba'] },
      ],
    }
    const dagFile = await writeDag(tmpDir, 'dag.json', dag)
    const outFile = path.join(tmpDir, 'diagram.md')

    await runVisualize(dagFile, { format: 'mermaid', output: outFile })

    const content = await fs.readFile(outFile, 'utf-8')
    expect(content).toContain('```mermaid')
    expect(content).toContain('flowchart LR')
    expect(content).toContain('BA')
    expect(content).toContain('ARCH')
    expect(content).toContain('BA --> ARCH')
  })

  it('writes a DOT diagram when --format dot', async () => {
    const dag = {
      name: 'dot-dag',
      steps: [
        { id: 'frontend', agent: 'frontend' },
        { id: 'backend', agent: 'backend', dependsOn: ['frontend'] },
      ],
    }
    const dagFile = await writeDag(tmpDir, 'dot-dag.json', dag)
    const outFile = path.join(tmpDir, 'graph.dot')

    await runVisualize(dagFile, { format: 'dot', output: outFile })

    const content = await fs.readFile(outFile, 'utf-8')
    expect(content).toContain('digraph')
    expect(content).toContain('rankdir=LR')
    expect(content).toContain('FRONTEND -> BACKEND')
  })

  it('handles barriers in steps format', async () => {
    const dag = {
      steps: [
        { id: 'step1', agent: 'agent1' },
        { barrier: true },
        { id: 'step2', agent: 'agent2' },
      ],
    }
    const dagFile = await writeDag(tmpDir, 'barrier-dag.json', dag)
    const outFile = path.join(tmpDir, 'barrier.md')

    await runVisualize(dagFile, { output: outFile })

    const content = await fs.readFile(outFile, 'utf-8')
    expect(content).toContain('BARRIER_0')
    expect(content).toContain('barrier')
  })

  it('handles lanes+barriers format', async () => {
    const dag = {
      name: 'lanes-dag',
      lanes: [
        { id: 'ba', agent: 'business-analyst' },
        { id: 'arch', agent: 'architecture', dependsOn: ['ba'] },
      ],
      barriers: [{ after: ['arch'] }],
    }
    const dagFile = await writeDag(tmpDir, 'lanes.json', dag)
    const outFile = path.join(tmpDir, 'lanes.md')

    await runVisualize(dagFile, { output: outFile })

    const content = await fs.readFile(outFile, 'utf-8')
    expect(content).toContain('BA')
    expect(content).toContain('ARCH')
    expect(content).toContain('BARRIER_0')
  })

  it('prints to stdout when no --output', async () => {
    const dag = { steps: [{ id: 'x', agent: 'x-agent' }] }
    const dagFile = await writeDag(tmpDir, 'small.json', dag)

    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      await runVisualize(dagFile, {})
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('includes dag name as comment in mermaid output', async () => {
    const dag = { name: 'my-special-dag', steps: [{ id: 'a', agent: 'a' }] }
    const dagFile = await writeDag(tmpDir, 'named.json', dag)
    const outFile = path.join(tmpDir, 'named.md')

    await runVisualize(dagFile, { output: outFile })

    const content = await fs.readFile(outFile, 'utf-8')
    expect(content).toContain('my-special-dag')
  })
})

