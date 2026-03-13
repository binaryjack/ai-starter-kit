/**
 * CodeAssistantOrchestrator — constructor + interface
 *
 * Follows the same constructor-function pattern used by DagOrchestrator and
 * PlanOrchestrator:
 *   - The constructor sets shared state on `this`.
 *   - All methods live in prototype/ and are attached by prototype/index.ts.
 *   - `createCodeAssistantOrchestrator` is the public factory alias.
 *
 * This file intentionally contains NO business logic — only state initialisation.
 */

import type { IModelRouter } from '../../lib/model-router/index.js';
import type {
    CodeAssistantOptions,
    ExecutionRequest,
    ExecutionResult,
    FilePatch,
} from '../code-assistant-orchestrator.types.js';
import type { CodebaseIndexStoreInstance } from '../storage/codebase-index-store.types.js';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ICodeAssistantOrchestrator {
  _options: CodeAssistantOptions;

  // ── Public API ────────────────────────────────────────────────────────────
  execute(req: ExecutionRequest): Promise<ExecutionResult>;

  // ── Protected helpers (prototype methods — not part of external contract) ─
  _buildRouter():    Promise<IModelRouter | undefined>;
  _openStore():      Promise<CodebaseIndexStoreInstance>;
  _gatherContext(store: CodebaseIndexStoreInstance, task: string): Promise<string>;
  _parsePatches(response: string): FilePatch[];
}

// ─── Constructor ──────────────────────────────────────────────────────────────

export const CodeAssistantOrchestrator = function CodeAssistantOrchestrator(
  this:    ICodeAssistantOrchestrator,
  options: CodeAssistantOptions,
) {
  this._options = options;
} as unknown as new (options: CodeAssistantOptions) => ICodeAssistantOrchestrator;

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Preferred public entry point.  Returns the typed interface so callers never
 * need to import the constructor directly.
 */
export function createCodeAssistantOrchestrator(
  options: CodeAssistantOptions,
): ICodeAssistantOrchestrator {
  return new CodeAssistantOrchestrator(options);
}
