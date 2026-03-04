import { randomUUID } from 'crypto';
import { AgentContext, AgentOutput, AgentType, WorkflowState, AGENT_CONFIGS } from './types.js';
import { agentContext } from './context-manager.js';

export const workflowOrchestrator = {
  async createWorkflow(featureName: string, spec: string): Promise<WorkflowState> {
    const sessionId = randomUUID();
    const workflow: WorkflowState = {
      sessionId,
      featureName,
      status: 'pending',
      agents: {},
      approvals: {
        supervisor: false,
      },
      blockers: [],
    };

    await agentContext.saveWorkflowState(workflow);
    return workflow;
  },

  async getWorkflow(sessionId: string): Promise<WorkflowState | null> {
    return agentContext.loadWorkflowState(sessionId);
  },

  async getNextAgent(workflow: WorkflowState): Promise<AgentType | null> {
    const sequence: AgentType[] = [
      'business-analyst',
      'architecture',
      'backend',
      'frontend',
      'testing',
      'e2e',
    ];

    for (const agentType of sequence) {
      if (!workflow.agents[agentType]) {
        return agentType;
      }

      const output = workflow.agents[agentType];
      if (output && output.status !== 'completed') {
        return agentType;
      }
    }

    return null;
  },

  async updateAgentOutput(
    sessionId: string,
    output: AgentOutput
  ): Promise<WorkflowState> {
    const workflow = await agentContext.loadWorkflowState(sessionId);
    if (!workflow) {
      throw new Error(`Workflow ${sessionId} not found`);
    }

    workflow.agents[output.agentType] = output;

    if (output.status === 'failed') {
      workflow.status = 'failed';
      workflow.blockers.push(`${output.agentType} failed: ${output.errors.join(', ')}`);
    }

    if (output.errors.length > 0) {
      workflow.blockers.push(...output.errors.map((e) => `${output.agentType}: ${e}`));
    }

    await agentContext.saveWorkflowState(workflow);
    await agentContext.saveOutput(output, sessionId);

    return workflow;
  },

  async approveCheckpoint(sessionId: string, agentType: AgentType): Promise<WorkflowState> {
    const workflow = await agentContext.loadWorkflowState(sessionId);
    if (!workflow) {
      throw new Error(`Workflow ${sessionId} not found`);
    }

    const output = workflow.agents[agentType];
    if (!output) {
      throw new Error(`No output from ${agentType}`);
    }

    output.status = 'completed';
    workflow.approvals.supervisor = true;

    await agentContext.saveWorkflowState(workflow);
    return workflow;
  },

  async rejectCheckpoint(
    sessionId: string,
    agentType: AgentType,
    reason: string
  ): Promise<WorkflowState> {
    const workflow = await agentContext.loadWorkflowState(sessionId);
    if (!workflow) {
      throw new Error(`Workflow ${sessionId} not found`);
    }

    const output = workflow.agents[agentType];
    if (!output) {
      throw new Error(`No output from ${agentType}`);
    }

    output.status = 'pending';
    workflow.blockers.push(`Rejected by supervisor: ${reason}`);

    await agentContext.saveWorkflowState(workflow);
    return workflow;
  },

  async getWorkflowSummary(sessionId: string): Promise<string> {
    const workflow = await agentContext.loadWorkflowState(sessionId);
    if (!workflow) {
      return `Workflow ${sessionId} not found`;
    }

    const lines = [
      `# Workflow: ${workflow.featureName}`,
      `Session: ${sessionId}`,
      `Status: ${workflow.status}`,
      ``,
      `## Agent Progress`,
    ];

    const sequence: AgentType[] = [
      'business-analyst',
      'architecture',
      'backend',
      'frontend',
      'testing',
      'e2e',
    ];

    for (const agentType of sequence) {
      const output = workflow.agents[agentType];
      const status = output?.status ?? 'pending';
      const config = AGENT_CONFIGS[agentType];
      lines.push(`- ${config.displayName}: ${status}`);
    }

    if (workflow.blockers.length > 0) {
      lines.push(``, `## Blockers`);
      workflow.blockers.forEach((b) => lines.push(`- ${b}`));
    }

    return lines.join('\n');
  },
};
