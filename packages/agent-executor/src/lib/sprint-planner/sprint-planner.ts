import type { IBacklogBoard } from './backlog/index.js';
import type { IChatRenderer } from './chat-renderer/index.js';
import type { IModelRouter } from './model-router/index.js';
import type { PlanDefinition, DiscoveryResult } from './plan-types.js';
import { run } from './prototype/index.js';

export interface ISprintPlanner {
  new(renderer: IChatRenderer, projectRoot: string, modelRouter?: IModelRouter): ISprintPlanner;
  // Private state
  _renderer:     IChatRenderer;
  _projectRoot:  string;
  _modelRouter?: IModelRouter;
  // Public API
  run(plan: PlanDefinition, discovery: DiscoveryResult, board: IBacklogBoard): Promise<void>;
}

export const SprintPlanner = function(
  this: ISprintPlanner,
  renderer: IChatRenderer,
  projectRoot: string,
  modelRouter?: IModelRouter,
) {
  this._renderer     = renderer;
  this._projectRoot  = projectRoot;
  this._modelRouter  = modelRouter;
} as unknown as ISprintPlanner;

Object.assign(SprintPlanner.prototype, { run });
