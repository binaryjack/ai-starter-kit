import { PromptInjectionDetector } from '../prompt-injection-detector.js';
import { enforce, scan } from './methods.js';

Object.assign((PromptInjectionDetector as unknown as { prototype: object }).prototype, {
  scan, enforce,
});
