import { InteractiveHumanReviewGate } from '../interactive-human-review-gate.js';
import { prompt } from './methods.js';

Object.assign((InteractiveHumanReviewGate as unknown as { prototype: object }).prototype, {
  prompt,
});
