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
  | 'run-command'      // Run a shell command and check exit code / output pattern
  | 'llm-generate'     // Generate content via LLM; stores result under outputKey
  | 'llm-review'       // Review a file or directory via LLM and report findings
  | 'llm-tool'         // LLM generation with full tool-use loop (read_file, list_dir, etc.)

export interface CheckDefinition {
  /** The type of check to perform */
  type: CheckType;

  /** Path to the file or directory to check (relative to projectRoot). Optional for shell/LLM checks. */
  path?: string;

  /** For json-field: dot-notation path into the JSON e.g. "dependencies" or "compilerOptions.strict" */
  field?: string;

  /** For json-has-key: the JSON key to check for existence (dot-notation). Alias for field. */
  key?: string;

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

  // ─── run-command ────────────────────────────────────────────────────────────

  /** Shell command to run (cwd = projectRoot, timeout = 30 s) */
  command?: string;

  /** Regex applied to stdout+stderr; check passes when it matches */
  passPattern?: string;

  /** Regex applied to stdout+stderr; check passes when it does NOT match */
  failPattern?: string;

  // ─── llm-generate / llm-review ──────────────────────────────────────────────

  /**
   * Prompt template sent to the LLM.
   * Placeholders: {content}, {path}, {retryContext}
   */
  prompt?: string;

  /** TaskType override for model routing (default: 'code-generation' / 'validation') */
  taskType?: string;

  /**
   * For llm-generate: key under which the LLM output is stored in
   * details / ContractExports for downstream lanes to read.
   */
  outputKey?: string;

  // ─── Tool use ──────────────────────────────────────────────────────────────

  /**
   * When `true`, enables the tool-use loop for `llm-generate`, `llm-review`,
   * or `llm-tool` checks.
   *
   * Built-in tools available: read_file, list_dir, run_shell, grep_project, write_file
   *
   * Requires a `ToolExecutorFn` to be present in the context (injected by the
   * `LaneExecutor` when tools are enabled on the DAG or lane).
   */
  enableTools?: boolean;

  /**
   * Subset of built-in tools to expose to this check.
   * When omitted (and `enableTools` is true), all built-in tools are available.
   * Values: 'read_file' | 'list_dir' | 'run_shell' | 'grep_project' | 'write_file'
   */
  toolNames?: string[];
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
