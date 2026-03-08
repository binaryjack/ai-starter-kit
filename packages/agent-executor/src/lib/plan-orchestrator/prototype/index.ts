import { PlanOrchestrator } from '../plan-orchestrator.js';
import {
    _executeSteps,
    _inferDagFile,
    _printSummary,
    _runStep,
    _savePlan,
    _shouldRun,
    _topoGroups,
    _waitForAnyInput,
    run,
} from './methods.js';

Object.assign((PlanOrchestrator as unknown as { prototype: object }).prototype, {
  run,
  _executeSteps,
  _runStep,
  _topoGroups,
  _shouldRun,
  _inferDagFile,
  _savePlan,
  _waitForAnyInput,
  _printSummary,
});
