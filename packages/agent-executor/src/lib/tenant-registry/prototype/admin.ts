import * as fs from 'fs/promises'
import * as path from 'path'
import type { ITenantRunRegistry, TenantDeleteSummary, TenantExportSummary } from '../tenant-registry.js'

export async function listTenants(this: ITenantRunRegistry): Promise<string[]> {
  try {
    const entries = await fs.readdir(this.tenantsRoot, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function exportTenant(
  this: ITenantRunRegistry,
  tenantId: string | undefined,
  destDir: string,
): Promise<TenantExportSummary> {
  const tid = tenantId ?? this.tenantId;
  const srcRoot = path.join(this.tenantsRoot, tid);
  await fs.mkdir(destDir, { recursive: true });

  let runCount = 0;
  let totalBytes = 0;

  const copyDir = async (src: string, dest: string): Promise<void> => {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        const stat = await fs.stat(srcPath);
        totalBytes += stat.size;
        await fs.copyFile(srcPath, destPath);
      }
    }
  };

  try {
    await copyDir(srcRoot, destDir);
    const runIds = await fs.readdir(path.join(srcRoot, 'runs')).catch(() => []);
    runCount = runIds.length;
  } catch {
    // tenant has no data — that's fine
  }

  const summary: TenantExportSummary = {
    tenantId: tid,
    destDir,
    runCount,
    totalBytes,
    exportedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(destDir, 'export-manifest.json'),
    JSON.stringify(summary, null, 2),
    'utf-8',
  );

  return summary;
}

export async function deleteTenant(
  this: ITenantRunRegistry,
  tenantId: string | undefined,
): Promise<TenantDeleteSummary> {
  const tid = tenantId ?? this.tenantId;
  const tenantRoot = path.join(this.tenantsRoot, tid);

  let runCount = 0;
  let totalBytesFreed = 0;

  const measure = async (dir: string): Promise<void> => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await measure(p);
        } else {
          const stat = await fs.stat(p);
          totalBytesFreed += stat.size;
        }
      }
    } catch {
      // ignore if already gone
    }
  };

  try {
    const runsDir = path.join(tenantRoot, 'runs');
    const runIds = await fs.readdir(runsDir).catch(() => [] as string[]);
    runCount = runIds.length;
    await measure(tenantRoot);
  } catch {
    // no data
  }

  await fs.rm(tenantRoot, { recursive: true, force: true });

  return {
    tenantId: tid,
    runCount,
    totalBytesFreed,
    deletedAt: new Date().toISOString(),
  };
}
