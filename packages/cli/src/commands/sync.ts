import * as path from 'path';
import { syncTemplateFiles, SyncResult } from '@tadeo/ai-kit-core';
import { TEMPLATE_DIR } from '@tadeo/ai-kit-core';

export const runSync = async (): Promise<void> => {
  const dest = process.cwd();
  const results: SyncResult[] = await syncTemplateFiles(TEMPLATE_DIR, dest);
  for (const r of results) {
    const rel = path.relative(dest, r.path);
    if (r.status === 'updated') {
      console.log(`synced: ${rel}`);
    } else if (r.status === 'diverged') {
      console.warn(`diverged: ${rel}`);
    } else {
      console.log(`ok: ${rel}`);
    }
  }
};
