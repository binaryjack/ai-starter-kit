import { ChatRenderer } from '../chat-renderer.js';
import {
    _progressBar,
    _statusIcon,
    _wrap,
    approvalPrompt,
    checklist, decision,
    error,
    modelRecommendation,
    newline,
    phaseHeader,
    phaseSummary,
    question,
    say,
    separator,
    system, warn,
} from './methods.js';

Object.assign((ChatRenderer as unknown as { prototype: object }).prototype, {
  phaseHeader, say, question, system, warn, error,
  separator, newline, checklist, decision,
  modelRecommendation, approvalPrompt, phaseSummary,
  _statusIcon, _progressBar, _wrap,
});
