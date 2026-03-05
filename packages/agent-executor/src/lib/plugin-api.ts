/**
 * plugin-api.ts — Public plugin contract for ai-kit check-handler plugins.
 *
 * A plugin is a Node.js package that registers one or more `ICheckHandler`
 * implementations into the `CheckHandlerRegistry`.
 *
 * ## Naming convention
 *   `@ai-kit-plugin/<name>` or `ai-kit-plugin-<name>`
 *
 * ## Plugin package structure
 * ```
 * my-plugin/
 *   package.json        { "main": "dist/index.js" }
 *   dist/
 *     index.js          // CJS module — exports `register` and `manifest`
 * ```
 *
 * ## Plugin entry point contract
 * ```typescript
 * import type { AiKitPluginManifest, AiKitPluginRegisterFn } from '@ai-agencee/ai-kit-agent-executor';
 *
 * export const manifest: AiKitPluginManifest = {
 *   name:        'my-plugin',
 *   version:     '1.0.0',
 *   description: 'Adds custom check types for my-org policies',
 *   checkTypes:  ['my-org-lint', 'my-org-security'],
 * };
 *
 * export const register: AiKitPluginRegisterFn = (registry) => {
 *   registry.register(new MyOrgLintHandler());
 *   registry.register(new MyOrgSecurityHandler());
 * };
 * ```
 *
 * ## Discovery
 * ```typescript
 * const registry = CheckHandlerRegistry.createDefault(modelRouter);
 * await registry.discover();   // scans node_modules for ai-kit-plugin-* packages
 * ```
 *
 * ## Manual registration
 * ```typescript
 * import { registry } from './my-module.js';
 * registry.register(new MyCustomHandler());
 * ```
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { CheckHandlerRegistry } from './checks/check-handler-registry.js'

// ─── Plugin manifest ──────────────────────────────────────────────────────────

export interface AiKitPluginManifest {
  /** Plugin package name (matches the npm package name) */
  name: string;
  /** SemVer version */
  version: string;
  /** Human-readable description */
  description?: string;
  /** List of check type identifiers this plugin registers */
  checkTypes: string[];
}

/**
 * The registration function that plugins must export as `register`.
 * Receives the live `CheckHandlerRegistry` instance and should call
 * `registry.register(handler)` for each handler it provides.
 */
export type AiKitPluginRegisterFn = (registry: CheckHandlerRegistry) => void | Promise<void>;

/**
 * Shape of a valid plugin module's exports.
 * Both `register` and `manifest` are required.
 */
export interface AiKitPluginModule {
  register: AiKitPluginRegisterFn;
  manifest: AiKitPluginManifest;
}

// ─── Discovery result ─────────────────────────────────────────────────────────

export interface PluginDiscoveryResult {
  /** Number of plugins successfully loaded */
  loaded: number;
  /** Plugin manifests of successfully loaded plugins */
  manifests: AiKitPluginManifest[];
  /** Errors encountered while loading (plugin name → error message) */
  errors: Record<string, string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Package name patterns that identify an ai-kit plugin. */
const PLUGIN_PATTERNS: ReadonlyArray<RegExp> = [
  /^@ai-kit-plugin\//,
  /^ai-kit-plugin-/,
  /^@[^/]+\/ai-kit-plugin-/,
];

function isPluginPackage(name: string): boolean {
  return PLUGIN_PATTERNS.some((p) => p.test(name));
}

/**
 * Scan a `node_modules` directory and return the list of installed ai-kit plugin
 * package names.  Also handles scoped packages under `node_modules/@<scope>/`.
 */
async function findInstalledPlugins(nodeModulesDir: string): Promise<string[]> {
  const found: string[] = [];

  let entries: string[];
  try {
    entries = await fs.readdir(nodeModulesDir);
  } catch {
    return found; // node_modules doesn't exist yet
  }

  for (const entry of entries) {
    if (entry.startsWith('@')) {
      // Scoped packages — look inside the scope dir
      const scopeDir = path.join(nodeModulesDir, entry);
      let scoped: string[];
      try {
        scoped = await fs.readdir(scopeDir);
      } catch {
        continue;
      }
      for (const pkg of scoped) {
        const fullName = `${entry}/${pkg}`;
        if (isPluginPackage(fullName)) found.push(fullName);
      }
    } else {
      if (isPluginPackage(entry)) found.push(entry);
    }
  }

  return found;
}

/**
 * Discover and load all installed ai-kit plugin packages from `node_modules`.
 *
 * @param registry       The `CheckHandlerRegistry` to register handlers into.
 * @param nodeModulesDir Path to the `node_modules` directory to scan.
 *                       Defaults to `./node_modules` relative to `process.cwd()`.
 */
export async function discoverPlugins(
  registry: CheckHandlerRegistry,
  nodeModulesDir?: string,
): Promise<PluginDiscoveryResult> {
  const nmDir = nodeModulesDir ?? path.join(process.cwd(), 'node_modules');
  const pluginNames = await findInstalledPlugins(nmDir);

  const result: PluginDiscoveryResult = {
    loaded:    0,
    manifests: [],
    errors:    {},
  };

  for (const name of pluginNames) {
    const pluginPath = path.join(nmDir, name);
    try {
      // Resolve the plugin's main entry via its package.json
      const pkgJsonPath = path.join(pluginPath, 'package.json');
      const pkgJson     = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8')) as { main?: string };
      const mainFile    = pkgJson.main ?? 'index.js';
      const entryPath   = path.resolve(pluginPath, mainFile);

      // Dynamic require — CommonJS compatible
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(entryPath) as Partial<AiKitPluginModule>;

      if (typeof mod.register !== 'function') {
        result.errors[name] = 'Plugin does not export a `register` function';
        continue;
      }
      if (!mod.manifest || typeof mod.manifest !== 'object') {
        result.errors[name] = 'Plugin does not export a `manifest` object';
        continue;
      }

      await mod.register(registry);
      result.loaded++;
      result.manifests.push(mod.manifest);
    } catch (err) {
      result.errors[name] = String(err);
    }
  }

  return result;
}
