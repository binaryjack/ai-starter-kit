import * as path from 'path';
import { TEMPLATE_DIR } from './constants.js';
import { listFilesRecursive, readFile } from './fs.js';

export interface TemplateFile {
  relativePath: string;
  content: string;
}

export const loadTemplateFiles = async (): Promise<TemplateFile[]> => {
  const files = await listFilesRecursive(TEMPLATE_DIR);
  const result: TemplateFile[] = [];
  for (const file of files) {
    const content = await readFile(file);
    result.push({ relativePath: path.relative(TEMPLATE_DIR, file), content });
  }
  return result;
};
