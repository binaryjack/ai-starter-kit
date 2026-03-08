import { ModelRouter }                        from '../model-router.js';
import { registerProvider, autoRegister, useMock } from './register.js';
import { route, routeWithTools }             from './route.js';
import { streamRoute }                       from './stream-route.js';
import {
  _breakerFor,
  profileFor,
  modelIdFor,
  estimateCost,
  budgetCap,
  defaultProvider,
  registeredProviders,
  wrapAllProviders,
  withProviderOverride,
}                                            from './helpers.js';

Object.assign(ModelRouter.prototype, {
  registerProvider,
  autoRegister,
  useMock,
  profileFor,
  modelIdFor,
  estimateCost,
  route,
  routeWithTools,
  streamRoute,
  budgetCap,
  defaultProvider,
  registeredProviders,
  wrapAllProviders,
  withProviderOverride,
  _breakerFor,
});
