import './prototype/index.js';
export { GitHubWebhookTrigger } from './webhook-trigger.js';
export type {
    GitHubWebhookPayload, GitHubWebhookTriggerOptions, IGitHubWebhookTrigger, TriggerContext, WebhookRoute
} from './webhook-trigger.js';

import type { GitHubWebhookTriggerOptions } from './webhook-trigger.js';
import { GitHubWebhookTrigger } from './webhook-trigger.js';

export async function startWebhookTrigger(
  options: GitHubWebhookTriggerOptions,
): Promise<InstanceType<typeof GitHubWebhookTrigger>> {
  const trigger = new GitHubWebhookTrigger(options);
  await trigger.start();
  return trigger;
}
