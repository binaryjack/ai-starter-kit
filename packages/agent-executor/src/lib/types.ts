// Agent executor types and definitions
export type AgentType = 'business-analyst' | 'architecture' | 'backend' | 'frontend' | 'testing' | 'e2e' | 'supervisor';

export interface AgentContext {
  agentType: AgentType;
  featureName: string;
  spec?: string;
  previousOutput?: string;
  timestamp: number;
  sessionId: string;
}

export interface AgentOutput {
  agentType: AgentType;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  output: string;
  errors: string[];
  timestamp: number;
  nextAgent?: AgentType;
}

export interface WorkflowState {
  sessionId: string;
  featureName: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  agents: {
    [key in AgentType]?: AgentOutput;
  };
  approvals: {
    supervisor: boolean;
  };
  blockers: string[];
}

export interface AgentConfig {
  name: AgentType;
  displayName: string;
  description: string;
  predecessors: AgentType[];
  successors: AgentType[];
  requiresSupervisorApproval: boolean;
}

export interface AgentResult {
  agentName: string;
  status: 'success' | 'error';
  findings: string[];
  recommendations: string[];
  details: Record<string, unknown>;
  timestamp: string;
}

export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  'business-analyst': {
    name: 'business-analyst',
    displayName: 'Business Analyst',
    description: 'Breaks down specs into actionable features',
    predecessors: [],
    successors: ['architecture'],
    requiresSupervisorApproval: true,
  },
  architecture: {
    name: 'architecture',
    displayName: 'Architecture Agent',
    description: 'Designs system architecture and data models',
    predecessors: ['business-analyst'],
    successors: ['backend'],
    requiresSupervisorApproval: true,
  },
  backend: {
    name: 'backend',
    displayName: 'Backend Agent',
    description: 'Implements backend services and APIs',
    predecessors: ['architecture'],
    successors: ['frontend'],
    requiresSupervisorApproval: true,
  },
  frontend: {
    name: 'frontend',
    displayName: 'Frontend Agent',
    description: 'Implements frontend components and UI',
    predecessors: ['backend'],
    successors: ['testing'],
    requiresSupervisorApproval: true,
  },
  testing: {
    name: 'testing',
    displayName: 'Testing Agent',
    description: 'Creates comprehensive test suites',
    predecessors: ['frontend'],
    successors: ['e2e'],
    requiresSupervisorApproval: true,
  },
  e2e: {
    name: 'e2e',
    displayName: 'E2E Testing Agent',
    description: 'Implements end-to-end testing scenarios',
    predecessors: ['testing'],
    successors: [],
    requiresSupervisorApproval: true,
  },
  supervisor: {
    name: 'supervisor',
    displayName: 'Supervisor Agent',
    description: 'Quality gate enforcement and approval authority',
    predecessors: ['business-analyst', 'architecture', 'backend', 'frontend', 'testing', 'e2e'],
    successors: [],
    requiresSupervisorApproval: false,
  },
};
