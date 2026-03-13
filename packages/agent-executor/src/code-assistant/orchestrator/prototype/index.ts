/**
 * Prototype wiring for CodeAssistantOrchestrator.
 *
 * Imports every prototype method and attaches them to the constructor's
 * prototype object in one atomic Object.assign call — the same pattern used by
 * DagOrchestrator, PlanOrchestrator, and SupervisedAgent.
 *
 * This file is the *only* place that binds implementation to constructor.  No
 * prototype method file ever imports from another prototype method file, which
 * keeps the dependency graph a strict DAG and eliminates circular-import races.
 */

import { CodeAssistantOrchestrator } from '../code-assistant-orchestrator.js';
import { _buildRouter } from './build-router.js';
import { execute } from './execute.js';
import { _gatherContext } from './gather-context.js';
import { _openStore } from './open-store.js';
import { _parsePatches } from './parse-patches.js';

Object.assign(
  (CodeAssistantOrchestrator as unknown as { prototype: object }).prototype,
  {
    execute,
    _buildRouter,
    _openStore,
    _gatherContext,
    _parsePatches,
  },
);
