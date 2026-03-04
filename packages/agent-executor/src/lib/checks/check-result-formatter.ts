/**
 * CheckResultFormatter — converts a RawCheckResult into a StepResult.
 *
 * Pure function module; no I/O, no state.
 * Extracted from the bottom of the original runCheckStep() switch statement.
 */

import type { CheckDefinition } from '../agent-types.js';
import type { StepResult } from '../check-runner.js';
import type { RawCheckResult } from './check-handler.interface.js';

/**
 * Interpolate `{count}`, `{value}`, `{path}`, `{pattern}`, `{field}`
 * placeholders in a template string.
 */
export function interpolateTemplate(
  tpl: string,
  check: CheckDefinition,
  value: string | number | undefined,
): string {
  return tpl
    .replace('{count}',   String(value ?? 0))
    .replace('{value}',   String(value ?? ''))
    .replace('{path}',    check.path    ?? '')
    .replace('{pattern}', check.pattern ?? '')
    .replace('{field}',   check.field   ?? '');
}

/**
 * Return the severity icon prefix for a failed check.
 * Empty string when the check passed.
 */
function severityIcon(passed: boolean, check: CheckDefinition): string {
  if (passed) return '';
  if (check.failSeverity === 'error')   return '❌';
  if (check.failSeverity === 'warning') return '⚠️ ';
  return 'ℹ️ ';
}

/**
 * Build a StepResult from a RawCheckResult + the original CheckDefinition.
 *
 * @param raw     Result produced by ICheckHandler.execute()
 * @param check   The check definition (for message templates + recommendations)
 * @param retryInstructions  Copied verbatim if present
 */
export function formatCheckResult(
  raw: RawCheckResult,
  check: CheckDefinition,
  retryInstructions?: string,
): StepResult {
  const findings:        string[] = [];
  const recommendations: string[] = [];

  if (retryInstructions) {
    findings.push(`ℹ️ Retry context: ${retryInstructions}`);
  }

  // Append any pre-formatted extras from the handler (e.g. LLM narrative)
  if (raw.extraFindings)        findings.push(...raw.extraFindings);
  if (raw.extraRecommendations) recommendations.push(...raw.extraRecommendations);

  const interpolate = (tpl: string): string =>
    interpolateTemplate(tpl, check, raw.value);

  const icon = severityIcon(raw.passed, check);

  if (raw.passed && check.pass) {
    findings.push(interpolate(check.pass));
  } else if (!raw.passed && check.fail) {
    findings.push(icon + interpolate(check.fail));
  }

  if (check.recommendations) {
    recommendations.push(...check.recommendations.map(interpolate));
  }
  if (raw.passed && check.passRecommendations) {
    recommendations.push(...check.passRecommendations.map(interpolate));
  }
  if (!raw.passed && check.failRecommendations) {
    recommendations.push(...check.failRecommendations.map(interpolate));
  }

  return {
    findings,
    recommendations,
    detail: raw.detail ?? (
      raw.value !== undefined
        ? { key: (check.path ?? 'value').replace(/\W+/g, '_'), value: raw.value }
        : undefined
    ),
  };
}
