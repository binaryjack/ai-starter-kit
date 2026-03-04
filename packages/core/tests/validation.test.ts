import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { checkProject } from '../src/validation';

describe('checkProject', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-kit-validation-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const writeFile = (rel: string, content: string) => {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };

  it('fails when required files are missing', async () => {
    const results = await checkProject(tmpDir);
    const failing = results.filter((r) => !r.pass);
    expect(failing.length).toBeGreaterThan(0);
    expect(failing.some((r) => r.rule.startsWith('required-file:'))).toBe(true);
  });

  it('passes required file check when file exists', async () => {
    writeFile('.github/copilot-instructions.md', '# AI rules');
    const results = await checkProject(tmpDir);
    const copilotCheck = results.find((r) => r.rule === 'required-file:.github/copilot-instructions.md');
    expect(copilotCheck?.pass).toBe(true);
  });

  it('detects forbidden pattern "class "', async () => {
    writeFile('src/my-component.ts', 'class MyComponent {}');
    const results = await checkProject(tmpDir);
    const found = results.find((r) => r.rule === 'forbidden-pattern:class');
    expect(found?.pass).toBe(false);
  });

  it('detects non-kebab-case filename', async () => {
    writeFile('src/myComponent.ts', 'const x = 1;');
    const results = await checkProject(tmpDir);
    const found = results.find((r) => r.rule === 'naming:kebab-case');
    expect(found?.pass).toBe(false);
  });

  it('passes for kebab-case filename', async () => {
    writeFile('src/my-component.ts', 'const x = 1;');
    const results = await checkProject(tmpDir);
    const namingFails = results.filter((r) => r.rule === 'naming:kebab-case' && !r.pass);
    expect(namingFails).toHaveLength(0);
  });
});
