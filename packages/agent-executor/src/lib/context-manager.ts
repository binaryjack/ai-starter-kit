import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentContext, AgentOutput, WorkflowState } from './types.js';

const CONTEXT_DIR = path.join(process.cwd(), '.agents');
const RESULTS_DIR = path.join(CONTEXT_DIR, 'results');
const STATE_DIR = path.join(CONTEXT_DIR, 'state');

export const agentContext = {
  async ensureDirectories(): Promise<void> {
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    await fs.mkdir(STATE_DIR, { recursive: true });
  },

  async saveContext(context: AgentContext): Promise<string> {
    await this.ensureDirectories();
    const contextPath = path.join(CONTEXT_DIR, `context-${context.sessionId}.json`);
    await fs.writeFile(contextPath, JSON.stringify(context, null, 2));
    return contextPath;
  },

  async loadContext(sessionId: string): Promise<AgentContext | null> {
    try {
      const contextPath = path.join(CONTEXT_DIR, `context-${sessionId}.json`);
      const content = await fs.readFile(contextPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  },

  async saveOutput(output: AgentOutput, sessionId: string): Promise<string> {
    await this.ensureDirectories();
    const outputPath = path.join(RESULTS_DIR, `${sessionId}-${output.agentType}.json`);
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    return outputPath;
  },

  async loadOutput(sessionId: string, agentType: string): Promise<AgentOutput | null> {
    try {
      const outputPath = path.join(RESULTS_DIR, `${sessionId}-${agentType}.json`);
      const content = await fs.readFile(outputPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  },

  async saveWorkflowState(state: WorkflowState): Promise<string> {
    await this.ensureDirectories();
    const statePath = path.join(STATE_DIR, `workflow-${state.sessionId}.json`);
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    return statePath;
  },

  async loadWorkflowState(sessionId: string): Promise<WorkflowState | null> {
    try {
      const statePath = path.join(STATE_DIR, `workflow-${sessionId}.json`);
      const content = await fs.readFile(statePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  },

  async getAllOutputs(sessionId: string): Promise<Record<string, AgentOutput>> {
    const outputs: Record<string, AgentOutput> = {};
    try {
      const files = await fs.readdir(RESULTS_DIR);
      const sessionFiles = files.filter((f) => f.startsWith(`${sessionId}-`));
      for (const file of sessionFiles) {
        const content = await fs.readFile(path.join(RESULTS_DIR, file), 'utf-8');
        const output = JSON.parse(content) as AgentOutput;
        outputs[output.agentType] = output;
      }
    } catch {
      // Directory might not exist yet
    }
    return outputs;
  },

  async cleanupSession(sessionId: string): Promise<void> {
    try {
      const contextPath = path.join(CONTEXT_DIR, `context-${sessionId}.json`);
      await fs.unlink(contextPath);

      const files = await fs.readdir(RESULTS_DIR);
      const sessionFiles = files.filter((f) => f.startsWith(`${sessionId}-`));
      for (const file of sessionFiles) {
        await fs.unlink(path.join(RESULTS_DIR, file));
      }

      const statePath = path.join(STATE_DIR, `workflow-${sessionId}.json`);
      await fs.unlink(statePath);
    } catch {
      // Files might not exist
    }
  },
};
