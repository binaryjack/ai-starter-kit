import { GitHubWebhookTrigger } from '../webhook-trigger.js';
import { handleRequest, isRunning, matchRoutes, start, stop } from './methods.js';

Object.assign((GitHubWebhookTrigger as unknown as { prototype: object }).prototype, {
  start, stop, isRunning, handleRequest, matchRoutes,
});
