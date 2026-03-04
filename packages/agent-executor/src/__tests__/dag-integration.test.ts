/**
 * Integration test — DagOrchestrator end-to-end
 *
 * Uses REAL filesystem I/O (no mocks) against a fully-wired temp directory.
 * Covers:
 *   1. Full DAG run with 3 lanes (success, success, escalated)
 *   2. Cross-lane contract reads: lane-b soft-aligns with lane-a and receives its snapshot
 *   3. Retry audit trail: lane-c checkpoint files + in-memory retryCount evidence
 */

import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { DagOrchestrator } from '../lib/dag-orchestrator'
import { CheckpointRecord, DagResult, LaneResult } from '../lib/dag-types'

// ─── fixture builders ─────────────────────────────────────────────────────────

/** One-check agent that tests for file existence */
const agentJson = (name: string, icon: string, filePath: string) =>
  JSON.stringify({
    name,
    icon,
    description: `Integration fixture: ${name}`,
    checks: [
      {
        type: 'file-exists',
        path: filePath,
        pass: `✅ ${filePath} exists`,
        fail: `❌ ${filePath} missing`,
        failSeverity: 'error',
      },
    ],
  });

/** Supervisor that soft-aligns on step-0 waiting for another lane */
const softAlignSupervisorJson = (laneId: string, waitForLane: string) =>
  JSON.stringify({
    laneId,
    retryBudget: 3,
    checkpoints: [
      {
        checkpointId: 'step-0',
        mode: 'soft-align',
        waitFor: [waitForLane],
        timeoutMs: 2000,
        fallback: 'proceed-with-snapshot',
      },
    ],
  });

/**
 * Supervisor that demands minFindings: 5 on step-0, with retryBudget: 1.
 * The agent only ever produces 1 finding → RETRY → budget exhausted → ESCALATE.
 * This creates a 2-record checkpoint trail: [{RETRY, retryCount:1}, {ESCALATE, retryCount:0}]
 */
const retryThenEscalateSupervisorJson = (laneId: string) =>
  JSON.stringify({
    laneId,
    retryBudget: 1,
    checkpoints: [
      {
        checkpointId: 'step-0',
        mode: 'self',
        expect: { minFindings: 5 },
        onFail: 'RETRY',
        retryInstructions: 'Find more files — need at least 5 findings',
      },
    ],
  });

/** dag.json wiring three lanes */
const dagJson = (agentsDir: string) =>
  JSON.stringify({
    name: 'Integration Test DAG',
    description: 'Fixture DAG for end-to-end integration testing',
    lanes: [
      {
        id: 'lane-a',
        agentFile: path.join(agentsDir, 'lane-a.agent.json'),
        // no supervisor → auto-approve everything
      },
      {
        id: 'lane-b',
        agentFile: path.join(agentsDir, 'lane-b.agent.json'),
        supervisorFile: path.join(agentsDir, 'lane-b.supervisor.json'),
        dependsOn: ['lane-a'], // runs after lane-a so its contract is published
      },
      {
        id: 'lane-c',
        agentFile: path.join(agentsDir, 'lane-c.agent.json'),
        supervisorFile: path.join(agentsDir, 'lane-c.supervisor.json'),
        // no dependsOn → runs in parallel with lane-a
      },
    ],
  });

// ─── suite setup ──────────────────────────────────────────────────────────────

let tmpDir: string;
let result: DagResult;
let laneA: LaneResult;
let laneB: LaneResult;
let laneC: LaneResult;

beforeAll(async () => {
  jest.setTimeout(15_000);

  // ── create temp project directory ───────────────────────────────────────────
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-kit-dag-integration-'));

  const agentsDir = path.join(tmpDir, 'agents');
  const resultsDir = path.join(tmpDir, '.agents', 'results');
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });

  // ── fixture project files the agents will check ──────────────────────────────
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'fixture' }));
  fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify({ strict: true }));

  // ── agent JSON files ─────────────────────────────────────────────────────────
  fs.writeFileSync(
    path.join(agentsDir, 'lane-a.agent.json'),
    agentJson('Lane A Agent', '🅰️', 'package.json'),
  );
  fs.writeFileSync(
    path.join(agentsDir, 'lane-b.agent.json'),
    agentJson('Lane B Agent', '🅱️', 'tsconfig.json'),
  );
  // lane-c checks the same package.json — will produce 1 finding, but supervisor needs 5
  fs.writeFileSync(
    path.join(agentsDir, 'lane-c.agent.json'),
    agentJson('Lane C Agent', '🌊', 'package.json'),
  );

  // ── supervisor JSON files ─────────────────────────────────────────────────────
  fs.writeFileSync(
    path.join(agentsDir, 'lane-b.supervisor.json'),
    softAlignSupervisorJson('lane-b', 'lane-a'),
  );
  fs.writeFileSync(
    path.join(agentsDir, 'lane-c.supervisor.json'),
    retryThenEscalateSupervisorJson('lane-c'),
  );

  // ── dag.json ─────────────────────────────────────────────────────────────────
  const dagFilePath = path.join(tmpDir, 'dag.json');
  fs.writeFileSync(dagFilePath, dagJson(agentsDir));

  // ── execute ──────────────────────────────────────────────────────────────────
  const orchestrator = new DagOrchestrator(tmpDir, { verbose: false, resultsDir });
  result = await orchestrator.run('dag.json');

  laneA = result.lanes.find((l) => l.laneId === 'lane-a')!;
  laneB = result.lanes.find((l) => l.laneId === 'lane-b')!;
  laneC = result.lanes.find((l) => l.laneId === 'lane-c')!;
}, 15_000);

afterAll(async () => {
  if (tmpDir) {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  }
});

// ─── 1. DAG-level results ─────────────────────────────────────────────────────

describe('DAG result', () => {
  it('has a result', () => {
    expect(result).toBeDefined();
  });

  it('status is partial — two lanes succeed, one escalates', () => {
    expect(result.status).toBe('partial');
  });

  it('contains exactly 3 lane results', () => {
    expect(result.lanes).toHaveLength(3);
  });

  it('has a unique runId', () => {
    expect(typeof result.runId).toBe('string');
    expect(result.runId.length).toBeGreaterThan(0);
  });

  it('rolls up findings from successful lanes with lane prefix', () => {
    expect(result.findings.some((f) => f.includes('[lane-a]'))).toBe(true);
    expect(result.findings.some((f) => f.includes('[lane-b]'))).toBe(true);
  });

  it('produces a result file on disk', async () => {
    const resultsDir = path.join(tmpDir, '.agents', 'results');
    const files = await fsPromises.readdir(resultsDir);
    const dagFile = files.find((f) => f.startsWith(`dag-${result.runId}`));
    expect(dagFile).toBeDefined();

    const raw = await fsPromises.readFile(path.join(resultsDir, dagFile!), 'utf-8');
    const saved = JSON.parse(raw);
    expect(saved.runId).toBe(result.runId);
    expect(saved.dagName).toBe('Integration Test DAG');
  });
});

// ─── 2. Lane-level status ─────────────────────────────────────────────────────

describe('Lane statuses', () => {
  it('lane-a: success (file-exists check passes, no supervisor)', () => {
    expect(laneA).toBeDefined();
    expect(laneA.status).toBe('success');
  });

  it('lane-b: success (soft-align resolves, file-exists passes)', () => {
    expect(laneB).toBeDefined();
    expect(laneB.status).toBe('success');
  });

  it('lane-c: escalated (retry budget exhausted after 1 retry)', () => {
    expect(laneC).toBeDefined();
    expect(laneC.status).toBe('escalated');
  });

  it('lane-a has at least 1 checkpoint', () => {
    expect(laneA.checkpoints.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── 3. Cross-lane contract reads ────────────────────────────────────────────

describe('Cross-lane contract reads (lane-b soft-aligns with lane-a)', () => {
  let cp0: CheckpointRecord;

  beforeAll(() => {
    cp0 = laneB?.checkpoints[0];
  });

  it('lane-b has a checkpoint with contractsReceived', () => {
    expect(cp0).toBeDefined();
    expect(cp0.contractsReceived).toBeDefined();
  });

  it('contractsReceived contains an entry for lane-a', () => {
    expect(cp0.contractsReceived!.has('lane-a')).toBe(true);
  });

  it('lane-a snapshot is non-null (it published before lane-b started)', () => {
    const snap = cp0.contractsReceived!.get('lane-a');
    expect(snap).not.toBeNull();
  });

  it('lane-a snapshot has the correct laneId', () => {
    const snap = cp0.contractsReceived!.get('lane-a');
    expect(snap!.laneId).toBe('lane-a');
  });

  it('lane-a snapshot has version >= 1', () => {
    const snap = cp0.contractsReceived!.get('lane-a');
    expect(snap!.version).toBeGreaterThanOrEqual(1);
  });

  it('checkpoint mode is soft-align', () => {
    expect(cp0.mode).toBe('soft-align');
  });

  it('no lanes timed out (lane-a was already done when lane-b started)', () => {
    // BarrierResolution.timedOut would be in the checkpoint payload timing—
    // assert via verdict: it should be APPROVE (no timeout escalation)
    expect(cp0.verdict.type).toBe('APPROVE');
  });
});

// ─── 4. Retry audit trail (lane-c) ───────────────────────────────────────────

describe('Retry audit trail (lane-c)', () => {
  it('totalRetries is 1', () => {
    expect(laneC.totalRetries).toBe(1);
  });

  it('has 2 checkpoint records for step-0 (RETRY then ESCALATE)', () => {
    const step0Records = laneC.checkpoints.filter((cp) => cp.checkpointId === 'step-0');
    expect(step0Records).toHaveLength(2);
  });

  it('first step-0 record has verdict RETRY with retryCount=1', () => {
    const step0Records = laneC.checkpoints.filter((cp) => cp.checkpointId === 'step-0');
    expect(step0Records[0].verdict.type).toBe('RETRY');
    expect(step0Records[0].retryCount).toBe(1);
  });

  it('second step-0 record has verdict ESCALATE (budget exhausted)', () => {
    const step0Records = laneC.checkpoints.filter((cp) => cp.checkpointId === 'step-0');
    expect(step0Records[1].verdict.type).toBe('ESCALATE');
    expect(step0Records[1].verdict.reason).toMatch(/retry budget exhausted/i);
  });

  it('RETRY verdict carries the retryInstructions from the supervisor rule', () => {
    const retryRecord = laneC.checkpoints.find(
      (cp) => cp.checkpointId === 'step-0' && cp.verdict.type === 'RETRY',
    );
    expect(retryRecord?.verdict.instructions).toMatch(/at least 5 findings/i);
  });

  it('checkpoint file written to disk for lane-c', async () => {
    const cpDir = path.join(tmpDir, '.agents', 'checkpoints', 'lane-c');
    const files = await fsPromises.readdir(cpDir);
    expect(files).toContain('step-0.json');
  });

  it('checkpoint file contains valid JSON with expected fields', async () => {
    const cpFile = path.join(tmpDir, '.agents', 'checkpoints', 'lane-c', 'step-0.json');
    const raw = await fsPromises.readFile(cpFile, 'utf-8');
    const record = JSON.parse(raw);

    expect(record.checkpointId).toBe('step-0');
    expect(record.stepIndex).toBe(0);
    expect(['RETRY', 'ESCALATE']).toContain(record.verdict.type);
    expect(typeof record.durationMs).toBe('number');
    expect(typeof record.timestamp).toBe('string');
  });
});
