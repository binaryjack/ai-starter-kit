import { DagOrchestrator } from '../dag-orchestrator.js';
import { _log, execute, loadDag, run } from './methods.js';

Object.assign(
  (DagOrchestrator as unknown as { prototype: object }).prototype,
  { run, execute, loadDag, _log },
);
