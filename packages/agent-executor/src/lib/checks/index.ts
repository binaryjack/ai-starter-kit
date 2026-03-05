/**
 * Checks barrel — re-exports all check infrastructure.
 */

// ─── Context + Interface ──────────────────────────────────────────────────────
export type { CheckContext } from './check-context.js'
export type { ICheckHandler, RawCheckResult } from './check-handler.interface.js'

// ─── Formatter (utility) ──────────────────────────────────────────────────────
export { formatCheckResult, interpolateTemplate } from './check-result-formatter.js'

// ─── Registry ────────────────────────────────────────────────────────────────
export { CheckHandlerRegistry } from './check-handler-registry.js'

// ─── Built-in handlers ────────────────────────────────────────────────────────
export { CountDirsHandler } from './count-dirs.handler.js'
export { CountFilesHandler } from './count-files.handler.js'
export { DirExistsHandler } from './dir-exists.handler.js'
export { FileExistsHandler } from './file-exists.handler.js'
export { GrepHandler } from './grep.handler.js'
export { JsonFieldHandler } from './json-field.handler.js'
export { JsonHasKeyHandler } from './json-has-key.handler.js'
export { LlmGenerateHandler } from './llm-generate.handler.js'
export { LlmReviewHandler } from './llm-review.handler.js'
export { LlmToolHandler } from './llm-tool.handler.js'
export { RunCommandHandler } from './run-command.handler.js'


