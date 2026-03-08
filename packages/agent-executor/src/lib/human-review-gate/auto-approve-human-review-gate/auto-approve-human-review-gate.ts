import type { CheckpointPayload, SupervisorVerdict } from '../../dag-types.js';
import type { IHumanReviewGate } from '../human-review-gate.types.js';
import './prototype/index.js';

export interface IAutoApproveHumanReviewGate extends IHumanReviewGate {
  prompt(payload: CheckpointPayload, verdict: SupervisorVerdict): Promise<SupervisorVerdict>;
}

export const AutoApproveHumanReviewGate = function(
  this: IAutoApproveHumanReviewGate,
) {
  // no state
} as unknown as {
  new(): IAutoApproveHumanReviewGate;
};
