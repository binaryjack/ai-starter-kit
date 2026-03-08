import * as path from 'path'

import type { RunEntry, RunPaths, RunStatus } from './run-registry.types.js'

import './prototype/index.js'

export interface IRunRegistry {
  new(projectRoot: string): IRunRegistry;
  _projectRoot:  string;
  _runsDir:      string;
  _manifestPath: string;
  create(runId: string, dagName: string): Promise<RunPaths>;
  complete(runId: string, status: RunStatus, durationMs?: number): Promise<void>;
  delete(runId: string): Promise<void>;
  purgeOld(olderThanMs?: number): Promise<string[]>;
  paths(runId: string): RunPaths;
  get(runId: string): Promise<RunEntry | undefined>;
  list(): Promise<RunEntry[]>;
  listActive(): Promise<RunEntry[]>;
  _paths(runId: string): RunPaths;
  _read(): Promise<RunEntry[]>;
  _write(entries: RunEntry[]): Promise<void>;
  _upsert(entry: RunEntry): Promise<void>;
}

export const RunRegistry = function(
  this:        IRunRegistry,
  projectRoot: string,
) {
  this._projectRoot  = projectRoot;
  this._runsDir      = path.join(projectRoot, '.agents', 'runs');
  this._manifestPath = path.join(projectRoot, '.agents', 'runs', 'manifest.json');
} as unknown as IRunRegistry;
