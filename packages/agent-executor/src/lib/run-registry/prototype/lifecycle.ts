import * as fs from 'fs/promises';

import type { IRunRegistry } from '../run-registry.js';
import type { RunEntry, RunPaths, RunStatus } from '../run-registry.types.js';

export async function create(
  this:    IRunRegistry,
  runId:   string,
  dagName: string,
): Promise<RunPaths> {
  const paths = this._paths(runId);

  await Promise.all([
    fs.mkdir(paths.auditDir,       { recursive: true }),
    fs.mkdir(paths.checkpointsDir, { recursive: true }),
    fs.mkdir(paths.resultsDir,     { recursive: true }),
    fs.mkdir(paths.planStateDir,   { recursive: true }),
  ]);

  const entry: RunEntry = {
    runId,
    dagName,
    status:    'running',
    startedAt: new Date().toISOString(),
  };

  await this._upsert(entry);
  return paths;
}

export async function complete(
  this:       IRunRegistry,
  runId:      string,
  status:     RunStatus,
  durationMs?: number,
): Promise<void> {
  const manifest = await this._read();
  const idx = manifest.findIndex((e) => e.runId === runId);
  if (idx < 0) return;

  manifest[idx] = {
    ...manifest[idx]!,
    status,
    completedAt: new Date().toISOString(),
    durationMs,
  };
  await this._write(manifest);
}

export async function deleteRun(this: IRunRegistry, runId: string): Promise<void> {
  const runRoot = this._paths(runId).runRoot;
  await fs.rm(runRoot, { recursive: true, force: true });
  const manifest = await this._read();
  await this._write(manifest.filter((e) => e.runId !== runId));
}

export async function purgeOld(
  this:        IRunRegistry,
  olderThanMs: number = 7 * 24 * 60 * 60 * 1_000,
): Promise<string[]> {
  const cutoff   = Date.now() - olderThanMs;
  const manifest = await this._read();
  const toDelete = manifest.filter((e) => {
    if (e.status === 'running') return false;
    const ts = new Date(e.completedAt ?? e.startedAt).getTime();
    return ts < cutoff;
  });

  for (const entry of toDelete) {
    await this.deleteRun(entry.runId);
  }

  return toDelete.map((e) => e.runId);
}
