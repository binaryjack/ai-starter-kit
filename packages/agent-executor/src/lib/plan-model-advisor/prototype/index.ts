import { PlanModelAdvisor } from '../plan-model-advisor.js';
import { _estimateTotal, _render, display } from './methods.js';

Object.assign((PlanModelAdvisor as unknown as { prototype: object }).prototype, {
  display, _render, _estimateTotal,
});
