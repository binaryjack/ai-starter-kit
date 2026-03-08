import * as fs   from 'fs/promises';
import * as path from 'path';

import type { IRunRegistry }  from '../run-registry.js';
import type { RunEntry, RunPaths } from '../run-registry.types.js';

export function _paths(this: IRunRegistry, runId: string): RunPaths {
  const runRoot = path.join(this._runsDir, runId);
  return {
    runRoot,
    auditDir:       path.join(runRoot, 'audit'),
    checkpointsDir: path.join(runRoot, 'checkpoints'),
    resultsDir:     path.join(runRoot, 'results'),
    planStateDir:   path.join(runRoot, 'plan-state'),
  };
}

export async function _read(this: IRunRegistry): Promise<RunEntry[]> {
  const raw = await fs.readFile(this._manifestPath, 'utf-8').catch(() => '[]');
  try {
    const parsed: unknown = JSON.parse(raw as string);
    if (Array.isArray(parsed)) return parsed as RunEntry[];
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as Record<string, unknown>).runs)
    ) {
      return (parsed as { runs: RunEntry[] }).runs;
    }
    return [];
  } catch {
    return [];
  }
}

export async function _write(this: IRunRegistry, entries: RunEntry[]): Promise<void> {
  await fs.mkdir(this._runsDir, { recursive: true });
  await fs.writeFile(this._manifestPath, JSON.stringify(entries, null, 2), 'utf-8');
}

export async function _upsert(this: IRunRegistry, entry: RunEntry): Promise<void> {
  const manifest = await this._read();
  const idx = manifest.findIndex((e) => e.runId === entry.runId);
  if (idx >= 0) {
    manifest[idx] = entry;
  } else {
    manifest.push(entry);
  }
  await this._write(manifest);
}
