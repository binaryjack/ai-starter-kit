import type { ContractSnapshot } from './dag-types.js';
import {
  publish,
  getSnapshot,
  getVersion,
  has,
  publishedLanes,
  getAll,
  formatStatus,
  clear,
  waitForVersion,
  waitForAll,
} from './prototype/index.js';

export interface IContractRegistry {
  new(): IContractRegistry;
  // Private state
  _snapshots: Map<string, ContractSnapshot>;
  _versions:  Map<string, number>;
  // Public API
  publish(laneId: string, snapshot: Omit<ContractSnapshot, 'version' | 'timestamp'>): ContractSnapshot;
  getSnapshot(laneId: string): ContractSnapshot | undefined;
  getVersion(laneId: string): number;
  has(laneId: string): boolean;
  publishedLanes(): string[];
  getAll(): Map<string, ContractSnapshot>;
  waitForVersion(laneId: string, minVersion: number, timeoutMs: number, pollIntervalMs?: number): Promise<ContractSnapshot | null>;
  waitForAll(laneIds: string[], timeoutMs: number): Promise<Map<string, ContractSnapshot | null>>;
  formatStatus(): string;
  clear(): void;
}

export const ContractRegistry = function(this: IContractRegistry) {
  this._snapshots = new Map();
  this._versions  = new Map();
} as unknown as IContractRegistry;

Object.assign(ContractRegistry.prototype, {
  publish,
  getSnapshot,
  getVersion,
  has,
  publishedLanes,
  getAll,
  formatStatus,
  clear,
  waitForVersion,
  waitForAll,
});
