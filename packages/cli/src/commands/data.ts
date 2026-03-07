/**
 * E4 — GDPR Data Portability & Erasure CLI commands
 *
 * Provides three commands for enterprise compliance officers and DPAs:
 *
 *   ai-kit data:export   [--tenant <id>] --dest <dir>
 *     Copy all run data for the tenant to a destination directory.
 *     Prints an export receipt (GDPR Art. 20 — Right to Data Portability).
 *
 *   ai-kit data:delete   [--tenant <id>] [--confirm]
 *     Permanently purge all run data for the tenant.
 *     Requires --confirm flag to prevent accidental erasure (GDPR Art. 17).
 *     Prints a deletion receipt with file count and bytes freed.
 *
 *   ai-kit data:list-tenants
 *     List all tenant IDs present in .agents/tenants/.
 *
 * The command resolves the project root by walking up from cwd looking for
 * package.json (same heuristic used by the rest of the CLI).
 */

import { TenantRunRegistry } from '@ai-agencee/engine';
import * as fs from 'fs/promises';
import * as path from 'path';

// ─── Project root resolution ──────────────────────────────────────────────────

async function findProjectRoot(startDir: string): Promise<string> {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    try {
      await fs.stat(path.join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return startDir; // fall back to cwd
}

// ─── data:export ──────────────────────────────────────────────────────────────

export interface DataExportOptions {
  tenant?: string;
  dest: string;
}

export async function runDataExport(options: DataExportOptions): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  const registry = new TenantRunRegistry(projectRoot, options.tenant);
  const tenantId = options.tenant ?? registry.tenantId;
  const destDir = path.resolve(options.dest);

  console.log(`Exporting data for tenant "${tenantId}" → ${destDir} …`);

  try {
    const summary = await registry.exportTenant(tenantId, destDir);

    console.log(`\n✓ Export complete`);
    console.log(`  Tenant  : ${summary.tenantId}`);
    console.log(`  Runs    : ${summary.runCount}`);
    console.log(`  Bytes   : ${formatBytes(summary.totalBytes)}`);
    console.log(`  Location: ${summary.destDir}`);
    console.log(`  Time    : ${summary.exportedAt}`);
    console.log(`\nAudit receipt written to ${path.join(destDir, 'export-manifest.json')}`);
  } catch (err) {
    console.error(`Error during export: ${String(err)}`);
    process.exit(1);
  }
}

// ─── data:delete ──────────────────────────────────────────────────────────────

export interface DataDeleteOptions {
  tenant?: string;
  confirm?: boolean;
}

export async function runDataDelete(options: DataDeleteOptions): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  const registry = new TenantRunRegistry(projectRoot, options.tenant);
  const tenantId = options.tenant ?? registry.tenantId;

  if (!options.confirm) {
    console.error(
      `Error: This will permanently delete ALL data for tenant "${tenantId}".\n`
      + `Re-run with --confirm to proceed.\n`
      + `Tip: Run data:export first to create a backup.`,
    );
    process.exit(1);
  }

  console.log(`Deleting all data for tenant "${tenantId}" …`);

  try {
    const summary = await registry.deleteTenant(tenantId);

    console.log(`\n✓ Deletion complete (GDPR Art. 17 — Right to Erasure)`);
    console.log(`  Tenant       : ${summary.tenantId}`);
    console.log(`  Runs deleted : ${summary.runCount}`);
    console.log(`  Space freed  : ${formatBytes(summary.totalBytesFreed)}`);
    console.log(`  Deleted at   : ${summary.deletedAt}`);
    console.log(`\nRetain this output as your deletion receipt.`);
  } catch (err) {
    console.error(`Error during deletion: ${String(err)}`);
    process.exit(1);
  }
}

// ─── data:list-tenants ────────────────────────────────────────────────────────

export async function runDataListTenants(): Promise<void> {
  const projectRoot = await findProjectRoot(process.cwd());
  // Use "default" tenant just to get the tenantsRoot path
  const registry = new TenantRunRegistry(projectRoot);

  try {
    const tenants = await registry.listTenants();

    if (tenants.length === 0) {
      console.log('No tenants found in .agents/tenants/');
      return;
    }

    console.log(`Found ${tenants.length} tenant(s):\n`);

    for (const tenantId of tenants) {
      const tenantReg = new TenantRunRegistry(projectRoot, tenantId);
      const runs = await tenantReg.list();
      console.log(`  ${tenantId}  (${runs.length} run${runs.length !== 1 ? 's' : ''})`);
    }
  } catch (err) {
    console.error(`Error listing tenants: ${String(err)}`);
    process.exit(1);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_024 * 1_024 * 1_024) return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
  return `${(bytes / (1_024 * 1_024 * 1_024)).toFixed(1)} GB`;
}
