import { ModelRouter } from '../model-router.js'
import {
    _breakerFor,
    budgetCap,
    defaultProvider,
    estimateCost,
    modelIdFor,
    profileFor,
    registeredProviders,
    withProviderOverride,
    wrapAllProviders,
} from './helpers.js'
import { autoRegister, registerProvider, useMock } from './register.js'
import { route, routeWithTools } from './route.js'
import { streamRoute } from './stream-route.js'

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
