import { IntraSupervisor } from '../intra-supervisor.js';
import { evaluate, getRuleFor, incrementRetry, isExhausted, laneId, retryBudget, retryCount } from './methods.js';

Object.assign((IntraSupervisor as unknown as { prototype: object }).prototype, {
  evaluate,
  isExhausted,
  incrementRetry,
  retryCount,
  laneId,
  retryBudget,
  getRuleFor,
});
