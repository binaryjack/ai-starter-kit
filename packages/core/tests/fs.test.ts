import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { copyTemplateFiles, fileExists, listFilesRecursive } from '../src/fs';

describe('copyTemplateFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-kit-fs-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies files from src to dest', async () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(path.join(src, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(src, 'a.md'), 'hello');
    fs.writeFileSync(path.join(src, 'sub', 'b.md'), 'world');

    const copied = await copyTemplateFiles(src, dest, async () => true);
    expect(copied).toHaveLength(2);
    expect(await fileExists(path.join(dest, 'a.md'))).toBe(true);
    expect(await fileExists(path.join(dest, 'sub', 'b.md'))).toBe(true);
  });

  it('skips files when confirm returns false', async () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'a.md'), 'hello');

    const copied = await copyTemplateFiles(src, dest, async () => false);
    expect(copied).toHaveLength(0);
  });

  it('listFilesRecursive returns all files', async () => {
    const dir = path.join(tmpDir, 'list');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.txt'), '');
    fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), '');
    const files = await listFilesRecursive(dir);
    expect(files).toHaveLength(2);
  });
});
