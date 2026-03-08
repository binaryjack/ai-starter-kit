import type { StepResult } from '../../check-runner.js'
import { runCheckStep } from '../../check-runner.js'
import type {
    AgentResult,
    CheckpointMode,
    CheckpointPayload,
    ContractSnapshot,
    SupervisorVerdict,
} from '../../dag-types.js'
import type { RoutedResponse } from '../../model-router/index.js'
import type { ISupervisedAgent } from '../supervised-agent.js'
import { EscalationError } from '../supervised-agent.js'

export async function* run(
  this: ISupervisedAgent,
  projectRoot: string,
  defaultMode: CheckpointMode = 'self',
  publishContract?: () => ContractSnapshot,
  modelRouter?: ModelRouter,
  onLlmResponse?: (response: RoutedResponse) => void,
  onLlmStream?: (token: string) => void,
): AsyncGenerator<CheckpointPayload, AgentResult | null, SupervisorVerdict> {
  const findings: string[] = [];
  const recommendations: string[] = [];
  const details: Record<string, unknown> = {};

  const checks = this._definition.checks;
  let stepIndex = 0;

  while (stepIndex < checks.length) {
    const check = checks[stepIndex];

    let retryInstructions: string | undefined;
    let stepResult: StepResult;

    try {
      stepResult = await runCheckStep(check, projectRoot, retryInstructions, modelRouter, onLlmResponse, onLlmStream);
    } catch (err) {
      stepResult = {
        findings: [`❌ Unexpected step error: ${err}`],
        recommendations: [],
      };
    }

    findings.push(...stepResult.findings);
    recommendations.push(...stepResult.recommendations);
    if (stepResult.detail) {
      details[stepResult.detail.key] = stepResult.detail.value;
    }

    const partialResult: Partial<AgentResult> = {
      agentName: this._definition.name,
      status: 'success',
      findings: [...findings],
      recommendations: [...recommendations],
      details: { ...details },
      timestamp: new Date().toISOString(),
    };

    const checkpointId = `step-${stepIndex}`;
    const payload: CheckpointPayload = {
      checkpointId,
      mode: defaultMode,
      stepIndex,
      partialResult,
      contracts: publishContract?.(),
    };

    const verdict: SupervisorVerdict = yield payload;

    switch (verdict.type) {
      case 'APPROVE':
        stepIndex++;
        break;

      case 'RETRY': {
        retryInstructions = verdict.instructions;
        const stepFindingCount = stepResult.findings.length;
        const stepRecoCount = stepResult.recommendations.length;
        if (stepFindingCount > 0) findings.splice(-stepFindingCount, stepFindingCount);
        if (stepRecoCount > 0) recommendations.splice(-stepRecoCount, stepRecoCount);
        if (stepResult.detail) delete details[stepResult.detail.key];
        break;
      }

      case 'HANDOFF':
        return null;

      case 'ESCALATE':
        throw new EscalationError(verdict.reason ?? 'Escalated by supervisor', verdict);
    }
  }

  return {
    agentName: this._definition.name,
    status: 'success',
    findings,
    recommendations,
    details,
    timestamp: new Date().toISOString(),
  };
}
