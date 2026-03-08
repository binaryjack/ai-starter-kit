import type { CheckpointPayload, SupervisorVerdict } from '../../../dag-types.js';
import type { IAutoApproveHumanReviewGate } from '../auto-approve-human-review-gate.js';

export async function prompt(
  this: IAutoApproveHumanReviewGate,
  _payload: CheckpointPayload,
  verdict: SupervisorVerdict,
): Promise<SupervisorVerdict> {
  return verdict;
}
