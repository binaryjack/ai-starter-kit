import * as path from 'path';
import type { DagRunOptions } from '../dag-orchestrator.js';

// ─── IDagOrchestrator ────────────────────────────────────────────────────────

export interface IDagOrchestrator {
  _projectRoot:  string;
  _resultsDir:   string;
  _options:      DagRunOptions;
  _verbose:      boolean;

  run(dagFile: string): Promise<import('../dag-types.js').DagResult>;
  execute(
    dag:     import('../dag-types.js').DagDefinition,
    dagDir?: string,
  ): Promise<import('../dag-types.js').DagResult>;
  loadDag(dagFilePath: string): Promise<import('../dag-types.js').DagDefinition>;
  _log(msg: string): void;
}

// ─── DagOrchestrator constructor ─────────────────────────────────────────────

export const DagOrchestrator = function DagOrchestrator(
  this: IDagOrchestrator,
  projectRoot: string,
  options?: DagRunOptions,
) {
  this._projectRoot = projectRoot;
  this._options     = options ?? {};
  this._verbose     = options?.verbose ?? false;
  this._resultsDir  =
    options?.resultsDir ?? path.join(projectRoot, '.agents', 'results');
} as unknown as new (
  projectRoot: string,
  options?: DagRunOptions,
) => IDagOrchestrator;

export { type DagRunOptions };
