import * as path from 'path';
import { fileExists, listFilesRecursive, readFile } from './fs.js';
import { REQUIRED_FILES, FORBIDDEN_PATTERNS } from './constants.js';

export interface CheckResult {
  rule: string;
  pass: boolean;
  message: string;
}

const isKebabCase = (name: string): boolean => /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)*$/.test(name);

export const checkProject = async (projectDir: string): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];

  for (const rel of REQUIRED_FILES) {
    const full = path.join(projectDir, rel);
    const exists = await fileExists(full);
    results.push({
      rule: `required-file:${rel}`,
      pass: exists,
      message: exists ? '' : `Missing required file: ${rel}`,
    });
  }

  let allFiles: string[] = [];
  try {
    allFiles = await listFilesRecursive(projectDir);
  } catch {
    allFiles = [];
  }

  const sourceFiles = allFiles.filter((f) => {
    const rel = path.relative(projectDir, f);
    return !rel.startsWith('node_modules') && !rel.startsWith('.git');
  });

  for (const file of sourceFiles) {
    const name = path.basename(file);
    const ext = path.extname(name);
    const base = ext ? name.slice(0, -ext.length) : name;
    if (base && !isKebabCase(base)) {
      results.push({
        rule: 'naming:kebab-case',
        pass: false,
        message: `Non-kebab-case filename: ${path.relative(projectDir, file)}`,
      });
    }
  }

  const tsFiles = sourceFiles.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
  for (const file of tsFiles) {
    let content = '';
    try {
      content = await readFile(file);
    } catch {
      continue;
    }
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (content.includes(pattern)) {
        results.push({
          rule: `forbidden-pattern:${pattern.trim()}`,
          pass: false,
          message: `Found forbidden pattern "${pattern.trim()}" in ${path.relative(projectDir, file)}`,
        });
      }
    }
  }

  return results;
};
