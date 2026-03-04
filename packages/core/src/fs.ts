import * as fs from 'fs';
import * as path from 'path';

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const readFile = async (filePath: string): Promise<string> =>
  fs.promises.readFile(filePath, 'utf8');

export const writeFile = async (filePath: string, content: string): Promise<void> => {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, 'utf8');
};

export const listFilesRecursive = async (dir: string): Promise<string[]> => {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFilesRecursive(full);
      files.push(...nested);
    } else {
      files.push(full);
    }
  }
  return files;
};

export const copyTemplateFiles = async (
  src: string,
  dest: string,
  confirm: (filePath: string) => Promise<boolean>,
): Promise<string[]> => {
  const allFiles = await listFilesRecursive(src);
  const copied: string[] = [];
  for (const srcFile of allFiles) {
    const rel = path.relative(src, srcFile);
    const destFile = path.join(dest, rel);
    const shouldWrite = await confirm(destFile);
    if (shouldWrite) {
      const content = await readFile(srcFile);
      await writeFile(destFile, content);
      copied.push(destFile);
    }
  }
  return copied;
};

export interface SyncResult {
  path: string;
  status: 'updated' | 'ok' | 'diverged';
}

export const syncTemplateFiles = async (
  src: string,
  dest: string,
): Promise<SyncResult[]> => {
  const allFiles = await listFilesRecursive(src);
  const results: SyncResult[] = [];
  for (const srcFile of allFiles) {
    const rel = path.relative(src, srcFile);
    const destFile = path.join(dest, rel);
    const srcContent = await readFile(srcFile);
    if (await fileExists(destFile)) {
      const destContent = await readFile(destFile);
      if (destContent === srcContent) {
        results.push({ path: destFile, status: 'ok' });
      } else {
        await writeFile(destFile, srcContent);
        results.push({ path: destFile, status: 'diverged' });
      }
    } else {
      await writeFile(destFile, srcContent);
      results.push({ path: destFile, status: 'updated' });
    }
  }
  return results;
};
