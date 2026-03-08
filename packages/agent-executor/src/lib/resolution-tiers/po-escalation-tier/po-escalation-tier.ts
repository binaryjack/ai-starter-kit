import type { ChatRenderer } from '../../chat-renderer.js'
import type { IModelRouter } from '../../model-router/index.js'
import type { DecisionOption, PendingDecision, ResolutionTier } from '../resolution-tiers.types.js'
import './prototype/index.js'

export interface IPOEscalationTier extends ResolutionTier {
  _renderer: ChatRenderer;
  _modelRouter?: IModelRouter;
  canHandle(pending: PendingDecision): boolean;
  resolve(pending: PendingDecision): Promise<DecisionOption | null>;
}

export const POEscalationTier = function(
  this: IPOEscalationTier,
  renderer: ChatRenderer,
  modelRouter?: IModelRouter,
) {
  this._renderer = renderer;
  this._modelRouter = modelRouter;
} as unknown as {
  new(renderer: ChatRenderer, modelRouter?: IModelRouter): IPOEscalationTier;
};
