import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('@ai-agencee/ai-kit-core', () => ({
  checkProject: jest.fn(),
}));

import type { CheckResult } from '@ai-agencee/core';
import { checkProject } from '@ai-agencee/core';

const mockCheck = checkProject as jest.MockedFunction<typeof checkProject>;

describe('runCheck', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-kit-check-test-'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    jest.clearAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits 0 when all checks pass', async () => {
    const results: CheckResult[] = [
      { rule: 'required-file:.github/copilot-instructions.md', pass: true, message: '' },
    ];
    mockCheck.mockResolvedValue(results);
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const { runCheck } = await import('../src/commands/check.js');
    await runCheck();
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it('exits 1 when a check fails', async () => {
    const results: CheckResult[] = [
      { rule: 'required-file:.github/copilot-instructions.md', pass: false, message: 'Missing file' },
    ];
    mockCheck.mockResolvedValue(results);
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1'); });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { runCheck } = await import('../src/commands/check.js');
    await expect(runCheck()).rejects.toThrow('exit:1');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
