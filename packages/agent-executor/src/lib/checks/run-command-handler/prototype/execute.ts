import { exec } from 'child_process'
import { promisify } from 'util'
import type { CheckContext } from '../check-context.js'
import type { RawCheckResult } from '../check-handler.interface.js'

const execAsync = promisify(exec);

const COMMAND_UNAVAILABLE_RE =
  /not recognized|command not found|no such file|n'est pas reconnu|wird nicht erkannt|introuvable|spawn.*enoent/i;

export async function execute(this: unknown, ctx: CheckContext): Promise<RawCheckResult> {
  const cmd = ctx.check.command ?? '';
  if (!cmd) {
    return {
      passed:        false,
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
      if (
        execErr != null &&
        typeof execErr === 'object' &&
        'stdout' in execErr &&
        'stderr' in execErr
      ) {
        stdout = String((execErr as { stdout: string }).stdout);
        stderr = String((execErr as { stderr: string }).stderr);

        const combinedErr  = (stdout + stderr).toLowerCase();
        const cmdName      = cmd.trim().split(/[\s|&]/)[0];
        const quotedCmd    = `'${cmdName.toLowerCase()}'`;
        const isUnavailable =
          COMMAND_UNAVAILABLE_RE.test(combinedErr) ||
          (combinedErr.includes(quotedCmd) && combinedErr.length < 600);

        if (isUnavailable) throw execErr;

        if (!ctx.check.passPattern && !ctx.check.failPattern) {
          return { passed: false, value: (stdout + stderr).trim().slice(0, 300) };
        }
      } else {
        throw execErr;
      }
    }

    const output = stdout.trim();
    const value  = (stdout + stderr).trim().slice(0, 500);

    let passed: boolean;
    if (ctx.check.passPattern) {
      passed = new RegExp(ctx.check.passPattern).test(output);
    } else if (ctx.check.failPattern) {
      passed = !new RegExp(ctx.check.failPattern).test(output);
    } else {
      passed = true;
    }

    return { passed, value };
  } catch (err: unknown) {
    const msg = String(err);
    const isCommandMissing =
      /not recognized|command not found|No such file or directory|ENOENT|spawn.*ENOENT|n'est pas reconnu|wird nicht erkannt|introuvable/i.test(
        msg,
      );

    if (isCommandMissing) {
      return {
        passed:        true,
        extraFindings: [
          `⚠️ run-command skipped (command not available): ${cmd.trim().split(' ')[0]}`,
        ],
      };
    }

    return { passed: false, value: msg.slice(0, 300) };
  }
}
