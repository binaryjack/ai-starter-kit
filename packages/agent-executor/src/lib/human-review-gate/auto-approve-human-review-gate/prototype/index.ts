import { AutoApproveHumanReviewGate } from '../auto-approve-human-review-gate.js';
import { prompt } from './methods.js';

Object.assign((AutoApproveHumanReviewGate as unknown as { prototype: object }).prototype, {
  prompt,
});
