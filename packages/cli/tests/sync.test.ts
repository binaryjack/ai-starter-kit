import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('@ai-agencee/ai-kit-core', () => ({
  syncTemplateFiles: jest.fn(),
  TEMPLATE_DIR: '/fake/template',
}));

import type { SyncResult } from '@ai-agencee/core';
import { syncTemplateFiles } from '@ai-agencee/core';

const mockSync = syncTemplateFiles as jest.MockedFunction<typeof syncTemplateFiles>;

describe('runSync', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-kit-sync-test-'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    jest.clearAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls syncTemplateFiles and logs updated files', async () => {
    const results: SyncResult[] = [
      { path: path.join(tmpDir, '.github/copilot-instructions.md'), status: 'updated' },
    ];
    mockSync.mockResolvedValue(results);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { runSync } = await import('../src/commands/sync.js');
    await runSync();
    expect(mockSync).toHaveBeenCalledWith('/fake/template', tmpDir);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('synced:'));
    logSpy.mockRestore();
  });

  it('warns on diverged files', async () => {
    const results: SyncResult[] = [
      { path: path.join(tmpDir, 'src/.ai/rules.md'), status: 'diverged' },
    ];
    mockSync.mockResolvedValue(results);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { runSync } = await import('../src/commands/sync.js');
    await runSync();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('diverged:'));
    warnSpy.mockRestore();
  });
});
