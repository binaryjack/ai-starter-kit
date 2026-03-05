/**
 * Unit tests for code-sandbox.ts
 * child_process.spawn and fs/promises are mocked.
 */

import { EventEmitter } from 'events'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
  mkdtemp: jest.fn().mockResolvedValue('/tmp/aikit-sandbox-xxxx'),
}));

jest.mock('os', () => ({
  tmpdir: jest.fn().mockReturnValue('/tmp'),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface MockChildProcess {
  stdout: EventEmitter;
  stderr: EventEmitter;
  on: jest.Mock;
  kill: jest.Mock;
}

/**
 * Build a mock ChildProcess that emits stdout, stderr, then closes.
 */
function makeMockChild(
  stdout: string,
  stderr: string,
  exitCode: number,
  delayMs = 0
): MockChildProcess {
  const child: MockChildProcess = {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    on: jest.fn(),
    kill: jest.fn(),
  };

  // Simulate async data emission
  const emit = () => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    // Find and call the 'close' handler
    const closeCb = (child.on.mock.calls as [string, (...a: unknown[]) => void][]).find(([ev]) => ev === 'close')?.[1];
    if (closeCb) closeCb(exitCode);
  };

  if (delayMs > 0) {
    setTimeout(emit, delayMs);
  } else {
    setImmediate(emit);
  }

  return child;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

import { runCodeFencesInText, runInSandbox } from '../lib/code-sandbox.js'

beforeEach(() => {
  jest.clearAllMocks();
  (require('fs/promises') as { mkdtemp: jest.Mock }).mkdtemp.mockResolvedValue('/tmp/aikit-sandbox-xxxx');
  (require('fs/promises') as { mkdir: jest.Mock }).mkdir.mockResolvedValue(undefined);
  (require('fs/promises') as { writeFile: jest.Mock }).writeFile.mockResolvedValue(undefined);
  (require('fs/promises') as { rm: jest.Mock }).rm.mockResolvedValue(undefined);
});

describe('runInSandbox()', () => {
  it('returns stdout and exitCode 0 for a success case', async () => {
    const child = makeMockChild('hello\n', '', 0);
    mockSpawn.mockReturnValue(child);

    const result = await runInSandbox({ code: 'console.log("hello")', language: 'javascript' });

    expect(result.stdout).toBe('hello\n');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it('captures stderr', async () => {
    const child = makeMockChild('', 'oops', 1);
    mockSpawn.mockReturnValue(child);

    const result = await runInSandbox({ code: 'process.exit(1)', language: 'javascript' });

    expect(result.stderr).toBe('oops');
    expect(result.exitCode).toBe(1);
  });

  it('reports timedOut=true when child exceeds timeoutMs', async () => {
    const child = makeMockChild('', '', 0, 500);  // slow — won't close before timeout
    // Override: simulate that kill() then triggers close
    child.on.mockImplementation((ev: string, cb: (...a: unknown[]) => void) => {
      if (ev === 'close') {
        // close won't be called from makeMockChild (delayMs=500 > timeoutMs=50)
        // but SIGKILL forces it
        (child as unknown as { _closeCb: (...a: unknown[]) => void })._closeCb = cb;
      }
    });
    child.kill.mockImplementation(() => {
      const cb = (child as unknown as { _closeCb?: (...a: unknown[]) => void })._closeCb;
      if (cb) setImmediate(() => cb(null));
    });
    mockSpawn.mockReturnValue(child);

    const result = await runInSandbox({ code: 'while(true){}', language: 'javascript', timeoutMs: 50 });

    expect(result.timedOut).toBe(true);
  });

  it('reports truncated=true when output exceeds maxOutputBytes', async () => {
    const largeOutput = 'x'.repeat(100);
    const child = makeMockChild(largeOutput, '', 0);
    mockSpawn.mockReturnValue(child);

    const result = await runInSandbox({
      code: 'console.log("x".repeat(100))',
      language: 'javascript',
      maxOutputBytes: 10, // tiny limit
    });

    expect(result.truncated).toBe(true);
  });

  it('spawns node for javascript language', async () => {
    const child = makeMockChild('', '', 0);
    mockSpawn.mockReturnValue(child);

    await runInSandbox({ code: 'x', language: 'javascript' });

    expect(mockSpawn).toHaveBeenCalledWith('node', expect.any(Array), expect.any(Object));
  });

  it('spawns python3 for python language', async () => {
    const child = makeMockChild('', '', 0);
    mockSpawn.mockReturnValue(child);

    await runInSandbox({ code: 'print(1)', language: 'python' });

    expect(mockSpawn).toHaveBeenCalledWith('python3', expect.any(Array), expect.any(Object));
  });

  it('throws on unsupported language', async () => {
    await expect(
      runInSandbox({ code: 'puts "hello"', language: 'ruby' as never })
    ).rejects.toThrow(/ruby/i);
  });

  it('returns durationMs >= 0', async () => {
    const child = makeMockChild('', '', 0);
    mockSpawn.mockReturnValue(child);

    const result = await runInSandbox({ code: 'x', language: 'javascript' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles spawn error gracefully', async () => {
    // Create a child that ONLY fires 'error', never 'close'
    const errorChild: MockChildProcess = {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      on: jest.fn(),
      kill: jest.fn(),
    };
    errorChild.on.mockImplementation((ev: string, cb: (...a: unknown[]) => void) => {
      if (ev === 'error') setImmediate(() => cb(new Error('spawn ENOENT')));
      // 'close' never fires
    });
    mockSpawn.mockReturnValue(errorChild);

    const result = await runInSandbox({ code: '?', language: 'javascript' });
    expect(result.exitCode).toBe(1);
  });
});

describe('runCodeFencesInText()', () => {
  it('returns no-code-blocks message when no fences found', async () => {
    const result = await runCodeFencesInText('No code here.', 'javascript');
    expect(result).toContain('No code blocks found');
  });

  it('extracts and runs a single JS code fence', async () => {
    const child = makeMockChild('1\n', '', 0);
    mockSpawn.mockReturnValue(child);

    const text = '```javascript\nconsole.log(1)\n```';
    const result = await runCodeFencesInText(text, 'javascript');

    expect(result).toContain('block 1');
    expect(result).toContain('exit=0');
  });

  it('runs multiple code fences', async () => {
    mockSpawn
      .mockReturnValueOnce(makeMockChild('a\n', '', 0))
      .mockReturnValueOnce(makeMockChild('b\n', '', 0));

    const text = '```js\ncode1\n```\n\n```js\ncode2\n```';
    const result = await runCodeFencesInText(text, 'javascript');

    expect(result).toContain('block 1');
    expect(result).toContain('block 2');
  });

  it('includes stdout in result', async () => {
    const child = makeMockChild('my-output\n', '', 0);
    mockSpawn.mockReturnValue(child);

    const result = await runCodeFencesInText('```js\ncode\n```', 'javascript');
    expect(result).toContain('my-output');
  });
});
