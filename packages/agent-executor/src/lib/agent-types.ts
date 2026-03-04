/**
 * JSON-driven agent definition schema.
 * An agent is fully described by a JSON file - no TypeScript required to add new agents.
 */

export type CheckType =
  | 'file-exists'      // Does a file or directory exist?
  | 'count-dirs'       // Count sub-directories in a path
  | 'count-files'      // Count files matching a glob pattern
  | 'json-field'       // Read a field from a JSON file
  | 'json-has-key'     // Does a JSON file contain a specific key?
  | 'grep'             // Does any file content match a string or pattern?
  | 'dir-exists'       // Does a directory exist?

export interface CheckDefinition {
  /** The type of check to perform */
  type: CheckType;

  /** Path to the file or directory to check (relative to projectRoot) */
  path: string;

  /** For json-field: dot-notation path into the JSON e.g. "dependencies" or "compilerOptions.strict" */
  field?: string;

  /** For grep: the string to search for */
  pattern?: string;

  /** For count-files: glob pattern e.g. "**\/*.test.ts" */
  glob?: string;

  /** Message when the check passes. Use {count} or {value} as placeholders */
  pass?: string;

  /** Message when the check fails */
  fail?: string;

  /** Severity when the check fails: info (default), warning, error */
  failSeverity?: 'info' | 'warning' | 'error';

  /** Recommendations to add regardless of pass/fail */
  recommendations?: string[];

  /** Recommendations to add only when check fails */
  failRecommendations?: string[];

  /** Recommendations to add only when check passes */
  passRecommendations?: string[];
}

export interface AgentDefinition {
  /** Display name shown in CLI output */
  name: string;

  /** Icon shown in CLI output */
  icon: string;

  /** Short description of what this agent checks */
  description: string;

  /** Ordered list of checks to execute */
  checks: CheckDefinition[];
}

// ─── Agent Result ─────────────────────────────────────────────────────────────

/**
 * Output produced when an agent (or lane) finishes running its checks.
 * Used as the return value of a completed SupervisedAgent generator.
 */
export interface AgentResult {
  agentName: string;
  status: 'success' | 'error';
  findings: string[];
  recommendations: string[];
  details: Record<string, unknown>;
  timestamp: string;
}
