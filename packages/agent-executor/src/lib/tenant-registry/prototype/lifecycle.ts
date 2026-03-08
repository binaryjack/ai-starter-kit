import * as fs from 'fs/promises'
import * as path from 'path'
import type { ITenantRunRegistry, RunMeta } from '../tenant-registry.js'

export async function create(this: ITenantRunRegistry, runId: string, dagFile: string): Promise<RunMeta> {
  const runDir = this._runDir(runId);
  await fs.mkdir(runDir, { recursive: true });
  const meta: RunMeta = {
    runId,
    tenantId: this.tenantId,
    dagFile,
    status: 'running',
    startedAt: new Date().toISOString(),
  };
  await fs.writeFile(this._configPath(runId), JSON.stringify(meta, null, 2), 'utf-8');
  return meta;
}

export async function complete(
  this: ITenantRunRegistry,
  runId: string,
  status: 'completed' | 'failed' | 'cancelled' = 'completed',
  result?: unknown,
): Promise<RunMeta> {
  const meta = await this.get(runId);
  meta.status = status;
  meta.completedAt = new Date().toISOString();
  await fs.writeFile(this._configPath(runId), JSON.stringify(meta, null, 2), 'utf-8');
  if (result !== undefined) {
    await fs.writeFile(
      path.join(this._runDir(runId), 'result.json'),
      JSON.stringify(result, null, 2),
      'utf-8',
    );
  }
  return meta;
}

export async function appendEvent(this: ITenantRunRegistry, runId: string, event: Record<string, unknown>): Promise<void> {
  const line = JSON.stringify({ ...event, _ts: new Date().toISOString() }) + '\n';
  await fs.appendFile(path.join(this._runDir(runId), 'events.ndjson'), line, 'utf-8');
}

export async function get(this: ITenantRunRegistry, runId: string): Promise<RunMeta> {
  const raw = await fs.readFile(this._configPath(runId), 'utf-8');
  return JSON.parse(raw) as RunMeta;
}

export async function deleteRun(this: ITenantRunRegistry, runId: string): Promise<void> {
  await fs.rm(this._runDir(runId), { recursive: true, force: true });
}

export async function list(this: ITenantRunRegistry): Promise<string[]> {
  try {
    const entries = await fs.readdir(this.runsRoot, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function listActive(this: ITenantRunRegistry): Promise<RunMeta[]> {
  const ids = await this.list();
  const metas = await Promise.all(
    ids.map(async (id) => {
      try {
        return await this.get(id);
      } catch {
        return null;
      }
    }),
  );
  return metas.filter((m): m is RunMeta => m !== null && m.status === 'running');
}

export async function purgeOld(this: ITenantRunRegistry, maxAgeDays: number): Promise<number> {
  const ids = await this.list();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1_000;
  let purged = 0;
  for (const id of ids) {
    try {
      const meta = await this.get(id);
      if (meta.status === 'running') continue;
      const finishedAt = meta.completedAt ? new Date(meta.completedAt).getTime() : 0;
      if (finishedAt < cutoff) {
        await this.delete(id);
        purged++;
      }
    } catch {
      // skip corrupt entries
    }
  }
  return purged;
}
