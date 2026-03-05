/**
 * Integration tests for code-sandbox.ts
 *
 * These tests spawn REAL child processes using node.
 * They require Node.js to be on PATH — which it always is in this environment.
 *
 * Skip in environments where child process spawning is disallowed
 * by setting CODE_SANDBOX_SKIP_INTEGRATION=1.
 */

const SKIP = process.env['CODE_SANDBOX_SKIP_INTEGRATION'] === '1';
const itOrSkip = SKIP ? it.skip : it;

import { runCodeFencesInText, runInSandbox } from '../lib/code-sandbox.js'

describe('runInSandbox() — real process execution', () => {
  itOrSkip('runs a simple JS console.log and captures stdout', async () => {
    const result = await runInSandbox({
      code: 'console.log("hello-integration")',
      language: 'javascript',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello-integration');
    expect(result.timedOut).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  }, 15_000);

  itOrSkip('captures non-zero exit code', async () => {
    const result = await runInSandbox({
      code: 'process.exit(42)',
      language: 'javascript',
    });

    expect(result.exitCode).toBe(42);
  }, 15_000);

  itOrSkip('captures stderr output', async () => {
    const result = await runInSandbox({
      code: 'process.stderr.write("error-line\\n")',
      language: 'javascript',
    });

    expect(result.stderr).toContain('error-line');
  }, 15_000);

  itOrSkip('times out when script runs forever', async () => {
    const result = await runInSandbox({
      code: 'const now = Date.now(); while(Date.now() - now < 10000) {}',
      language: 'javascript',
      timeoutMs: 300,
    });

    expect(result.timedOut).toBe(true);
  }, 5_000);

  itOrSkip('handles multi-line scripts', async () => {
    const code = [
      'const arr = [1, 2, 3];',
      'const sum = arr.reduce((a, b) => a + b, 0);',
      'console.log(sum);',
    ].join('\n');

    const result = await runInSandbox({ code, language: 'javascript' });
    expect(result.stdout.trim()).toBe('6');
    expect(result.exitCode).toBe(0);
  }, 15_000);

  itOrSkip('handles syntax errors (non-zero exit, stderr populated)', async () => {
    const result = await runInSandbox({
      code: 'const @invalid = syntax error;',
      language: 'javascript',
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  }, 15_000);

  itOrSkip('env variables are passed to subprocess', async () => {
    const result = await runInSandbox({
      code: 'console.log(process.env.TEST_VAR)',
      language: 'javascript',
      env: { TEST_VAR: 'hello-env' },
    });

    expect(result.stdout.trim()).toBe('hello-env');
  }, 15_000);
});

describe('runCodeFencesInText() — real process execution', () => {
  itOrSkip('runs a single JS fence and returns summary', async () => {
    const text = '```javascript\nconsole.log("fence-test")\n```';
    const result = await runCodeFencesInText(text, 'javascript');

    expect(result).toContain('block 1');
    expect(result).toContain('exit=0');
    expect(result).toContain('fence-test');
  }, 15_000);

  itOrSkip('returns no-code message for plain text', async () => {
    const result = await runCodeFencesInText('No code blocks here.', 'javascript');
    expect(result).toContain('No code blocks found');
  }, 5_000);

  itOrSkip('runs multiple fences and reports each', async () => {
    const text = [
      '```javascript',
      'console.log("first")',
      '```',
      '',
      '```javascript',
      'console.log("second")',
      '```',
    ].join('\n');

    const result = await runCodeFencesInText(text, 'javascript');
    expect(result).toContain('block 1');
    expect(result).toContain('block 2');
    expect(result).toContain('first');
    expect(result).toContain('second');
  }, 20_000);
});
