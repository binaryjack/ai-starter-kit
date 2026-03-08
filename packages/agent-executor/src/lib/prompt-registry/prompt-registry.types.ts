import { ModelFamily, TaskType } from '../llm-provider.js';

export interface PromptFrontmatter {
  agent:            string;
  modelFamily:      ModelFamily;
  task:             TaskType;
  contextRequired?: string[];
  outputSchema?:    string;
  maxTokens?:       number;
}

export interface ResolvedPrompt {
  frontmatter:  PromptFrontmatter;
  systemPrompt: string;
  filePath:     string;
}
