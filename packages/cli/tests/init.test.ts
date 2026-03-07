import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('@ai-agencee/ai-kit-core', () => ({
  copyTemplateFiles: jest.fn(),
  fileExists: jest.fn(),
  TEMPLATE_DIR: '/fake/template',
}));

import { copyTemplateFiles, fileExists } from '@ai-agencee/core';

const mockCopy = copyTemplateFiles as jest.MockedFunction<typeof copyTemplateFiles>;
const mockExists = fileExists as jest.MockedFunction<typeof fileExists>;

describe('runInit', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-kit-init-test-'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    mockExists.mockResolvedValue(false);
    mockCopy.mockResolvedValue([path.join(tmpDir, '.github/copilot-instructions.md')]);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    jest.clearAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls copyTemplateFiles with correct arguments', async () => {
    const { runInit } = await import('../src/commands/init.js');
    await runInit();
    expect(mockCopy).toHaveBeenCalledWith('/fake/template', tmpDir, expect.any(Function));
  });

  it('confirm returns true when file does not exist', async () => {
    mockExists.mockResolvedValue(false);
    let capturedConfirm: ((p: string) => Promise<boolean>) | undefined;
    mockCopy.mockImplementation(async (_src, _dest, confirm) => {
      capturedConfirm = confirm;
      return [];
    });
    const { runInit } = await import('../src/commands/init.js');
    await runInit();
    expect(capturedConfirm).toBeDefined();
    const result = await capturedConfirm!(path.join(tmpDir, 'new-file.md'));
    expect(result).toBe(true);
  });
});
