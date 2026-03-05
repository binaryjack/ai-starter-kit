import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import { TenantRunRegistry } from '../lib/tenant-registry'

// ─── helpers ─────────────────────────────────────────────────────────────────

async function makeTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'tenant-test-'))
}

// ─── TenantRunRegistry ────────────────────────────────────────────────────────

describe('TenantRunRegistry', () => {
  let tmpDir: string
  let registry: TenantRunRegistry

  beforeEach(async () => {
    tmpDir = await makeTmp()
    registry = new TenantRunRegistry(tmpDir, 'tenant-a')
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ─── constructor ──────────────────────────────────────────────────────────

  it('uses provided tenantId', () => {
    expect(registry.tenantId).toBe('tenant-a')
  })

  it('falls back to AIKIT_TENANT_ID env var', () => {
    const old = process.env['AIKIT_TENANT_ID']
    process.env['AIKIT_TENANT_ID'] = 'env-tenant'
    const r = new TenantRunRegistry(tmpDir)
    expect(r.tenantId).toBe('env-tenant')
    if (old === undefined) delete process.env['AIKIT_TENANT_ID']
    else process.env['AIKIT_TENANT_ID'] = old
  })

  it('falls back to "default" when env is unset', () => {
    const old = process.env['AIKIT_TENANT_ID']
    delete process.env['AIKIT_TENANT_ID']
    const r = new TenantRunRegistry(tmpDir)
    expect(r.tenantId).toBe('default')
    if (old !== undefined) process.env['AIKIT_TENANT_ID'] = old
  })

  it('tenant paths are under .agents/tenants/<tenantId>/', () => {
    expect(registry.tenantRoot).toContain(path.join('.agents', 'tenants', 'tenant-a'))
  })

  // ─── create / get ────────────────────────────────────────────────────────

  it('create() writes config.json and returns meta', async () => {
    const meta = await registry.create('run-001', 'agents/dag.json')
    expect(meta.runId).toBe('run-001')
    expect(meta.tenantId).toBe('tenant-a')
    expect(meta.dagFile).toBe('agents/dag.json')
    expect(meta.status).toBe('running')

    const loaded = await registry.get('run-001')
    expect(loaded).toEqual(meta)
  })

  it('get() throws on unknown runId', async () => {
    await expect(registry.get('no-such-run')).rejects.toThrow()
  })

  // ─── complete ────────────────────────────────────────────────────────────

  it('complete() updates status and completedAt', async () => {
    await registry.create('run-002', 'agents/dag.json')
    const meta = await registry.complete('run-002', 'completed', { output: 42 })
    expect(meta.status).toBe('completed')
    expect(meta.completedAt).toBeDefined()

    // result.json should exist
    const resultPath = path.join(registry.runsRoot, 'run-002', 'result.json')
    await expect(fs.stat(resultPath)).resolves.toBeDefined()
  })

  it('complete() with failed status', async () => {
    await registry.create('run-003', 'agents/dag.json')
    const meta = await registry.complete('run-003', 'failed')
    expect(meta.status).toBe('failed')
  })

  // ─── appendEvent ─────────────────────────────────────────────────────────

  it('appendEvent() writes ndjson lines', async () => {
    await registry.create('run-004', 'agents/dag.json')
    await registry.appendEvent('run-004', { type: 'start', lane: 'ba' })
    await registry.appendEvent('run-004', { type: 'end', lane: 'ba' })

    const eventsPath = path.join(registry.runsRoot, 'run-004', 'events.ndjson')
    const raw = await fs.readFile(eventsPath, 'utf-8')
    const lines = raw.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!).type).toBe('start')
  })

  // ─── list / listActive ───────────────────────────────────────────────────

  it('list() returns all run IDs', async () => {
    await registry.create('run-010', 'dag.json')
    await registry.create('run-011', 'dag.json')
    const ids = await registry.list()
    expect(ids).toContain('run-010')
    expect(ids).toContain('run-011')
  })

  it('listActive() returns only running runs', async () => {
    await registry.create('run-020', 'dag.json') // running
    await registry.create('run-021', 'dag.json')
    await registry.complete('run-021', 'completed') // done
    const active = await registry.listActive()
    expect(active.map((m) => m.runId)).toContain('run-020')
    expect(active.map((m) => m.runId)).not.toContain('run-021')
  })

  // ─── delete ──────────────────────────────────────────────────────────────

  it('delete() removes the run directory', async () => {
    await registry.create('run-030', 'dag.json')
    await registry.delete('run-030')
    const ids = await registry.list()
    expect(ids).not.toContain('run-030')
  })

  // ─── purgeOld ────────────────────────────────────────────────────────────

  it('purgeOld() removes old completed runs but not active ones', async () => {
    await registry.create('run-040', 'dag.json') // stays running

    await registry.create('run-041', 'dag.json')
    // Manually backdate completedAt to simulate old run
    const meta = await registry.complete('run-041', 'completed')
    const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1_000).toISOString()
    meta.completedAt = staleDate
    const cfgPath = path.join(registry.runsRoot, 'run-041', 'config.json')
    await fs.writeFile(cfgPath, JSON.stringify(meta), 'utf-8')

    const purged = await registry.purgeOld(7)
    expect(purged).toBe(1)
    const ids = await registry.list()
    expect(ids).toContain('run-040')
    expect(ids).not.toContain('run-041')
  })

  // ─── GDPR: listTenants ───────────────────────────────────────────────────

  it('listTenants() enumerates tenant IDs on disk', async () => {
    const regB = new TenantRunRegistry(tmpDir, 'tenant-b')
    await registry.create('run-050', 'dag.json')
    await regB.create('run-051', 'dag.json')

    const tenants = await registry.listTenants()
    expect(tenants).toContain('tenant-a')
    expect(tenants).toContain('tenant-b')
  })

  // ─── GDPR: exportTenant ───────────────────────────────────────────────────

  it('exportTenant() copies files and writes manifest', async () => {
    await registry.create('run-060', 'dag.json')
    await registry.create('run-061', 'dag.json')

    const destDir = path.join(tmpDir, 'export-out')
    const summary = await registry.exportTenant('tenant-a', destDir)

    expect(summary.tenantId).toBe('tenant-a')
    expect(summary.runCount).toBe(2)
    expect(summary.totalBytes).toBeGreaterThan(0)

    // Manifest file should exist
    await expect(fs.stat(path.join(destDir, 'export-manifest.json'))).resolves.toBeDefined()
  })

  it('exportTenant() for non-existent tenant returns zero counts gracefully', async () => {
    const destDir = path.join(tmpDir, 'export-empty')
    const summary = await registry.exportTenant('ghost-tenant', destDir)
    expect(summary.runCount).toBe(0)
    expect(summary.totalBytes).toBe(0)
  })

  // ─── GDPR: deleteTenant ──────────────────────────────────────────────────

  it('deleteTenant() removes all data and returns receipt', async () => {
    await registry.create('run-070', 'dag.json')
    await registry.create('run-071', 'dag.json')

    const receipt = await registry.deleteTenant('tenant-a')
    expect(receipt.tenantId).toBe('tenant-a')
    expect(receipt.runCount).toBe(2)
    expect(receipt.totalBytesFreed).toBeGreaterThan(0)

    // tenant dir should be gone
    await expect(fs.stat(registry.tenantRoot)).rejects.toThrow()
  })

  it('deleteTenant() on empty tenant is safe and returns zero counts', async () => {
    const receipt = await registry.deleteTenant('never-existed')
    expect(receipt.runCount).toBe(0)
    expect(receipt.totalBytesFreed).toBe(0)
  })

  // ─── tenant isolation ────────────────────────────────────────────────────

  it('tenant-a runs are not visible to tenant-b', async () => {
    const regB = new TenantRunRegistry(tmpDir, 'tenant-b')
    await registry.create('run-a', 'dag.json')
    const bIds = await regB.list()
    expect(bIds).not.toContain('run-a')
  })
})
