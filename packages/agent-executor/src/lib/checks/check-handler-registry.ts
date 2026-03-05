/**
 * CheckHandlerRegistry — dispatches checks to the appropriate ICheckHandler.
 *
 * Provides a `createDefault()` factory that pre-registers all built-in
 * handlers.  Custom handlers can be registered with `register()` to
 * extend or override behaviour without touching existing code.
 */

import * as path from 'path'
import type { CheckType } from '../agent-types.js'
import type { StepResult } from '../check-runner.js'
import type { ToolExecutorFn } from '../llm-provider.js'
import type { ModelRouter, RoutedResponse } from '../model-router.js'
import { discoverPlugins } from '../plugin-api.js'
import type { CheckContext } from './check-context.js'
import type { ICheckHandler } from './check-handler.interface.js'
import { formatCheckResult } from './check-result-formatter.js'

// ─── Handlers ─────────────────────────────────────────────────────────────────
import { CountDirsHandler } from './count-dirs.handler.js'
import { CountFilesHandler } from './count-files.handler.js'
import { DirExistsHandler } from './dir-exists.handler.js'
import { FileExistsHandler } from './file-exists.handler.js'
import { GrepHandler } from './grep.handler.js'
import { JsonFieldHandler } from './json-field.handler.js'
import { JsonHasKeyHandler } from './json-has-key.handler.js'
import { LlmGenerateHandler } from './llm-generate.handler.js'
import { LlmReviewHandler } from './llm-review.handler.js'
import { RunCommandHandler } from './run-command.handler.js'

export class CheckHandlerRegistry {
  private readonly handlers = new Map<CheckType, ICheckHandler>();

  // ─── Registration ─────────────────────────────────────────────────────────

  /** Register a handler for its declared type. Overwrites any existing handler. */
  register(handler: ICheckHandler): this {
    this.handlers.set(handler.type, handler);
    return this;
  }

  /**
   * Discover and register all ai-kit plugin packages from node_modules.
   * Safe to call multiple times — each call re-scans and re-registers.
   *
   * @param nodeModulesDir  Override the node_modules directory to scan.
   *                        Defaults to the project's own node_modules.
   */
  async discover(nodeModulesDir?: string): Promise<void> {
    await discoverPlugins(this, nodeModulesDir);
  }

  // ─── Dispatch ──────────────────────────────────────────────────────────────

  /**
   * Execute the check in `ctx` using the registered handler for `ctx.check.type`.
   *
   * @returns Full StepResult with interpolated messages and recommendations.
   * @throws  Never — unknown check types return a failed StepResult.
   */
  async run(ctx: CheckContext): Promise<StepResult> {
    const handler = this.handlers.get(ctx.check.type);

    if (!handler) {
      return {
        findings:        [`❌ Unknown check type: "${ctx.check.type}"`],
        recommendations: [],
      };
    }

    let raw;
    try {
      raw = await handler.execute(ctx);
    } catch (err) {
      return {
        findings:        [`❌ Check error: ${err}`],
        recommendations: [],
      };
    }

    // Early-return: handler has already built its own findings (llm-generate outputKey, etc.)
    if (raw.earlyReturn) {
      const findings:        string[] = [];
      const recommendations: string[] = [];
      if (ctx.retryInstructions) findings.push(`ℹ️ Retry context: ${ctx.retryInstructions}`);
      if (raw.extraFindings)        findings.push(...raw.extraFindings);
      if (raw.extraRecommendations) recommendations.push(...raw.extraRecommendations);
      return { findings, recommendations, detail: raw.detail };
    }

    return formatCheckResult(raw, ctx.check, ctx.retryInstructions);
  }

  // ─── Factory ───────────────────────────────────────────────────────────────

  /**
   * Build a registry with all built-in check handlers pre-registered.
   *
   * @param modelRouter     Optional router for llm-generate and llm-review.
   * @param onLlmResponse   Optional callback fired after every LLM completion.
   */
  static createDefault(
    _modelRouter?: ModelRouter,
    _onLlmResponse?: (response: RoutedResponse) => void,
  ): CheckHandlerRegistry {
    const registry = new CheckHandlerRegistry();
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
  }

  /**
   * Build a CheckContext given the raw inputs from runCheckStep().
   */
  static buildContext(
    check: import('../agent-types.js').CheckDefinition,
    projectRoot: string,
    retryInstructions?: string,
    modelRouter?: ModelRouter,
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
  }
}
