/**
 * Integration tests for distillation.ts — uses a real temp directory.
 *
 * These tests do NOT mock fs. They write and read real files to ensure
 * the full round-trip (save → load → buildExamplesBlock) works correctly.
 */

import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import { buildExamplesBlock, loadExamples, saveExample } from '../../src/lib/distillation.js'

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'distillation-test-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('saveExample → loadExamples round-trip', () => {
  it('stores and retrieves a single example', async () => {
    await saveExample(
      'code-review',
      'run-001',
      { prompt: 'Review this code', response: 'Looks good!' },
      { score: 0.9, projectRoot: tempDir }
    );

    const examples = await loadExamples('code-review', { projectRoot: tempDir });
    expect(examples).toHaveLength(1);
    expect(examples[0]?.prompt).toBe('Review this code');
    expect(examples[0]?.response).toBe('Looks good!');
    expect(examples[0]?.score).toBe(0.9);
    expect(examples[0]?.runId).toBe('run-001');
  });

  it('taskType matches the retrieved record', async () => {
    await saveExample('security-review', 'run-s1', { prompt: 'p', response: 'r' }, { projectRoot: tempDir });
    const examples = await loadExamples('security-review', { projectRoot: tempDir });
    expect(examples[0]?.taskType).toBe('security-review');
  });

  it('savedAt is a valid ISO date string', async () => {
    await saveExample('review', 'run-1', { prompt: 'p', response: 'r' }, { projectRoot: tempDir });
    const examples = await loadExamples('review', { projectRoot: tempDir });
    expect(() => new Date(examples[0]?.savedAt ?? '')).not.toThrow();
    expect(new Date(examples[0]?.savedAt ?? '').toISOString()).toBe(examples[0]?.savedAt);
  });

  it('multiple saves → loadExamples returns all (up to limit)', async () => {
    await saveExample('review', 'run-a', { prompt: 'pa', response: 'ra' }, { score: 0.8, projectRoot: tempDir });
    await saveExample('review', 'run-b', { prompt: 'pb', response: 'rb' }, { score: 0.6, projectRoot: tempDir });
    await saveExample('review', 'run-c', { prompt: 'pc', response: 'rc' }, { score: 0.9, projectRoot: tempDir });

    const examples = await loadExamples('review', { limit: 10, projectRoot: tempDir });
    expect(examples).toHaveLength(3);
  });

  it('sorts by score descending', async () => {
    await saveExample('review', 'run-low', { prompt: 'p', response: 'r' }, { score: 0.3, projectRoot: tempDir });
    await saveExample('review', 'run-high', { prompt: 'p', response: 'r' }, { score: 0.9, projectRoot: tempDir });
    await saveExample('review', 'run-mid', { prompt: 'p', response: 'r' }, { score: 0.6, projectRoot: tempDir });

    const examples = await loadExamples('review', { limit: 10, projectRoot: tempDir });
    expect(examples[0]?.runId).toBe('run-high');
    expect(examples[1]?.runId).toBe('run-mid');
    expect(examples[2]?.runId).toBe('run-low');
  });

  it('minScore filter excludes low-scoring examples', async () => {
    await saveExample('review', 'low', { prompt: 'p', response: 'r' }, { score: 0.4, projectRoot: tempDir });
    await saveExample('review', 'high', { prompt: 'p', response: 'r' }, { score: 0.95, projectRoot: tempDir });

    const examples = await loadExamples('review', { minScore: 0.8, projectRoot: tempDir });
    expect(examples).toHaveLength(1);
    expect(examples[0]?.runId).toBe('high');
  });

  it('limit=1 returns only the best example', async () => {
    await saveExample('review', 'r1', { prompt: 'p', response: 'r' }, { score: 0.5, projectRoot: tempDir });
    await saveExample('review', 'r2', { prompt: 'p', response: 'r' }, { score: 0.99, projectRoot: tempDir });

    const examples = await loadExamples('review', { limit: 1, projectRoot: tempDir });
    expect(examples).toHaveLength(1);
    expect(examples[0]?.runId).toBe('r2');
  });
});

describe('buildExamplesBlock integration', () => {
  it('returns empty string when no examples exist', async () => {
    const block = await buildExamplesBlock('nonexistent-task', { projectRoot: tempDir });
    expect(block).toBe('');
  });

  it('returns valid XML wrapping when examples exist', async () => {
    await saveExample('xml-test', 'run-1', { prompt: 'Write code', response: 'const x = 1;' }, { projectRoot: tempDir });

    const block = await buildExamplesBlock('xml-test', { projectRoot: tempDir });
    expect(block).toMatch(/^<examples>/);
    expect(block).toMatch(/<\/examples>$/);
    expect(block).toContain('<example index="1">');
    expect(block).toContain('Write code');
    expect(block).toContain('const x = 1;');
  });

  it('XML-encodes angle brackets in prompt/response', async () => {
    await saveExample('xml-enc', 'run-e', { prompt: '<b>bold</b>', response: 'a & b' }, { projectRoot: tempDir });

    const block = await buildExamplesBlock('xml-enc', { projectRoot: tempDir });
    expect(block).toContain('&lt;b&gt;');
    expect(block).toContain('&amp;');
    expect(block).not.toContain('<b>');
  });

  it('numbers multiple examples starting at 1', async () => {
    await saveExample('numbered', 'r1', { prompt: 'p1', response: 'r1' }, { score: 1, projectRoot: tempDir });
    await saveExample('numbered', 'r2', { prompt: 'p2', response: 'r2' }, { score: 0.8, projectRoot: tempDir });

    const block = await buildExamplesBlock('numbered', { limit: 10, projectRoot: tempDir });
    expect(block).toContain('index="1"');
    expect(block).toContain('index="2"');
  });
});
