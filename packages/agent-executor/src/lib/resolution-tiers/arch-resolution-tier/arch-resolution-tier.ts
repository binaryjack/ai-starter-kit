import type { IModelRouter } from '../../model-router/index.js';
import type { DecisionOption, PendingDecision, ResolutionTier } from '../resolution-tiers.types.js';
import './prototype/index.js';

export interface IArchResolutionTier extends ResolutionTier {
  _modelRouter?: IModelRouter;
  canHandle(pending: PendingDecision): boolean;
  resolve(pending: PendingDecision): Promise<DecisionOption | null>;
}

export const ArchResolutionTier = function(
  this: IArchResolutionTier,
  modelRouter?: IModelRouter,
) {
  this._modelRouter = modelRouter;
} as unknown as {
  new(modelRouter?: IModelRouter): IArchResolutionTier;
};
