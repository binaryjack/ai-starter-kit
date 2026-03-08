import type { IRunRegistry }  from '../run-registry.js';
import type { RunEntry, RunPaths } from '../run-registry.types.js';

export function paths(this: IRunRegistry, runId: string): RunPaths {
  return this._paths(runId);
}

export async function get(
  this:  IRunRegistry,
  runId: string,
): Promise<RunEntry | undefined> {
  return (await this._read()).find((e) => e.runId === runId);
}

export async function list(this: IRunRegistry): Promise<RunEntry[]> {
  const entries = await this._read();
  return [...entries].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export async function listActive(this: IRunRegistry): Promise<RunEntry[]> {
  return (await this.list()).filter((e) => e.status === 'running');
}
