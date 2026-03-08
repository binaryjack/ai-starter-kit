import { RunAdvisor } from '../run-advisor.js';
import { _loadResults, _readManifest, analyse, formatReport } from './methods.js';

Object.assign((RunAdvisor as unknown as { prototype: object }).prototype, {
  analyse, formatReport, _readManifest, _loadResults,
});
