import * as fs from 'fs/promises';
import * as path from 'path';
import type { ICostTracker } from '../cost-tracker.js';

export async function save(this: ICostTracker, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  const filename = `cost-${this._runId}.json`;
  await fs.writeFile(
    path.join(outputDir, filename),
    JSON.stringify(this.summary(), null, 2),
    'utf-8',
  );
}
