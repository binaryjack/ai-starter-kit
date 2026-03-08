import { POEscalationTier } from '../po-escalation-tier.js';
import { canHandle, resolve } from './methods.js';

Object.assign((POEscalationTier as unknown as { prototype: object }).prototype, {
  canHandle,
  resolve,
});
