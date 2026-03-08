import type { ModelFamily }        from '../../llm-provider.js';
import type { PromptFrontmatter, ResolvedPrompt } from '../prompt-registry.types.js';
import type { IPromptRegistry }    from '../prompt-registry.js';

export function _makeKey(this: IPromptRegistry, agent: string, family: ModelFamily): string {
  return `${agent}:${family}`;
}

export function _parseFrontmatter(
  this:     IPromptRegistry,
  raw:      string,
  filePath: string,
): ResolvedPrompt | null {
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

    const key      = line.slice(0, colonIdx).trim() as keyof PromptFrontmatter;
    const rawValue = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');

    if (!key || !rawValue) continue;

    if (key === 'contextRequired') {
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
    frontmatter:  frontmatter as PromptFrontmatter,
    systemPrompt: body.trim(),
    filePath,
  };
}
