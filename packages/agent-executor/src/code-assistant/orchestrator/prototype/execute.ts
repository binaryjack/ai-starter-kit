/**
 * Prototype method: execute
 *
 * Main entry point for Codernic code generation.  Coordinates the four helper
 * methods defined in the other prototype files:
 *
 *   _openStore()      → open (or reuse) the SQLite index
 *   _gatherContext()  → FTS5 symbol search + file snippet loading
 *   _buildRouter()    → model router bootstrap
 *   _parsePatches()   → LLM response → ordered FilePatch list
 *
 * This file contains no business logic — it is the thin orchestration layer
 * that calls the helpers in order and handles failures at each boundary.
 *
 * Token-sustainability notes:
 * - context is gathered BEFORE the router is initialised so a missing index
 *   surfaces immediately without burning an API call.
 * - dry-run returns the raw LLM output as `plan` without writing any files,
 *   so users can review before committing a generation budget.
 * - The store is closed unconditionally in a finally block unless the caller
 *   supplied their own pre-opened instance (options.indexStore).
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import type { TaskType } from '../../../lib/llm-provider.js';

import type {
    ExecutionRequest,
    ExecutionResult,
    FilePatch,
} from '../../code-assistant-orchestrator.types.js';
import type { CodebaseIndexStoreInstance } from '../../storage/codebase-index-store.types.js';
import type { ICodeAssistantOrchestrator } from '../code-assistant-orchestrator.js';
import { MODE_TASK_TYPE, SYSTEM_PROMPT } from './constants.js';

export async function execute(
  this: ICodeAssistantOrchestrator,
  req:  ExecutionRequest,
): Promise<ExecutionResult> {
  const start = Date.now();
  const { task, dryRun = false, mode = 'feature' } = req;

  // ── 1. Open index store ───────────────────────────────────────────────────

  let store: CodebaseIndexStoreInstance;
  try {
    store = await this._openStore();
  } catch {
    return {
      success:       false,
      filesModified: [],
      totalCost:     0,
      duration:      Date.now() - start,
      error:         'Index not found. Run: ai-kit code index first.',
    };
  }

  // ── 2. Gather codebase context (no API cost) ──────────────────────────────

  let context = '';
  try {
    context = await this._gatherContext(store, task);
  } finally {
    // Close the store only when we opened it; leave caller-supplied stores alone
    if (!this._options.indexStore) {
      await store.close();
    }
  }

  // ── 3. Obtain model router ────────────────────────────────────────────────

  const router = await this._buildRouter();
  if (!router) {
    return {
      success:       false,
      filesModified: [],
      totalCost:     0,
      duration:      Date.now() - start,
      error:         'No LLM provider available. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.',
    };
  }

  // ── 4. Build prompt ───────────────────────────────────────────────────────

  const taskType: TaskType = MODE_TASK_TYPE[mode] ?? 'code-generation';

  const contextSection = context.length > 0
    ? '## Codebase context\n' + context
    : '(No index symbols matched — generating from task description alone.)';

  const dryRunDirective = dryRun
    ? '\n**Dry run:** describe the planned changes in plain English. Do NOT emit ## FILE or ## DELETE blocks.'
    : '';

  const userContent =
    contextSection +
    '\n\n## Task\n' + task +
    '\n\n## Mode: ' + mode +
    dryRunDirective;

  // ── 5. Call LLM ──────────────────────────────────────────────────────────

  let llmContent:  string;
  let totalCost:   number;
  try {
    const response = await router.route(taskType, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userContent },
      ],
      maxTokens:   8192,
      temperature: 0.2,
    });
    llmContent = response.content;
    totalCost  = response.estimatedCostUSD ?? 0;
  } catch (err: unknown) {
    return {
      success:       false,
      filesModified: [],
      totalCost:     0,
      duration:      Date.now() - start,
      error:         String(err),
    };
  }

  // ── 6. Dry run — return plan, no writes ───────────────────────────────────

  const patches: FilePatch[] = this._parsePatches(llmContent);

  if (dryRun || patches.length === 0) {
    return {
      success:       true,
      filesModified: [],
      newFiles:      [],
      totalCost,
      duration:      Date.now() - start,
      plan:          llmContent,
    };
  }

  // ── 7. Apply patches to disk ──────────────────────────────────────────────

  const filesModified: string[] = [];
  const newFiles:      string[] = [];

  for (const patch of patches) {
    const abs = path.isAbsolute(patch.relativePath)
      ? patch.relativePath
      : path.join(this._options.projectRoot, patch.relativePath);

    if (patch.delete) {
      try { await fs.unlink(abs); } catch { /* already absent */ }
      continue;
    }

    const existed = await fs.access(abs).then(() => true, () => false);
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, patch.content, 'utf-8');
      if (existed) {
        filesModified.push(patch.relativePath);
      } else {
        newFiles.push(patch.relativePath);
      }
    } catch (writeErr: unknown) {
      return {
        success:       false,
        filesModified,
        newFiles,
        totalCost,
        duration:      Date.now() - start,
        error:         'Failed to write ' + patch.relativePath + ': ' + String(writeErr),
      };
    }
  }

  return {
    success:       true,
    filesModified,
    newFiles,
    totalCost,
    duration:      Date.now() - start,
  };
}
