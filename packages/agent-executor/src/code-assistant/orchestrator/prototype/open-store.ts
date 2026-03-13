/**
 * Prototype method: _openStore
 *
 * Opens the SQLite index store for the current project, or returns the
 * pre-opened store from options when the caller already holds one (avoids a
 * second DB connection in test environments and in watch mode).
 */

import * as path from 'path';

import type { CodebaseIndexStoreInstance } from '../../storage/codebase-index-store.types.js';
import { createCodebaseIndexStore } from '../../storage/create-codebase-index-store.js';

import type { ICodeAssistantOrchestrator } from '../code-assistant-orchestrator.js';

export async function _openStore(
  this: ICodeAssistantOrchestrator,
): Promise<CodebaseIndexStoreInstance> {
  if (this._options.indexStore) return this._options.indexStore;

  const { projectRoot } = this._options;
  const dbPath    = path.join(projectRoot, '.agents', 'code-index.db');
  const projectId = path.basename(projectRoot);

  return createCodebaseIndexStore({ dbPath, projectId }) as Promise<CodebaseIndexStoreInstance>;
}
