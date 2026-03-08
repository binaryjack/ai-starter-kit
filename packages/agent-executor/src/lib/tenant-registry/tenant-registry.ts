import * as path from 'path'
import './prototype/index.js'

export interface RunMeta {
  runId: string;
  tenantId: string;
  dagFile: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
}

export interface TenantExportSummary {
  tenantId: string;
  destDir: string;
  runCount: number;
  totalBytes: number;
  exportedAt: string;
}

export interface TenantDeleteSummary {
  tenantId: string;
  runCount: number;
  totalBytesFreed: number;
  deletedAt: string;
}

export interface ITenantRunRegistry {
  readonly tenantId: string;
  readonly tenantsRoot: string;
  readonly tenantRoot: string;
  readonly runsRoot: string;
  create(runId: string, dagFile: string): Promise<RunMeta>;
  complete(runId: string, status?: 'completed' | 'failed' | 'cancelled', result?: unknown): Promise<RunMeta>;
  appendEvent(runId: string, event: Record<string, unknown>): Promise<void>;
  get(runId: string): Promise<RunMeta>;
  delete(runId: string): Promise<void>;
  list(): Promise<string[]>;
  listActive(): Promise<RunMeta[]>;
  purgeOld(maxAgeDays: number): Promise<number>;
  listTenants(): Promise<string[]>;
  exportTenant(tenantId: string | undefined, destDir: string): Promise<TenantExportSummary>;
  deleteTenant(tenantId: string | undefined): Promise<TenantDeleteSummary>;
  _runDir(runId: string): string;
  _configPath(runId: string): string;
}

export const TenantRunRegistry = function(
  this: { tenantId: string; tenantsRoot: string; tenantRoot: string; runsRoot: string },
  projectRoot: string,
  tenantId?: string,
) {
  this.tenantId    = tenantId ?? process.env['AIKIT_TENANT_ID'] ?? 'default';
  this.tenantsRoot = path.join(projectRoot, '.agents', 'tenants');
  this.tenantRoot  = path.join(this.tenantsRoot, this.tenantId);
  this.runsRoot    = path.join(this.tenantRoot, 'runs');
} as unknown as {
  new(projectRoot: string, tenantId?: string): ITenantRunRegistry;
};
