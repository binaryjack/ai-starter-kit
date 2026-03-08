import type { CheckpointPayload, SupervisorVerdict } from '../dag-types.js';

export interface IHumanReviewGate {
  prompt(payload: CheckpointPayload, verdict: SupervisorVerdict): Promise<SupervisorVerdict>;
}
