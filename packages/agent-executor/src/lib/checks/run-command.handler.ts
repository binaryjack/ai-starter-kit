import { exec }    from 'child_process';
import { promisify } from 'util';
import type { ICheckHandler, RawCheckResult } from './check-handler.interface.js';
import type { CheckContext } from './check-context.js';

const execAsync = promisify(exec);

// Locale-agnostic patterns that indicate a command was not found / not available.
// Covers: English (cmd.exe, PowerShell, bash), French (cmd.exe "n'est pas reconnu"),
// German ("wird nicht erkannt"), and ENOENT from Node's spawn.
const COMMAND_UNAVAILABLE_RE =
  /not recognized|command not found|no such file|n'est pas reconnu|wird nicht erkannt|introuvable|spawn.*enoent/i;

/**
 * Runs a shell command (`check.command`) in `projectRoot` with a 30-second
 * timeout, then evaluates the output against `passPattern` or `failPattern`.
 *
 * Edge-cases handled:
 *   - Non-zero exits from search-style commands: output is still evaluated
 *   - Command not available (any locale): treated as a soft skip, not a hard fail
 *   - Pattern evaluation uses stdout ONLY (stderr contains shell error messages
 *     that would cause false negatives on pattern checks)
 */
export class RunCommandHandler implements ICheckHandler {
  readonly type = 'run-command' as const;

  async execute(ctx: CheckContext): Promise<RawCheckResult> {
    const cmd = ctx.check.command ?? '';
    if (!cmd) {
      return {
        passed:       false,
        extraFindings: ['❌ run-command: no command specified'],
      };
    }

    try {
      let stdout = '';
      let stderr = '';

      try {
        const result = await execAsync(cmd, { cwd: ctx.projectRoot, timeout: 30_000 });
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (execErr: unknown) {
        // execAsync rejects on non-zero exit.  For search-style commands
        // (e.g. grep with passPattern/failPattern) the exit code is
        // meaningful (1 = no matches) — we still want to evaluate the output.
        if (
          execErr != null &&
          typeof execErr === 'object' &&
          'stdout' in execErr &&
          'stderr' in execErr
        ) {
          stdout = String((execErr as { stdout: string }).stdout);
          stderr = String((execErr as { stderr: string }).stderr);

          // If the combined output indicates the command was unavailable,
          // re-route to the outer catch for graceful skipping.
          const combinedErr  = (stdout + stderr).toLowerCase();
          const cmdName      = cmd.trim().split(/[\s|&]/)[0];
          const quotedCmd    = `'${cmdName.toLowerCase()}'`;
          const isUnavailable =
            COMMAND_UNAVAILABLE_RE.test(combinedErr) ||
            (combinedErr.includes(quotedCmd) && combinedErr.length < 600);

          if (isUnavailable) throw execErr;

          // No patterns to evaluate → treat non-zero exit as failure
          if (!ctx.check.passPattern && !ctx.check.failPattern) {
            return { passed: false, value: (stdout + stderr).trim().slice(0, 300) };
          }
        } else {
          throw execErr; // re-throw to outer catch for command-not-found handling
        }
      }

      // Evaluate patterns against stdout ONLY (stderr has shell error messages)
      const output = stdout.trim();
      const value  = (stdout + stderr).trim().slice(0, 500);

      let passed: boolean;
      if (ctx.check.passPattern) {
        passed = new RegExp(ctx.check.passPattern).test(output);
      } else if (ctx.check.failPattern) {
        passed = !new RegExp(ctx.check.failPattern).test(output);
      } else {
        passed = true; // ran without command-not-found error = pass
      }

      return { passed, value };
    } catch (err: unknown) {
      const msg = String(err);
      // Command not installed / not in PATH → skip rather than hard-fail
      const isCommandMissing =
        /not recognized|command not found|No such file or directory|ENOENT|spawn.*ENOENT|n'est pas reconnu|wird nicht erkannt|introuvable/i.test(
          msg,
        );

      if (isCommandMissing) {
        return {
          passed: true, // treat as skipped
          extraFindings: [
            `⚠️ run-command skipped (command not available): ${cmd.trim().split(' ')[0]}`,
          ],
        };
      }

      return { passed: false, value: msg.slice(0, 300) };
    }
  }
}
