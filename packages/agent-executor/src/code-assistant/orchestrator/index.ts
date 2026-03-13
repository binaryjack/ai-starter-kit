/**
 * Public barrel for the CodeAssistantOrchestrator module.
 *
 * The side-effect import of './prototype/index.js' is the only mechanism that
 * attaches methods to CodeAssistantOrchestrator.prototype.  It must come before
 * the named exports so consumers always receive a fully-wired instance.
 */

import './prototype/index.js';

export {
    CodeAssistantOrchestrator,
    createCodeAssistantOrchestrator
} from './code-assistant-orchestrator.js';

export type { ICodeAssistantOrchestrator } from './code-assistant-orchestrator.js';
