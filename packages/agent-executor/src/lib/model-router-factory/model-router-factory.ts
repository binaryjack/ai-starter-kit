import * as path from 'path'

import type { SamplingCallback } from '../llm-provider.js'
import type { IModelRouter } from '../model-router/model-router.js'
import { ModelRouter } from '../model-router/model-router.js'
import { BedrockProvider } from '../providers/bedrock.provider.js'
import { GeminiProvider } from '../providers/gemini.provider.js'
import { MockProvider } from '../providers/mock.provider.js'
import { OllamaProvider } from '../providers/ollama.provider.js'
import { VSCodeSamplingProvider } from '../providers/vscode-sampling.provider.js'

export interface RouterFactoryOptions {
  routerFilePath:    string | undefined;
  samplingCallback:  SamplingCallback | undefined;
  agentsBaseDir:     string;
  forceProvider?:    string;
  mockResponses?:    Record<string, string>;
  log:               (msg: string) => void;
}

export interface IModelRouterFactory {
  new(): IModelRouterFactory;
  create(options: RouterFactoryOptions): Promise<IModelRouter | undefined>;
}

export const ModelRouterFactory = function(this: IModelRouterFactory) {
  // static-only
} as unknown as IModelRouterFactory;

(ModelRouterFactory as unknown as Record<string, unknown>).create = async function(
  options: RouterFactoryOptions,
): Promise<IModelRouter | undefined> {
  const { routerFilePath, samplingCallback, agentsBaseDir, log } = options;

  if (!routerFilePath && !samplingCallback) return undefined;

  if (!routerFilePath) {
    log('   🧠 VS Code sampling callback provided (no model-router.json; LLM checks disabled)');
    return undefined;
  }

  try {
    const resolvedPath = path.isAbsolute(routerFilePath)
      ? routerFilePath
      : path.resolve(agentsBaseDir, routerFilePath);

    const modelRouter = await (ModelRouter as unknown as { fromFile(p: string): Promise<IModelRouter> }).fromFile(resolvedPath);

    if (samplingCallback) {
      modelRouter.registerProvider(new VSCodeSamplingProvider(samplingCallback));
    }

    if (options.forceProvider === 'mock') {
      modelRouter.registerProvider(new MockProvider(options.mockResponses ?? {}));
      log(`   🧪 Mock provider forced — LLM calls return synthetic responses (no API key needed)`);
    } else {
      if (process.env['OLLAMA_HOST']) {
        const ollama = new OllamaProvider();
        if (await ollama.isAvailable()) {
          modelRouter.registerProvider(ollama);
          log(`   🦙 Ollama provider auto-registered (host: ${process.env['OLLAMA_HOST']})`);
        }
      }
      if (process.env['GEMINI_API_KEY']) {
        const gemini = new GeminiProvider();
        if (await gemini.isAvailable()) {
          modelRouter.registerProvider(gemini);
          log(`   ✨ Gemini provider auto-registered`);
        }
      }
      if (process.env['AWS_ACCESS_KEY_ID'] && process.env['AWS_SECRET_ACCESS_KEY']) {
        const bedrock = new BedrockProvider();
        if (await bedrock.isAvailable()) {
          modelRouter.registerProvider(bedrock);
          const region = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? 'us-east-1';
          log(`   ☁️  Bedrock provider auto-registered (region: ${region})`);
        }
      }
      await modelRouter.autoRegister();
    }

    if (options.forceProvider && options.forceProvider !== 'mock') {
      if (!modelRouter.registeredProviders().includes(options.forceProvider)) {
        log(`   ⚠️  Forced provider '${options.forceProvider}' is not registered (missing API key?). Falling back to autoRegister.`);
        await modelRouter.autoRegister();
      } else {
        log(`   🎯 Provider forced: ${options.forceProvider}`);
      }
    }

    log(
      `   🧠 Model router loaded: ${routerFilePath} ` +
      `(providers: ${modelRouter.registeredProviders().join(', ') || 'none'})`,
    );

    return modelRouter;
  } catch (err) {
    log(`   ⚠️  Failed to load model router: ${err}`);
    return undefined;
  }
};
