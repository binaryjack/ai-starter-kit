import { IssueSync } from '../issue-sync.js';
import {
    _body,
    _createJiraIssue,
    _createLinearIssue,
    _extraJiraFields,
    _title,
    attach,
    createIssueForRun,
    detach,
} from './methods.js';

Object.assign((IssueSync as unknown as { prototype: object }).prototype, {
  attach,
  detach,
  createIssueForRun,
  _createJiraIssue,
  _createLinearIssue,
  _title,
  _body,
  _extraJiraFields,
});
