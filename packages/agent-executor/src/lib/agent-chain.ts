import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentResult } from './types.js';
import { AgentDefinition, CheckDefinition } from './agent-types.js';

// ─────────────────────────────────────────────────────────────────────────────
// CHECK RUNNERS
// Each check type maps to a function that returns { message, passed, value }
// ─────────────────────────────────────────────────────────────────────────────

interface CheckResult {
  passed: boolean;
  value?: string | number;
}

async function runCheck(check: CheckDefinition, projectRoot: string): Promise<CheckResult> {
  const fullPath = path.join(projectRoot, check.path);

  switch (check.type) {
    case 'file-exists':
    case 'dir-exists': {
      try {
        await fs.access(fullPath);
        return { passed: true };
      } catch {
        return { passed: false };
      }
    }

    case 'count-dirs': {
      try {
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const dirs = entries.filter((e) => e.isDirectory());
        return { passed: dirs.length > 0, value: dirs.length };
      } catch {
        return { passed: false, value: 0 };
      }
    }

    case 'count-files': {
      try {
        const glob = check.glob ?? '**/*';
        const entries = (await fs.readdir(fullPath, { recursive: true })) as string[];
        const ext = glob.replace('**/*', '').replace('*', '');
        const matched = entries.filter((f) => typeof f === 'string' && f.endsWith(ext));
        return { passed: matched.length > 0, value: matched.length };
      } catch {
        return { passed: false, value: 0 };
      }
    }

    case 'json-field': {
      try {
        const raw = await fs.readFile(fullPath, 'utf-8');
        const json = JSON.parse(raw);
        // Navigate dot-notation field e.g. "compilerOptions.strict"
        const parts = (check.field ?? '').split('.');
        let value: any = json;
        for (const part of parts) {
          value = value?.[part];
        }
        if (value === undefined || value === null) {
          return { passed: false };
        }
        if (typeof value === 'object') {
          const count = Object.keys(value).length;
          return { passed: count > 0, value: count };
        }
        return { passed: true, value: String(value) };
      } catch {
        return { passed: false };
      }
    }

    case 'json-has-key': {
      try {
        const raw = await fs.readFile(fullPath, 'utf-8');
        const json = JSON.parse(raw);
        const parts = (check.field ?? '').split('.');
        let value: any = json;
        for (const part of parts) {
          value = value?.[part];
        }
        return { passed: value !== undefined && value !== null };
      } catch {
        return { passed: false };
      }
    }

    case 'grep': {
      try {
        const entries = (await fs.readdir(fullPath, { recursive: true })) as string[];
        const pattern = check.pattern ?? '';
        for (const entry of entries) {
          if (typeof entry !== 'string') continue;
          const filePath = path.join(fullPath, entry);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            if (content.includes(pattern)) {
              return { passed: true, value: entry };
            }
          } catch {
            // Skip unreadable files
          }
        }
        return { passed: false };
      } catch {
        return { passed: false };
      }
    }

    default:
      return { passed: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE INTERPOLATION
// Replaces {count}, {value}, {path} in message strings
// ─────────────────────────────────────────────────────────────────────────────

function interpolate(template: string, result: CheckResult, check: CheckDefinition): string {
  return template
    .replace('{count}', String(result.value ?? 0))
    .replace('{value}', String(result.value ?? ''))
    .replace('{path}', check.path)
    .replace('{pattern}', check.pattern ?? '')
    .replace('{field}', check.field ?? '');
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY - runs a single JSON-defined agent
// ─────────────────────────────────────────────────────────────────────────────

export class JsonAgentStrategy {
  constructor(private readonly definition: AgentDefinition) {}

  get name(): string {
    return this.definition.name;
  }

  get icon(): string {
    return this.definition.icon;
  }

  async run(projectRoot: string): Promise<AgentResult> {
    const findings: string[] = [];
    const recommendations: string[] = [];
    const details: Record<string, unknown> = {};

    try {
      for (const check of this.definition.checks) {
        const result = await runCheck(check, projectRoot);

        // Build finding message
        const severityIcon =
          !result.passed && check.failSeverity === 'error'
            ? '❌'
            : !result.passed && check.failSeverity === 'warning'
              ? '⚠️ '
              : !result.passed
                ? 'ℹ️ '
                : '';

        if (result.passed && check.pass) {
          findings.push(interpolate(check.pass, result, check));
        } else if (!result.passed && check.fail) {
          findings.push(severityIcon + interpolate(check.fail, result, check));
        }

        // Collect recommendations
        if (check.recommendations) {
          recommendations.push(...check.recommendations.map((r) => interpolate(r, result, check)));
        }
        if (result.passed && check.passRecommendations) {
          recommendations.push(
            ...check.passRecommendations.map((r) => interpolate(r, result, check))
          );
        }
        if (!result.passed && check.failRecommendations) {
          recommendations.push(
            ...check.failRecommendations.map((r) => interpolate(r, result, check))
          );
        }

        // Store raw value in details
        if (result.value !== undefined) {
          details[check.path.replace(/\W+/g, '_')] = result.value;
        }
      }

      return {
        agentName: this.definition.name,
        status: 'success',
        findings,
        recommendations,
        details,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        agentName: this.definition.name,
        status: 'error',
        findings: [`❌ Agent failed: ${error}`],
        recommendations: [],
        details: { error: String(error) },
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN EXECUTOR - loads all JSON definitions and runs them in sequence
// ─────────────────────────────────────────────────────────────────────────────

export class AgentChainExecutor {
  private agents: JsonAgentStrategy[] = [];

  /** Add a strategy directly (code-defined agents e.g. Supervisor) */
  addStrategy(strategy: JsonAgentStrategy): this {
    this.agents.push(strategy);
    return this;
  }

  /** Load a single JSON definition file and register it */
  async loadFromFile(jsonPath: string): Promise<this> {
    const raw = await fs.readFile(jsonPath, 'utf-8');
    const definition: AgentDefinition = JSON.parse(raw);
    this.agents.push(new JsonAgentStrategy(definition));
    return this;
  }

  /** Load ALL .json files from a directory, sorted alphabetically */
  async loadFromDirectory(dir: string): Promise<this> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return this; // Directory doesn't exist - skip
    }

    const jsonFiles = entries
      .filter((f) => f.endsWith('.agent.json'))
      .sort()
      .map((f) => path.join(dir, f));

    for (const file of jsonFiles) {
      await this.loadFromFile(file);
    }

    return this;
  }

  /** Execute all agents in sequence, return all results */
  async execute(projectRoot: string): Promise<AgentResult[]> {
    const results: AgentResult[] = [];

    for (const agent of this.agents) {
      console.log(`${agent.icon}  ${agent.name} analyzing...`);
      const result = await agent.run(projectRoot);
      results.push(result);

      const status = result.status === 'success' ? '✅' : '❌';
      console.log(`   ${status} Complete (${result.findings.length} findings)\n`);
    }

    return results;
  }
}
