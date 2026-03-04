import * as path from 'path';
import * as readline from 'readline';
import { copyTemplateFiles, fileExists } from '@tadeo/ai-kit-core';
import { TEMPLATE_DIR } from '@tadeo/ai-kit-core';

const ask = (question: string): Promise<string> =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });

export const runInit = async (): Promise<void> => {
  const dest = process.cwd();
  const src = TEMPLATE_DIR;
  const files = await copyTemplateFiles(src, dest, async (filePath: string) => {
    if (await fileExists(filePath)) {
      const answer = await ask(`Overwrite ${path.relative(dest, filePath)}? [y/N] `);
      return answer.toLowerCase() === 'y';
    }
    return true;
  });
  for (const f of files) {
    console.log(`created: ${path.relative(dest, f)}`);
  }
};
