import { checkProject, CheckResult } from '@tadeo/ai-kit-core';

export const runCheck = async (): Promise<void> => {
  const dest = process.cwd();
  const results: CheckResult[] = await checkProject(dest);
  let failed = false;
  for (const r of results) {
    if (r.pass) {
      console.log(`pass: ${r.rule}`);
    } else {
      console.error(`fail: ${r.rule} — ${r.message}`);
      failed = true;
    }
  }
  if (failed) {
    process.exit(1);
  }
};
