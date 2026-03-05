/**
 * Unit tests for distillation.ts
 * fs/promises and fs.existsSync are mocked to avoid real disk I/O.
 */

import * as path from 'path'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  readFile: jest.fn().mockResolvedValue('{}'),
}));

// existsSync is called from the 'fs' default import (not fs/promises)
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
}));

import * as fsSync from 'fs'
import * as fsMock from 'fs/promises'

const mockMkdir = fsMock.mkdir as jest.Mock;
const mockWriteFile = fsMock.writeFile as jest.Mock;
const mockReaddir = fsMock.readdir as jest.Mock;
const mockReadFile = fsMock.readFile as jest.Mock;
const mockExistsSync = fsSync.existsSync as jest.Mock;

// ─── Import module under test ─────────────────────────────────────────────────

import { buildExamplesBlock, loadExamples, saveExample } from '../lib/distillation.js'

// ─── Tests ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = '/fake-project';

beforeEach(() => {
  jest.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockReaddir.mockResolvedValue([]);
});

describe('saveExample()', () => {
  it('creates the target directory with recursive=true', async () => {
    await saveExample('code-review', 'run-1', { prompt: 'p', response: 'r' }, { projectRoot: PROJECT_ROOT });

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining(path.join('.agents', 'examples', 'code-review')),
      { recursive: true }
    );
  });

  it('writes a JSON file at the correct path', async () => {
    await saveExample('code-review', 'run-1', { prompt: 'p', response: 'r' }, { projectRoot: PROJECT_ROOT });

    const [writePath, content] = mockWriteFile.mock.calls[0] as [string, string, string];
    expect(writePath).toContain('run-1.json');
    const parsed = JSON.parse(content);
    expect(parsed.prompt).toBe('p');
    expect(parsed.response).toBe('r');
  });

  it('includes score in saved record when provided', async () => {
    await saveExample('code-review', 'run-1', { prompt: 'p', response: 'r' }, { score: 0.9, projectRoot: PROJECT_ROOT });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(content);
    expect(parsed.score).toBe(0.9);
  });

  it('sanitises taskType path segment (slash → underscore)', async () => {
    await saveExample('code/review', 'run-1', { prompt: 'p', response: 'r' }, { projectRoot: PROJECT_ROOT });

    const [writePath] = mockWriteFile.mock.calls[0] as [string, string, string];
    expect(writePath).toContain('code_review');
    expect(writePath).not.toContain('code/review');
  });

  it('sanitises runId (special chars → underscore)', async () => {
    await saveExample('review', 'run:special!id', { prompt: 'p', response: 'r' }, { projectRoot: PROJECT_ROOT });

    const [writePath] = mockWriteFile.mock.calls[0] as [string, string, string];
    expect(writePath).toContain('run_special_id.json');
  });

  it('includes metadata when provided', async () => {
    await saveExample('review', 'run-1', { prompt: 'p', response: 'r' }, { metadata: { lang: 'ts' }, projectRoot: PROJECT_ROOT });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(content);
    expect(parsed.metadata).toEqual({ lang: 'ts' });
  });
});

describe('loadExamples()', () => {
  it('returns [] when directory does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const results = await loadExamples('code-review', { projectRoot: PROJECT_ROOT });
    expect(results).toEqual([]);
  });

  it('returns [] on readdir error', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockRejectedValue(new Error('EACCES'));
    const results = await loadExamples('code-review', { projectRoot: PROJECT_ROOT });
    expect(results).toEqual([]);
  });

  it('ignores non-.json files', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockResolvedValue(['run-1.json', 'notes.txt', 'run-2.json']);
    mockReadFile.mockResolvedValue(JSON.stringify({ prompt: 'p', response: 'r', taskType: 'review', runId: 'x', savedAt: '2024-01-01T00:00:00.000Z' }));

    const results = await loadExamples('review', { projectRoot: PROJECT_ROOT });
    // Only 2 .json files
    expect(results).toHaveLength(2);
  });

  it('filters by minScore', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockResolvedValue(['low.json', 'high.json']);

    const lowRecord = JSON.stringify({ prompt: 'p', response: 'r', taskType: 'review', runId: 'low', savedAt: '2024-01-01T00:00:00.000Z', score: 0.4 });
    const highRecord = JSON.stringify({ prompt: 'p', response: 'r', taskType: 'review', runId: 'high', savedAt: '2024-01-02T00:00:00.000Z', score: 0.9 });

    mockReadFile
      .mockResolvedValueOnce(lowRecord)
      .mockResolvedValueOnce(highRecord);

    const results = await loadExamples('review', { minScore: 0.8, projectRoot: PROJECT_ROOT });
    expect(results).toHaveLength(1);
    expect(results[0]?.runId).toBe('high');
  });

  it('respects limit option', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockResolvedValue(['a.json', 'b.json', 'c.json', 'd.json']);
    mockReadFile.mockResolvedValue(JSON.stringify({ prompt: 'p', response: 'r', taskType: 'review', runId: 'x', savedAt: '2024-01-01T00:00:00.000Z', score: 1.0 }));

    const results = await loadExamples('review', { limit: 2, projectRoot: PROJECT_ROOT });
    expect(results).toHaveLength(2);
  });

  it('default limit is 3', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockResolvedValue(['a.json', 'b.json', 'c.json', 'd.json', 'e.json']);
    mockReadFile.mockResolvedValue(JSON.stringify({ prompt: 'p', response: 'r', taskType: 'review', runId: 'x', savedAt: '2024-01-01T00:00:00.000Z', score: 1.0 }));

    const results = await loadExamples('review', { projectRoot: PROJECT_ROOT });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('sorts by score descending', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockResolvedValue(['low.json', 'high.json', 'mid.json']);

    const records = [
      { prompt: 'p', response: 'r', taskType: 'review', runId: 'low', savedAt: '2024-01-03T00:00:00.000Z', score: 0.3 },
      { prompt: 'p', response: 'r', taskType: 'review', runId: 'high', savedAt: '2024-01-01T00:00:00.000Z', score: 0.9 },
      { prompt: 'p', response: 'r', taskType: 'review', runId: 'mid', savedAt: '2024-01-02T00:00:00.000Z', score: 0.6 },
    ];

    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(records[0]))
      .mockResolvedValueOnce(JSON.stringify(records[1]))
      .mockResolvedValueOnce(JSON.stringify(records[2]));

    const results = await loadExamples('review', { limit: 3, projectRoot: PROJECT_ROOT });
    expect(results[0]?.runId).toBe('high');
    expect(results[1]?.runId).toBe('mid');
    expect(results[2]?.runId).toBe('low');
  });

  it('skips corrupt JSON files silently', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockResolvedValue(['valid.json', 'corrupt.json']);

    mockReadFile
      .mockResolvedValueOnce(JSON.stringify({ prompt: 'p', response: 'r', taskType: 'review', runId: 'valid', savedAt: '2024-01-01T00:00:00.000Z' }))
      .mockResolvedValueOnce('{invalid json{{');

    const results = await loadExamples('review', { projectRoot: PROJECT_ROOT });
    expect(results).toHaveLength(1);
    expect(results[0]?.runId).toBe('valid');
  });
});

describe('buildExamplesBlock()', () => {
  it('returns empty string when no examples saved', async () => {
    mockExistsSync.mockReturnValue(false);
    const block = await buildExamplesBlock('review', { projectRoot: PROJECT_ROOT });
    expect(block).toBe('');
  });

  it('wraps examples in <examples> XML tags', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockResolvedValue(['ex.json']);
    mockReadFile.mockResolvedValue(JSON.stringify({
      prompt: 'Write a function', response: 'function foo() {}',
      taskType: 'review', runId: 'ex', savedAt: '2024-01-01T00:00:00.000Z',
    }));

    const block = await buildExamplesBlock('review', { projectRoot: PROJECT_ROOT });
    expect(block).toMatch(/^<examples>/);
    expect(block).toMatch(/<\/examples>$/);
    expect(block).toContain('<example index="1">');
    expect(block).toContain('<prompt>');
    expect(block).toContain('<response>');
  });

  it('XML-escapes special characters in prompt/response', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockResolvedValue(['ex.json']);
    mockReadFile.mockResolvedValue(JSON.stringify({
      prompt: '<script>alert("xss")</script>',
      response: 'a & b',
      taskType: 'review', runId: 'ex', savedAt: '2024-01-01T00:00:00.000Z',
    }));

    const block = await buildExamplesBlock('review', { projectRoot: PROJECT_ROOT });
    expect(block).toContain('&lt;script&gt;');
    expect(block).toContain('&amp;');
    expect(block).not.toContain('<script>');
  });
});
