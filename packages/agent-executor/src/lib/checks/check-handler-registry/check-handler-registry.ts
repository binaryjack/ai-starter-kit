import * as path from 'path'
import type { CheckDefinition } from '../../agent-types.js'
import type { ToolExecutorFn } from '../../llm-provider.js'
import type { RoutedResponse } from '../../model-router/index.js'
import type { IModelRouter } from '../../model-router/model-router.js'
import type { CheckContext } from '../check-context.js'
import { CountDirsHandler } from '../count-dirs-handler/index.js'
import { CountFilesHandler } from '../count-files-handler/index.js'
import { DirExistsHandler } from '../dir-exists-handler/index.js'
import { FileExistsHandler } from '../file-exists-handler/index.js'
import { GrepHandler } from '../grep-handler/index.js'
import { JsonFieldHandler } from '../json-field-handler/index.js'
import { JsonHasKeyHandler } from '../json-has-key-handler/index.js'
import { LlmGenerateHandler } from '../llm-generate-handler/index.js'
import { LlmReviewHandler } from '../llm-review-handler/index.js'
import { RunCommandHandler } from '../run-command-handler/index.js'
import type { ICheckHandlerRegistry } from './check-handler-registry.types.js'
import { discover, register, run } from './prototype/index.js'

export const CheckHandlerRegistry = function(this: ICheckHandlerRegistry) {
  this._handlers = new Map();
} as unknown as ICheckHandlerRegistry;

Object.assign(CheckHandlerRegistry.prototype, { register, discover, run });

// ─── Static factory ───────────────────────────────────────────────────────────

(CheckHandlerRegistry as unknown as Record<string, unknown>).createDefault = function(
  _modelRouter?: IModelRouter,
  _onLlmResponse?: (response: RoutedResponse) => void,
): ICheckHandlerRegistry {
  const registry = new (CheckHandlerRegistry as unknown as new () => ICheckHandlerRegistry)();
  registry
    .register(new FileExistsHandler())
    .register(new DirExistsHandler())
    .register(new CountDirsHandler())
    .register(new CountFilesHandler())
    .register(new JsonFieldHandler())
    .register(new JsonHasKeyHandler())
    .register(new GrepHandler())
    .register(new RunCommandHandler())
    .register(new LlmGenerateHandler())
    .register(new LlmReviewHandler());
  return registry;
};

(CheckHandlerRegistry as unknown as Record<string, unknown>).buildContext = function(
  check: CheckDefinition,
  projectRoot: string,
  retryInstructions?: string,
  modelRouter?: IModelRouter,
  onLlmResponse?: (response: RoutedResponse) => void,
  onLlmStream?: (token: string) => void,
  toolExecutor?: ToolExecutorFn,
): CheckContext {
  return {
    check,
    projectRoot,
    fullPath:         check.path != null ? path.join(projectRoot, check.path) : '',
    retryInstructions,
    modelRouter,
    onLlmResponse,
    onLlmStream,
    toolExecutor,
  };
};
