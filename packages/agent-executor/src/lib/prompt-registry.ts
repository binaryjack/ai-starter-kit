import * as fs from 'fs/promises';
import * as path from 'path';
import { TaskType, ModelFamily } from './llm-provider.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PromptFrontmatter {
  /** Agent this prompt belongs to (matches lane id or agent name) */
  agent: string;
  /** Which model family this prompt is optimised for */
  modelFamily: ModelFamily;
  /** The task type this prompt handles */
  task: TaskType;
  /** Context keys that must be injected before sending this prompt */
  contextRequired?: string[];
  /** Expected output schema name (documentation only) */
  outputSchema?: string;
  /** Override max tokens for this specific prompt */
  maxTokens?: number;
}

export interface ResolvedPrompt {
  frontmatter: PromptFrontmatter;
  /** The system prompt body (everything after the frontmatter block) */
  systemPrompt: string;
  filePath: string;
}

// ─── PromptRegistry ───────────────────────────────────────────────────────────

/**
 * Loads *.prompt.md files from a directory and resolves them by (agent, modelFamily).
 *
 * File naming convention:  <agent>.<family>.prompt.md
 *   e.g.  backend-agent.sonnet.prompt.md
 *         supervisor.opus.prompt.md
 *         file-analysis.haiku.prompt.md
 *
 * Frontmatter format (YAML between --- delimiters):
 *   ---
 *   agent: backend-agent
 *   modelFamily: sonnet
 *   task: code-generation
 *   contextRequired: [contract-registry, project-structure]
 *   outputSchema: AgentResult
 *   maxTokens: 4000
 *   ---
 *   <system prompt body>
 *
 * Usage:
 *   const registry = new PromptRegistry('agents/prompts');
 *   await registry.loadAll();
 *   const prompt = registry.resolve('backend-agent', 'sonnet');
 */
export class PromptRegistry {
  private readonly prompts = new Map<string, ResolvedPrompt>();
  private readonly promptsDir: string;

  constructor(promptsDir: string) {
    this.promptsDir = promptsDir;
  }

  /** Load all *.prompt.md files from the configured directory */
  async loadAll(): Promise<this> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.promptsDir);
    } catch {
      // Directory doesn't exist yet — no-op, registry stays empty
      return this;
    }

    const promptFiles = entries.filter((e) => e.endsWith('.prompt.md'));
    await Promise.all(
      promptFiles.map((f) => this.loadFile(path.join(this.promptsDir, f))),
    );

    return this;
  }

  /** Load a single prompt file */
  async loadFile(filePath: string): Promise<void> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = this.parseFrontmatter(raw, filePath);
      if (parsed) {
        const key = this.makeKey(parsed.frontmatter.agent, parsed.frontmatter.modelFamily);
        this.prompts.set(key, parsed);
      }
    } catch (err) {
      console.warn(`[PromptRegistry] Failed to load ${filePath}: ${err}`);
    }
  }

  /**
   * Resolve a prompt for a given agent + model family.
   *
   * Falls back gracefully if exact family not found:
   *   opus   → sonnet → haiku
   *   sonnet → sonnet → haiku → opus
   *   haiku  → haiku  → sonnet → opus
   */
  resolve(agent: string, family: ModelFamily): ResolvedPrompt | undefined {
    const exact = this.prompts.get(this.makeKey(agent, family));
    if (exact) return exact;

    const fallbackOrder: Record<ModelFamily, ModelFamily[]> = {
      opus:   ['opus', 'sonnet', 'haiku'],
      sonnet: ['sonnet', 'haiku', 'opus'],
      haiku:  ['haiku', 'sonnet', 'opus'],
    };

    for (const f of fallbackOrder[family]) {
      const candidate = this.prompts.get(this.makeKey(agent, f));
      if (candidate) return candidate;
    }

    return undefined;
  }

  /** Check if a prompt exists for the exact agent + family combination */
  has(agent: string, family: ModelFamily): boolean {
    return this.prompts.has(this.makeKey(agent, family));
  }

  /** List all loaded prompt keys (for debugging / CLI display) */
  list(): string[] {
    return [...this.prompts.keys()].sort();
  }

  get size(): number {
    return this.prompts.size;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private makeKey(agent: string, family: ModelFamily): string {
    return `${agent}:${family}`;
  }

  /**
   * Minimal YAML frontmatter parser — avoids adding gray-matter as a dependency.
   * Supports: string, number, and simple array values.
   */
  private parseFrontmatter(raw: string, filePath: string): ResolvedPrompt | null {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
      console.warn(`[PromptRegistry] No frontmatter found in ${filePath}`);
      return null;
    }

    const [, yamlBlock, body] = match;
    const frontmatter: Partial<PromptFrontmatter> = {};

    for (const line of yamlBlock.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim() as keyof PromptFrontmatter;
      const rawValue = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');

      if (!key || !rawValue) continue;

      if (key === 'contextRequired') {
        // Parse: [a, b, c] or a, b, c
        const cleaned = rawValue.replace(/^\[|\]$/g, '');
        (frontmatter as Record<string, unknown>)[key] = cleaned
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      } else if (key === 'maxTokens') {
        (frontmatter as Record<string, unknown>)[key] = parseInt(rawValue, 10);
      } else {
        (frontmatter as Record<string, unknown>)[key] = rawValue;
      }
    }

    if (!frontmatter.agent || !frontmatter.modelFamily || !frontmatter.task) {
      console.warn(
        `[PromptRegistry] Missing required fields (agent, modelFamily, task) in ${filePath}`,
      );
      return null;
    }

    return {
      frontmatter: frontmatter as PromptFrontmatter,
      systemPrompt: body.trim(),
      filePath,
    };
  }
}
