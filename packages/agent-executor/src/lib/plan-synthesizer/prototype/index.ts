import { PlanSynthesizer } from '../plan-synthesizer.js';
import {
    _agentIntroduction,
    _buildStepsWithFallback,
    _ensurePromptRegistry,
    _processApprovalFeedback,
    _save,
    synthesize,
} from './methods.js';

Object.assign((PlanSynthesizer as unknown as { prototype: object }).prototype, {
  synthesize,
  _buildStepsWithFallback,
  _agentIntroduction,
  _processApprovalFeedback,
  _ensurePromptRegistry,
  _save,
});
