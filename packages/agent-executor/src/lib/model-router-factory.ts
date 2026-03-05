/**
 * ModelRouterFactory — constructs and wires a ModelRouter for a DAG run.
 *
 * Extracted from DagOrchestrator.execute() so that router setup concerns
 * (file loading, VS Code sampling injection, auto-registration) live in
 * one dedicated place.
 */

import * as path from 'path'
import type { SamplingCallback } from './llm-provider.js'
import { ModelRouter } from './model-router.js'
import { MockProvider } from './providers/mock.provider.js'
import { VSCodeSamplingProvider } from './providers/vscode-sampling.provider.js'

export interface RouterFactoryOptions {
  /** Resolved path to the model-router.json file, or undefined when not provided. */
  routerFilePath: string | undefined;
  /** Optional VS Code sampling callback (MCP context). */
  samplingCallback: SamplingCallback | undefined;
  /** Base directory used to resolve relative router file paths. */
  agentsBaseDir: string;
  /**
   * Force all calls to use a specific provider, overriding model-router.json.
   * 'mock' creates a zero-cost mock provider with no API key requirement.
   */
  forceProvider?: string;
  /** Logging sink — called with diagnostic messages. */
  log: (msg: string) => void;
}

export class ModelRouterFactory {
  /**
   * Build a ModelRouter from a JSON file and/or a sampling callback.
   * Returns `undefined` when neither is provided.
   */
  static async create(options: RouterFactoryOptions): Promise<ModelRouter | undefined> {
    const { routerFilePath, samplingCallback, agentsBaseDir, log } = options;

    if (!routerFilePath && !samplingCallback) return undefined;

    if (!routerFilePath) {
      // No router file but sampling callback available — nothing to load but
      // log a diagnostic so the operator understands LLM checks are degraded.
      log('   🧠 VS Code sampling callback provided (no model-router.json; LLM checks disabled)');
      return undefined;
    }

    try {
      const resolvedPath = path.isAbsolute(routerFilePath)
        ? routerFilePath
        : path.resolve(agentsBaseDir, routerFilePath);

      const modelRouter = await ModelRouter.fromFile(resolvedPath);

      // Inject VS Code sampling callback if provided
      if (samplingCallback) {
        modelRouter.registerProvider(new VSCodeSamplingProvider(samplingCallback));
      }

      // If forceProvider='mock', register a mock and skip API-key providers
      if (options.forceProvider === 'mock') {
        modelRouter.registerProvider(new MockProvider());
        log(`   🧪 Mock provider forced — LLM calls return synthetic responses (no API key needed)`);
      } else {
        await modelRouter.autoRegister();
      }

      // If a specific (non-mock) provider is forced, validate it is registered
      if (options.forceProvider && options.forceProvider !== 'mock') {
        if (!modelRouter.registeredProviders.includes(options.forceProvider)) {
          log(`   ⚠️  Forced provider '${options.forceProvider}' is not registered (missing API key?). Falling back to autoRegister.`);
          await modelRouter.autoRegister();
        } else {
          log(`   🎯 Provider forced: ${options.forceProvider}`);
        }
      }

      log(
        `   🧠 Model router loaded: ${routerFilePath} ` +
        `(providers: ${modelRouter.registeredProviders.join(', ') || 'none'})`,
      );

      return modelRouter;
    } catch (err) {
      log(`   ⚠️  Failed to load model router: ${err}`);
      return undefined;
    }
  }
}
